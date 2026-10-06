import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { GeminiSparkle } from './GeminiSparkle';

export interface TraceStep {
  id: number;
  toolName: string;
  duration: string;
  status: 'succeeded' | 'in-progress' | 'failed' | 'pending';
  params: Record<string, string | number>;
  reasoning: string;
}

interface ReActTracePanelProps {
  isDarkMode: boolean;
  steps?: TraceStep[];
  onClose?: () => void;
}

export const ReActTracePanel: React.FC<ReActTracePanelProps> = ({ 
  isDarkMode, 
  steps: customSteps,
  onClose 
}) => {
  const [copied, setCopied] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<number[]>([1, 2]);

  const steps = customSteps || [];

  const toggleAccordion = (stepId: number) => {
    setOpenAccordion(prev => 
      prev.includes(stepId) ? prev.filter(i => i !== stepId) : [...prev, stepId]
    );
  };

  const copyTrace = () => {
    setCopied(true);
    navigator.clipboard?.writeText(JSON.stringify(steps, null, 2));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className={`w-[580px] max-w-full rounded-3xl border shadow-2xl p-5 sm:p-6 relative overflow-hidden transition-all ${
        isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/35' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/35'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80 dark:border-slate-800/80 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#12284B] text-[#FFF8E7] border border-[#8CC1E9]/40 flex items-center justify-center shadow-md">
            <GeminiSparkle size={16} />
          </div>
          <div>
            <div className="text-xs font-bold horizon-gradient-text tracking-wide">Activity details</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Desktop agent · {steps.length} Actions</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyTrace}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700/80 hover:bg-[#8CC1E9]/15 text-slate-600 dark:text-slate-300 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] transition-all"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy trace"}</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Timeline Steps: #8CC1E9 -> #438BC4 -> #0055A0 -> #FFF8E7 */}
      <div className="trace-timeline">
        {steps.map((step) => {
          const isOpen = openAccordion.includes(step.id);
          return (
            <div key={step.id} className="trace-step text-xs">
              {/* Status node */}
              <div className={`trace-node trace-node-${step.status}`} aria-hidden="true" />

              {/* Step Card */}
              <div className={`p-3.5 rounded-2xl border transition-all ${
                isDarkMode 
                  ? 'bg-[#12151c]/75 border-slate-800 hover:border-[#8CC1E9]/50' 
                  : 'bg-slate-50/70 border-slate-200/90 hover:border-[#438BC4]/50 shadow-sm'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#0055A0] dark:text-[#8CC1E9]">Step {step.id}: {step.toolName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      step.status === 'succeeded' 
                        ? 'bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/35' 
                        : 'bg-[#FFF8E7]/25 text-[#12284B] dark:text-[#FFF8E7] border border-[#438BC4]/40'
                    }`}>
                      {step.status}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">{step.duration}</span>
                </div>

                {/* Parameters Display */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {Object.entries(step.params || {}).map(([k, v]) => (
                    <span key={k} className="px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                      <span className="text-[#0055A0] dark:text-[#8CC1E9] font-semibold">{k}:</span> {String(v)}
                    </span>
                  ))}
                </div>

                {/* Collapsible Reasoning Disclosure */}
                <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
                  <button
                    onClick={() => toggleAccordion(step.id)}
                    className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-[#0055A0] dark:hover:text-[#8CC1E9] transition-colors"
                  >
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <span>Why this action</span>
                  </button>
                  {isOpen && (
                    <p className="mt-1.5 pl-3 border-l-2 border-[#438BC4] text-[11px] leading-relaxed italic text-slate-600 dark:text-slate-300 bg-[#8CC1E9]/10 p-2 rounded-r-xl">
                      "{step.reasoning}"
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
