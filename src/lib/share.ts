// Sharing to the plaza is asked for in the query of the create request rather
// than its body, so a provider-native route can carry the same intent without a
// gateway-specific field appearing in a body the upstream also has to accept.

export type SharePreference = {
  share: boolean;
  sharePrompt: boolean;
};

// Sharing the work is the point of the feature, so it starts on. The prompt is
// often the part an author considers their own, so it starts off.
export const defaultSharePreference: SharePreference = {
  share: true,
  sharePrompt: false,
};

const storageKey = 'media_gateway_share_preference';

export function readSharePreference(): SharePreference {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultSharePreference;
    const parsed = JSON.parse(raw) as Partial<SharePreference>;
    return {
      share:
        typeof parsed.share === 'boolean'
          ? parsed.share
          : defaultSharePreference.share,
      sharePrompt:
        typeof parsed.sharePrompt === 'boolean'
          ? parsed.sharePrompt
          : defaultSharePreference.sharePrompt,
    };
  } catch {
    // A browser with storage disabled still gets the defaults.
    return defaultSharePreference;
  }
}

export function writeSharePreference(value: SharePreference): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // The choice still holds for this page.
  }
}

// Only the parameters that are on are sent: sharing is off unless the query
// asks for it, and a prompt is never carried by the decision to share the work.
export function withShareParams(
  path: string,
  preference: SharePreference,
): string {
  const params: string[] = [];
  if (preference.share) params.push('share=1');
  if (preference.share && preference.sharePrompt) params.push('share_prompt=1');
  if (!params.length) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${params.join('&')}`;
}
