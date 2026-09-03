import { describe, expect, it } from 'bun:test';
import { selectComposerModel } from './composerSelection';

const image = { id: 'image-model', modality: 'image' as const };
const video = { id: 'video-model', modality: 'video' as const };

describe('composer model selection', () => {
  it('keeps an allowed current model', () => {
    expect(
      selectComposerModel(
        [image, video],
        { modality: 'video', model: video.id },
        true,
        true,
      ),
    ).toEqual({ modality: 'video', model: video.id });
  });

  it('does not oscillate into an image-only catalog when image is disabled', () => {
    expect(
      selectComposerModel(
        [image],
        { modality: 'video', model: '' },
        false,
        true,
      ),
    ).toEqual({ modality: 'video', model: '' });
  });

  it('moves to the first model in another allowed modality', () => {
    expect(
      selectComposerModel(
        [image],
        { modality: 'video', model: '' },
        true,
        true,
      ),
    ).toEqual({ modality: 'image', model: image.id });
  });

  it('clears the model when every catalog entry is disallowed', () => {
    expect(
      selectComposerModel(
        [image, video],
        { modality: 'image', model: image.id },
        false,
        false,
      ),
    ).toEqual({ modality: 'image', model: '' });
  });
});
