import React from 'react';

interface ComponentCardProps {
  id: string;
  spec: string;
  title: string;
  description: string;
  children: React.ReactNode;
  isDarkMode: boolean;
  actions?: React.ReactNode;
}

export const ComponentCard: React.FC<ComponentCardProps> = ({ 
  id, 
  spec, 
  title, 
  description, 
  children, 
  isDarkMode, 
  actions 
}) => {
  return (
    <section 
      id={id} 
      className={`scroll-mt-36 rounded-3xl p-6 sm:p-7 border transition-all duration-300 relative ${
        isDarkMode 
          ? 'bg-[#0e1117]/90 border-slate-800/90 hover:border-[#8CC1E9]/50 shadow-2xl hover:shadow-[0_0_35px_rgba(67,139,196,0.18)]' 
          : 'bg-white border-slate-200/90 hover:border-[#438BC4]/50 shadow-md hover:shadow-xl hover:shadow-[0_0_25px_rgba(140,193,233,0.2)]'
      }`}
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800/80 mb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-full font-mono text-[11px] font-bold tracking-wide bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/40">
              {spec}
            </span>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              {title}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed">
            {description}
          </p>
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>

      {/* Interactive Component Surface */}
      <div className="w-full flex items-center justify-center">
        {children}
      </div>
    </section>
  );
};
