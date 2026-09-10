import type { Generation } from '../types';

export type Failure = { code: string; message: string };

// A job that ended badly carries a machine code, a message the upstream sent
// back, or both — and a job that went fine carries neither, because the gateway
// clears them when a later attempt succeeds. Reading them together keeps the
// caller from having to decide what an empty field means.
export function generationFailure(
  generation: Generation | null | undefined,
): Failure | null {
  const code = generation?.error_code?.trim() ?? '';
  const message = generation?.error_message?.trim() ?? '';
  if (!code && !message) return null;
  // An upstream that only repeats the code as its message says nothing twice.
  return { code, message: message === code ? '' : message };
}
