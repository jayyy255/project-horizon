import React, { useState } from 'react';
import { CameraOff, Database, ShieldCheck } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

interface FirstRunConsentModalProps {
  isDarkMode: boolean;
  onConsentGiven?: () => void;
  onConsentDeclined?: () => void;
}

export const FirstRunConsentModal: React.FC<FirstRunConsentModalProps> = ({ 
  isDarkMode,
  onConsentGiven,
  onConsentDeclined
}) => {
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState("unsubmitted");

  const handleEnable = () => {
    if (!agreed) return;
    setStatus("enabled");
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('horizon_hotkey_approved', 'true');
      }
      if (typeof window !== 'undefined' && (window as any).horizonAPI?.approveHotkey) {
        (window as any).horizonAPI.approveHotkey('CommandOrControl+Shift+C');
      }
    } catch {}
    if (onConsentGiven) {
      onConsentGiven();
    }
    setTimeout(() => setStatus("unsubmitted"), 2500);
  };

  return (
    <div 
      className={`w-[580px] max-w-full rounded-3xl p-6 sm:p-7 border shadow-2xl transition-all ${
        isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/35' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/35'
      }`}
    >
      {/* Title & Gemini Authorization */}
      <div className="flex items-center gap-3.5 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#12284B] via-[#0055A0] to-[#438BC4] text-[#FFF8E7] border border-[#8CC1E9]/50 flex items-center justify-center flex-shrink-0 shadow-lg">
          <GeminiSparkle size={24} />
        </div>
        <div>
          <h3 className="text-base font-bold">Google Gemini Multimodal Authorization</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Desktop Sandboxing, Hotkey Setup &amp; Privacy Agreement</p>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
        Project Horizon runs locally as your conversational desktop agent. Upon your approval, the global desktop shortcut is automatically registered to enable Circle-to-Search and AI multimodal chat:
      </p>

      {/* Hotkey Auto-Configuration Card */}
      <div className="p-3.5 rounded-2xl border border-[#8CC1E9]/40 bg-gradient-to-r from-[#0055A0]/10 via-[#438BC4]/10 to-[#8CC1E9]/10 flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#0055A0]/20 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/30">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Automatic Global Shortcut</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Auto-Registered</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Press to freeze screen, lasso any UI element, or summon Horizon AI
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-[#0055A0] dark:text-[#8CC1E9] bg-white dark:bg-carbon-900 px-3 py-1.5 rounded-xl border border-[#8CC1E9]/40 shadow-sm">
          <span>Win</span>
          <span>+</span>
          <span>Shift</span>
          <span>+</span>
          <span>C</span>
        </div>
      </div>

      {/* 3 Privacy Boundary Cards */}
      <div className="space-y-2 mb-4">
        <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850 flex items-start gap-3">
          <CameraOff size={16} className="text-[#8CC1E9] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-700 dark:text-slate-300">
            <span className="font-bold text-[#0055A0] dark:text-[#8CC1E9]">No Background Recording:</span> Screen buffers freeze exclusively upon your explicit hotkey or lasso drag.
          </div>
        </div>

        <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850 flex items-start gap-3">
          <Database size={16} className="text-[#438BC4] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-700 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-[#FFF8E7]">Local SQLite Storage:</span> Past conversations, indices, and audit trails stay encrypted on your device.
          </div>
        </div>

        <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850 flex items-start gap-3">
          <ShieldCheck size={16} className="text-[#8CC1E9] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-700 dark:text-slate-300">
            <span className="font-bold text-[#0055A0] dark:text-[#8CC1E9]">Dual-Model Sandbox:</span> Shell commands and destructive file operations halt for Tier 2 confirmation.
          </div>
        </div>
      </div>

      {/* Mandatory Consent Checkbox */}
      <label className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-[#8CC1E9]/10 transition-colors mb-5">
        <input 
          type="checkbox" 
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="w-4 h-4 rounded text-[#0055A0] focus:ring-[#8CC1E9] border-slate-300 dark:border-slate-700 cursor-pointer"
        />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          I authorize visual desktop transmission to Gemini API for requested desktop actions.
        </span>
      </label>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={onConsentDeclined || (() => alert("Authorization declined."))}
          className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          Decline &amp; Exit
        </button>
        <button
          disabled={!agreed}
          onClick={handleEnable}
          className={`px-6 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
            agreed 
              ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] hover:brightness-110 shadow-lg shadow-[#438BC4]/30 border border-[#FFF8E7]/40'
              : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
        >
          <GeminiSparkle size={14} />
          <span>{status === "enabled" ? "Hotkey Registered & Enabled ✓" : "Enable Agent"}</span>
        </button>
      </div>
    </div>
  );
};
