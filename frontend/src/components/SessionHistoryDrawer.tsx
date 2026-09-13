import React, { useState } from 'react';
import { History, Send } from 'lucide-react';

interface SessionHistoryDrawerProps {
  isDarkMode: boolean;
  onSelectSession?: (sessionId: number) => void;
}

export const SessionHistoryDrawer: React.FC<SessionHistoryDrawerProps> = ({ 
  isDarkMode,
  onSelectSession
}) => {
  const [followUpQuery, setFollowUpQuery] = useState("");
  const [selectedId, setSelectedId] = useState(1);
  const [chatLog, setChatLog] = useState([
    { sender: "user", text: "What was on line 42 of that vertex shader crop?" },
    { sender: "gemini", text: "Line 42 contained: uniform vec3 uLightPosition;" }
  ]);

  const historyTasks = [
    {
      id: 1,
      prompt: "Explain compile error in WebGL vertex shader",
      time: "12m ago",
      status: "succeeded",
      thumb: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=160&auto=format&fit=crop&q=60"
    },
    {
      id: 2,
      prompt: "Open target repo in VS Code and branch to feature/liquid",
      time: "48m ago",
      status: "succeeded",
      thumb: "https://images.unsplash.com/photo-1618401471353-b98afee0b2eb?w=160&auto=format&fit=crop&q=60"
    }
  ];

  const sendFollowUp = () => {
    if (!followUpQuery.trim()) return;
    setChatLog(prev => [
      ...prev, 
      { sender: "user", text: followUpQuery },
      { sender: "gemini", text: `Retrospective analysis of crop #${selectedId}: Extracted target tokens successfully.` }
    ]);
    setFollowUpQuery("");
  };

  const handleSelect = (id: number) => {
    setSelectedId(id);
    if (onSelectSession) onSelectSession(id);
  };

  return (
    <div 
      className={`w-[450px] max-w-full rounded-3xl p-5 border shadow-2xl flex flex-col transition-all ${
        isDarkMode ? 'liquid-glass-dark text-slate-100 border-[#8CC1E9]/35' : 'liquid-glass-light text-slate-900 border-[#8CC1E9]/35'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80 mb-3">
        <div className="flex items-center gap-2">
          <History size={17} className="text-[#8CC1E9]" />
          <h3 className="text-xs font-bold uppercase tracking-wide horizon-gradient-text">Session Memory &amp; Follow-Up</h3>
        </div>
        <span className="text-[10px] font-mono text-[#FFF8E7]">NO_RECAPTURE_NEEDED</span>
      </div>

      {/* Past Task Cards */}
      <div className="space-y-2.5 mb-3">
        {historyTasks.map(item => (
          <div
            key={item.id}
            onClick={() => handleSelect(item.id)}
            className={`p-2.5 rounded-2xl border cursor-pointer transition-all ${
              selectedId === item.id
                ? 'border-[#8CC1E9] bg-[#8CC1E9]/15 shadow-md shadow-[#438BC4]/20'
                : 'border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-carbon-850 hover:border-slate-300'
            }`}
          >
            <div className="flex gap-2.5 items-center">
              <img 
                src={item.thumb} 
                alt="crop" 
                className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase font-bold bg-[#8CC1E9]/15 text-[#0055A0] dark:text-[#8CC1E9] border border-[#8CC1E9]/35">
                    {item.status}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">{item.time}</span>
                </div>
                <p className="text-xs font-medium truncate mt-1 text-slate-800 dark:text-slate-200">{item.prompt}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mini Retrospective Chat Display */}
      <div className="p-3 rounded-2xl bg-slate-100 dark:bg-carbon-950 border border-slate-200 dark:border-slate-800 text-xs space-y-2 mb-3 max-h-[140px] overflow-y-auto">
        {chatLog.map((c, i) => (
          <div key={i} className={`flex ${c.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`p-2.5 rounded-2xl max-w-[85%] text-[11px] ${
              c.sender === 'user' 
                ? 'bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] shadow-md shadow-[#438BC4]/25 font-semibold border border-[#FFF8E7]/30' 
                : 'bg-white dark:bg-carbon-850 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-sm'
            }`}>
              {c.text}
            </div>
          </div>
        ))}
      </div>

      {/* Inline Retrospective Input */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-carbon-850 shadow-sm">
        <input
          type="text"
          value={followUpQuery}
          onChange={(e) => setFollowUpQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendFollowUp()}
          placeholder="Ask Gemini about this crop..."
          className="flex-1 bg-transparent border-none outline-none text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 px-3"
        />
        <button
          onClick={sendFollowUp}
          className="p-2 rounded-full bg-gradient-to-r from-[#0055A0] via-[#438BC4] to-[#8CC1E9] text-[#FFF8E7] font-bold hover:brightness-110 transition-all flex items-center justify-center shadow-md shadow-[#438BC4]/30 border border-[#FFF8E7]/30"
        >
          <Send size={13} />
        </button>
      </div>
    </div>
  );
};
