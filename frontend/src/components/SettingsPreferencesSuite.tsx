import { useEffect, useState } from 'react';
import { Sliders, Keyboard, FolderGit2, Cpu, Folder, Plus } from 'lucide-react';
interface SettingsPreferencesSuiteProps { isDarkMode: boolean; onSaveSettings?: (settings: Record<string, unknown>) => void; }
export function SettingsPreferencesSuite({ isDarkMode }: SettingsPreferencesSuiteProps) {
  const [activeTab, setActiveTab] = useState('hotkeys');
  const [hotkey, setHotkey] = useState(() => localStorage.getItem('horizon_hotkey') || 'Win + Shift + C');
  const [roots, setRoots] = useState<string[]>([]);
  const [health, setHealth] = useState<{status:string;backend?:string}>({status:'checking'});
  const [error, setError] = useState('');
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');
  useEffect(() => {
    window.horizonAPI?.getWorkspaceRoots?.().then(setRoots).catch(() => setError('Could not load workspaces.'));
    if (window.horizonAPI?.getPerceptionHealth) window.horizonAPI.getPerceptionHealth().then(setHealth).catch(() => setHealth({status:'offline'}));
    else setHealth({status:'offline'});
    window.horizonAPI?.getGeminiStatus?.().then(status => setGeminiConfigured(status.configured)).catch(() => setError('Could not load Gemini settings.'));
  }, []);
  const saveKey = async (value: string) => {
    setSavingKey(true); setError(''); setKeyMessage('');
    try {
      if (!window.horizonAPI?.saveGeminiKey) throw new Error('Key setup requires the desktop app.');
      const status = await window.horizonAPI.saveGeminiKey(value);
      setGeminiConfigured(status.configured); setApiKey('');
      setKeyMessage(status.configured ? 'Key saved. Gemini is ready for your next request.' : 'Saved key removed.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the key.'); }
    finally { setSavingKey(false); }
  };
  const cycleHotkey = async () => {
    const next = hotkey === 'Win + Shift + C' ? 'Ctrl + Space' : 'Win + Shift + C';
    try {
      const result = await window.horizonAPI?.approveHotkey?.(next === 'Ctrl + Space' ? 'CommandOrControl+Space' : 'Super+Shift+C');
      if (result && !result.success) throw new Error(result.error || 'Shortcut is unavailable.');
      localStorage.setItem('horizon_hotkey', next); setHotkey(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not register shortcut.'); }
  };
  return <div className={`preferences-panel w-[720px] max-w-full h-[490px] flex flex-col overflow-hidden rounded-2xl border ${isDarkMode ? 'liquid-glass-dark text-slate-100' : 'liquid-glass-light text-slate-900'}`}>
    <div className="px-6 py-5 border-b border-slate-500/15 flex items-center gap-3"><Sliders size={19} className="text-slate-400" /><div><h3 className="text-sm font-medium">Preferences &amp; Controls</h3><p className="text-[11px] text-slate-400 mt-1">Make Horizon fit your desktop.</p></div></div>
    <div className="flex flex-1 min-h-0"><nav className="w-48 p-3 border-r border-slate-500/15 space-y-1">
      {[{id:'hotkeys',label:'Hotkey Trigger',Icon:Keyboard},{id:'roots',label:'Project Roots',Icon:FolderGit2},{id:'backend',label:'Inference Engine',Icon:Cpu}].map(({id,label,Icon}) => <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-2.5 w-full px-3 py-3 rounded-lg text-xs text-left ${activeTab === id ? 'bg-slate-400/10' : 'text-slate-400 hover:bg-slate-400/5'}`}><Icon size={15} />{label}</button>)}
    </nav><div className="flex-1 min-w-0 p-6 overflow-auto">
      {activeTab === 'hotkeys' && <div><h4 className="text-sm font-medium">Screen Capture Hotkey</h4><p className="text-xs text-slate-400 mt-2 leading-relaxed">Summon the floating bar from anywhere. Add screen context there or expand into your workspace.</p><div className="flex items-center gap-3 mt-6"><kbd className="px-4 py-3 rounded-xl border border-slate-500/20 text-xs">{hotkey}</kbd><button className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200" onClick={cycleHotkey}>Cycle Hotkey</button></div></div>}
      {activeTab === 'roots' && <div><div className="flex items-center justify-between"><h4 className="text-sm font-medium">Indexed Project Roots</h4><button disabled={!window.horizonAPI?.addWorkspaceRoot} onClick={async () => { try { const next = await window.horizonAPI?.addWorkspaceRoot?.(); if (next) setRoots(next); } catch { setError('Could not index the selected folder.'); } }} className="flex items-center gap-1.5 text-xs text-slate-400 disabled:opacity-40"><Plus size={14} />Add Path</button></div><p className="text-xs text-slate-400 my-3 leading-relaxed">Choose the folders Horizon can search for projects and workspaces.</p>{roots.length === 0 && <p className="text-xs text-slate-400 mt-6">No workspace folders available.</p>}{roots.map(root => <div key={root} className="flex items-center gap-2 p-3 mt-2 rounded-xl border border-slate-500/15 text-[11px] font-mono break-all"><Folder size={15} className="flex-shrink-0 text-slate-400" />{root}</div>)}</div>}
      {activeTab === 'backend' && <div><h4 className="text-sm font-medium">Inference Engine</h4><p className="text-xs text-slate-400 mt-2 leading-relaxed">Screen elements are detected locally. Gemini reasons about your task and proposes actions.</p>
        <form className="mt-5" onSubmit={e => { e.preventDefault(); void saveKey(apiKey); }}>
          <div className="flex justify-between items-center mb-2"><label htmlFor="gemini-api-key" className="text-xs">Gemini API key</label><span className="text-[11px] text-slate-400">{geminiConfigured ? 'Configured' : 'Setup needed'}</span></div>
          <input id="gemini-api-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={geminiConfigured ? 'Enter a replacement key' : 'Paste your Gemini API key'} className="w-full rounded-lg border border-slate-500/20 bg-transparent px-3 py-2 text-xs outline-none focus:border-sky-400/50" />
          <div className="flex gap-3 mt-3"><button type="submit" disabled={savingKey || !apiKey.trim()} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs disabled:opacity-40">{savingKey ? 'Saving…' : 'Save key'}</button>{geminiConfigured && <button type="button" disabled={savingKey} onClick={() => void saveKey('')} className="text-xs text-slate-400">Remove key</button>}</div>
          <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">Your key is encrypted for this Windows account. Screen context is shared with Gemini when you submit it.</p>
          {keyMessage && <p role="status" className="text-xs text-sky-400 mt-3">{keyMessage}</p>}
        </form>
        <div className="p-4 border border-slate-500/15 rounded-xl mt-5"><div className="flex justify-between text-xs"><span>Local screen perception</span><span>{health.status === 'ok' ? 'Connected' : health.status === 'checking' ? 'Checking…' : 'Offline'}</span></div>{health.backend && <p className="text-[11px] text-slate-400 mt-3">{health.backend}</p>}</div><p className="text-[11px] text-slate-400 mt-4">Sensitive actions always pause for your review.</p></div>}
      {error && <p role="alert" className="text-xs text-rose-400 mt-4">{error}</p>}
    </div></div>
  </div>;
}
