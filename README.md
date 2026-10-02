# Project Horizon

<p align="center">
  <strong>System-Wide Multimodal Desktop & GUI Agent for Windows</strong><br>
  <em>Circle-to-Search Style Screen Capture + Autonomous Computer-Use Agent with Strict HITL Guardrails</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(x64)-blue?style=flat-square&logo=windows" alt="Windows Platform" />
  <img src="https://img.shields.io/badge/Shell-Electron%20%7C%20TypeScript-informational?style=flat-square&logo=electron" alt="Electron Shell" />
  <img src="https://img.shields.io/badge/UI-React%2019%20%7C%20TailwindCSS-61dafb?style=flat-square&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/Perception-YOLOv8%20ONNX%20%2B%20RapidOCR-green?style=flat-square&logo=python" alt="Perception Service" />
  <img src="https://img.shields.io/badge/LLM-Gemini%202.5%20%2F%203.5%20%7C%20Ollama%20Fallback-orange?style=flat-square&logo=google" alt="LLM Engine" />
  <img src="https://img.shields.io/badge/Security-Two--Tier%20HITL%20%2B%20AES--256--GCM-red?style=flat-square&logo=shield" alt="Safety & Encryption" />
  <img src="https://img.shields.io/badge/Tests-86%2F86%20Passing%20(100%25)-brightgreen?style=flat-square" alt="Test Status" />
</p>

---

## 📖 Overview

**Project Horizon** is an academic-grade, autonomous multimodal Windows desktop agent. It enables users to capture any on-screen area (or entire multi-monitor desktop), issue natural-language instructions, and execute complex, verified tasks across the operating system.

The system combines:
1. **Local Set-of-Marks (SoM) Vision**: YOLOv8n ONNX object detection and RapidOCR text recognition for fine-grained UI element grounding without cloud vision dependency.
2. **Reflexive Intent Matching**: Instantaneous (< 1ms, 0-token) deterministic path for common operations (app launches, window focusing, hotkeys).
3. **Adaptive Hybrid LLM Routing**: Primary cloud planning via Google Gemini 2.5 Flash / 3.5 Flash-Lite with automatic circuit-breaker failover to local offline Ollama models (Llama 3.2 Vision / Qwen 2.5).
4. **Load-Bearing Action Verification**: Win32 `EnumWindows` window polling and before/after pixel delta verification (>0%) ensuring actions produce real physical effects before reporting success.
5. **Deterministic Two-Tier Safety Gate**: Strict Human-in-the-Loop (HITL) authorization for privileged/destructive actions (file deletions, arbitrary shell scripts) and an instant hardware corner-slam panic switch (<20ms SLA).
6. **Learned Encrypted Command Cache**: Action plans verified 3 consecutive times are promoted to an on-device AES-256-GCM encrypted cache for rapid offline replay.

---

## 🏗️ System Architecture

Project Horizon operates as a native Windows desktop application with an in-process agent coordinator hosted inside Electron's main process, interacting directly with a decoupled local Python computer-vision service:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                PROJECT HORIZON ECOSYSTEM                                │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
               ┌────────────────────────────┴─────────────────────────────┐
               ▼                                                          ▼
┌────────────────────────────────────────────────────────┐    ┌───────────────────────────┐
│              NATIVE ELECTRON DESKTOP SHELL             │    │    Perception-Service     │
│  ┌────────────────────────┐  ┌──────────────────────┐  │    │   (Python 3.13 + FastAPI) │
│  │      Frontend UI       │  │   In-Process Agent   │  │    │        Port: 4200         │
│  │ (React 19 + Tailwind)  │  │   Host & Coordinator │  │    │  (YOLOv8 + OCR + SoM Tag) │
│  └───────────┬────────────┘  └──────────┬───────────┘  │    └─────────────┬─────────────┘
└──────────────┼──────────────────────────┼──────────────┘                  │
               │ Direct IPC Renderer      │ Direct IPC Method               │
               └──────────────────────────► (Reflexive / Cache / Router)    │
                                          ├─────────────────────────────────┘
                                          ▼
                         ┌─────────────────────────────────┐
                         │   Local SQLite Data Storage     │
                         │   - horizon_graph.db (Topology) │
                         │   - horizon_index.db (FTS5)     │
                         │   - horizon_cache.db (AES-256)  │
                         │   - horizon_audit.db (Auditing) │
                         └────────────────┬────────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
      ┌───────────────────────────┐               ┌───────────────────────────┐
      │   Cloud LLM Services      │               │   Local GPU Fallbacks     │
      │   - Gemini 2.5 Flash      │  (Failover)   │   - Ollama Llama 3.2 (3B) │
      │   - Gemini 3.5 Flash-Lite │ ────────────► │   - Ollama Vision (11B)   │
      │   - Gemini 2.5 Pro        │               │   - Qwen 2.5 (3B)         │
      └───────────────────────────┘               └───────────────────────────┘
```

---

## ⚡ Core Features & Subsystems

### 1. Screen Capture & Visual Selection
- **Native DWM Capture**: Uses Electron's `desktopCapturer` paired with pre-warmed WebRTC video streams to capture 1:1 physical resolution desktop frames (1920×1080 at 120 DPI) in **0.30ms p50**.
- **Interactive Catmull-Rom Lasso**: Freehand smooth lasso dragging with automatic 12px outward-padded Axis-Aligned Bounding Box (AABB) computation.
- **Multi-Monitor Display Awareness**: Normalizes coordinates across arbitrary multi-monitor topologies with negative coordinate bounds and DPI scaling.
- **Target App Isolation**: Explicit window-targeting filter prevents recursive self-capture of Project Horizon's own cockpit.

### 2. Local Perception Microservice (OmniParser + RapidOCR)
- **Air-Gapped Local Vision**: Python FastAPI service running on `http://127.0.0.1:4200` with zero outbound network egress.
- **YOLOv8n ONNX Model**: 3.2M parameter nano architecture (12.26 MB) running on DirectML / CPU, detecting buttons, inputs, icons, and containers in ~180ms.
- **RapidOCR ONNX Engine**: Text detection (DBNet) and recognition (CRNN) specialized for small UI fonts.
- **Set-of-Marks (SoM) Tagging**: Bounding box fusion overlays numbered badges (`[0]`, `[1]`, `[2]...`) to ground visual elements for LLM reasoning without coordinate hallucination.

### 3. Reflexive Intent Matching (Phase A)
- **Zero-Token Interception**: Unambiguous intents (`"open calculator"`, `"focus chrome"`, `"take a screenshot"`, `"copy"`) execute in **< 1ms** without cloud LLM roundtrips.
- **Store & Win32 App Resolution**: Automatically resolves Win32 binaries and Microsoft Store UWP applications via AppX AUMIDs (`explorer.exe shell:AppsFolder\<AppID>`).
- **Ambiguity Fallthrough**: Prompts containing pronouns, relative temporal constraints, or visual dependencies (`"open the file Sarah sent"`, `"check flight in Gmail"`) fall through to model planners.
- **VIPI Screen-Injection Isolation**: The reflexive matching layer is structurally isolated from perception buffers to prevent on-screen text from triggering autonomous commands.

### 4. Hybrid Model Router & Circuit Breaker (Phase B)
- **Dynamic Complexity Classification**: Routes lightweight tasks to `gemini-2.5-flash` and multimodal/visual reasoning tasks to `gemini-3.5-flash-lite` or `gemini-2.5-pro`.
- **Three-State Circuit Breaker**:
  - `CLOSED`: Normal operation tracking errors over a sliding 60s window.
  - `OPEN`: Trips after 3 consecutive failures; immediately reroutes requests to local Ollama (`llama3.2` / `llama3.2-vision`) without waiting for timeouts.
  - `HALF-OPEN`: After a 30s reset cooldown, sends a single canary probe to verify cloud recovery before restoring `CLOSED` status.
- **Mandatory VIPI Defense Directive**: Every prompt template enforces the Visual Indirect Prompt Injection defense directive, preventing models from following instructions embedded in visual screenshots.

### 5. Learned Per-User Command Cache (Phase C)
- **AES-256-GCM Encryption**: Verified action plans are encrypted at rest with AES-256-GCM in `horizon_cache.db`.
- **3x Consecutive Success Rule**: Actions remain in staging until successfully verified **3 consecutive times**. Any single failure resets the promotion streak to 0.
- **Binary Hash Validation**: Checks executable existence and SHA-256 file validity before replaying cached plans; automatically invalidates stale entries upon application updates.
- **Click Exclusion**: Absolute coordinate clicks (`click_element`) are excluded from caching to prevent execution drift caused by window repositioning.

### 6. Safety Gate & Load-Bearing Verification
- **Two-Tier Action Classification**:
  - **Tier 1 (Autonomous)**: Safe read-only inspections (`find_path`, `inspect_viewport`, `focus_window`, non-destructive clicks).
  - **Tier 2 (HITL Required)**: Destructive actions (file deletions, `rmdir`, `cmd.exe /c del`, arbitrary scripts) halt execution and prompt the user via a modal dialog.
  - **Hard Invariant**: No shortcut, cache replay, or reflexive match can bypass Tier 2 classification.
- **ActionVerifier Verification**:
  - `verifyAppLaunch`: Validates process PID and window visibility via native Win32 `EnumWindows` P/Invoke.
  - `verifyClickElementDelta`: Validates cursor Bézier trajectory and verifies before/after screen region pixel delta (>0%).
- **Hardware Panic Kill-Switch**: Physical mouse corner slam aborts execution and purges input queues in **< 20ms**.
- **Cryptographic Audit Ledger**: Every action and authorization is logged to `horizon_audit.db` with automated PII masking (`[EMAIL]`, `[PHONE]`, `[CARD]`).

---

## 🗄️ Local Database Storage

All agent data is maintained **100% on-device** in local SQLite databases:

| Database File | Class / Handler | Primary Responsibility |
| :--- | :--- | :--- |
| `horizon_graph.db` | `SystemKnowledgeGraph` | Stores user topology, open VS Code workspaces, directory containment, and application edges. |
| `horizon_index.db` | `ProjectIndexer` | SQLite FTS5 full-text search index over user workspace files and installed `Get-StartApps` applications. |
| `horizon_cache.db` | `CommandCache` | AES-256-GCM encrypted database storing verified user action plans promoted via the 3x rule. |
| `horizon_audit.db` | `AuditDatabase` | Append-only cryptographically hashed ledger recording all sessions, tool invocations, and Tier 2 approvals. |

---

## 📁 Repository Structure

```
project-horizon/
├── electron/                         # Native Electron application
│   ├── main.ts                       # Main process entry, IPC handlers & desktop capture
│   ├── preload.ts                    # ContextBridge secure API exposition
│   └── agent/                        # In-process Agent Coordinator & Engines
│       ├── coordinator.ts            # ReAct reasoning loop & tool dispatch
│       ├── gate.ts                   # SafetyGate (Tier 1 vs Tier 2 HITL classification)
│       ├── verifier.ts               # ActionVerifier (Win32 EnumWindows & pixel-delta checks)
│       ├── reflexive.ts              # ReflexiveMatcher (<1ms zero-token intent interceptor)
│       ├── router.ts                 # ModelRouter & CircuitBreaker (Gemini <-> Ollama)
│       ├── cache.ts                  # CommandCache (AES-256-GCM encrypted plan storage)
│       ├── indexer.ts                # ProjectIndexer (SQLite FTS5 & Get-StartApps catalog)
│       ├── graph.ts                  # SystemKnowledgeGraph (Topology & workspace mapping)
│       ├── synthesizer.ts            # InputSynthesizer (Bézier curves & panic corner slam)
│       └── db.ts                     # AuditDatabase (Cryptographic audit ledger)
├── frontend/                         # React 19 Frontend Shell
│   ├── src/                          # Contextual prompt bar, capture overlay & modal dialogs
│   └── dist/                         # Vite production bundle
├── backend/                          # Companion Microservices
│   ├── agent-service/                # Standalone Node.js agent microservice
│   └── perception-service/           # Python 3.13 FastAPI Perception Microservice
│       ├── server.py                 # FastAPI HTTP server (:4200)
│       ├── detector.py               # YOLOv8 ONNX + RapidOCR element detection
│       ├── som_visualizer.py         # Set-of-Marks badge rendering engine
│       └── models/yolov8n.onnx       # 12.26 MB ONNX model weights
├── shared/                           # Shared types, geometry & AABB algorithms
├── scripts/                          # Automated test suites, benchmarks & verification
│   ├── run_live_session.js           # Full 8-step live E2E packaged app test harness
│   ├── test_phase0_suite.js          # Phase 0 test suite (App resolution, EnumWindows, deltas)
│   ├── test_phasea_suite.js          # Phase A test suite (Reflexive intent matching)
│   ├── test_phaseb_suite.js          # Phase B test suite (Model routing & circuit breaker)
│   └── test_phasec_suite.js          # Phase C test suite (Command cache & AES-256 encryption)
└── docs/                             # Internal documentation
    └── DEVNOTES.md                   # Architectural notes, trade-off matrices & post-mortems (gitignored)
```

---

## 🚀 Getting Started

### Prerequisites
- **Operating System**: Windows 10 or Windows 11 (x64)
- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Python**: `3.11` – `3.13` (x64)
- **PowerShell**: 5.1+ (built into Windows)
- **Ollama** *(Optional for offline local GPU inference)*: [ollama.com](https://ollama.com/) with `llama3.2:latest` or `qwen2.5:3b`

### 1. Clone & Install Dependencies
```powershell
git clone https://github.com/jayyy255/project-horizon.git
cd project-horizon

# Install root dependencies
npm install

# Install frontend dependencies
npm install --prefix frontend

# Install agent-service dependencies
npm install --prefix backend/agent-service
```

### 2. Set Up Perception Microservice (Python)
```powershell
cd backend/perception-service

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt

cd ../..
```

### 3. Environment Configuration
Create a `.env` file in the project root:
```env
# Google Gemini API Key (Required for cloud planner)
GEMINI_API_KEY="your_actual_gemini_api_key_here"

# Perception Service Configuration
PERCEPTION_SERVICE_PORT=4200
PERCEPTION_CONFIDENCE_THRESHOLD=0.20

# Ollama Local Fallback Configuration (Optional)
OLLAMA_HOST="http://localhost:11434"
OLLAMA_TEXT_MODEL="qwen2.5:3b"
OLLAMA_VISION_MODEL="llama3.2-vision:latest"
```

---

## 💻 Running the Application

### Development Mode
Run all microservices concurrently (Frontend Vite, Agent Service, Python Perception Service):
```powershell
npm run dev:all
```

To run the full desktop application in development mode:
```powershell
npm run dev:desktop
```

### Packaging for Production
To build the standalone Windows application bundle (`win-unpacked`):
```powershell
# Compile frontend, agent, and electron
npm run build:desktop

# Package into release/win-unpacked/Project Horizon.exe
npm run package:dir
```

To generate the full NSIS Windows Installer (`.exe`):
```powershell
npm run package:win
```

---

## 🧪 Testing & Verification

Project Horizon includes **86 comprehensive automated tests** across all subsystems:

### Run Microservice Unit Tests
```powershell
# Run frontend unit tests (Vitest)
npm run test:frontend

# Run agent unit tests
npm run test:agent

# Run perception microservice tests (Pytest)
npm run test:perception

# Run all microservice tests concurrently
npm run test:all
```

### Run Architecture Phase Test Suites
```powershell
# Phase 0: Store app resolution, Win32 EnumWindows, ActionVerifier
node scripts/test_phase0_suite.js

# Phase A: Reflexive intent matching & zero-token interception
node scripts/test_phasea_suite.js

# Phase B: Dynamic model routing, circuit breaker & VIPI defense
node scripts/test_phaseb_suite.js

# Phase C: AES-256-GCM command cache, 3x promotion & validity check
node scripts/test_phasec_suite.js
```

### Run Real End-to-End Live Session Harness
To execute the live verification session against the real packaged desktop executable (`Project Horizon.exe`):
```powershell
node scripts/run_live_session.js
```

The harness runs 8 live tests sequentially:
1. **STEP 1**: Real native display capture, YOLOv8n + RapidOCR Set-of-Marks detection, visual question answering.
2. **STEP 2**: Reflexive intent matching (`open calculator`), shell activation, process PID and window verification.
3. **STEP 3**: Grounded GUI button click via cubic Bézier curve, confirming physical pixel delta > 0%.
4. **STEP 4**: Cloud Gemini multi-step ReAct planning (`find_path` + `launch_app` to open workspace).
5. **STEP 5**: Tier 2 safety gate interception, modal payload display, verification of file preservation during pending wait, and authorized deletion.
6. **STEP 6**: 3x promotion to AES-256-GCM encrypted command cache and subsequent replay with fresh Tier 1 classification.
7. **STEP 7**: Hardware panic kill-switch triggered by mouse corner slam during fullscreen window, aborting within SLA.
8. **STEP 8**: Circuit breaker trip from HTTPS failures to `OPEN`, fallback to Ollama, and restoration to `CLOSED` via canary probe.

---

## 🛡️ Security & Safety Invariants

Project Horizon is designed from the ground up around strict safety invariants:

1. **Zero Egress for Perception & State**: All screen captures, OCR detections, topological graphs, full-text indexes, and audit logs remain strictly on the local machine.
2. **No Shortcut Bypasses Tier 2**: Every proposed action (whether generated by Gemini, replayed from cache, or triggered reflexively) must pass through `SafetyGate.evaluate()`. Destructive operations unconditionally halt for human approval.
3. **Load-Bearing Verifications**: No action is marked successful based on API status codes alone; physical process creation, window rendering, or visual state changes must be confirmed.
4. **Instant Panic Abort**: A physical corner-slam gesture aborts agent operations and purges input queues in under 20 milliseconds, providing immediate physical override.
5. **Prompt Injection Defense**: Visual Indirect Prompt Injection (VIPI) directives isolate untrusted on-screen text from being interpreted as agent system commands.

---

## 📄 License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for details.