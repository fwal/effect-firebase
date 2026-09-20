import { describe, expect, it } from 'vitest';
import {
  collectionIdOf,
  validateCollectionId,
  validateCollectionPath,
  validateDocPath,
} from './path.js';

describe('validateDocPath', () => {
  it('accepts document paths with an even, non-empty segment count', () => {
    expect(validateDocPath('posts/1')).toBeUndefined();
    expect(validateDocPath('posts/1/comments/2')).toBeUndefined();
    expect(validateDocPath('a/b/c/d/e/f')).toBeUndefined();
  });

  it('rejects collection-parity paths (odd segment count)', () => {
    expect(validateDocPath('posts')).toBeDefined();
    expect(validateDocPath('posts/1/comments')).toBeDefined();
  });

  it('rejects empty and empty-segment paths', () => {
    expect(validateDocPath('')).toBeDefined();
    expect(validateDocPath('posts//1')).toBeDefined();
    expect(validateDocPath('posts/1/')).toBeDefined();
    expect(validateDocPath('/posts/1')).toBeDefined();
  });

  it('produces a message naming the kind, the path and the expected parity', () => {
    const message = validateDocPath('posts/1/comments');
    expect(message).toContain("document path 'posts/1/comments'");
    expect(message).toContain('even number of segments');
  });
});

describe('validateCollectionPath', () => {
  it('accepts collection paths with an odd, non-empty segment count', () => {
    expect(validateCollectionPath('posts')).toBeUndefined();
    expect(validateCollectionPath('posts/1/comments')).toBeUndefined();
    expect(validateCollectionPath('a/b/c/d/e')).toBeUndefined();
  });

  it('rejects document-parity paths (even segment count)', () => {
    expect(validateCollectionPath('posts/1')).toBeDefined();
    expect(validateCollectionPath('posts/1/comments/2')).toBeDefined();
  });

  it('rejects empty and empty-segment paths', () => {
    expect(validateCollectionPath('')).toBeDefined();
    expect(validateCollectionPath('posts/')).toBeDefined();
    expect(validateCollectionPath('/posts')).toBeDefined();
    expect(validateCollectionPath('posts//1/comments')).toBeDefined();
  });

  it('produces a message naming the kind, the path and the expected parity', () => {
    const message = validateCollectionPath('posts/1');
    expect(message).toContain("collection path 'posts/1'");
    expect(message).toContain('odd number of segments');
  });
});

describe('validateCollectionId', () => {
  it('accepts a single non-empty segment with no slash', () => {
    expect(validateCollectionId('comments')).toBeUndefined();
    expect(validateCollectionId('a')).toBeUndefined();
  });

  it('rejects an empty id and an id containing a slash', () => {
    expect(validateCollectionId('')).toBeDefined();
    expect(validateCollectionId('posts/comments')).toBeDefined();
  });
});

describe('collectionIdOf', () => {
  it('returns the final segment of a collection path', () => {
    expect(collectionIdOf('posts')).toBe('posts');
    expect(collectionIdOf('posts/1/comments')).toBe('comments');
  });
});
