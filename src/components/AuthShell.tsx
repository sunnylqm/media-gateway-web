import type { ReactNode } from 'react';
import { Brand } from './Brand';

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Product introduction">
        <Brand />
        <div className="auth-story-copy">
          <span className="eyebrow">Unified generation infrastructure</span>
          <h1>One deliberate path from prompt to production.</h1>
          <p>Route image and video workloads, preserve every decision, and keep the operational picture calm.</p>
        </div>
        <div className="signal-card" aria-hidden="true">
          <div className="signal-row"><span>Gateway</span><b>Operational</b></div>
          <div className="signal-track"><i /></div>
          <div className="signal-meta"><span>Image</span><span>Video</span><span>Audit</span></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="muted auth-description">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
