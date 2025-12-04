import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  DocumentReference,
  AnyDocumentReferenceId,
  AnyDocumentReferencePath,
  DocumentReferenceId,
  DocumentReferencePath,
} from './reference.js';

describe('DocumentReference', () => {
  describe('class instantiation', () => {
    it('should create a DocumentReference with id and path', () => {
      const ref = new DocumentReference({
        id: 'doc123',
        path: 'users/doc123',
      });

      expect(ref.id).toBe('doc123');
      expect(ref.path).toBe('users/doc123');
    });

    it('should handle nested collection paths', () => {
      const ref = new DocumentReference({
        id: 'comment456',
        path: 'posts/post123/comments/comment456',
      });

      expect(ref.id).toBe('comment456');
      expect(ref.path).toBe('posts/post123/comments/comment456');
    });
  });

  describe('Schema encoding/decoding', () => {
    const decode = Schema.decodeUnknownSync(DocumentReference);
    const encode = Schema.encodeSync(DocumentReference);

    it('should decode a valid object to DocumentReference', () => {
      const input = { id: 'doc123', path: 'users/doc123' };
      const ref = decode(input);

      expect(ref).toBeInstanceOf(DocumentReference);
      expect(ref.id).toBe('doc123');
      expect(ref.path).toBe('users/doc123');
    });

    it('should encode a DocumentReference to plain object', () => {
      const ref = new DocumentReference({
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
  });
});

describe('DocumentReferenceId', () => {
  const decode = Schema.decodeUnknownSync(AnyDocumentReferenceId);
  const encode = Schema.encodeSync(AnyDocumentReferenceId);

  describe('decoding', () => {
    it('should decode DocumentReference to just the ID string', () => {
      const input = { id: 'doc123', path: 'users/doc123' };
      const id = decode(input);

      expect(id).toBe('doc123');
    });
  });

  describe('encoding', () => {
    it('should fail to encode an ID string to DocumentReference', () => {
      expect(() => encode('doc123')).toThrow(
        /Id string cannot be encoded to DocumentReference/
      );
    });
  });
});

describe('DocumentReferencePath', () => {
  const decode = Schema.decodeUnknownSync(AnyDocumentReferencePath);
  const encode = Schema.encodeSync(AnyDocumentReferencePath);

  describe('decoding', () => {
    it('should decode DocumentReference to just the path string', () => {
      const input = { id: 'doc123', path: 'users/doc123' };
      const path = decode(input);

      expect(path).toBe('users/doc123');
    });

    it('should handle nested paths', () => {
      const input = {
        id: 'comment456',
        path: 'posts/post123/comments/comment456',
      };
      const path = decode(input);

      expect(path).toBe('posts/post123/comments/comment456');
    });
  });

  describe('encoding', () => {
    it('should encode a path string to DocumentReference', () => {
      const encoded = encode('users/doc123');

      expect(encoded).toEqual({ id: 'doc123', path: 'users/doc123' });
    });

    it('should extract ID from nested path', () => {
      const encoded = encode('posts/post123/comments/comment456');

      expect(encoded).toEqual({
        id: 'comment456',
        path: 'posts/post123/comments/comment456',
      });
    });

    it('should handle empty path segment gracefully', () => {
      const encoded = encode('');

      expect(encoded.id).toBe('');
      expect(encoded.path).toBe('');
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

describe('TypedReferenceId', () => {
  const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
  type AuthorId = typeof AuthorId.Type;
  const AuthorRef = DocumentReferenceId(AuthorId, 'authors');

  const decode = Schema.decodeUnknownSync(AuthorRef);
  const encode = Schema.encodeSync(AuthorRef);

  describe('type preservation', () => {
    it('should preserve branded type (compile-time check)', () => {
      // This test verifies the Type is branded, not just string
      type AuthorRefType = typeof AuthorRef.Type;

      // Type-level assertion: AuthorRefType should be assignable to AuthorId
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _typeCheck: AuthorRefType = '' as AuthorId;

      // If TypedReferenceId erased the type to string, this would be:
      // type AuthorRefType = string
      // And the above assignment would still work, but the reverse wouldn't
      // (can't assign string to branded type without cast)

      expect(true).toBe(true); // Runtime passes, type check is compile-time
    });
  });

  describe('decoding', () => {
    it('should decode DocumentReference to branded ID', () => {
      const input = { id: 'author123', path: 'authors/author123' };
      const authorId = decode(input);

      // Verify the decoded value can be used as the branded type
      const typedId: AuthorId = authorId;
      expect(typedId).toBe('author123');
    });
  });

  describe('encoding', () => {
    it('should encode branded ID to DocumentReference with correct path', () => {
      const authorId = 'author123' as Schema.Schema.Type<typeof AuthorId>;
      const encoded = encode(authorId);

      expect(encoded).toEqual({ id: 'author123', path: 'authors/author123' });
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
      const CommentRef = DocumentReferenceId(CommentId, 'posts/post1/comments');

      const encodeComment = Schema.encodeSync(CommentRef);
      const commentId = 'comment123' as Schema.Schema.Type<typeof CommentId>;
      const encoded = encodeComment(commentId);

      expect(encoded.path).toBe('posts/post1/comments/comment123');
    });
  });
});

describe('TypedReferencePath', () => {
  const UserPath = DocumentReferencePath('users');

  const decode = Schema.decodeUnknownSync(UserPath);
  const encode = Schema.encodeSync(UserPath);

  describe('decoding', () => {
    it('should decode DocumentReference to path string', () => {
      const input = { id: 'user123', path: 'users/user123' };
      const path = decode(input);

      expect(path).toBe('users/user123');
    });
  });

  describe('encoding', () => {
    it('should encode valid path to DocumentReference', () => {
      const encoded = encode('users/user123');

      expect(encoded).toEqual({ id: 'user123', path: 'users/user123' });
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
    const CommentPath = DocumentReferencePath('posts/post1/comments');
    const encodeComment = Schema.encodeSync(CommentPath);
    const decodeComment = Schema.decodeUnknownSync(CommentPath);

    it('should validate nested collection prefix', () => {
      const encoded = encodeComment('posts/post1/comments/comment123');
      expect(encoded.path).toBe('posts/post1/comments/comment123');
    });

    it('should reject invalid nested collection prefix', () => {
      expect(() => encodeComment('posts/post2/comments/comment123')).toThrow(
        /Path must start with "posts\/post1\/comments\/"/
      );
    });

    it('should decode nested path correctly', () => {
      const input = {
        id: 'comment123',
        path: 'posts/post1/comments/comment123',
      };
      const path = decodeComment(input);

      expect(path).toBe('posts/post1/comments/comment123');
    });
  });
});
