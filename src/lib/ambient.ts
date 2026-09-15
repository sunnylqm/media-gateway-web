// A fixed seed keeps the decorative sky stable across renders and languages.
// Each layer is painted once and only its transform is animated by CSS.
export function starField(seed: number, count: number): string {
  let value = seed >>> 0;
  const next = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const x = (next() * 100).toFixed(2);
    const y = (next() * 100).toFixed(2);
    const radius = (0.45 + next() * 0.8).toFixed(2);
    const edge = (Number(radius) + 0.7).toFixed(2);
    const opacity = (0.22 + next() * 0.48).toFixed(2);
    return `radial-gradient(circle at ${x}% ${y}%, rgb(249 235 213 / ${opacity}) 0, rgb(249 235 213 / ${opacity}) ${radius}px, transparent ${edge}px)`;
  }).join(', ');
}

export const starLayers = [starField(17, 38), starField(41, 30), starField(83, 22)];

// No media request is made until a real source is configured. Root-relative
// assets and HTTPS sources are both supported; insecure/invalid URLs fall back.
export function mediaURL(value: string | undefined): string | undefined {
  const source = value?.trim();
  if (!source) return undefined;
  if (source.startsWith('/') && !source.startsWith('//')) return source;
  try {
    return new URL(source).protocol === 'https:' ? source : undefined;
  } catch {
    return undefined;
  }
}
