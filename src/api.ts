import { t } from './i18n';

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class APIError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

function cookie(name: string): string {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const item of document.cookie.split(';')) {
    const value = item.trim();
    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }
  return '';
}

export const gatewayURL = (
  import.meta.env.VITE_GATEWAY_URL ?? 'https://sg.cresc.dev'
).replace(/\/$/, '');

export function absoluteGatewayURL(value: string): string {
  return new URL(value, `${gatewayURL}/`).toString();
}
const csrfStorageKey = (admin: boolean) =>
  admin ? 'media_gateway_admin_csrf' : 'media_gateway_csrf';

export async function api<T>(
  path: string,
  init: RequestInit = {},
  admin = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }
  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf =
      cookie(admin ? 'media_gateway_admin_csrf' : 'media_gateway_csrf') ||
      sessionStorage.getItem(csrfStorageKey(admin)) ||
      '';
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const requestHeaders = new Headers(headers);
    const response = await fetch(`${gatewayURL}${path}`, {
      ...init,
      headers: requestHeaders,
      credentials: 'include',
    });
    const csrf = response.headers.get('X-CSRF-Token');
    if (csrf) sessionStorage.setItem(csrfStorageKey(admin), csrf);
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    let payload: ErrorEnvelope = {};
    try {
      payload = (await response.json()) as ErrorEnvelope;
    } catch {
      // The status still carries the useful failure signal.
    }

    // Another tab can replace the session cookie while this tab still holds
    // the previous session's token. The gateway reflects the token belonging
    // to the authenticated cookie, so retry the rejected mutation once with
    // that newer value. A missing or unchanged token is a real CSRF failure.
    if (
      attempt === 0 &&
      response.status === 403 &&
      payload.error?.code === 'csrf_failed' &&
      csrf &&
      csrf !== headers.get('X-CSRF-Token')
    ) {
      headers.set('X-CSRF-Token', csrf);
      continue;
    }
    throw new APIError(
      response.status,
      payload.error?.code ?? 'request_failed',
      payload.error?.message ??
        t('api.requestFailed', { status: response.status }),
    );
  }
  throw new APIError(403, 'csrf_failed', 'a valid CSRF token is required');
}
