import { describe, expect, it } from 'bun:test';
import { onPageRevived, type PageRevivalScope } from './pageRevival';

function fakeTarget() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    listeners,
    addEventListener(type: string, listener: () => void) {
      const bucket = listeners.get(type) ?? new Set<() => void>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    emit(type: string) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
    count() {
      let total = 0;
      for (const bucket of listeners.values()) total += bucket.size;
      return total;
    },
  };
}

function fakeScope(visibilityState = 'visible') {
  const window = fakeTarget();
  const document = Object.assign(fakeTarget(), { visibilityState });
  return { window, document, scope: { window, document } as PageRevivalScope };
}

describe('onPageRevived', () => {
  it('runs the handler when the page is restored from the cache', () => {
    const { window, scope } = fakeScope();
    let revived = 0;
    onPageRevived(() => revived++, scope);
    window.emit('pageshow');
    expect(revived).toBe(1);
  });

  it('runs the handler when the tab becomes visible again', () => {
    const { document, scope } = fakeScope();
    let revived = 0;
    onPageRevived(() => revived++, scope);
    document.emit('visibilitychange');
    expect(revived).toBe(1);
  });

  it('ignores the tab being hidden', () => {
    const { document, scope } = fakeScope('hidden');
    let revived = 0;
    onPageRevived(() => revived++, scope);
    document.emit('visibilitychange');
    expect(revived).toBe(0);
  });

  it('detaches both listeners on cleanup', () => {
    const { window, document, scope } = fakeScope();
    let revived = 0;
    const stop = onPageRevived(() => revived++, scope);
    stop();
    expect(window.count()).toBe(0);
    expect(document.count()).toBe(0);
    window.emit('pageshow');
    document.emit('visibilitychange');
    expect(revived).toBe(0);
  });
});
