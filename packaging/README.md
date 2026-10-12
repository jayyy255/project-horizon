# Windows installer

Use Node.js and the repository's npm lockfiles. Create `backend/perception-service/.venv` with Python 3.13, then install its requirements. The model at `backend/perception-service/models/yolov8n.onnx` is tracked.

Run `npm run package:win`. This builds the current UI/Electron sources, downloads the official Python 3.13.2 x64 embeddable distribution, copies the installed perception dependencies, compiles the native window verifier with Windows' .NET Framework compiler, and creates an NSIS per-user installer. Large unused development packages such as Torch and Ultralytics are excluded. The runtime is tested by initializing the ONNX and OCR engines before packaging. Python's [embeddable-package documentation](https://docs.python.org/3.13/using/windows.html#the-embeddable-package) describes this application-local distribution format.

Build artifacts and staging files are under ignored `release/`. App icons and packaging sources are tracked. No `.env`, user databases, screenshots or credentials are included in the payload.

Run `node packaging/verify-package.cjs` after packaging to check the actual executable, branding, Google sign-in UI, credential exclusion, delayed hotkey registration, bundled native verifier, and the bundled perception server on an isolated port without host Python. This local smoke test also checks the user's code-security-reviewer project command; change that prompt to an available project when running elsewhere. It uses an isolated user-data directory and the executable's loopback inspector, then terminates its own test processes. It does not call an external model.

The setup wizard supports an installation-directory choice, desktop shortcut and Start menu shortcut. The installer is unsigned unless a signing identity is configured for electron-builder. End users choose **Sign in with Google** under Preferences → Inference Engine. Shared Gemini access is provided by the [hosted backend](../backend/gemini-service/README.md), which must be deployed and configured first.

After committing and pushing the verified source to `origin/main`, run `node packaging/publish-release.cjs` to publish the installer and SHA-256 file on the project's GitHub release. The helper uses the existing Git credential in memory, uploads into a draft, and publishes only after the installer upload completes. Local screenshots, smoke reports and user profiles are not uploaded.

Credential-containing friends builds are retired. `package:win:friends` and `HORIZON_BUNDLE_OWNER_KEY=1` now fail before staging credentials. Use the ordinary `package:win` build; it includes public backend/client identifiers only. Neither Gemini nor OAuth client secrets are packaged.

`verify-friends.cjs` remains a historical verifier for withdrawn installers and should not be used to validate the hosted build. Publish a new hosted installer only after its package checks and a live signed-in backend answer have been verified.

The hosted build retains the PDF reader and native page-rendering dependency. `npm run test:desktop:attachments` checks file validation, scanning, PDF active-content rejection, page rendering, injection patterns and the answer-only tool boundary. `npm run test:desktop:context-ui` captures the native floating UI using synthetic account sessions and mocked image/document answers, with external requests blocked. It does not measure live Gemini latency. To exercise the packaged archive, set `HORIZON_TEST_PACKAGE_ROOT` to the absolute `release/win-unpacked/resources/app.asar/dist-electron` path before running either Electron test entry point directly. File scanning requires enabled Microsoft Defender with current definitions.
