import { HORIZON_BACKEND_URL } from '../../shared/cloud';
import { LatencyTrace } from '../latency';
export async function hostedAnswer(question: { prompt: string; parts: unknown[]; history?: Array<{ role: 'user' | 'assistant'; text: string }> }, trace?: LatencyTrace, onPartial?: (text: string) => void, signal?: AbortSignal) {
  const started = performance.now();
  const response = await fetch(`${HORIZON_BACKEND_URL}/v1/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...question, history: question.history?.slice(-10).map(item => ({ role: item.role, text: item.text.slice(0, 4000) })) || [] }), signal: AbortSignal.any([AbortSignal.timeout(145000), ...(signal ? [signal] : [])]) });
  trace?.add('hosted_response_headers', performance.now() - started, response.ok ? 'ok' : 'error');
  if (!response.ok) {
    await response.body?.cancel();
    if ([401,403].includes(response.status)) throw new Error('Horizon’s service is still private. Its owner needs to finish the Cloud Run access setup.');
    if (response.status === 429) throw new Error('Horizon usage limit reached. Try again later.');
    if (response.status === 413) throw new Error('Attachment upload exceeds the service limit. Choose fewer items.');
    throw new Error('Horizon could not answer right now. Try again shortly.');
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) throw new Error('Horizon returned an invalid answer stream.');
  let text = '', done = false, buffer = '';
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const consume = (final = false) => {
    const chunks = buffer.replace(/\r\n/g, '\n').split('\n\n'); buffer = final ? '' : chunks.pop()!;
    for (const chunk of chunks) {
      const payload = chunk.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!payload) continue;
      const data = JSON.parse(payload);
      if (data.type === 'error') throw new Error(typeof data.message === 'string' ? data.message.slice(0, 300) : 'Horizon could not complete the answer.');
      if (data.type === 'timing' && typeof data.stage === 'string' && typeof data.durationMs === 'number' && Number.isFinite(data.durationMs) && data.durationMs >= 0) trace?.add(`hosted_${data.stage.slice(0, 80)}`, data.durationMs);
      if (data.type === 'delta' && typeof data.text === 'string') { text += data.text; if (text.length > 64000) throw new Error('Horizon returned an oversized answer.'); onPartial?.(text); }
      if (data.type === 'done' && typeof data.text === 'string') { if (data.text.length > 64000) throw new Error('Horizon returned an oversized answer.'); text = data.text; done = true; }
    }
    if (buffer.length > 1024 * 1024) throw new Error('Horizon returned an oversized stream event.');
  };
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); consume(); }
    buffer += decoder.decode(); consume(true);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  trace?.add('hosted_stream_completion', performance.now() - started);
  if (!done || !text.trim()) throw new Error('Horizon’s answer was interrupted. Try again.');
  return { finalAnswer: text.trim() };
}
