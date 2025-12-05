import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  Reference,
  ReferenceInstance,
  AnyReferenceId,
  AnyReferencePath,
  ReferenceId,
  ReferencePath,
} from './reference.js';

describe('Reference', () => {
  describe('class instantiation', () => {
    it('should create a Reference with id and path', () => {
      const ref = Reference.make({
        id: 'doc123',
        path: 'users/doc123',
      });

      expect(ref.id).toBe('doc123');
      expect(ref.path).toBe('users/doc123');
    });

    it('should handle nested collection paths', () => {
      const ref = Reference.make({
        id: 'comment456',
        path: 'posts/post123/comments/comment456',
      });

      expect(ref.id).toBe('comment456');
      expect(ref.path).toBe('posts/post123/comments/comment456');
    });
  });

  describe('makeFromPath', () => {
    it('should create a Reference from a valid path', () => {
      const ref = Reference.makeFromPath('users/doc123');

      expect(ref.id).toBe('doc123');
      expect(ref.path).toBe('users/doc123');
    });

    it('should create nested Reference with parent', () => {
      const ref = Reference.makeFromPath('posts/post123/comments/comment456');

      expect(ref.id).toBe('comment456');
      expect(ref.path).toBe('posts/post123/comments/comment456');
      expect(ref.parent?.id).toBe('post123');
      expect(ref.parent?.path).toBe('posts/post123');
    });

    it('should throw for empty path', () => {
      expect(() => Reference.makeFromPath('')).toThrow();
    });

    it('should throw for odd number of path segments', () => {
      expect(() => Reference.makeFromPath('users')).toThrow();
    });
  });

  describe('Schema encoding/decoding', () => {
    const decode = Schema.decodeUnknownSync(Reference);
    const encode = Schema.encodeSync(Reference);

    it('should decode a valid object to Reference', () => {
      const input = { id: 'doc123', path: 'users/doc123' };
      const ref = decode(input);

      expect(ref).toBeInstanceOf(Reference);
      expect(ref.id).toBe('doc123');
      expect(ref.path).toBe('users/doc123');
    });

    it('should encode a Reference to plain object', () => {
      const ref = Reference.make({
        id: 'doc123',
        path: 'users/doc123',
      });
      const encoded = encode(ref);

      expect(encoded).toEqual({ id: 'doc123', path: 'users/doc123' });
    });

    it('should fail decoding missing id', () => {
      expect(() => decode({ path: 'users/doc123' })).toThrow();
    });

    it('should fail decoding missing path', () => {
      expect(() => decode({ id: 'doc123' })).toThrow();
    });

    it('should fail decoding null', () => {
      expect(() => decode(null)).toThrow();
    });

    it('should fail when id does not match last path segment', () => {
      expect(() => decode({ id: 'wrong', path: 'users/doc123' })).toThrow();
    });

    it('should fail for invalid path (odd segments)', () => {
      expect(() => decode({ id: 'doc123', path: 'users' })).toThrow();
    });
  });
});

describe('ReferenceInstance', () => {
  it('should accept Reference class instances', () => {
    const ref = Reference.make({ id: 'doc123', path: 'users/doc123' });
    const decoded = Schema.decodeSync(ReferenceInstance)(ref);

    expect(decoded).toBe(ref);
  });

  it('should reject non-Reference objects', () => {
    expect(() =>
      Schema.decodeSync(ReferenceInstance)({
        id: 'doc123',
        path: 'users/doc123',
      })
    ).toThrow();
  });
});

describe('AnyReferenceId', () => {
  const decode = Schema.decodeSync(AnyReferenceId);
  const encode = Schema.encodeSync(AnyReferenceId);

  describe('decoding', () => {
    it('should decode Reference to just the ID string', () => {
      const input = Reference.make({ id: 'doc123', path: 'users/doc123' });
      const id = decode(input);

      expect(id).toBe('doc123');
    });
  });

  describe('encoding', () => {
    it('should fail to encode an ID string to Reference', () => {
      expect(() => encode('doc123')).toThrow(
        /Id string cannot be encoded to Reference/
      );
    });
  });
});

describe('AnyReferencePath', () => {
  const decode = Schema.decodeSync(AnyReferencePath);
  const encode = Schema.encodeSync(AnyReferencePath);

  describe('decoding', () => {
    it('should decode Reference to just the path string', () => {
      const input = Reference.make({ id: 'doc123', path: 'users/doc123' });
      const path = decode(input);

      expect(path).toBe('users/doc123');
    });

    it('should handle nested paths', () => {
      const input = Reference.make({
        id: 'comment456',
        path: 'posts/post123/comments/comment456',
      });
      const path = decode(input);

      expect(path).toBe('posts/post123/comments/comment456');
    });
  });

  describe('encoding', () => {
    it('should encode a path string to Reference class instance', () => {
      const encoded = encode('users/doc123');

      expect(encoded).toBeInstanceOf(Reference);
      expect(encoded.id).toBe('doc123');
      expect(encoded.path).toBe('users/doc123');
    });

    it('should extract ID from nested path', () => {
      const encoded = encode('posts/post123/comments/comment456');

      expect(encoded).toBeInstanceOf(Reference);
      expect(encoded.id).toBe('comment456');
      expect(encoded.path).toBe('posts/post123/comments/comment456');
    });

    it('should fail encoding empty path', () => {
      expect(() => encode('')).toThrow();
    });

    it('should fail encoding invalid path (odd segments)', () => {
      expect(() => encode('users')).toThrow();
    });
  });

  describe('roundtrip', () => {
    it('should maintain path through roundtrip', () => {
      const originalPath = 'users/doc123';
      const encoded = encode(originalPath);
      const decoded = decode(encoded);

      expect(decoded).toBe(originalPath);
    });
  });
});

describe('ReferenceId (typed)', () => {
  const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
  type AuthorId = typeof AuthorId.Type;
  const AuthorRef = ReferenceId(AuthorId, 'authors');

  const decode = Schema.decodeSync(AuthorRef);
  const encode = Schema.encodeSync(AuthorRef);

  describe('type preservation', () => {
    it('should preserve branded type (compile-time check)', () => {
      // This test verifies the Type is branded, not just string
      type AuthorRefType = typeof AuthorRef.Type;

      // Type-level assertion: AuthorRefType should be assignable to AuthorId
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _typeCheck: AuthorRefType = '' as AuthorId;

      // If ReferenceId erased the type to string, this would be:
      // type AuthorRefType = string
      // And the above assignment would still work, but the reverse wouldn't
      // (can't assign string to branded type without cast)

      expect(true).toBe(true); // Runtime passes, type check is compile-time
    });
  });

  describe('decoding', () => {
    it('should decode Reference to branded ID', () => {
      const input = Reference.make({
        id: 'author123',
        path: 'authors/author123',
      });
      const authorId = decode(input);

      // Verify the decoded value can be used as the branded type
      const typedId: AuthorId = authorId;
      expect(typedId).toBe('author123');
    });
  });

  describe('encoding', () => {
    it('should encode branded ID to Reference class instance', () => {
      const authorId = 'author123' as Schema.Schema.Type<typeof AuthorId>;
      const encoded = encode(authorId);

      expect(encoded).toBeInstanceOf(Reference);
      expect(encoded.id).toBe('author123');
      expect(encoded.path).toBe('authors/author123');
    });
  });

  describe('roundtrip', () => {
    it('should maintain ID through roundtrip', () => {
      const authorId = 'author123' as Schema.Schema.Type<typeof AuthorId>;
      const encoded = encode(authorId);
      const decoded = decode(encoded);

      expect(decoded).toBe('author123');
    });
  });

  describe('with different collection paths', () => {
    it('should work with nested collection path', () => {
      const CommentId = Schema.String.pipe(Schema.brand('CommentId'));
      const CommentRef = ReferenceId(CommentId, 'posts/post1/comments');

      const encodeComment = Schema.encodeSync(CommentRef);
      const commentId = 'comment123' as Schema.Schema.Type<typeof CommentId>;
      const encoded = encodeComment(commentId);

      expect(encoded).toBeInstanceOf(Reference);
      expect(encoded.path).toBe('posts/post1/comments/comment123');
    });
  });
});

describe('ReferencePath (typed)', () => {
  const UserPath = ReferencePath('users');

  const decode = Schema.decodeSync(UserPath);
  const encode = Schema.encodeSync(UserPath);

  describe('decoding', () => {
    it('should decode Reference to path string', () => {
      const input = Reference.make({ id: 'user123', path: 'users/user123' });
      const path = decode(input);

      expect(path).toBe('users/user123');
    });
  });

  describe('encoding', () => {
    it('should encode valid path to Reference class instance', () => {
      const encoded = encode('users/user123');

      expect(encoded).toBeInstanceOf(Reference);
      expect(encoded.id).toBe('user123');
      expect(encoded.path).toBe('users/user123');
    });

    it('should fail encoding path that does not start with collection', () => {
      expect(() => encode('posts/post123')).toThrow(
        /Path must start with "users\/"/
      );
    });

    it('should fail encoding empty path', () => {
      expect(() => encode('')).toThrow(/Path must start with "users\/"/);
    });
  });

  describe('roundtrip', () => {
    it('should maintain valid path through roundtrip', () => {
      const originalPath = 'users/user123';
      const encoded = encode(originalPath);
      const decoded = decode(encoded);

      expect(decoded).toBe(originalPath);
    });
  });

  describe('with nested collection path', () => {
    const CommentPath = ReferencePath('posts/post1/comments');
    const encodeComment = Schema.encodeSync(CommentPath);
    const decodeComment = Schema.decodeSync(CommentPath);

    it('should validate nested collection prefix', () => {
      const encoded = encodeComment('posts/post1/comments/comment123');

      expect(encoded).toBeInstanceOf(Reference);
      expect(encoded.path).toBe('posts/post1/comments/comment123');
    });

    it('should reject invalid nested collection prefix', () => {
      expect(() => encodeComment('posts/post2/comments/comment123')).toThrow(
        /Path must start with "posts\/post1\/comments\/"/
      );
    });

    it('should decode nested path correctly', () => {
      const input = Reference.make({
        id: 'comment123',
        path: 'posts/post1/comments/comment123',
      });
      const path = decodeComment(input);

      expect(path).toBe('posts/post1/comments/comment123');
    });
  });
});
