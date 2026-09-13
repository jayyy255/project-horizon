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
    if (onConsentGiven) {
      onConsentGiven();
    }
    setTimeout(() => setStatus("unsubmitted"), 2500);
  };

  return (
    <div 
      className={`w-[560px] max-w-full rounded-3xl p-6 sm:p-7 border shadow-2xl transition-all ${
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
          <p className="text-xs text-slate-500 dark:text-slate-400">Desktop Sandboxing &amp; Privacy Boundary Agreement</p>
        </div>
      </div>

      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
        Horizon executes visual desktop actions via Google Gemini multimodal embeddings. Review our three immutable safety boundaries before activation:
      </p>

      {/* 3 Privacy Boundary Cards */}
      <div className="space-y-2.5 mb-4">
        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850 flex items-start gap-3">
          <CameraOff size={17} className="text-[#8CC1E9] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-700 dark:text-slate-300">
            <span className="font-bold text-[#0055A0] dark:text-[#8CC1E9]">No Passive Background Capture:</span> Screen buffers are frozen exclusively upon your explicit hotkey or lasso drag.
          </div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850 flex items-start gap-3">
          <Database size={17} className="text-[#438BC4] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-700 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-[#FFF8E7]">Local SQLite Storage:</span> Task histories and audit trails stay fully encrypted in local storage with zero cloud retention.
          </div>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-carbon-850 flex items-start gap-3">
          <ShieldCheck size={17} className="text-[#8CC1E9] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-700 dark:text-slate-300">
            <span className="font-bold text-[#0055A0] dark:text-[#8CC1E9]">Dual-Model Sandbox:</span> Shell commands and destructive filesystem modifications block until Tier 2 confirmation.
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
          <span>{status === "enabled" ? "Gemini Enabled ✓" : "Enable Agent"}</span>
        </button>
      </div>
    </div>
  );
};
