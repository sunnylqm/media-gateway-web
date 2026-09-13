// Handing the browser to an external payment page does not tear this tab down.
// Android Chrome and Safari keep it in the back/forward cache and restore it —
// React state and all — when the tenant backs out of the hosted checkout, and
// even without that cache the tab is merely hidden while the redirect is in
// flight. Anything a redirect leaves latched (a "redirecting…" flag that also
// disables the dialog's own close button) has to be released when the tab comes
// back, or the page reads as frozen.

type Listenable = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export type PageRevivalScope = {
  window: Listenable;
  document: Listenable & { visibilityState: string };
};

// `pageshow` covers the back/forward cache restore; `visibilitychange` covers a
// redirect that never happened, or one the tenant abandoned without the page
// being frozen. Either way the handler may run more than once, so it has to be
// safe to repeat.
export function onPageRevived(
  handler: () => void,
  scope: PageRevivalScope,
): () => void {
  const revive = () => handler();
  const onVisible = () => {
    if (scope.document.visibilityState === 'visible') handler();
  };
  scope.window.addEventListener('pageshow', revive);
  scope.document.addEventListener('visibilitychange', onVisible);
  return () => {
    scope.window.removeEventListener('pageshow', revive);
    scope.document.removeEventListener('visibilitychange', onVisible);
  };
}

export function browserPageRevivalScope(): PageRevivalScope | null {
  if (typeof window === 'undefined' || typeof document === 'undefined')
    return null;
  return { window, document };
}
