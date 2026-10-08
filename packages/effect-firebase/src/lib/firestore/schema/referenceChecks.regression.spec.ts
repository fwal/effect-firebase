import { describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import { Reference, ReferenceInstance } from './reference.js';

const decodeCodec = Schema.decodeSync(Schema.toCodecJson(ReferenceInstance));
const decodeClass = Schema.decodeUnknownSync(Reference);

describe('referenceChecks: empty-segment paths', () => {
  it('rejects a non-canonical path with a wrong id through the codec (filter 1)', () => {
    expect(() => decodeCodec({ id: '', path: 'users/doc123/' })).toThrow();
  });

  it('rejects a non-canonical path with the correct id through the codec (filter 1)', () => {
    expect(() => decodeCodec({ id: 'doc123', path: 'users/doc123/' })).toThrow(
      /even number of parts/,
    );
  });

  it('rejects a leading-slash path through the codec (filter 1)', () => {
    expect(() =>
      decodeCodec({ id: 'def', path: '/users/abc/posts/def' }),
    ).toThrow();
  });

  it('rejects a consecutive-slash path through the codec (filter 1)', () => {
    expect(() =>
      decodeCodec({ id: 'doc123', path: 'users//doc123' }),
    ).toThrow();
  });

  it('rejects a non-canonical path through the class decode (filter 1)', () => {
    expect(() => decodeClass({ id: '', path: 'users/doc123/' })).toThrow();
  });
});
