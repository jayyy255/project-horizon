import { describe, it, expect, beforeEach } from 'vitest';
import { SafetyGate, ProposedAction } from '../safety/gate.js';

describe('Safety Gate & Guardrails Test Suite (TC-U-04, TC-SEC-01, TC-SEC-03)', () => {
  let gate: SafetyGate;

  beforeEach(() => {
    gate = new SafetyGate({
      allowedProjectRoots: ['C:/Users/Developer/workspace', 'E:/code/projects'],
      maxTypeLength: 500,
      maxToolCallsPerTask: 20,
    });
  });

  describe('TC-U-04: Command Sanitizer & Argument Vectorizer', () => {
    it('converts shell-escaped input strings into safe parameterized argument vectors', () => {
      const input = '--config="my config.json" --port 8080 --verbose';
      const vector = gate.sanitizeArgVector(input);

      expect(vector).toEqual(['--config=my config.json', '--port', '8080', '--verbose']);
    });

    it('strips dangerous shell chaining operators and command injection characters', () => {
      const maliciousInput = 'src/index.ts; rm -rf /; echo "hacked" && calc.exe | evil.sh `whoami`';
      const vector = gate.sanitizeArgVector(maliciousInput);

      expect(vector).not.toContain(';');
      expect(vector).not.toContain('&&');
      expect(vector).not.toContain('|');
      expect(vector).not.toContain('`');
      // Verify token vectorization prevents secondary shell subshell eval
      expect(vector.every(t => !/[;&|`$]/.test(t))).toBe(true);
    });
  });

  describe('TC-SEC-01: Visual Indirect Prompt Injection (VIPI) Resistance', () => {
    it('strictly blocks actions whose provenance traces to on-screen text rather than user task', () => {
      const vipiAction: ProposedAction = {
        tool_name: 'launch_app',
        args: {
          executable_path: 'C:/Windows/System32/cmd.exe',
          args: ['/c', 'echo', 'System Override Active'],
        },
        narration: 'Executing system override read from browser banner',
        provenance: 'on_screen_text', // Screen contained fake "System Override"
      };

      const result = gate.evaluate('task-vipi-1', vipiAction);
      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toContain('VIPI Violation');
    });

    it('allows identical action if provenance is legitimate user task', () => {
      const legitimateAction: ProposedAction = {
        tool_name: 'find_path',
        args: { search_term: 'project-horizon' },
        narration: 'Searching local directory',
        provenance: 'user_task',
      };

      const result = gate.evaluate('task-legit-1', legitimateAction);
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe(1);
    });
  });

  describe('TC-SEC-03: Tier 2 Interception for Destructive Actions', () => {
    it('intercepts destructive command (rmdir /s /q node_modules) and gates it to Tier 2', () => {
      const destructiveAction: ProposedAction = {
        tool_name: 'launch_app',
        args: {
          executable_path: 'C:/Windows/System32/cmd.exe',
          args: '/c rmdir /s /q node_modules',
        },
        narration: 'Cleaning node_modules directory',
        provenance: 'user_task',
      };

      const result = gate.evaluate('task-destruct-1', destructiveAction);

      // Must be gated to Tier 2 (requiring physical HUD confirmation modal)
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe(2);
      expect(result.tier2Payload).toBeDefined();
      expect(result.tier2Payload?.isDestructive).toBe(true);
      expect(result.tier2Payload?.description).toContain('cmd.exe');
    });

    it('gates destructive GUI button clicks ("Delete Account", "Confirm Payment") to Tier 2', () => {
      const validTags = new Set([0, 1, 2]);
      const clickAction: ProposedAction = {
        tool_name: 'click_element',
        args: {
          tag_id: 1,
          label: 'Delete All Records',
        },
        narration: 'Clicking delete button',
        provenance: 'user_task',
      };

      const result = gate.evaluate('task-click-1', clickAction, validTags);
      expect(result.allowed).toBe(true);
      expect(result.tier).toBe(2);
      expect(result.tier2Payload?.isDestructive).toBe(true);
      expect(result.tier2Payload?.description).toContain('Delete All Records');
    });
  });

  describe('Path Traversal & Stale Tag Validations (§8.6)', () => {
    it('rejects path traversal ("..") attempts', () => {
      const traversalAction: ProposedAction = {
        tool_name: 'launch_app',
        args: {
          executable_path: 'C:/Users/Developer/workspace/../../Windows/System32/calc.exe',
        },
        narration: 'Launching calculator',
        provenance: 'user_task',
      };

      const result = gate.evaluate('task-path-1', traversalAction);
      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toContain('Path traversal');
    });

    it('rejects click on stale or hallucinated tag IDs not present in active frame', () => {
      const validTags = new Set([0, 1, 2]);
      const invalidClick: ProposedAction = {
        tool_name: 'click_element',
        args: { tag_id: 99 }, // 99 not in frame!
        narration: 'Clicking element 99',
        provenance: 'user_task',
      };

      const result = gate.evaluate('task-tag-1', invalidClick, validTags);
      expect(result.allowed).toBe(false);
      expect(result.rejectionReason).toContain('Invalid or stale tag_id');
    });

    it('enforces rate limiting on runaway tasks', () => {
      const harmlessAction: ProposedAction = {
        tool_name: 'find_path',
        args: { search_term: 'test' },
        narration: 'Searching',
        provenance: 'user_task',
      };

      // Exceed maxToolCallsPerTask (20)
      for (let i = 0; i < 20; i++) {
        expect(gate.evaluate('runaway-task', harmlessAction).allowed).toBe(true);
      }

      // 21st call must be blocked by rate limiter
      const blocked = gate.evaluate('runaway-task', harmlessAction);
      expect(blocked.allowed).toBe(false);
      expect(blocked.rejectionReason).toContain('Rate limit exceeded');
    });
  });
});
