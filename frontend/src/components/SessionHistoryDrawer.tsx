import { useState } from 'react';
import { History, Search, MessageSquare, ArrowUpRight } from 'lucide-react';
interface HistorySession { id: string; title: string; time: string; messages: Array<{ sender: string; text: string }>; thumbnail?: string; }
interface SessionHistoryDrawerProps { isDarkMode: boolean; sessions?: HistorySession[]; onSelectSession?: (sessionId: string) => void; }
export function SessionHistoryDrawer({ isDarkMode, sessions = [], onSelectSession }: SessionHistoryDrawerProps) {
  const [query, setQuery] = useState('');
  const filtered = sessions.filter(s => s.title.toLowerCase().includes(query.toLowerCase()) || s.messages.some(m => m.text.toLowerCase().includes(query.toLowerCase())));
  return <div className={`history-drawer h-full flex flex-col p-6 ${isDarkMode ? 'liquid-glass-dark text-slate-100' : 'liquid-glass-light text-slate-900'}`}>
    <div className="flex items-center gap-3 mb-2"><History size={18} /><h3 className="text-sm font-medium">Session Memory &amp; Follow-Up</h3></div>
    <p className="text-xs text-[var(--muted)] mb-6">Revisit a conversation and continue in your workspace.</p>
    <label className="flex items-center gap-2 rounded-xl border border-slate-500/20 px-3 py-2 mb-5"><Search size={15} className="text-[var(--muted)]" /><input aria-label="Search conversations" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search conversations…" className="bg-transparent border-0 text-xs min-w-0 flex-1 focus:ring-0" /></label>
    <div className="overflow-auto flex-1 space-y-2">
      {filtered.length === 0 && <p className="text-xs text-[var(--muted)] py-8 text-center">{query ? 'No conversations match your search.' : 'Your conversations will appear here.'}</p>}
      {filtered.map(s => <button key={s.id} onClick={() => onSelectSession?.(s.id)} className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-slate-500/15 hover:bg-slate-400/10 transition-colors"><MessageSquare size={16} className="text-[var(--muted)] flex-shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate text-xs">{s.title}</span><span className="block text-[10px] text-[var(--muted)] mt-1.5">{s.time} · {s.messages.filter(m => m.sender === 'user').length} prompts</span></span><ArrowUpRight size={14} className="text-[var(--muted)]" /></button>)}
    </div>
  </div>;
}
