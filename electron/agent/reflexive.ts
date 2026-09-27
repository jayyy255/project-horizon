import { ProposedAction } from './gate';

/**
 * Phase A: Deterministic Reflexive Intent-Matching Layer (FR-2.1)
 *
 * Intercepts unambiguous user instructions BEFORE any model call.
 * Runs in <5ms with zero token cost.
 *
 * VIPI / Prompt Injection Defense:
 * - This matcher ONLY receives the raw user instruction string.
 * - Screen content, OCR text, and window titles from perception are
 *   STRICTLY EXCLUDED to guarantee screen prompt injections cannot
 *   trigger reflexive execution.
 * - Every matched action still passes through the Safety Gate (Tier classification,
 *   Tier 2 confirmation modal, path traversal checks) and post-action verification.
 */
export class ReflexiveMatcher {
  // Disambiguation keywords that imply perception or complex reasoning is needed
  private static readonly AMBIGUOUS_WORDS = [
    /\bfile\b/i,
    /\btab\b/i,
    /\bdocument\b/i,
    /\bemail\b/i,
    /\blink\b/i,
    /\bfolder\b/i,
    /\bphoto\b/i,
    /\bpicture\b/i,
    /\bimage\b/i,
    /\bmessage\b/i,
    /\bthat\b/i,
    /\bwhich\b/i,
    /\bwhere\b/i,
    /\bsent\b/i,
    /\breceived\b/i,
    /\bdownloaded\b/i,
    /\bunread\b/i,
    /\brecent\b/i,
    /\blast\b/i,
    /\band\b/i,
    /\bthen\b/i,
    /\bafter\b/i,
    /\bwith\b/i,
    /\bmy\b/i,
    /\bour\b/i,
    /\bme\b/i,
    /\bconfirmation\b/i,
    /\b(gmail|slack|outlook|jira|drive|teams)\b/i,
  ];

  /**
   * Evaluates the raw user instruction.
   * Returns a ProposedAction if there is an unambiguous reflexive match, or null to fall through.
   */
  public match(rawInstruction: string): ProposedAction | null {
    if (!rawInstruction || typeof rawInstruction !== 'string') return null;

    const trimmed = rawInstruction.trim();
    if (!trimmed) return null;

    // 1. Screen capture patterns (highest priority single-word/short intents)
    if (/^(?:take\s+a\s+screenshot|screenshot|capture\s+screen|capture\s+desktop)$/i.test(trimmed)) {
      return {
        tool_name: 'inspect_viewport',
        args: {},
        narration: '[Reflexive] Taking full desktop screenshot for viewport inspection',
        provenance: 'user_task',
      };
    }

    // 2. Clipboard single-word operations
    if (/^copy$/i.test(trimmed)) {
      return {
        tool_name: 'send_hotkey',
        args: { keys: 'ctrl+c' },
        narration: '[Reflexive] Copying selection to clipboard (Ctrl+C)',
        provenance: 'user_task',
      };
    }
    if (/^paste$/i.test(trimmed)) {
      return {
        tool_name: 'send_hotkey',
        args: { keys: 'ctrl+v' },
        narration: '[Reflexive] Pasting from clipboard (Ctrl+V)',
        provenance: 'user_task',
      };
    }
    if (/^cut$/i.test(trimmed)) {
      return {
        tool_name: 'send_hotkey',
        args: { keys: 'ctrl+x' },
        narration: '[Reflexive] Cutting selection to clipboard (Ctrl+X)',
        provenance: 'user_task',
      };
    }

    // Check for ambiguity/relational qualifiers before checking parameterized intents
    const isAmbiguous = ReflexiveMatcher.AMBIGUOUS_WORDS.some(rgx => rgx.test(trimmed));
    if (isAmbiguous) {
      return null;
    }

    // 3. Web search patterns: "search for <term>", "google <term>", "look up <term>"
    const searchMatch = trimmed.match(/^(?:search\s+for|google|look\s+up)\s+(.+)$/i);
    if (searchMatch && searchMatch[1]) {
      const term = searchMatch[1].trim();
      if (term.length > 0) {
        return {
          tool_name: 'launch_app',
          args: {
            executable_path: `https://www.google.com/search?q=${encodeURIComponent(term)}`,
            target_label: `Google Search: "${term}"`,
          },
          narration: `[Reflexive] Searching web for "${term}"`,
          provenance: 'user_task',
        };
      }
    }

    // 4. Window focus patterns: "focus <name>", "switch to <name>", "bring up <name>"
    const focusMatch = trimmed.match(/^(?:focus|switch\s+to|bring\s+up)\s+(?:the\s+)?([a-zA-Z0-9_\-\.\s]+)$/i);
    if (focusMatch && focusMatch[1]) {
      const target = focusMatch[1].trim();
      if (target.length > 0) {
        return {
          tool_name: 'focus_window',
          args: {
            window_title: target,
            process_name: target,
          },
          narration: `[Reflexive] Focusing window matching "${target}"`,
          provenance: 'user_task',
        };
      }
    }

    // 5. App launching patterns: "open <name>", "launch <name>", "start <name>"
    const launchMatch = trimmed.match(/^(?:open|launch|start)\s+(?:the\s+)?([a-zA-Z0-9_\-\.\s]+)$/i);
    if (launchMatch && launchMatch[1]) {
      const appName = launchMatch[1].trim();
      if (appName.length > 0) {
        return {
          tool_name: 'launch_app',
          args: {
            executable_path: appName,
          },
          narration: `[Reflexive] Launching application "${appName}"`,
          provenance: 'user_task',
        };
      }
    }

    return null;
  }
}
