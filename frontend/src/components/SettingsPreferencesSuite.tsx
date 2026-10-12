import { useEffect, useState } from 'react';
import { Sliders, Keyboard, FolderGit2, Cpu, Folder, Plus } from 'lucide-react';
import { useHotkeyStatus } from '../hooks/useHotkeyStatus';
import { DEFAULT_HOTKEY, HOTKEY_OPTIONS } from '@shared/hotkeys';
interface SettingsPreferencesSuiteProps { isDarkMode: boolean; onSaveSettings?: (settings: Record<string, unknown>) => void; }
export function SettingsPreferencesSuite({ isDarkMode }: SettingsPreferencesSuiteProps) {
  const [activeTab, setActiveTab] = useState('hotkeys');
  const { status: shortcut, loading: checkingShortcut, error: shortcutError, register: registerShortcut } = useHotkeyStatus();
  const [savingShortcut, setSavingShortcut] = useState(false);
  const [roots, setRoots] = useState<string[]>([]);
  const [health, setHealth] = useState<{status:string;backend?:string}>({status:'checking'});
  const [error, setError] = useState('');
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [ownerProvided, setOwnerProvided] = useState(false);
  const [hosted, setHosted] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string>();
  const [signingIn, setSigningIn] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');
  useEffect(() => {
    window.horizonAPI?.getWorkspaceRoots?.().then(setRoots).catch(() => setError('Could not load workspaces.'));
    if (window.horizonAPI?.getPerceptionHealth) window.horizonAPI.getPerceptionHealth().then(setHealth).catch(() => setHealth({status:'offline'}));
    else setHealth({status:'offline'});
    window.horizonAPI?.getGeminiStatus?.().then(status => { setGeminiConfigured(status.configured); setOwnerProvided(Boolean(status.ownerProvided)); setHosted(Boolean(status.hosted)); setAccountEmail(status.email); setSigningIn(Boolean(status.signingIn)); }).catch(() => setError('Could not load Gemini settings.'));
    return window.horizonAPI?.onAccountStatus?.(status => { setGeminiConfigured(status.signedIn); setAccountEmail(status.email); setSigningIn(status.signingIn); });
  }, []);
  const accountAction = async (signOut = false) => {
    setError(''); setKeyMessage(''); setSigningIn(!signOut);
    try {
      const action = signOut ? window.horizonAPI?.signOut : window.horizonAPI?.signIn;
      if (!action) throw new Error('Sign-in requires the updated desktop app.');
      const status = await action();
      setGeminiConfigured(status.configured); setAccountEmail(status.email);
      setKeyMessage(signOut ? 'Signed out on this device.' : 'Signed in. Horizon is ready for your questions.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not complete sign-in.'); }
    finally { setSigningIn(false); }
  };
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
  const changeHotkey = async (accelerator?: string) => {
    setSavingShortcut(true); setError('');
    try {
      const result = await registerShortcut(accelerator);
      if (!result.success) setError(result.error || 'Shortcut is unavailable.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not register shortcut.'); }
    finally { setSavingShortcut(false); }
  };
  return <div className={`preferences-panel w-[720px] max-w-full h-[490px] flex flex-col overflow-hidden rounded-2xl border ${isDarkMode ? 'liquid-glass-dark text-slate-100' : 'liquid-glass-light text-slate-900'}`}>
    <div className="px-6 py-5 border-b border-slate-500/15 flex items-center gap-3"><Sliders size={19} className="text-[var(--muted)]" /><div><h3 className="text-sm font-medium">Preferences &amp; Controls</h3><p className="text-[11px] text-[var(--muted)] mt-1">Make Horizon fit your desktop.</p></div></div>
    <div className="flex flex-1 min-h-0"><nav className="w-48 p-3 border-r border-slate-500/15 space-y-1">
      {[{id:'hotkeys',label:'Hotkey Trigger',Icon:Keyboard},{id:'roots',label:'Project Roots',Icon:FolderGit2},{id:'backend',label:'Inference Engine',Icon:Cpu}].map(({id,label,Icon}) => <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-2.5 w-full px-3 py-3 rounded-lg text-xs text-left ${activeTab === id ? 'bg-slate-400/10' : 'text-[var(--muted)] hover:bg-slate-400/5'}`}><Icon size={15} />{label}</button>)}
    </nav><div className="flex-1 min-w-0 p-6 overflow-auto">
      {activeTab === 'hotkeys' && <div>
        <h4 className="text-sm font-medium">Floating Assistant Hotkey</h4>
        <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">Summon Horizon over any app. Keep it running in the tray; closing the workspace leaves your shortcut active.</p>
        <label className="block mt-6">
          <span className="block text-[11px] text-[var(--muted)] mb-2">Shortcut</span>
          <select aria-label="Floating assistant shortcut" value={shortcut.accelerator} disabled={savingShortcut || checkingShortcut}
            onChange={event => void changeHotkey(event.target.value)} className="rounded-xl border border-slate-500/20 bg-transparent px-4 py-3 text-xs disabled:opacity-40">
            {HOTKEY_OPTIONS.map(option => <option key={option.accelerator} value={option.accelerator}>{option.label}</option>)}
          </select>
        </label>
        <p role="status" className="text-xs text-[var(--muted)] mt-4">{checkingShortcut ? 'Checking shortcut…' : savingShortcut ? 'Registering…' : shortcut.active ? 'Active across Windows' : 'Not active'}</p>
        {shortcut.notice && <p className="text-[11px] text-[var(--accent)] mt-3 leading-relaxed">{shortcut.notice}</p>}
        {!shortcut.active && <div className="flex flex-wrap gap-3 mt-4">
          <button disabled={savingShortcut || checkingShortcut} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs disabled:opacity-40" onClick={() => void changeHotkey()}>Enable shortcut</button>
          {shortcut.accelerator !== DEFAULT_HOTKEY.accelerator && <button disabled={savingShortcut || checkingShortcut} className="text-xs text-[var(--accent)] disabled:opacity-40" onClick={() => void changeHotkey(DEFAULT_HOTKEY.accelerator)}>Use {DEFAULT_HOTKEY.label}</button>}
        </div>}
        <p className="text-[11px] text-[var(--muted)] mt-5 leading-relaxed">Enable tries available alternatives if your shortcut is blocked. Your working choice is saved and restored when Horizon starts.</p>
      </div>}
      {activeTab === 'roots' && <div><div className="flex items-center justify-between"><h4 className="text-sm font-medium">Indexed Project Roots</h4><button disabled={!window.horizonAPI?.addWorkspaceRoot} onClick={async () => { try { const next = await window.horizonAPI?.addWorkspaceRoot?.(); if (next) setRoots(next); } catch { setError('Could not index the selected folder.'); } }} className="flex items-center gap-1.5 text-xs text-[var(--muted)] disabled:opacity-40"><Plus size={14} />Add Path</button></div><p className="text-xs text-[var(--muted)] my-3 leading-relaxed">Choose the folders Horizon can search for projects and workspaces.</p>{roots.length === 0 && <p className="text-xs text-[var(--muted)] mt-6">No workspace folders available.</p>}{roots.map(root => <div key={root} className="flex items-center gap-2 p-3 mt-2 rounded-xl border border-slate-500/15 text-[11px] font-mono break-all"><Folder size={15} className="flex-shrink-0 text-[var(--muted)]" />{root}</div>)}</div>}
      {activeTab === 'backend' && <div><h4 className="text-sm font-medium">Inference Engine</h4><p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">Screen elements are detected locally. Ask Horizon about your screen or documents, or open an indexed project.</p>
        {hosted ? <div className="p-4 border border-slate-500/15 rounded-xl mt-5">
          <h5 className="text-xs">Horizon account</h5>
          <p className="text-[11px] text-[var(--muted)] mt-3 leading-relaxed">{geminiConfigured ? `Signed in as ${accountEmail || 'your Google account'}.` : 'Sign in with an approved Google account to get answers. Gemini access is provided by Horizon.'}</p>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {geminiConfigured ? <button disabled={signingIn} onClick={() => void accountAction(true)} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs disabled:opacity-40">Sign out</button> : <button disabled={signingIn} onClick={() => void accountAction()} className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs disabled:opacity-40">{signingIn ? 'Waiting for Google…' : 'Sign in with Google'}</button>}
            {signingIn && <button onClick={() => void window.horizonAPI?.cancelSignIn?.()} className="text-xs text-[var(--muted)]">Cancel sign-in</button>}
          </div>
          <p className="text-[11px] text-[var(--muted)] mt-3 leading-relaxed">Your browser handles Google sign-in. Selected context is sent to Horizon’s service and Gemini when you submit a question.</p>
          {keyMessage && <p role="status" className="text-xs text-[var(--accent)] mt-3">{keyMessage}</p>}
        </div> : ownerProvided ? <div className="p-4 border border-slate-500/15 rounded-xl mt-5"><h5 className="text-xs">Gemini access included</h5><p className="text-[11px] text-[var(--muted)] mt-3 leading-relaxed">Provided by Horizon. Ask a question or attach a screen selection to get an answer—no API key setup needed.</p></div> : <form className="mt-5" onSubmit={e => { e.preventDefault(); void saveKey(apiKey); }}>
          <div className="flex justify-between items-center mb-2"><label htmlFor="gemini-api-key" className="text-xs">Gemini API key</label><span className="text-[11px] text-[var(--muted)]">{geminiConfigured ? 'Configured' : 'Setup needed'}</span></div>
          <input id="gemini-api-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={geminiConfigured ? 'Enter a replacement key' : 'Paste your Gemini API key'} className="w-full rounded-lg border border-slate-500/20 bg-transparent px-3 py-2 text-xs outline-none focus:border-sky-400/50" />
          <div className="flex gap-3 mt-3"><button type="submit" disabled={savingKey || !apiKey.trim()} className="rounded-lg border border-slate-500/20 px-3 py-2 text-xs disabled:opacity-40">{savingKey ? 'Saving…' : 'Save key'}</button>{geminiConfigured && <button type="button" disabled={savingKey} onClick={() => void saveKey('')} className="text-xs text-[var(--muted)]">Remove key</button>}</div>
          <p className="text-[11px] text-[var(--muted)] mt-3 leading-relaxed">Your key is encrypted for this Windows account. Screen context is shared with Gemini when you submit it.</p>
          {keyMessage && <p role="status" className="text-xs text-sky-400 mt-3">{keyMessage}</p>}
        </form>}
        <div className="p-4 border border-slate-500/15 rounded-xl mt-5"><div className="flex justify-between text-xs"><span>Local screen perception</span><span>{health.status === 'ok' ? 'Connected' : health.status === 'checking' ? 'Checking…' : 'Offline'}</span></div>{health.backend && <p className="text-[11px] text-[var(--muted)] mt-3">{health.backend}</p>}</div><p className="text-[11px] text-[var(--muted)] mt-4">Sensitive actions always pause for your review.</p></div>}
      {(error || (activeTab === 'hotkeys' && shortcutError)) && <p role="alert" className="text-xs text-rose-400 mt-4">{error || shortcutError}</p>}
    </div></div>
  </div>;
}
