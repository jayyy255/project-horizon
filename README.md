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

**Project Horizon** is an academic-grade, multimodal Windows desktop application that brings the speed and intuition of **Google Search AI Mode** and **Circle-to-Search** directly to the Windows operating system. 

When launched, Project Horizon automatically registers the global desktop shortcut (`Win + Shift + C` or `Ctrl + Shift + C`) upon your approval. From that point on, Horizon acts as a dedicated desktop AI chatbot app where you can review all past conversations, continue existing threads, and circle or inspect any open application, document, or screen region.

### Key Capabilities
1. **Conversational AI Mode Chatbot**: Persistent desktop cockpit modeled after the Google Search AI Mode experience. View all past chat threads in the left sidebar, seamlessly continue previous discussions, and initiate new multimodal investigations with full context memory.
2. **One-Click Hotkey Approval (`Win + Shift + C`)**: Prompts on first startup to automatically bind the global shortcut. Press the hotkey from any game, browser, IDE, or document to instantly freeze the desktop and lasso any UI element.
3. **Air-Gapped Local Perception (Set-of-Marks)**: Runs an on-device YOLOv8n ONNX neural network and RapidOCR engine on `http://127.0.0.1:4200`. Detects interactive buttons, input fields, containers, and text tags (`[0]`, `[1]`, `[2]...`) with zero screen data egress.
4. **Reflexive Intent Matching (< 1ms)**: Standard desktop tasks (launching Calculator, focusing VS Code, toggling system controls) match instantaneously with 0 tokens and zero cloud roundtrips.
5. **Two-Tier Human-in-the-Loop Safety Gate**: Read-only actions run autonomously (Tier 1), while destructive operations (file deletions, disk modifications, arbitrary shell executions) unconditionally pause for explicit human approval via a secure modal (Tier 2).
6. **Encrypted Local Memory**: All conversation histories, system knowledge graphs, full-text file indices, and verified action plans are stored 100% on-device in AES-256-GCM encrypted local SQLite databases.

---

## 💾 Installation & Quick Start

Project Horizon is distributed as a packaged desktop application for 64-bit Windows. **No website setup, manual cloning, or Node environment is required for end users.**

### 1. Download the Desktop Package
Download the latest Windows installer or standalone package from the [GitHub Releases](https://github.com/jayyy255/project-horizon/releases) page:
- **Installer**: `Project-Horizon-Setup.exe` (recommended for standard installation and desktop shortcut creation)
- **Portable**: `Project-Horizon-win-x64.zip` (extract and run `Project Horizon.exe` directly)

### 2. Launch & Approve Hotkey
1. Run the downloaded `Project-Horizon-Setup.exe`.
2. On first launch, Horizon will prompt for your authorization to register the global desktop shortcut:
   - **Default Hotkey**: `Win + Shift + C` (or `Ctrl + Shift + C`)
   - **Privacy Boundary**: Horizon never passively records your screen; screen buffers are captured exclusively when you press the hotkey or select a region.
3. Click **"Enable Agent"** (or Approve Hotkey). The shortcut is automatically registered with the Windows operating system.

### 3. Using Horizon as Your AI Chatbot
- **View Past Chats**: All prior questions, code explanations, and automation summaries appear in the **Past Chats** sidebar with timestamps, turn counts, and crop thumbnails.
- **Continue Any Conversation**: Click any past session to load its full message stream, review previous answers, and type follow-up questions.
- **Start a New Chat**: Click the **"+ New Chat"** button at the top of the sidebar.
- **Circle-to-Search**: Press `Win + Shift + C` anywhere in Windows to bring up the transparent lasso canvas, draw a boundary around what you want explained or automated, and press Enter to query Horizon AI.

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