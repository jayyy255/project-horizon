# Changes

## 1.1.5 (hosted integration, pending live validation)

- Standard builds use Google sign-in and the Horizon Cloud Run service for text, image and document questions. No user API-key entry is required for hosted access.
- Desktop sign-in uses the system browser, a random loopback callback, state, nonce and PKCE. Session tokens are encrypted for the Windows account; status IPC does not expose credentials. Refresh is deduplicated, and sign-out cannot be undone by a late login response.
- The backend handles Google OAuth exchange and refresh with a separately stored OAuth client secret, verifies identities against the owner's allowlist, and retains persistent per-user/global model limits. Model selection remains server-controlled. Desktop action planning is not provided by this answer service; indexed-project opening and supported local commands remain available.
- Answers stream into the existing floating UI with hosted timing stages. Cancelling a task aborts its request. Existing context-retention and fresh-hotkey chat behavior remain.
- Removed support for credential-containing installers. The old friends packaging path now refuses to run, and standard packaging verifies no owner key/session/config resources are present.
- Consent explains transmission through Horizon's service to Google. Preferences uses a Horizon account card with sign-in, cancellation and sign-out controls.

The owner deployed the initial backend and confirmed its health/configuration checks. The updated OAuth endpoints, secret binding and desktop access still require a backend update and a real signed-in answer check before releasing this installer. Fixture tests do not establish live provider latency or availability.

Local validation: 49 frontend, 33 desktop-command, 20 shortcut/rate-limit, 14 image, 13 attachment, seven desktop-account and 32 hosted-backend checks passed (168 total). Native hosted UI passed 18 fixture checks, and the actual packaged executable passed 13 smoke checks, including credential exclusion and real VS Code project opening. No live Gemini answer or real Google consent flow is claimed by these fixtures.

## 1.1.4

- A hotkey press after a completed floating reply opens a fresh chat and preserves the previous conversation in history. In-progress requests and approval dialogs retain their state.
- Selected images stay attached for follow-up questions. Their original pixels remain local; uploads are prepared afresh, with lossless small crops and a 2400-pixel maximum edge for larger images. Pixels outside a selected crop are never implicitly shared.
- Image and document answers stream into the floating assistant. The 6.5-second cutoff is removed; a 60-second connection guard handles stalled requests. Cloud response times still vary.
- Attach PDFs, UTF-8 text/code files, PNG, JPEG and WebP through the file picker. A fixed copy must pass Microsoft Defender before parsing; unavailable scanning blocks attachment use. Files are limited to 20 MB, PDFs to 100 pages, and extracted text to one million characters. Executables, archives, Office documents/macros, binary text and PDFs containing active content are rejected.
- Explicit prompt-injection patterns are screened. Attachment content is treated as untrusted data, and file/PDF questions cannot invoke desktop tools. These defenses do not guarantee that every unknown malware or injection technique is detected.
- Each attachment answer has expandable timing details: capture/crop, scanning, parsing, preparation, response headers, first text, stream completion and rendering. Local rotating JSONL logs omit prompts, file paths, contents and credentials. Context selection for large text documents is repeated for each follow-up.
- Visual and scanned PDFs use locally rendered images of up to three relevant pages per question. Page images are bounded to a 1600-pixel edge, and a later question can select another page from the inspected original. Ordinary text PDF questions use extracted text.

Validation: 47 frontend, 33 desktop command, 20 shortcut/rate-limit, 14 image and 13 attachment-security checks passed, including a real Defender scan of harmless content, bounded PDF page rendering, streamed replies, the removed short deadline and blocked PDF active content. Native app verification covers fresh hotkey chats, retained context, scanned PDFs, both themes and live generated attachment questions. Recorded timings are samples, not guarantees.

## 1.1.3

- Enable shortcut recovers from an unavailable binding by registering and saving an available alternative. Preferences shows the actual shortcut in a selector, reports recovery, and preserves an existing working choice on upgrade. New setups default to Ctrl + Alt + H.
- The floating bar offers Circle area and Full screen immediately, with screen context optional. Full-screen capture briefly hides the bar to keep Horizon out of the attachment. New selections start with a clear canvas; cancellation returns to the bar.
- Open in workspace starts a new conversation, carries the unsent prompt and context, and preserves earlier chats.
- Screen selection now shares Horizon's black/white glass surfaces, logo, JetBrains Mono and restrained blue selection line.
- Image questions go directly to Gemini Flash Lite without waiting for local OCR or tool-planner JSON. Images are resized to a maximum 1600-pixel edge and compressed for upload. The verified 3.1 Flash Lite model is used first; 3.5 Flash Lite is tried after temporary service failures. Provider failures show their actual category. Slow image requests stop after a 6.5-second processing budget with a retry message; a completed answer within seven seconds remains dependent on Gemini and connectivity.

Validation: 43 frontend, 33 desktop-command, 20 hotkey/rate-limit and 13 image regressions passed. Native UI tests verified shortcut recovery, capture, cancellation, theme changes and new-chat transfer. Three live synthetic repository-page questions completed in 3.99 s, 1.89 s and 1.70 s. These timings are samples, not a guaranteed cloud response time. Later checks observed HTTP 503 and a 6.5-second timeout from Gemini; the installed key remained valid. The verified 3.1 Flash Lite endpoint answered a direct image probe in 3.29 seconds. The final packaged executable passed all 32 checks: live text answers and follow-ups worked, and a repository image question returned in 4.34 seconds after the first model returned HTTP 503 and the fallback model answered. The packaged report records live provider availability separately from the controlled UI checks.

## 1.1.2

- White light mode and black dark mode share neutral glass surfaces, legible foregrounds and restrained blue accents from the Horizon logo. Preferences, consent, history and execution details follow the palette.
- Removed the nested prompt frame. The floating assistant has one continuous glass surface and transparent native corners instead of an opaque rectangular page background.
- Floating and capture windows follow theme changes from the workspace without reopening.

Validation: 39 frontend regressions, eight native theme checks and 24 packaged checks passed, including transparent corner pixels, borderless composers and live light/dark synchronization. Actual native screenshots were inspected in both modes. The private friends installer retains included Gemini access and local request limits.

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
