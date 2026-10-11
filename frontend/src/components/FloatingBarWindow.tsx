import { useEffect, useRef, useState } from 'react';
import { Maximize2, Plus, ShieldCheck, X } from 'lucide-react';
import { HorizonMark } from './HorizonMark';
import { ContextualPromptBar, ScreenAttachment } from './ContextualPromptBar';
import { useHorizonAgent } from '../hooks/useHorizonAgent';
import type { ReActSessionState } from '../services/agentClient';
import { TimingDetails } from './TimingDetails';
import type { LatencyReport } from '@shared/types';

interface FloatingMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  status?: 'working' | 'done' | 'error';
  attachments?: ScreenAttachment[];
  latency?: LatencyReport;
}
const timestamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function FloatingBarWindow({ isDarkMode }: { isDarkMode: boolean }) {
  const [attachments, setAttachments] = useState<ScreenAttachment[]>([]);
  const [messages, setMessages] = useState<FloatingMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [composerVersion, setComposerVersion] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const conversation = useRef<string | null>(null);
  const pending = useRef(false);
  const { sessionState, dispatchTask, submitTier2Decision } = useHorizonAgent();
  const approval = sessionState?.status === 'awaiting_tier2' ? sessionState.pendingTier2 : undefined;
  const reset = () => { if (pending.current || approval) return; conversation.current = null; setMessages([]); setAttachments([]); setDraft(''); setCaptureError(''); setComposerVersion(value => value + 1); };
  const resetRef = useRef(reset); resetRef.current = reset;
  useEffect(() => window.horizonAPI?.onFloatingNewChat?.(() => resetRef.current()), []);
  useEffect(() => { void window.horizonAPI?.setFloatingState?.({ completed: messages.some(message => message.sender === 'assistant' && message.status !== 'working'), busy: busy || capturing || Boolean(approval) }); }, [messages, busy, capturing, approval]);

  useEffect(() => {
    const focus = () => panel.current?.querySelector('textarea')?.focus();
    focus(); window.addEventListener('focus', focus);
    const unsubscribe = window.horizonAPI?.onAreaAttached?.(data => {
      if (data) setAttachments(prev => [...prev, { id: crypto.randomUUID(), label: data.label || 'Screen selection',
        type: data.type === 'fullscreen' ? 'fullscreen' : 'crop', coords: data.coords,
        croppedDataUrl: data.croppedDataUrl || data.dataUrl, traceId: data.traceId, timestamp: Date.now() }]);
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (panel.current) void window.horizonAPI?.resizeFloatingBar?.(Math.ceil(panel.current.getBoundingClientRect().height) + 16);
    });
    if (panel.current) observer?.observe(panel.current);
    return () => { unsubscribe?.(); observer?.disconnect(); window.removeEventListener('focus', focus); };
  }, []);
  useEffect(() => { if (feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [messages, busy, approval]);

  const save = (next: FloatingMessage[]) => {
    setMessages(next);
    if (!conversation.current) return;
    try {
      const sessions = JSON.parse(localStorage.getItem('horizon_chat_sessions') || '[]');
      const existing = sessions.find((session: { id: string }) => session.id === conversation.current);
      const session = { ...existing, id: conversation.current, createdAt: existing?.createdAt || Date.now(),
        title: next.find(message => message.sender === 'user')?.text.slice(0, 45) || 'Screen question',
        time: 'Just now', messages: next, thumbnail: next[0]?.attachments?.[0]?.croppedDataUrl };
      localStorage.setItem('horizon_chat_sessions', JSON.stringify([session, ...sessions.filter((item: { id: string }) => item.id !== session.id)]));
      localStorage.setItem('horizon_active_session_id', session.id);
    } catch (error) { console.warn('[FloatingBar] Could not save conversation:', error); }
  };
  const reply = (state: ReActSessionState, current: FloatingMessage[]) => {
    const receivedAt = performance.now();
    save(current.map((message, index) => index === current.length - 1
      ? { ...message, text: state.currentNarration, latency: state.latency, status: state.status === 'error' ? 'error' : state.status === 'awaiting_tier2' ? 'working' : 'done' } : message));
    if (state.latency) requestAnimationFrame(() => requestAnimationFrame(() => void window.horizonAPI?.recordRenderLatency?.(state.latency!.id, performance.now() - receivedAt)));
  };

  const submit = async (prompt: string, context: ScreenAttachment[]) => {
    if (pending.current || approval || !prompt.trim()) return;
    pending.current = true; setBusy(true);
    conversation.current ||= `session-${crypto.randomUUID()}`;
    const history = messages.filter(message => message.status !== 'working' && message.status !== 'error')
      .slice(-10).map(message => ({ role: message.sender, text: message.text }));
    const current: FloatingMessage[] = [...messages,
      { id: crypto.randomUUID(), sender: 'user', text: prompt, timestamp: timestamp(), attachments: context },
      { id: crypto.randomUUID(), sender: 'assistant', text: 'Thinking…', timestamp: timestamp(), status: 'working' }];
    save(current);
    try { reply(await dispatchTask(prompt, context.map(item => item.croppedDataUrl).filter((url): url is string => Boolean(url)), history, context), current); }
    catch (error) { reply({ currentNarration: error instanceof Error ? error.message : 'Could not get an answer.', status: 'error' } as ReActSessionState, current); }
    finally { pending.current = false; setBusy(false); }
  };
  const decide = async (authorized: boolean) => {
    if (!approval || pending.current) return;
    pending.current = true; setBusy(true);
    try { reply(await submitTier2Decision(approval.actionId, authorized), messages); }
    catch (error) { reply({ currentNarration: error instanceof Error ? error.message : 'Could not send your decision.', status: 'error' } as ReActSessionState, messages); }
    finally { pending.current = false; setBusy(false); }
  };
  const captureScreen = async () => {
    setCaptureError(''); setCapturing(true);
    try {
      const data = await window.horizonAPI?.captureDesktop();
      if (data?.dataUrl) setAttachments(prev => [...prev, { id: crypto.randomUUID(), label: data.displayLabel || 'Desktop',
        type: 'fullscreen', croppedDataUrl: data.dataUrl, traceId: data.traceId, timestamp: Date.now() }]);
    } catch { setCaptureError('Could not capture your screen. Try again.'); }
    finally { setCapturing(false); }
  };
  const circleScreen = async () => {
    setCaptureError(''); setCapturing(true);
    try { if (!await window.horizonAPI?.triggerCapture?.()) setCaptureError('Could not start screen selection. Try again.'); }
    catch { setCaptureError('Could not start screen selection. Try again.'); }
    finally { setCapturing(false); }
  };
  const attachFile = async () => {
    setCaptureError(''); setCapturing(true);
    try { const items = await window.horizonAPI?.chooseAttachments?.(); if (items) setAttachments(prev => [...prev, ...items]); }
    catch (error) { setCaptureError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'Could not inspect the file.'); }
    finally { setCapturing(false); }
  };

  return <div className={`floating-bar ${isDarkMode ? '' : 'light-mode'} w-full h-full p-2 flex flex-col justify-end bg-transparent`}>
    <div ref={panel} className="floating-panel w-full backdrop-blur-2xl">
      <header className="floating-header"><div className="flex items-center gap-2"><HorizonMark size={23} /><span>Horizon</span>{busy && <span className="floating-thinking">Thinking…</span>}</div><div className="flex items-center gap-1">
        <button disabled={busy || capturing || Boolean(approval)} onClick={reset} aria-label="New floating conversation" title="New question"><Plus size={15} /></button>
        <button disabled={busy || Boolean(approval) || capturing} onClick={() => void window.horizonAPI?.openMainWindow?.({ newChat: true, draft, attachments })} aria-label="Open workspace" title="Open a new chat in workspace"><Maximize2 size={14} /></button>
        <button onClick={() => void window.horizonAPI?.hideFloatingBar?.()} aria-label="Dismiss floating assistant" title="Dismiss (Esc)"><X size={15} /></button>
      </div></header>
      {messages.length > 0 && <section ref={feed} className="floating-feed" aria-label="Floating conversation" aria-live="polite">
        {messages.map(message => <article key={message.id} className={`floating-message ${message.sender}`}><span className="floating-speaker">{message.sender === 'user' ? 'You' : 'Horizon'}</span>
          <div className={message.status === 'error' ? 'message-error' : ''}>{message.status === 'working' && busy ? (sessionState?.currentNarration || 'Thinking…') : message.text}</div>
          {message.sender === 'assistant' && <TimingDetails report={message.latency} />}
        </article>)}
        {approval && <div className="floating-approval"><strong className="flex items-center gap-2"><ShieldCheck size={15} />Your approval is needed</strong><p>{approval.description}</p><code>{approval.command || [approval.executablePath, ...(approval.args || [])].filter(Boolean).join(' ')}</code><div className="flex justify-end gap-3 mt-3"><button disabled={busy} onClick={() => void decide(false)}>Deny</button><button disabled={busy} onClick={() => void decide(true)}>Allow once</button></div></div>}
      </section>}
      {messages.length === 0 && <p className="floating-context-hint">Ask anything, or add a screen selection or file.</p>}
      {attachments.length > 0 && <p className="floating-context-hint">Context stays for follow-ups.{attachments.some(item => item.type === 'crop') ? ' A crop includes only the selected area.' : ''}</p>}
      {capturing && <p className="floating-context-hint" role="status">Preparing context… Files are scanned before use.</p>}
      {captureError && <p role="alert" className="floating-context-error">{captureError}</p>}
      <ContextualPromptBar key={composerVersion} isDarkMode={isDarkMode} showContextChoices onDraftChange={setDraft} attachments={attachments} onRemoveAttachment={id => setAttachments(prev => prev.filter(item => item.id !== id))}
        onClearAttachments={() => setAttachments([])} onTriggerLasso={() => void circleScreen()} onTriggerFullScreen={() => void captureScreen()}
        onAttachFile={() => void attachFile()}
        onSubmitPrompt={submit} isBusy={busy || capturing || Boolean(approval)} />
    </div>
  </div>;
}
