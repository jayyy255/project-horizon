import path from 'path';
import { Tier2ActionPayload } from '../../shared/types';

export type ActionTier = 1 | 2;

export interface ProposedAction {
  tool_name: string;
  args: Record<string, unknown>;
  narration: string;
  provenance?: 'user_task' | 'on_screen_text';
}

export interface GateEvaluationResult {
  allowed: boolean;
  tier: ActionTier;
  rejectionReason?: string;
  sanitizedArgs?: Record<string, unknown>;
  tier2Payload?: Tier2ActionPayload;
}

export interface SafetyGateConfig {
  allowedProjectRoots?: string[];
  maxTypeLength?: number;
  maxToolCallsPerTask?: number;
}

export class SafetyGate {
  private allowedProjectRoots: string[];
  private maxTypeLength: number;
  private maxToolCallsPerTask: number;
  private taskToolCallCount: Map<string, number> = new Map();

  private destructiveKeywords = new Set([
    'delete', 'drop', 'confirm payment', 'send', 'remove', 'format', 'erase', 'destroy', 'terminate'
  ]);

  private destructiveCommands = [
    /\brm\b/i,
    /\brmdir\b/i,
    /\bdel\b/i,
    /\berase\b/i,
    /\bformat\b/i,
    /\bdrop\s+database\b/i,
    /\bdrop\s+table\b/i,
    /\bgit\s+push\b/i,
    /\bpowershell(\.exe)?\b/i,
    /\bcmd(\.exe)?\b/i,
    /\bsh\b/i,
    /\bbash\b/i,
  ];

  constructor(config: SafetyGateConfig = {}) {
    this.allowedProjectRoots = (config.allowedProjectRoots || [
      'C:/Users', 'D:/', 'E:/', 'C:/Program Files', 'C:/Program Files (x86)', 'C:/Windows/System32'
    ]).map(r => path.normalize(r).toLowerCase());
    this.maxTypeLength = config.maxTypeLength || 1000;
    this.maxToolCallsPerTask = config.maxToolCallsPerTask || 50;
  }

  public evaluate(
    taskId: string,
    action: ProposedAction,
    validTagIds?: Set<number>
  ): GateEvaluationResult {
    const currentCalls = (this.taskToolCallCount.get(taskId) || 0) + 1;
    if (currentCalls > this.maxToolCallsPerTask) {
      return {
        allowed: false,
        tier: 1,
        rejectionReason: `Rate limit exceeded: Task exceeded maximum tool calls (${this.maxToolCallsPerTask}).`,
      };
    }
    this.taskToolCallCount.set(taskId, currentCalls);

    if (action.provenance === 'on_screen_text') {
      return {
        allowed: false,
        tier: 1,
        rejectionReason: 'VIPI Violation: Actions derived from untrusted on-screen text are prohibited from OS execution.',
      };
    }

    const { tool_name, args } = action;

    switch (tool_name) {
      case 'inspect_viewport':
      case 'find_path':
      case 'focus_window':
      case 'check_open_workspace':
        return {
          allowed: true,
          tier: 1,
          sanitizedArgs: args,
        };

      case 'click_element': {
        const tagId = Number(args.tag_id);
        if (Number.isNaN(tagId) || (validTagIds && !validTagIds.has(tagId))) {
          return {
            allowed: false,
            tier: 1,
            rejectionReason: `Invalid or stale tag_id [${args.tag_id}]. Tag must exist in active frame lookup table.`,
          };
        }

        const label = String(args.label || '').toLowerCase();
        const isDestructiveButton = Array.from(this.destructiveKeywords).some(kw => label.includes(kw));

        if (isDestructiveButton) {
          return {
            allowed: true,
            tier: 2,
            sanitizedArgs: args,
            tier2Payload: {
              actionId: `act-${Date.now()}`,
              description: `Confirm destructive click on "${args.label || `[${tagId}]`}"`,
              isDestructive: true,
              timestamp: Date.now(),
            },
          };
        }

        return {
          allowed: true,
          tier: 1,
          sanitizedArgs: args,
        };
      }

      case 'type_text': {
        const text = String(args.text || '');
        if (text.length > this.maxTypeLength) {
          return {
            allowed: false,
            tier: 1,
            rejectionReason: `Text length ${text.length} exceeds max allowed length of ${this.maxTypeLength}.`,
          };
        }

        const context = String(args.context || '').toLowerCase();
        if (context.includes('password') || context.includes('.env') || context.includes('secret')) {
          return {
            allowed: true,
            tier: 2,
            sanitizedArgs: args,
            tier2Payload: {
              actionId: `act-${Date.now()}`,
              description: `Authorize text entry into sensitive context (${context})`,
              isDestructive: false,
              timestamp: Date.now(),
            },
          };
        }

        return {
          allowed: true,
          tier: 1,
          sanitizedArgs: args,
        };
      }

      case 'send_hotkey': {
        const keys = String(args.keys || '').toLowerCase();
        if (keys.includes('ctrl+shift+del') || keys.includes('alt+f4')) {
          return {
            allowed: true,
            tier: 2,
            sanitizedArgs: args,
            tier2Payload: {
              actionId: `act-${Date.now()}`,
              description: `Authorize high-privilege keyboard shortcut: ${keys}`,
              isDestructive: true,
              timestamp: Date.now(),
            },
          };
        }

        return {
          allowed: true,
          tier: 1,
          sanitizedArgs: args,
        };
      }

      case 'launch_app': {
        const execPath = String(args.executable_path || '');
        const rawArgs = args.args;

        if (execPath.includes('..')) {
          return {
            allowed: false,
            tier: 1,
            rejectionReason: 'Path traversal ("..") is strictly forbidden in executable paths.',
          };
        }

        const normalized = path.normalize(execPath).toLowerCase();
        const base = path.basename(execPath).toLowerCase();
        const isUnderAllowedRoot = this.allowedProjectRoots.some(root => normalized.startsWith(root));
        const isStandardDevTool = ['code', 'code.cmd', 'git', 'npm', 'node', 'python', 'whatsapp', 'whatsapp:', 'spotify', 'spotify:', 'vscode'].includes(base) ||
          base.startsWith('whatsapp') || base.startsWith('spotify') ||
          execPath.toLowerCase().startsWith('whatsapp') || execPath.toLowerCase().startsWith('spotify');
        if (!isUnderAllowedRoot && !execPath.endsWith('.exe') && !isStandardDevTool) {
          return {
            allowed: false,
            tier: 1,
            rejectionReason: `Executable path "${execPath}" is not within authorized roots.`,
          };
        }

        const argVector = this.sanitizeArgVector(rawArgs);
        const combined = `${execPath} ${argVector.join(' ')}`;
        const isDestructive = this.destructiveCommands.some(rgx => rgx.test(combined));
        const isShellTarget = /cmd(\.exe)?|powershell(\.exe)?|bash|sh/i.test(path.basename(execPath));

        if (isDestructive || isShellTarget) {
          return {
            allowed: true,
            tier: 2,
            sanitizedArgs: {
              executable_path: execPath,
              args: argVector,
            },
            tier2Payload: {
              actionId: `act-${Date.now()}`,
              description: `Authorize privileged execution of: ${path.basename(execPath)}`,
              executablePath: execPath,
              args: argVector,
              command: combined,
              isDestructive: true,
              timestamp: Date.now(),
            },
          };
        }

        return {
          allowed: true,
          tier: 1,
          sanitizedArgs: {
            executable_path: execPath,
            args: argVector,
          },
        };
      }

      default:
        return {
          allowed: false,
          tier: 1,
          rejectionReason: `Unrecognized tool capability: "${tool_name}". Execution rejected.`,
        };
    }
  }

  public sanitizeArgVector(rawInput: unknown): string[] {
    if (Array.isArray(rawInput)) {
      return rawInput.map(item => String(item).trim()).filter(Boolean);
    }

    if (typeof rawInput === 'string') {
      const input = rawInput.trim();
      if (!input) return [];

      const tokens: string[] = [];
      let currentToken = '';
      let inQuotes = false;
      let quoteChar = '';

      for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if ((char === '"' || char === "'") && !inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar && inQuotes) {
          inQuotes = false;
          quoteChar = '';
        } else if (char === ' ' && !inQuotes) {
          if (currentToken.length > 0) {
            const sanitized = currentToken.replace(/[;&|`$<>\\]/g, '').trim();
            if (sanitized) tokens.push(sanitized);
            currentToken = '';
          }
        } else {
          currentToken += char;
        }
      }

      if (currentToken.length > 0) {
        const sanitized = currentToken.replace(/[;&|`$<>\\]/g, '').trim();
        if (sanitized) tokens.push(sanitized);
      }

      return tokens;
    }

    return [];
  }

  public resetTaskCounter(taskId: string): void {
    this.taskToolCallCount.delete(taskId);
  }
}
