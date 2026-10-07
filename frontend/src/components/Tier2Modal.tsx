import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Check } from 'lucide-react';
import { Tier2ActionPayload } from '@shared/types';

interface Tier2ModalProps {
  isDarkMode: boolean;
  payload?: Tier2ActionPayload;
  onAuthorize?: () => void;
  onDeny?: () => void;
}

export const Tier2Modal: React.FC<Tier2ModalProps> = ({
  isDarkMode,
  payload,
  onAuthorize,
  onDeny
}) => {
  const [authorized, setAuthorized] = useState(false);

  const defaultPayload: Tier2ActionPayload = {
    actionId: "action-sim-101",
    description: "Review Destructive File Modification",
    command: "rm -rf ./node_modules/.cache && rebuild_shaders --force",
    targetPath: "~/workspace/horizon",
    isDestructive: true,
    timestamp: Date.now()
  };

  const current = payload || defaultPayload;

  const handleAuth = () => {
    setAuthorized(true);
    if (onAuthorize) {
      onAuthorize();
    }
    setTimeout(() => setAuthorized(false), 3000);
  };

  return (
    <div
      className={`w-[520px] max-w-full rounded-3xl p-6 border-2 transition-all relative overflow-hidden shadow-2xl ${
        isDarkMode
          ? 'bg-[#111111]/95 border-[#8CC1E9]/50 shadow-[0_0_50px_rgba(67,139,196,0.22)] text-slate-100'
          : 'bg-white border-[#438BC4]/60 shadow-[0_0_40px_rgba(18,40,75,0.18)] text-slate-900'
      }`}
    >
      {/* Multi-stop Refractive Stripe: #181818 -> #0055A0 -> #438BC4 -> #8CC1E9 -> #FFFFFF */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#181818] via-[#0055A0] via-[#438BC4] via-[#8CC1E9] to-[#FFFFFF]" />

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#181818] to-[#0055A0] border border-[#8CC1E9]/40 text-[#FFFFFF] flex items-center justify-center flex-shrink-0 shadow-lg">
          <ShieldAlert size={24} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wide bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/35">
              Tier 2 Security Interrupter
            </span>
            <span className="text-[10px] font-mono text-[var(--muted)]">HIGH_PRIVILEGE</span>
          </div>
          <h3 className="text-lg font-bold mt-1 tracking-tight">
            {current.description}
          </h3>
          <p className="text-xs text-slate-500 dark:text-[var(--muted)] mt-1 leading-relaxed">
            Gemini detected a privileged or irreversible action. User approval is required to safeguard your workspace.
          </p>
        </div>
      </div>

      {/* Monospace Raw Command Payload Card */}
      <div className="mt-4 p-3.5 rounded-2xl font-mono text-xs bg-[#07080a] text-slate-200 border border-[#8CC1E9]/25 overflow-x-auto shadow-inner">
        <div className="text-[10px] uppercase text-[var(--muted)] font-semibold mb-1.5 flex items-center justify-between">
          <span>Target Payload</span>
          <span className="text-[#FFFFFF] font-mono">Scope: {current.targetPath || "Local System"}</span>
        </div>
        <code className="text-[#8CC1E9] block whitespace-pre-wrap">
          $ {current.command || (current.executablePath ? `${current.executablePath} ${(current.args || []).join(' ')}` : "Privileged Operation")}
        </code>
      </div>

      {/* Non-Repudiation Notice */}
      <div className="mt-3.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-[var(--muted)]">
        <ShieldCheck size={14} className="text-[#438BC4] flex-shrink-0" />
        <span>Your approval decision is recorded in the local audit history.</span>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          onClick={onDeny || (() => alert("Action safely declined."))}
          className={`px-4 py-2.5 rounded-2xl text-xs font-semibold border transition-all ${
            isDarkMode
              ? 'border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/60'
              : 'border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-100'
          }`}
        >
          Deny Execution
        </button>
        <button
          onClick={handleAuth}
          className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFFFFF] hover:brightness-110 shadow-lg shadow-[#438BC4]/30 border border-[#FFFFFF]/40 transition-all flex items-center gap-2"
        >
          <Check size={14} />
          <span>{authorized ? "Authorized ✓" : "Allow Execution"}</span>
        </button>
      </div>
    </div>
  );
};
