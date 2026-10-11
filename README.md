# Project Horizon

<img src="assets/icon.png" width="64" alt="Horizon app icon" />

Horizon is a Windows desktop assistant for asking questions about your screen or documents, finding local projects, and opening them in VS Code. A global shortcut opens a small prompt over the app you are using. You can ask a text-only question, select part of the screen, attach the full display, or choose a PDF, image or text/code file. Answers stream into the floating assistant; the workspace keeps your chats and shows the execution trace for actions.

The current build is **1.1.4** for Windows 10/11 (x64). See the [changelog](CHANGELOG.md) for changes and validation.

## Install

Download the friends installer from the [private GitHub releases](https://github.com/jayyy255/project-horizon/releases). You need access to the repository to download it. The installer includes Gemini access supplied by the app owner, so friends do not enter an API key. It is unsigned and may show a Windows security prompt.

To upgrade, **Quit Horizon from the system tray**, then run the new installer. Your saved shortcut and chats remain in your Windows user profile. You do not need to uninstall the previous version.

On first launch, review the consent screen and choose **Continue** to enable the global shortcut. New profiles start with **Ctrl + Alt + H**. Existing profiles keep their saved choice, including **Ctrl + Space**. If a shortcut is unavailable, Horizon tries another available choice and shows the active binding in **Preferences → Hotkey Trigger**. Keep Horizon running in the tray to use the shortcut outside its workspace.

The standard installer, built with `npm run package:win`, does not include owner access. It requires a personal Gemini key entered under **Preferences → Inference Engine**.

## Use the floating assistant

1. Press your active shortcut. Type a question and press **Enter** for a text-only answer.
2. For screen context, choose **Circle area**, drag around the region, then choose **Use selection**. Or choose **Full screen** to attach the display. The hotkey itself does not capture the screen.
3. Or choose **File** to attach a PDF, PNG/JPEG/WebP image, or UTF-8 text/code file. Horizon scans a fixed copy with Microsoft Defender before parsing. Attach up to four items; each file is limited to 20 MB, PDFs to 100 pages, and extracted text to one million characters. Combined model uploads are limited to 19 MB.
4. Ask your question. The answer streams into the floating assistant. Context stays attached for follow-ups; the original selected image remains available locally. A crop includes only that area, so a question about something outside it needs a new selection or a full-screen attachment. Large text documents are searched again for each question.
5. After an answer, pressing your shortcut starts a fresh floating chat. Earlier chats remain in history. To keep discussing the current attachment, type a follow-up in the existing bar.
6. Choose **Open in workspace** to start a new workspace chat with any unsent draft and attachment. Earlier chats stay available in the sidebar.

You can also ask Horizon to open an indexed project in VS Code, for example, “open my code security reviewer project in VS Code.” If Horizon cannot identify one project, add its parent folder under **Preferences → Project Roots** and try again. Requests for sensitive actions pause for your review. Physical mouse clicks and typing in other apps are not connected to a native input adapter in this release, so some computer-use requests cannot complete.

Image and document questions take a direct Gemini path. Small crops retain lossless text; larger image uploads use a 2400-pixel maximum edge and compact JPEG while the original stays local. There is no seven-second cutoff. A 60-second connection guard handles stalled requests, and transient provider errors can use a second fast model. Response time depends on Gemini, document size and connectivity.

Expand **Timing** below an attachment answer for capture/crop, file validation, Defender scan, parsing, PDF page rendering, context preparation, response headers, first text, stream completion and answer rendering. **Show local timing logs** opens the folder containing `latency.jsonl`. Logs rotate at 5 MB and contain timing metadata only. Answer time excludes earlier attachment preparation and time spent choosing context; some stage timings overlap.

## Privacy and access

- The shortcut alone does not capture the screen. You choose when to attach context. Action requests may also inspect the screen as part of the requested task. When Gemini handles an attachment question, the prompt, recent conversation and selected image/document context are sent to Google. Text PDFs normally send extracted text; scanned PDFs and visual questions send locally rendered images of up to three relevant pages. Ask for **page 5**, for example, to inspect another page. The original stays local for follow-ups. Screen element detection runs on the device.
- Chats, project indexes, and audit records are stored on your computer. Standard-build Gemini keys are encrypted for the Windows account.
- Scanned document copies and extracted context are retained locally for follow-ups. Executables, archives, Office documents/macros, binary text and active PDF content are blocked. Defender must be enabled with current definitions; scan failures block use. Explicit injection patterns are screened, and file/PDF questions have no desktop tools. Antivirus and injection defenses reduce risk; they cannot certify that every unknown threat is absent.
- The temporary friends installer contains an owner-provided Gemini credential in its packaged resources. Recipients can extract it. Keep the installer and its download link within the intended private group. Local limits of 10 model calls per minute and 100 per rolling 24 hours reduce accidental use, but cannot enforce a secure per-user quota. A hosted service is needed for that.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Shortcut does nothing | Check **Preferences → Hotkey Trigger** for **Active across Windows**. Select another shortcut or choose **Enable shortcut**. Confirm Horizon is running in the tray. |
| A project is not found | Add its parent folder under **Preferences → Project Roots**. Use the project's name in the request. |
| Gemini reports 503, a timeout, or a quota error | Retry after a short pause. A 503 or timeout can occur while the key is valid; a quota error may require waiting for provider capacity. |
| You need to stop Horizon | Use **Quit** in the system tray. Closing the workspace window leaves the shortcut active. |

## Develop and package

The desktop app uses Electron and React. Electron's main process owns the shortcut, screen capture, project index, and agent coordinator. The packaged app includes a local Python perception service for screen elements. See [packaging notes](packaging/README.md) for installer and verification details.

Prerequisites: Windows 10/11 (x64), Node.js 20 or 22, and Python 3.13 with the perception service dependencies installed in `backend/perception-service/.venv` for packaging.

```powershell
npm install
npm install --prefix frontend
npm install --prefix backend/agent-service
npm run dev:desktop
```

Useful checks and builds:

```powershell
npm run test:frontend
npm run test:desktop:commands
npm run test:desktop:hotkeys
npm run test:desktop:vision
npm run test:desktop:attachments
npm run build:desktop
npm run package:win
```

The private friends build is an explicit opt-in described in the [packaging notes](packaging/README.md). Never commit a Gemini key or the generated installer to this repository.

## License

[ISC](LICENSE).
