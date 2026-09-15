import { familyFrom, FAMILIES, generate, parseSeed, type Recipe, seedToken, stream } from './recipe';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
export type Choice = { readonly version: 'g1' } | { readonly version: 'g2'; readonly recipe: Recipe };
export const HISTORY = 'mypub_sky_g2';

function entropy() {
  try { return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; }
  catch { return Math.floor(Math.random() * 4294967296) >>> 0; }
}

export function select(search: string, storage?: StorageLike, random: () => number = entropy): Choice {
  const params = new URLSearchParams(search);
  const seed = parseSeed(params.get('seed'));
  const family = familyFrom(params.get('sky'));
  // G2 seed takes priority. Old canonical URLs and every valid G1 seed use the
  // untouched G1 engine; engine=g1 also retains its old random landing mode.
  if (seed !== undefined) return { version: 'g2', recipe: generate(seed, family) };
  if (/^g1-[0-9a-f]{8}$/i.test(params.get('seed') ?? '') || family || params.get('engine') === 'g1') return { version: 'g1' };
  let next = random() >>> 0;
  let previousFamily: string | undefined;
  try {
    const [previousSeed, previous] = (storage?.getItem(HISTORY) ?? '').split(':');
    if (parseSeed(previousSeed) === next) next = (next + 1) >>> 0;
    previousFamily = familyFrom(previous);
  } catch { /* A private-mode storage failure cannot prevent rendering. */ }
  const options = FAMILIES.filter((f) => f !== previousFamily);
  const selected = options[Math.floor(stream(next ^ 0x54fc3109)() * options.length)];
  const recipe = generate(next, selected);
  try { storage?.setItem(HISTORY, `${seedToken(next)}:${selected}`); }
  catch { /* Only cross-reload non-repetition is lost. */ }
  return { version: 'g2', recipe };
}

let chosen: Choice | undefined;
export function getChoice(): Choice {
  if (chosen) return chosen;
  if (typeof window === 'undefined') return { version: 'g1' };
  let storage: StorageLike | undefined;
  try { storage = window.sessionStorage; } catch { /* Property access can throw. */ }
  chosen = select(window.location.search, storage);
  return chosen;
}
