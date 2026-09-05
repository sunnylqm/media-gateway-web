import { describe, expect, it } from 'bun:test';
import { withShareParams } from './share';

describe('withShareParams', () => {
  it('omits the query entirely when nothing is shared', () => {
    expect(
      withShareParams('/v1/generations', { share: false, sharePrompt: false }),
    ).toBe('/v1/generations');
  });

  it('never sends the prompt without the work', () => {
    expect(
      withShareParams('/v1/generations', { share: false, sharePrompt: true }),
    ).toBe('/v1/generations');
  });

  it('sends only the parameters that are on', () => {
    expect(
      withShareParams('/v1/generations', { share: true, sharePrompt: false }),
    ).toBe('/v1/generations?share=1');
    expect(
      withShareParams('/v1/generations', { share: true, sharePrompt: true }),
    ).toBe('/v1/generations?share=1&share_prompt=1');
  });

  it('merges with an existing query string', () => {
    expect(
      withShareParams('/v1/proxy/images?model=x', {
        share: true,
        sharePrompt: true,
      }),
    ).toBe('/v1/proxy/images?model=x&share=1&share_prompt=1');
  });
});
