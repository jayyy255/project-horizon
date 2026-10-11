import { useEffect, useState } from 'react';
import type { LatencyReport } from '@shared/types';
const label = (name: string) => name.replace(/^attachment_/, '').replace(/_/g, ' ');
export function TimingDetails({ report }: { report?: LatencyReport }) {
  const [current, setCurrent] = useState(report);
  useEffect(() => { setCurrent(report); }, [report]);
  if (!current) return null;
  return <details className="timing-details" onToggle={event => {
    if (event.currentTarget.open) void window.horizonAPI?.getLatencyReport?.(current.id).then(updated => { if (updated) setCurrent(updated); });
  }}><summary>Timing · {(current.totalMs / 1000).toFixed(2)}s · {current.source}</summary>
    <p>Answer time excludes attachment preparation and time spent choosing context. First text includes upload and model processing; stream time overlaps it.</p>
    <dl>{current.stages.map((stage, index) => <div key={index}><dt>{label(stage.name)}{stage.status === 'error' ? ' (failed)' : ''}</dt><dd>{stage.durationMs.toFixed(0)} ms</dd></div>)}</dl>
    <button onClick={() => void window.horizonAPI?.openLatencyLogs?.()}>Show local timing logs</button>
  </details>;
}
