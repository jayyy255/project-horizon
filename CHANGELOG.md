# Changes

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
