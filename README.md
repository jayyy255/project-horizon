# Project Horizon

<p align="center">
  <strong>System-Wide Multimodal Desktop & GUI Agent for Windows</strong><br>
  <em>Conversational AI Mode Desktop App · Circle-to-Search Screen Lasso · Autonomous Computer-Use Agent</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Release-Windows%20Package%20(.exe)-0055A0?style=flat-square&logo=windows" alt="Windows Package" />
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011%20(x64)-blue?style=flat-square&logo=windows" alt="Windows Platform" />
  <img src="https://img.shields.io/badge/Hotkey-Win%20%2B%20Shift%20%2B%20C-8CC1E9?style=flat-square" alt="Hotkey" />
  <img src="https://img.shields.io/badge/UI-Google%20Search%20AI%20Mode-orange?style=flat-square&logo=google" alt="Google Search AI Mode" />
  <img src="https://img.shields.io/badge/Shell-Electron%20%7C%20TypeScript-informational?style=flat-square&logo=electron" alt="Electron Shell" />
  <img src="https://img.shields.io/badge/Perception-Local%20YOLOv8%20ONNX%20%2B%20RapidOCR-green?style=flat-square&logo=python" alt="Perception Service" />
  <img src="https://img.shields.io/badge/Security-Two--Tier%20HITL%20%2B%20AES--256--GCM-red?style=flat-square&logo=shield" alt="Safety & Encryption" />
</p>

---

## 📖 Overview

**Project Horizon** is a multimodal Windows desktop assistant for asking about selected screen context, finding projects, and launching applications. Version 1.1.1 uses a glass interface, JetBrains Mono, the Horizon app icon, and restrained pixel accents. Questions and follow-ups can be answered directly in the floating assistant.

After approval, Horizon registers the selected global shortcut, saves it in native app settings, and restores it on restart. Preferences show its actual availability. Closing the workspace keeps Horizon in the tray; use the tray's Quit command to stop it.

### Key Capabilities
1. **Conversational AI Mode Chatbot**: Native, edge-to-edge desktop cockpit modeled after the Google Search AI Mode experience. View all past chat threads in the left sidebar, seamlessly continue previous discussions, and initiate new multimodal investigations with full context memory.
2. **Floating Assistant (`Win + Shift + C`)**: Summon Horizon over your current app, ask a question, and read the answer in the same bar. Select screen context when needed and ask follow-ups without opening the full workspace. Preferences also offer `Ctrl + Space` and `Ctrl + Alt + H` when a shortcut is unavailable.
3. **Air-Gapped Local Perception (Set-of-Marks)**: Runs an on-device YOLOv8n ONNX neural network and RapidOCR engine on `http://127.0.0.1:4200` using a silent, windowless background worker (`pythonw.exe` with zero console popups). Detects interactive buttons, input fields, containers, and text tags (`[0]`, `[1]`, `[2]...`) with zero screen data egress.
4. **Direct Desktop Commands**: Simple app launches and screen capture use deterministic intent matching. Project-opening requests resolve an indexed folder and pass it directly to VS Code, like Explorer's Open with Code. Missing or ambiguous projects return clear errors.
5. **Two-Tier Human-in-the-Loop Safety Gate**: Read-only actions run autonomously (Tier 1), while destructive operations (file deletions, disk modifications, arbitrary shell executions) unconditionally pause for explicit human approval via a secure modal (Tier 2).
6. **Local Storage**: Conversations, audit records and workspace indexes remain on the device. Cached action plans use AES-256-GCM; saved Gemini keys use Windows-backed Electron credential encryption. Prompts and submitted image context are sent to Gemini for cloud reasoning.

Physical typing, clicks, window focus and clipboard shortcuts are not connected to a native input adapter in this release. Complex requests do not resume planning after approval; Horizon reports the remaining task as unverified. Current-workspace queries cannot infer a full folder path from window titles alone.

---

## 💾 Installation & Quick Start

Project Horizon is distributed as a packaged desktop application for 64-bit Windows. **No website setup, manual cloning, or Node environment is required for end users.**

### 1. Download the Desktop Package
Download the latest Windows installer or standalone package from the [GitHub Releases](https://github.com/jayyy255/project-horizon/releases) page:
- **Private friends installer**: `Project-Horizon-Friends-Setup-1.1.1-x64.exe`, with owner-provided Gemini access and no user key setup. It uses a per-user wizard, installation-directory choice, desktop shortcut and Start menu entry.
- Python, perception models and the native window verifier are bundled. End users do not need Node.js, Python, Miniconda or a source checkout.
- Both build types exclude `.env` files and are currently unsigned. The explicitly opted-in friends build includes the owner's Gemini credential in its resources; keep that artifact private. The ordinary `package:win` build excludes owner credentials.

### 2. Launch & Approve Hotkey
1. Run the downloaded setup executable.
2. On first launch, Horizon will prompt for your authorization to register the global desktop shortcut:
   - **Default Hotkey**: `Win + Shift + C`; Preferences can switch to `Ctrl + Space` or `Ctrl + Alt + H`.
   - **Privacy Boundary**: Horizon never passively records your screen; screen buffers are captured exclusively when you press the hotkey or select a region.
3. Read the first-run disclosures, select the consent checkbox, and click **Continue**. The shortcut registers after that choice.
4. The friends build shows **Gemini access included** in Preferences → Inference Engine. No user API key is needed. In a standard build, a user can save a personal key with Windows-backed encryption.
5. If your projects are outside the discovered locations, add their parent folder in **Preferences → Project Roots**.

### 3. Using Horizon as Your AI Chatbot
- **View Past Chats**: All prior questions, code explanations, and automation summaries appear in the **Past Chats** sidebar with timestamps, turn counts, and crop thumbnails.
- **Continue Any Conversation**: Click any past session to load its full message stream, review previous answers, and type follow-up questions.
- **Start a New Chat**: Click the **"+ New Chat"** button at the top of the sidebar.
- **Floating answers**: Press the selected hotkey, type a prompt and press Enter. The bar grows to display the response and retains context for follow-ups. Expand into the workspace only when desired.
- **Circle-to-Search**: Use the floating bar's context menu to select a screen region, then ask about it in the same bar.

The temporary friends build applies local limits of 10 Gemini model calls per minute and 100 per rolling 24 hours, saved across restarts. Each planning turn consumes a call. Requests have a brief submit cooldown and capped output length. These local limits can be bypassed by someone who extracts the bundled key; shared server enforcement is planned when hosting is selected. Google's project-level quotas remain the provider-side limits.

---

## 🏗️ Desktop Architecture

Project Horizon is packaged as a high-performance Windows desktop application combining an Electron desktop shell, a React 19 UI cockpit, an in-process agent coordinator, and a local Python vision microservice:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           PROJECT HORIZON DESKTOP APPLICATION                           │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
               ┌────────────────────────────┴─────────────────────────────┐
               ▼                                                          ▼
┌────────────────────────────────────────────────────────┐    ┌───────────────────────────┐
│           ELECTRON NATIVE DESKTOP SHELL (x64)          │    │    Perception-Service     │
│  ┌────────────────────────┐  ┌──────────────────────┐  │    │   (Local Python 3.13)     │
│  │   AI Chatbot UI        │  │   In-Process Agent   │  │    │        Port: 4200         │
│  │ (React 19 + Tailwind)  │  │   Host & Coordinator │  │    │  (YOLOv8 + OCR + SoM Tag) │
│  └───────────┬────────────┘  └──────────┬───────────┘  │    └─────────────┬─────────────┘
└──────────────┼──────────────────────────┼──────────────┘                  │
               │ Direct IPC Renderer      │ Direct IPC Method               │
               └──────────────────────────► (Reflexive / Cache / Router)    │
                                          ├─────────────────────────────────┘
                                          ▼
                         ┌─────────────────────────────────┐
                         │   On-Device SQLite Storage      │
                         │   - horizon_graph.db (Topology) │
                         │   - horizon_index.db (FTS5)     │
                         │   - horizon_cache.db (AES-256)  │
                         │   - horizon_audit.db (Auditing) │
                         └────────────────┬────────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
      ┌───────────────────────────┐               ┌───────────────────────────┐
      │   Cloud Gemini Planners   │               │   Local Offline Fallback  │
      │   - Gemini 2.5 Flash      │  (Failover)   │   - Ollama Llama 3.2      │
      │   - Gemini 3.5 Flash-Lite │ ────────────► │   - Ollama Vision (11B)   │
      │   - Gemini 2.5 Pro        │               │   - Qwen 2.5 (3B)         │
      └───────────────────────────┘               └───────────────────────────┘
```

---

## 📁 Repository Structure (For Contributors)

For developers contributing to Project Horizon on GitHub, the repository is organized into the following core subsystems:

```
project-horizon/
├── electron/                         # Native Windows Electron desktop shell & coordinator
│   ├── main.ts                       # Main process entry, desktop capturer & global hotkeys
│   ├── preload.ts                    # Secure contextBridge API bindings
│   └── agent/                        # In-process Agent Coordinator & Engines
│       ├── coordinator.ts            # ReAct multi-step reasoning loop & tool dispatch
│       ├── gate.ts                   # SafetyGate (Tier 1 Autonomous vs Tier 2 HITL)
│       ├── verifier.ts               # ActionVerifier (Win32 EnumWindows & pixel-delta checks)
│       ├── reflexive.ts              # ReflexiveMatcher (<1ms zero-token intent interceptor)
│       ├── router.ts                 # ModelRouter & CircuitBreaker (Gemini <-> Ollama)
│       ├── cache.ts                  # CommandCache (AES-256-GCM encrypted plan storage)
│       ├── indexer.ts                # ProjectIndexer (SQLite FTS5 & Get-StartApps catalog)
│       ├── graph.ts                  # SystemKnowledgeGraph (Topology & workspace mapping)
│       ├── synthesizer.ts            # InputSynthesizer (Bézier curves & panic corner slam)
│       └── db.ts                     # AuditDatabase (Cryptographic audit ledger)
├── frontend/                         # Desktop Chatbot UI Shell (React 19 + TailwindCSS)
│   ├── src/
│   │   ├── App.tsx                   # Main AI Mode Chatbot app & session continuation
│   │   ├── components/               # Contextual prompt bar, lasso overlay & modals
│   │   ├── hooks/                    # Agent client hooks & state synchronization
│   │   └── styles/                   # Celestial dark/light theme tokens & liquid glass styles
│   └── vite.config.ts                # Frontend bundler configuration
├── backend/
│   ├── perception-service/           # Air-gapped local perception microservice
│   │   ├── server.py                 # FastAPI HTTP server (port 4200)
│   │   ├── detector.py               # YOLOv8 ONNX + RapidOCR element detection
│   │   ├── som_visualizer.py         # Set-of-Marks badge rendering engine
│   │   └── models/yolov8n.onnx       # YOLOv8n ONNX neural network weights
│   └── agent-service/                # Standalone agent coordinator service
├── shared/                           # Shared TypeScript interfaces, geometry & AABB algorithms
├── electron-builder.yml              # Windows desktop installer & packaging specification
├── package.json                      # Workspace configuration & desktop build scripts
└── LICENSE                           # License file
```

---

## 🛠️ Contributor Build Guide

If you are developing or contributing to the Project Horizon source code, follow these steps to build and package the application:

### 1. Prerequisites
- **OS**: Windows 10 or 11 (x64)
- **Node.js**: `v20.x` or `v22.x` (LTS)
- **Python**: `3.11` – `3.13` (x64)

### 2. Install Development Dependencies
```powershell
npm install
npm install --prefix frontend
npm install --prefix backend/agent-service
```

### 3. Build & Package Desktop Executable
```powershell
# Compile frontend, agent coordinator, and electron processes
npm run build:desktop

# Package into standalone unpackaged directory (release/win-unpacked/Project Horizon.exe)
npm run package:dir

# Build complete NSIS Windows installer (.exe)
npm run package:win
```

---

## 🛡️ Security, Privacy & Safety Invariants

Project Horizon is engineered with strict cryptographic and physical safety guarantees:

1. **Zero Egress for Perception & State**: Desktop screenshots, OCR tokens, system knowledge graphs, and audit databases never leave your machine.
2. **Deterministic Two-Tier Safety Gate**: Every action passes through `SafetyGate.evaluate()`. Destructive operations (file deletion, process termination, disk modification) halt execution until you confirm them in the Tier 2 modal.
3. **Physical Action Verification**: The agent verifies physical changes (process PID creation, Win32 window focus via `EnumWindows`, screen region pixel deltas > 0%) before declaring success.
4. **Hardware Panic Override**: A physical mouse corner-slam gesture aborts agent operations and clears synthetic input queues in under 20 milliseconds.
5. **Visual Prompt Injection (VIPI) Defense**: Mandatory system prompts instruct the planner to ignore instructions or commands embedded within target screenshots.

---

## 📄 License

This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for details.
