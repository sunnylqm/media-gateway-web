import { useEffect, useState } from 'react';
import { api } from '@/api';

// The UI version is stamped into the bundle at build time (see vite.config.ts);
// the engine version is asked of the gateway at runtime. Printing both is the
// point: a console served from a stale CDN copy against a freshly deployed
// gateway is otherwise invisible until something behaves oddly.
const uiVersion = import.meta.env.VITE_UI_VERSION ?? 'dev';

export function Footer() {
  const [engine, setEngine] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ version: string }>('/version')
      .then((info) => {
        if (!cancelled) setEngine(info.version);
      })
      .catch(() => {
        // An unreachable version endpoint is not worth an error banner; every
        // page that matters reports its own failures already.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="page-foot">
      <span>&copy; {new Date().getFullYear()} CHARMLOT PTE. LTD.</span>
      {engine && <span>engine: {engine}</span>}
      <span>ui: {uiVersion}</span>
    </footer>
  );
}
