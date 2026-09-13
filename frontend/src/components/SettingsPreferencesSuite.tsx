import React, { useState } from 'react';
import { 
  Sliders, 
  Keyboard, 
  FolderGit2, 
  Cpu, 
  Clock, 
  LayoutGrid, 
  Command, 
  Plus, 
  Folder 
} from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

interface SettingsPreferencesSuiteProps {
  isDarkMode: boolean;
  onSaveSettings?: (settings: Record<string, unknown>) => void;
}

export const SettingsPreferencesSuite: React.FC<SettingsPreferencesSuiteProps> = ({ 
  isDarkMode 
}) => {
  const [activeTab, setActiveTab] = useState("hotkeys");
  const [hotkey, setHotkey] = useState("Win + Shift + C");
  const [backend, setBackend] = useState("gpu");
  const [retention, setRetention] = useState("7d");
  const [dockAnchor, setDockAnchor] = useState("top-right");
  const [projectRoots, setProjectRoots] = useState([
    { path: "~/Projects/horizon-agent", badge: "Primary" },
    { path: "~/Documents/ClientDesigns", badge: "Assets" }
  ]);

  return (
    <div 
      className={`w-[720px] max-w-full h-[490px] rounded-3xl border shadow-2xl flex flex-col overflow-hidden transition-all ${
        isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/35' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/35'
      }`}
    >
      {/* Header */}
      <div className="p-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#12284B] to-[#438BC4] text-[#FFF8E7] border border-[#8CC1E9]/40 flex items-center justify-center shadow-sm">
            <Sliders size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Gemini Agent Preferences &amp; Controls</h3>
            <p className="text-[11px] text-slate-400">Desktop Orchestration Settings</p>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full font-mono text-[10px] bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/35">
          CONFIG_SYNCED
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar Tabs */}
        <div className="w-52 border-r border-slate-200/80 dark:border-slate-800/80 p-3 space-y-1 bg-slate-50/50 dark:bg-carbon-900/50">
          {[
            { id: "hotkeys", label: "Hotkey Trigger", icon: Keyboard },
            { id: "roots", label: "Project Roots", icon: FolderGit2 },
            { id: "backend", label: "Inference Engine", icon: Cpu },
            { id: "retention", label: "Retention Window", icon: Clock },
            { id: "docking", label: "HUD Dock Position", icon: LayoutGrid },
          ].map(t => {
            const IconComponent = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full px-3 py-2.5 rounded-2xl text-xs font-medium flex items-center gap-2.5 text-left transition-all ${
                  activeTab === t.id
                    ? 'bg-[#8CC1E9]/20 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/40 font-semibold shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
              >
                <IconComponent size={15} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Pane */}
        <div className="flex-1 p-5 sm:p-6 overflow-y-auto space-y-4">
          {activeTab === 'hotkeys' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider horizon-gradient-text">Screen Capture Hotkey</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Combination that activates the freeze overlay and Gemini lasso tool.</p>
              <div className="flex items-center gap-3 pt-2">
                <div className="px-4 py-2.5 rounded-2xl font-mono text-sm border bg-slate-50 dark:bg-carbon-850 border-slate-200 dark:border-slate-700 text-[#0f172a] dark:text-[#FFF8E7] flex items-center gap-2 shadow-sm">
                  <Command size={15} />
                  <span className="font-bold">{hotkey}</span>
                </div>
                <button 
                  onClick={() => setHotkey(hotkey === "Win + Shift + C" ? "Ctrl + Space" : "Win + Shift + C")}
                  className="px-3.5 py-2.5 rounded-2xl text-xs border border-slate-200 dark:border-slate-700 hover:border-[#8CC1E9] text-slate-700 dark:text-slate-300 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] transition-colors"
                >
                  Cycle Hotkey
                </button>
              </div>
            </div>
          )}

          {activeTab === 'roots' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider horizon-gradient-text">Indexed Project Roots</h4>
                <button 
                  onClick={() => {
                    const path = prompt("Enter directory path:", "~/workspace/glsl-engine");
                    if (path) setProjectRoots(prev => [...prev, { path, badge: "Custom" }]);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] border border-[#FFF8E7]/30 flex items-center gap-1.5 shadow-md shadow-[#438BC4]/25"
                >
                  <Plus size={13} />
                  <span>Add Path</span>
                </button>
              </div>
              <div className="space-y-2">
                {projectRoots.map((root, i) => (
                  <div key={i} className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-carbon-850 text-xs font-mono">
                    <div className="flex items-center gap-2 truncate">
                      <Folder size={15} className="text-[#438BC4]" />
                      <span className="truncate">{root.path}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/35">
                      {root.badge}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'backend' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider horizon-gradient-text">Inference Engine Hardware</h4>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div 
                  onClick={() => setBackend("gpu")}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    backend === 'gpu' 
                      ? 'border-[#8CC1E9] bg-[#8CC1E9]/15 shadow-[0_0_20px_rgba(67,139,196,0.3)]' 
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-[#0055A0] dark:text-[#8CC1E9] flex items-center gap-1.5">
                      <GeminiSparkle size={12} />
                      <span>DirectML / GPU</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#438BC4]">~650ms</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Accelerated Gemini Vision tensor execution for instant bounding regressions.</p>
                </div>

                <div 
                  onClick={() => setBackend("cpu")}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    backend === 'cpu' 
                      ? 'border-[#8CC1E9] bg-[#8CC1E9]/15 shadow-[0_0_20px_rgba(67,139,196,0.3)]' 
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-slate-700 dark:text-slate-300">CPU Fallback</span>
                    <span className="font-mono text-[10px] text-slate-400">~1200ms</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Preserves discrete GPU memory bandwidth for 3D graphics and games.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'retention' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider horizon-gradient-text">Screenshot Retention Window</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Automatic pruning period for encrypted local frame buffers.</p>
              <div className="flex items-center gap-2 pt-2">
                {["24h", "7d", "30d", "Forever"].map(val => (
                  <button
                    key={val}
                    onClick={() => setRetention(val)}
                    className={`flex-1 py-2 rounded-2xl text-xs font-mono font-medium border transition-all ${
                      retention === val
                        ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] font-bold border-[#FFF8E7]/40 shadow-md shadow-[#438BC4]/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-carbon-850'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'docking' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider horizon-gradient-text">HUD Quadrant Docking</h4>
              <div className="grid grid-cols-2 gap-2.5 max-w-xs pt-1">
                {[
                  { id: "top-left", label: "Top-Left" },
                  { id: "top-right", label: "Top-Right" },
                  { id: "bottom-left", label: "Bottom-Left" },
                  { id: "bottom-right", label: "Bottom-Right" },
                ].map(q => (
                  <button
                    key={q.id}
                    onClick={() => setDockAnchor(q.id)}
                    className={`p-3 rounded-2xl border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                      dockAnchor === q.id 
                        ? 'bg-[#8CC1E9]/20 text-[#0055A0] dark:text-[#8CC1E9] border-[#8CC1E9] font-bold' 
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 bg-slate-50 dark:bg-carbon-850'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${dockAnchor === q.id ? 'bg-[#438BC4]' : 'bg-slate-400'}`} />
                    <span>{q.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
