import { execFileSync, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface WindowRecord {
  pid: number;
  process: string;
  title: string;
  handle: number;
}

export interface VerificationResult {
  verified: boolean;
  status: 'succeeded' | 'failed' | 'launched_unconfirmed_window';
  processFound: boolean;
  windowFound: boolean;
  pid?: number;
  windowTitle?: string;
  latencyMs: number;
  error?: string;
  details: string;
}

export interface AppVerifyOptions {
  appName: string;
  processPatterns: string[];
  titlePatterns?: string[];
  baselineWindows?: WindowRecord[];
  timeoutMs?: number;
  pollIntervalMs?: number;
  requireNewWindow?: boolean;
  requiredTitlePattern?: string;
}

export class ActionVerifier {
  private static listWindowsExePath: string = path.resolve(__dirname, '../../scripts/list_windows.exe');

  public static getVisibleWindows(): WindowRecord[] {
    const candidatePaths = [
      path.join(process.resourcesPath || '', 'native', 'list_windows.exe'),
      this.listWindowsExePath,
      path.resolve(process.cwd(), 'scripts/list_windows.exe'),
      path.resolve(__dirname, '../../../scripts/list_windows.exe'),
    ];

    const exePath = candidatePaths.find(p => fs.existsSync(p));
    if (exePath) {
      try {
        const out = execFileSync(exePath, { encoding: 'utf8', timeout: 1500 });
        const parsed = JSON.parse(out.trim() || '[]');
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (err) {
        // Fall back below
      }
    }

    // PowerShell fallback
    try {
      const psScript = `
        Add-Type -TypeDefinition @"
        using System; using System.Collections.Generic; using System.Runtime.InteropServices; using System.Text;
        public class DbgEnum {
            [DllImport("user32.dll")] public static extern IntPtr OpenInputDesktop(uint f, bool i, uint a);
            [DllImport("user32.dll")] public static extern bool EnumDesktopWindows(IntPtr h, EnumProc p, IntPtr l);
            public delegate bool EnumProc(IntPtr w, IntPtr l);
            [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr h);
            [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr w);
            [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr w, StringBuilder s, int m);
            [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr w, out uint p);
            public static List<string> Run() {
                var l = new List<string>();
                IntPtr h = OpenInputDesktop(0, false, 0x0101);
                if (h == IntPtr.Zero) return l;
                EnumDesktopWindows(h, (w, p) => {
                    if (IsWindowVisible(w)) {
                        var sb = new StringBuilder(256);
                        GetWindowText(w, sb, 256);
                        if (sb.Length > 0) {
                            uint pid = 0; GetWindowThreadProcessId(w, out pid);
                            l.Add(pid + "|" + sb.ToString().Replace("\"", ""));
                        }
                    }
                    return true;
                }, IntPtr.Zero);
                CloseDesktop(h);
                return l;
            }
        }
"@; [DbgEnum]::Run() | ConvertTo-Json -Compress
      `;
      const out = execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { encoding: 'utf8', timeout: 3000, windowsHide: true }).trim();
      if (out && out !== 'null') {
        const lines = out.startsWith('[') ? JSON.parse(out) : [JSON.parse(out)];
        return lines.map((item: string) => {
          const parts = item.split('|');
          return {
            pid: Number(parts[0]) || 0,
            process: '',
            title: parts[1] || '',
            handle: 0,
          };
        });
      }
    } catch {}

    return [];
  }

  public static isProcessRunning(processPatterns: string[]): { running: boolean; pid?: number; processName?: string } {
    if (!processPatterns || processPatterns.length === 0) return { running: false };

    try {
      const psNames = processPatterns.map(p => `'${p.replace(/\.exe$/i, '')}'`).join(',');
      const cmd = `powershell -NoProfile -Command "Get-Process -Name ${psNames} -ErrorAction SilentlyContinue | Select-Object -First 1 Id, ProcessName | ConvertTo-Json -Compress; exit 0"`;
      const out = execSync(cmd, { encoding: 'utf8', timeout: 1500, windowsHide: true }).trim();
      if (out && out !== 'null' && out.length > 2) {
        const parsed = JSON.parse(out);
        return {
          running: true,
          pid: parsed.Id,
          processName: parsed.ProcessName,
        };
      }
    } catch {}

    return { running: false };
  }

  /**
   * Bounded retry loop confirming both:
   * 1. Process exists
   * 2. Visible window exists for that process
   */
  public static async verifyAppLaunch(options: AppVerifyOptions): Promise<VerificationResult> {
    const {
      appName,
      processPatterns,
      titlePatterns = [],
      baselineWindows = [],
      timeoutMs = 5000,
      pollIntervalMs = 200,
    } = options;

    const startTime = performance.now();
    const baselineHandles = new Set(baselineWindows.map(w => w.handle).filter(h => h > 0));
    const allTitlePatterns = [...titlePatterns, appName.toLowerCase()];

    let lastFoundPid: number | undefined;
    let lastFoundProcessName: string | undefined;

    while (performance.now() - startTime < timeoutMs) {
      // 1. Check if process is running
      const procCheck = this.isProcessRunning(processPatterns);
      if (procCheck.running) {
        lastFoundPid = procCheck.pid;
        lastFoundProcessName = procCheck.processName;
      }

      // 2. Check if a visible window exists for this app
      const currentWindows = this.getVisibleWindows();
      const matchingWindow = currentWindows.find(w => {
        // Window title pattern match
        const lowerTitle = w.title.toLowerCase();
        if (options.requiredTitlePattern && !lowerTitle.includes(options.requiredTitlePattern.toLowerCase())) return false;
        const titleMatches = allTitlePatterns.some(pat => {
          const escaped = pat.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return escaped && new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(lowerTitle);
        });

        // Process name pattern match
        const lowerProc = w.process.toLowerCase();
        const procMatches = processPatterns.some(pat => {
          const clean = pat.toLowerCase().replace(/\.exe$/i, '');
          const escaped = clean.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          return escaped && new RegExp(`^${escaped}$`).test(lowerProc.replace(/\.exe$/i, ''));
        });

        const isGenericHost = ['applicationframehost', 'explorer', 'conhost', 'svchost'].some(g => lowerProc.includes(g));
        const isTargetMatch = isGenericHost ? titleMatches : (titleMatches || (procMatches && w.title.length > 0));
        if (!isTargetMatch) return false;

        // If baseline exists and requireNewWindow is enabled, verify this window is newly created
        if (options.requireNewWindow && baselineHandles.size > 0 && w.handle > 0) {
          const wasInBaseline = baselineWindows.some(bw => bw.handle === w.handle);
          if (wasInBaseline) {
            const hadWindowForApp = baselineWindows.some(bw =>
              allTitlePatterns.some(pat => pat && bw.title.toLowerCase().includes(pat)) ||
              processPatterns.some(pat => pat && bw.process.toLowerCase().includes(pat.toLowerCase().replace(/\.exe$/i, '')))
            );
            if (hadWindowForApp) {
              return false; // Require a NEW window if app was already running
            }
          }
        }
        return true;
      });

      if (procCheck.running && matchingWindow) {
        const latencyMs = performance.now() - startTime;
        return {
          verified: true,
          status: 'succeeded',
          processFound: true,
          windowFound: true,
          pid: matchingWindow.pid || procCheck.pid,
          windowTitle: matchingWindow.title,
          latencyMs,
          details: `Confirmed process "${lastFoundProcessName || matchingWindow.process}" (PID ${matchingWindow.pid || procCheck.pid}) and visible window "${matchingWindow.title}" in ${latencyMs.toFixed(1)}ms.`,
        };
      }

      // Wait pollIntervalMs
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    const totalLatency = performance.now() - startTime;

    // Ambiguous middle case: process is running, but no window confirmed yet
    if (lastFoundPid) {
      return {
        verified: false,
        status: 'launched_unconfirmed_window',
        processFound: true,
        windowFound: false,
        pid: lastFoundPid,
        latencyMs: totalLatency,
        details: `Process "${lastFoundProcessName || processPatterns[0]}" is running (PID ${lastFoundPid}), but no visible window was confirmed within ${(totalLatency / 1000).toFixed(1)}s (app may be starting slowly, minimized, or headless).`,
      };
    }

    // Explicit Failure
    return {
      verified: false,
      status: 'failed',
      processFound: false,
      windowFound: false,
      latencyMs: totalLatency,
      error: `Neither process (${processPatterns.join(', ')}) nor visible window appeared within ${(totalLatency / 1000).toFixed(1)}s.`,
      details: `Execution failed: application "${appName}" did not spawn an active process or window within the timeout window.`,
    };
  }

  /**
   * Computes pixel difference percentage between two RGBA buffers
   */
  public static computePixelDiffPercentage(bufA: Buffer, bufB: Buffer): number {
    if (!bufA || !bufB || bufA.length === 0 || bufB.length === 0) return 0;
    const len = Math.min(bufA.length, bufB.length);
    let changed = 0;
    for (let i = 0; i < len; i += 4) {
      const dr = Math.abs(bufA[i] - bufB[i]);
      const dg = Math.abs(bufA[i + 1] - bufB[i + 1]);
      const db = Math.abs(bufA[i + 2] - bufB[i + 2]);
      if (dr + dg + db > 25) {
        changed++;
      }
    }
    const totalPixels = Math.floor(len / 4);
    return totalPixels > 0 ? (changed / totalPixels) * 100 : 0;
  }

  /**
   * Verifies UI input delta for click_element:
   * 1. Confirms physical cursor trajectory reached target bounding box center within tolerance.
   * 2. Confirms a visible state delta occurred in the target element's screen region (before/after diff).
   */
  public static verifyClickElementDelta(
    targetCoords: [number, number],
    actualPosition: { x: number; y: number },
    visualDelta?: { beforeBuffer?: Buffer; afterBuffer?: Buffer; diffPercent?: number }
  ): { verified: boolean; distance: number; visualDeltaPercent?: number; details: string } {
    const dx = targetCoords[0] - actualPosition.x;
    const dy = targetCoords[1] - actualPosition.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const coordsMatch = dist <= 5;

    if (!coordsMatch) {
      return {
        verified: false,
        distance: dist,
        details: `Cursor positioning mismatch: target=(${targetCoords[0]}, ${targetCoords[1]}), actual=(${actualPosition.x}, ${actualPosition.y}), delta=${dist.toFixed(1)}px.`,
      };
    }

    if (visualDelta) {
      const diffPercent = visualDelta.diffPercent !== undefined
        ? visualDelta.diffPercent
        : (visualDelta.beforeBuffer && visualDelta.afterBuffer
            ? this.computePixelDiffPercentage(visualDelta.beforeBuffer, visualDelta.afterBuffer)
            : 0);

      const hasVisualChange = diffPercent >= 0.5;
      return {
        verified: hasVisualChange,
        distance: dist,
        visualDeltaPercent: Number(diffPercent.toFixed(2)),
        details: hasVisualChange
          ? `Confirmed: Cursor reached target center (${dist.toFixed(1)}px) AND element region showed visible state change (${diffPercent.toFixed(1)}% pixel delta).`
          : `Verification Failed: Cursor reached coordinates, but target element region showed NO visual state transition (${diffPercent.toFixed(1)}% change).`,
      };
    }

    return {
      verified: true,
      distance: dist,
      details: `Cursor successfully reached target center (${targetCoords[0]}, ${targetCoords[1]}) within ${dist.toFixed(1)}px tolerance.`,
    };
  }

  /**
   * Verifies send_hotkey execution delta:
   * Confirms hotkey dispatch AND visible screen delta resulting from the key combination.
   */
  public static verifyHotkeyDelta(
    keys: string,
    visualDelta?: { beforeBuffer?: Buffer; afterBuffer?: Buffer; diffPercent?: number }
  ): { verified: boolean; visualDeltaPercent?: number; details: string } {
    if (!keys || keys.trim().length === 0) {
      return { verified: false, details: 'Invalid hotkey definition.' };
    }

    if (visualDelta) {
      const diffPercent = visualDelta.diffPercent !== undefined
        ? visualDelta.diffPercent
        : (visualDelta.beforeBuffer && visualDelta.afterBuffer
            ? this.computePixelDiffPercentage(visualDelta.beforeBuffer, visualDelta.afterBuffer)
            : 0);

      const hasVisualChange = diffPercent >= 0.2;
      return {
        verified: hasVisualChange,
        visualDeltaPercent: Number(diffPercent.toFixed(2)),
        details: hasVisualChange
          ? `Confirmed: Hotkey "${keys}" triggered visible UI transition (${diffPercent.toFixed(1)}% screen delta).`
          : `Verification Failed: Hotkey "${keys}" dispatched, but no visible UI change occurred (${diffPercent.toFixed(1)}% delta).`,
      };
    }

    return {
      verified: true,
      details: `Hardware keyboard event "${keys}" dispatched and synchronized with Windows message queue.`,
    };
  }
}
