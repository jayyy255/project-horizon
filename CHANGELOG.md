# Changes

## 1.1.1

- Global shortcut settings live in the main process, restore on restart, expose actual registration status and report conflicts. Changing shortcuts releases the previous binding. The workspace closes into the tray, and duplicate app instances return to the existing window.
- Floating assistant displays full answers, errors and approvals in place, grows to fit them, and keeps follow-ups in one conversation. Users can choose to expand into the workspace. Circle selection and cancellation return to the requesting floating bar, even with the workspace open.
- Private friends build optionally includes owner-provided Gemini access, with no user API-key entry. Standard builds continue to exclude owner credentials. Both newer Google auth keys and legacy key formats are accepted.
- Local fair-use limits persist across restarts: 10 model calls per minute, 100 per rolling 24 hours, a brief submit cooldown and 4096 output tokens per call. Google 429 errors are shown clearly. Local limits do not prevent use of an extracted key.

Validation: 39 frontend tests, 33 production Electron regressions and 16 hotkey/rate-limit regressions passed. 23 packaged-runtime and physical keyboard checks passed, including live Gemini answers and follow-up context. Ctrl + Alt + H was tested with Horizon and Chrome focused; the Win shortcut was checked through native registration. The installer remains unsigned.

## 1.1.0

- Glass desktop workspace with restrained pixel accents, bundled JetBrains Mono, Horizon branding, updated consent, compact header and aligned execution trace.
- Real conversation history, capture context, model responses and approval outcomes.
- Project-parent discovery and deterministic folder resolution for opening projects in VS Code. GUI launches are visible, missing executables are handled, and verification checks the requested project.
- Repeated-action and turn-limit failures are explicit. Complex steps cannot be cached as complete commands. Unsupported native input reports failure instead of simulated success.
- Electron's built-in SQLite runtime stores agent data under user data; graph indexes use the correct column names.
- Installer includes a portable Python perception runtime, models, native window verifier and app icons. Developer secrets and `.env` files are excluded.
- Gemini key setup in Preferences uses Windows-backed encrypted storage. Hotkeys wait for first-run approval.

Validation: 31 frontend tests, 33 production Electron regressions, and 12 packaged-app smoke checks passed. The packaged executable was tested outside the checkout, with an isolated profile and no system Python on PATH. The exact code-security-reviewer project command succeeded in that executable. The existing backend/perception suites and prior live command results are recorded in local verification notes.

Typing, clicks, focus and clipboard input still require a native input adapter. Complex planning does not resume after approval, and existing-workspace path queries remain unverified. This release is unsigned.
