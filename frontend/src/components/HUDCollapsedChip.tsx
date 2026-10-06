import { ChevronDown, Activity } from 'lucide-react';
interface HUDCollapsedChipProps {
  isDarkMode: boolean; onExpandTrace?: () => void; isExpanded?: boolean; onToggleLogs?: () => void; currentNarration?: string; toolCategory?: string; status?: string;
}
export function HUDCollapsedChip({ isExpanded = false, onToggleLogs, onExpandTrace, currentNarration, status = 'idle' }: HUDCollapsedChipProps) {
  const labels: Record<string, string> = { idle: 'Ready', working: 'Working', done: 'Completed', error: 'Needs attention', awaiting_tier2: 'Awaiting approval' };
  return <div className="activity-chip"><Activity size={14} /><span className="activity-label">{labels[status] || 'Ready'}</span><span className="activity-narration">{currentNarration || 'No active task'}</span><button onClick={onToggleLogs || onExpandTrace} aria-expanded={isExpanded}>{isExpanded ? 'Collapse Logs' : 'View Logs'}<ChevronDown size={13} style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }} /></button></div>;
}
