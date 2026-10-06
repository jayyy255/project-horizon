using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

class Program {
    public delegate bool EnumDesktopWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumDesktopWindowsProc lpfn, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool CloseDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    static void Main(string[] args) {
        IntPtr hDesk = OpenInputDesktop(0, false, 0x0100 /* DESKTOP_ENUMERATE */ | 0x0001 /* DESKTOP_READOBJECTS */);
        if (hDesk == IntPtr.Zero) {
            Console.WriteLine("[]");
            return;
        }

        var list = new List<string>();
        EnumDesktopWindows(hDesk, (hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                var sb = new StringBuilder(512);
                GetWindowText(hWnd, sb, 512);
                string title = sb.ToString().Trim();
                if (!string.IsNullOrEmpty(title)) {
                    uint pid = 0;
                    GetWindowThreadProcessId(hWnd, out pid);
                    string procName = "unknown";
                    try {
                        using (var p = Process.GetProcessById((int)pid)) {
                            procName = p.ProcessName;
                        }
                    } catch {}

                    // Escape JSON characters
                    string safeTitle = title.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
                    list.Add(string.Format("{{\"pid\":{0},\"process\":\"{1}\",\"title\":\"{2}\",\"handle\":{3}}}", pid, procName, safeTitle, hWnd.ToInt64()));
                }
            }
            return true;
        }, IntPtr.Zero);

        CloseDesktop(hDesk);
        Console.WriteLine("[" + string.Join(",", list.ToArray()) + "]");
    }
}
