import { Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AnyIdReference,
  AnyPathReference,
  Reference,
  ReferenceAsInstance,
  ReferencePath,
  ReferenceOptional,
} from './reference.js';
import { Class, Generated } from './core.js';
import { Reference as SchemaReference } from '../schema/reference.js';

describe('Model.AnyIdReference', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    authorId: AnyIdReference,
  }) {}

  describe('get variant', () => {
    it('should decode Reference to ID string', () => {
      const decode = Schema.decodeSync(TestModel);
      const result = decode({
        id: 'post-1',
        authorId: SchemaReference.make({
          id: 'author-123',
          path: 'authors/author-123',
        }),
      });

      expect(result.authorId).toBe('author-123');
    });
  });

  describe('add variant', () => {
    it('should decode Reference to ID string', () => {
      const decode = Schema.decodeSync(TestModel.add);
      const result = decode({
        authorId: SchemaReference.make({
          id: 'author-123',
          path: 'authors/author-123',
        }),
      });

      expect(result.authorId).toBe('author-123');
    });
  });

  describe('json variant', () => {
    it('should decode string ID directly', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        authorId: 'author-123',
      });

      expect(result.authorId).toBe('author-123');
    });

    it('should encode ID string directly', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const result = encode({
        id: PostId.make('post-1'),
        authorId: 'author-123',
      });

      expect(result.authorId).toBe('author-123');
    });
  });
});

describe('Model.AnyPathReference', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    authorPath: AnyPathReference,
  }) {}

  describe('get variant', () => {
    it('should decode Reference to path string', () => {
      const decode = Schema.decodeSync(TestModel);
      const result = decode({
        id: 'post-1',
        authorPath: SchemaReference.make({
          id: 'author-123',
          path: 'authors/author-123',
        }),
      });

      expect(result.authorPath).toBe('authors/author-123');
    });
  });

  describe('add variant', () => {
    it('should encode path string to Reference class instance', () => {
      const encode = Schema.encodeSync(TestModel.add);
      const result = encode({
        authorPath: 'authors/author-123',
      });

      expect(result.authorPath).toBeInstanceOf(SchemaReference);
      expect(result.authorPath.id).toBe('author-123');
      expect(result.authorPath.path).toBe('authors/author-123');
    });
  });

  describe('json variant', () => {
    it('should decode path string directly', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        authorPath: 'authors/author-123',
      });

      expect(result.authorPath).toBe('authors/author-123');
    });

    it('should encode path string directly', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const result = encode({
        id: PostId.make('post-1'),
        authorPath: 'authors/author-123',
      });

      expect(result.authorPath).toBe('authors/author-123');
    });
  });
});

describe('Model.Reference', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));
  const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    author: Reference(AuthorId, 'authors'),
  }) {}

  describe('get variant', () => {
    it('should decode Reference to branded ID', () => {
      const decode = Schema.decodeSync(TestModel);
      const result = decode({
        id: 'post-1',
        author: SchemaReference.make({
          id: 'author-123',
          path: 'authors/author-123',
        }),
      });

      expect(result.author).toBe('author-123');
    });
  });

  describe('add variant', () => {
    it('should encode branded ID to Reference class instance', () => {
      const encode = Schema.encodeSync(TestModel.add);
      const authorId = 'author-123' as typeof AuthorId.Type;
      const result = encode({
        author: authorId,
      });

      expect(result.author).toBeInstanceOf(SchemaReference);
      expect(result.author.id).toBe('author-123');
      expect(result.author.path).toBe('authors/author-123');
    });
  });

  describe('update variant', () => {
    it('should encode branded ID to Reference class instance', () => {
      const encode = Schema.encodeSync(TestModel.update);
      const authorId = 'author-456' as typeof AuthorId.Type;
      const result = encode({
        id: 'post-1' as typeof PostId.Type,
        author: authorId,
      });

      expect(result.author).toBeInstanceOf(SchemaReference);
      expect(result.author.id).toBe('author-456');
      expect(result.author.path).toBe('authors/author-456');
    });
  });

  describe('json variant', () => {
    it('should decode branded ID string', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        author: 'author-123',
      });

      expect(result.author).toBe('author-123');
    });

    it('should encode branded ID string', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const authorId = 'author-123' as typeof AuthorId.Type;
      const result = encode({
        id: PostId.make('post-1'),
        author: authorId,
      });

      expect(result.author).toBe('author-123');
    });
  });

  describe('with nested collection path', () => {
    const CommentId = Schema.String.pipe(Schema.brand('CommentId'));

    class CommentModel extends Class<CommentModel>('CommentModel')({
      id: Generated(CommentId),
      replyTo: Reference(CommentId, 'posts/post-1/comments'),
    }) {}

    it('should encode to nested path', () => {
      const encode = Schema.encodeSync(CommentModel.add);
      const commentId = 'comment-123' as typeof CommentId.Type;
      const result = encode({
        replyTo: commentId,
      });

      expect(result.replyTo).toBeInstanceOf(SchemaReference);
      expect(result.replyTo.id).toBe('comment-123');
      expect(result.replyTo.path).toBe('posts/post-1/comments/comment-123');
    });
  });
});

describe('Model.ReferenceAsInstance', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));
  const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    author: ReferenceAsInstance(AuthorId, 'authors'),
  }) {}

  describe('get variant', () => {
    it('should decode Reference to Reference instance (passthrough)', () => {
      const decode = Schema.decodeSync(TestModel);
      const inputRef = SchemaReference.make({
        id: 'author-123',
        path: 'authors/author-123',
      });
      const result = decode({
        id: 'post-1',
        author: inputRef,
      });

      expect(result.author).toBeInstanceOf(SchemaReference);
      expect(result.author.id).toBe('author-123');
      expect(result.author.path).toBe('authors/author-123');
    });
  });

  describe('add variant', () => {
    it('should encode Reference instance to Reference instance (passthrough)', () => {
      const encode = Schema.encodeSync(TestModel.add);
      const authorRef = SchemaReference.make({
        id: 'author-123',
        path: 'authors/author-123',
      });
      const result = encode({
        author: authorRef,
      });

      expect(result.author).toBeInstanceOf(SchemaReference);
      expect(result.author.id).toBe('author-123');
      expect(result.author.path).toBe('authors/author-123');
    });
  });

  describe('update variant', () => {
    it('should encode Reference instance to Reference instance', () => {
      const encode = Schema.encodeSync(TestModel.update);
      const authorRef = SchemaReference.make({
        id: 'author-456',
        path: 'authors/author-456',
      });
      const result = encode({
        id: 'post-1' as typeof PostId.Type,
        author: authorRef,
      });

      expect(result.author).toBeInstanceOf(SchemaReference);
      expect(result.author.id).toBe('author-456');
      expect(result.author.path).toBe('authors/author-456');
    });
  });

  describe('json variant', () => {
    it('should decode branded ID string to Reference instance', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        author: 'author-123',
      });

      expect(result.author).toBeInstanceOf(SchemaReference);
      expect(result.author.id).toBe('author-123');
      expect(result.author.path).toBe('authors/author-123');
    });

    it('should encode Reference instance to branded ID string', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const authorRef = SchemaReference.make({
        id: 'author-123',
        path: 'authors/author-123',
      });
      const result = encode({
        id: PostId.make('post-1'),
        author: authorRef,
      });

      expect(result.author).toBe('author-123');
    });
  });

  describe('accessing Reference properties', () => {
    it('should provide access to both id and path', () => {
      const decode = Schema.decodeSync(TestModel);
      const result = decode({
        id: 'post-1',
        author: SchemaReference.make({
          id: 'author-123',
          path: 'authors/author-123',
        }),
      });

      // The main use case for ReferenceAsInstance is access to both properties
      expect(result.author.id).toBe('author-123');
      expect(result.author.path).toBe('authors/author-123');
    });
  });
});

describe('Model.ReferencePath', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    authorPath: ReferencePath('authors'),
  }) {}

  describe('get variant', () => {
    it('should decode Reference to path string', () => {
      const decode = Schema.decodeSync(TestModel);
      const result = decode({
        id: 'post-1',
        authorPath: SchemaReference.make({
          id: 'author-123',
          path: 'authors/author-123',
        }),
      });

      expect(result.authorPath).toBe('authors/author-123');
    });
  });

  describe('add variant', () => {
    it('should encode path string to Reference class instance', () => {
      const encode = Schema.encodeSync(TestModel.add);
      const result = encode({
        authorPath: 'authors/author-123',
      });

      expect(result.authorPath).toBeInstanceOf(SchemaReference);
      expect(result.authorPath.id).toBe('author-123');
      expect(result.authorPath.path).toBe('authors/author-123');
    });
  });

  describe('json variant', () => {
    it('should decode valid path string', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        authorPath: 'authors/author-123',
      });

      expect(result.authorPath).toBe('authors/author-123');
    });

    it('should fail decoding invalid path prefix', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);

      expect(() =>
        decode({
          id: 'post-1',
          authorPath: 'users/user-123',
        })
      ).toThrow(/Path must start with "authors\/"/);
    });

    it('should encode path string', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const result = encode({
        id: PostId.make('post-1'),
        authorPath: 'authors/author-123',
      });

      expect(result.authorPath).toBe('authors/author-123');
    });
  });
});

describe('Model.ReferenceOptional', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));
  const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(PostId),
    author: ReferenceOptional(AuthorId, 'authors'),
  }) {}

  describe('get variant', () => {
    it('should decode Reference to Option.some with ID', () => {
      const decode = Schema.decodeSync(TestModel);
      const result = decode({
        id: 'post-1',
        author: SchemaReference.make({
          id: 'author-123',
          path: 'authors/author-123',
        }),
      });

      expect(Option.isSome(result.author)).toBe(true);
      expect(Option.getOrNull(result.author)).toBe('author-123');
    });

    it('should decode null to Option.none', () => {
      const decode = Schema.decodeSync(TestModel);
      const result = decode({
        id: 'post-1',
        author: null,
      });

      expect(Option.isNone(result.author)).toBe(true);
    });
  });

  describe('add variant', () => {
    it('should encode Option.some to Reference class instance', () => {
      const encode = Schema.encodeSync(TestModel.add);
      const authorId = 'author-123' as typeof AuthorId.Type;
      const result = encode({
        author: Option.some(authorId),
      });

      expect(result.author).toBeInstanceOf(SchemaReference);
      expect(result.author?.id).toBe('author-123');
      expect(result.author?.path).toBe('authors/author-123');
    });

    it('should encode Option.none to null', () => {
      const encode = Schema.encodeSync(TestModel.add);
      const result = encode({
        author: Option.none(),
      });

      expect(result.author).toBeNull();
    });
  });

  describe('json variant', () => {
    it('should decode present ID to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'post-1',
        author: 'author-123',
      });

      expect(Option.isSome(result.author)).toBe(true);
      expect(Option.getOrNull(result.author)).toBe('author-123');
    });

    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ id: 'post-1' });

      expect(Option.isNone(result.author)).toBe(true);
    });

    it('should encode Option.some to string', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const authorId = 'author-123' as typeof AuthorId.Type;
      const result = encode({
        id: PostId.make('post-1'),
        author: Option.some(authorId),
      });

      expect(result.author).toBe('author-123');
    });

    it('should encode Option.none by omitting the key', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const result = encode({
        id: PostId.make('post-1'),
        author: Option.none(),
      });

      expect(result.author).toBeUndefined();
    });
  });

  describe('jsonAdd variant', () => {
    it('should decode null to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.jsonAdd);
      const result = decode({
        author: null,
      });

      expect(Option.isNone(result.author)).toBe(true);
    });

    it('should encode Option.none by omitting the key', () => {
      const encode = Schema.encodeSync(TestModel.jsonAdd);
      const result = encode({
        author: Option.none(),
      });

      // jsonAdd uses optionalWith which omits the key when encoding None
      expect(result.author).toBeUndefined();
    });
  });
});
