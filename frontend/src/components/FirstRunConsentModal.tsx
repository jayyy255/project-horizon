import React, { useState } from 'react';
import { ArrowRight, Camera, Cloud, ShieldCheck } from 'lucide-react';
import { HorizonMark } from './HorizonMark';
import { DEFAULT_HOTKEY } from '@shared/hotkeys';

interface FirstRunConsentModalProps {
  isDarkMode: boolean;
  isBusy?: boolean;
  error?: string;
  shortcutLabel?: string;
  onConsentGiven?: () => void;
  onConsentDeclined?: () => void;
}

export const FirstRunConsentModal: React.FC<FirstRunConsentModalProps> = ({
  isDarkMode, isBusy, error, shortcutLabel = DEFAULT_HOTKEY.label, onConsentGiven, onConsentDeclined,
}) => {
  const [agreed, setAgreed] = useState(false);

  return (
    <section className={`consent-dialog ${isDarkMode ? '' : 'consent-light'}`} role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-description">
      <header className="consent-brand">
        <HorizonMark size={44} />
        <span>Project Horizon</span>
        <span className="consent-setup">Getting started</span>
      </header>
      <div className="consent-content">
        <h2 id="consent-title">Set up Horizon</h2>
        <p id="consent-description" className="consent-intro">Ask about what's on your screen, find files, and take action without leaving your desktop.</p>
        <div className="consent-shortcut">
          <div><strong>One shortcut, anywhere</strong><span>Open your floating assistant</span></div>
          <div className="consent-keys" aria-label={shortcutLabel}>{shortcutLabel.split(' + ').map((key,index)=><React.Fragment key={index}>{index > 0 && <span>+</span>}<kbd>{key}</kbd></React.Fragment>)}</div>
        </div>
        <div className="consent-disclosures">
          <div className="consent-disclosure"><Camera size={17} /><div><h3>You choose what to share</h3><p>Capture your screen or select a region when you need it. Horizon doesn't record in the background.</p></div></div>
          <div className="consent-disclosure"><Cloud size={17} /><div><h3>Gemini helps with your task</h3><p>Your prompt and selected context pass through Horizon’s service to Google Gemini. Conversations stay saved on this device.</p></div></div>
          <div className="consent-disclosure"><ShieldCheck size={17} /><div><h3>Review sensitive actions</h3><p>Shell commands and destructive file changes pause for your approval.</p></div></div>
        </div>
      </div>
      <footer className="consent-footer">
        <label className="consent-agreement"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span>I agree to share my prompts and selected context with Horizon’s service and Google Gemini.</span></label>
        {error && <p role="alert" className="text-xs text-rose-400 mt-3">{error}</p>}
        <div className="consent-actions"><button className="consent-secondary" disabled={isBusy} onClick={onConsentDeclined}>Not now</button><button className="consent-primary" disabled={!agreed || isBusy} onClick={() => { if (agreed) onConsentGiven?.(); }}>{isBusy ? 'Setting up…' : 'Continue'}<ArrowRight size={15} /></button></div>
      </footer>
    </section>
  );
};
