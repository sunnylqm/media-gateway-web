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

const gatewayURL = (
  import.meta.env.VITE_GATEWAY_URL ?? 'https://sg.cresc.dev'
).replace(/\/$/, '');
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
  const response = await fetch(`${gatewayURL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  const csrf = response.headers.get('X-CSRF-Token');
  if (csrf) sessionStorage.setItem(csrfStorageKey(admin), csrf);
  if (!response.ok) {
    let payload: ErrorEnvelope = {};
    try {
      payload = (await response.json()) as ErrorEnvelope;
    } catch {
      // The status still carries the useful failure signal.
    }
    throw new APIError(
      response.status,
      payload.error?.code ?? 'request_failed',
      payload.error?.message ??
        t('api.requestFailed', { status: response.status }),
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
