import { Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  Class,
  Field,
  Generated,
  GeneratedByApp,
  Optional,
  OptionalNull,
  Sensitive,
} from './core.js';

describe('Model.Class', () => {
  const UserId = Schema.String.pipe(Schema.brand('UserId'));

  class User extends Class<User>('User')({
    id: Generated(UserId),
    name: Schema.String,
    email: Schema.String,
  }) {}

  describe('get variant (default)', () => {
    it('should decode all fields including generated', () => {
      const decode = Schema.decodeUnknownSync(User);
      const user = decode({
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
      });

      expect(user.id).toBe('user-123');
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
    });

    it('should encode to plain object', () => {
      const encode = Schema.encodeSync(User);
      const user = new User({
        id: 'user-123' as typeof UserId.Type,
        name: 'John Doe',
        email: 'john@example.com',
      });
      const encoded = encode(user);

      expect(encoded).toEqual({
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
      });
    });
  });

  describe('add variant', () => {
    it('should not require generated fields', () => {
      const decode = Schema.decodeUnknownSync(User.add);
      const user = decode({
        name: 'John Doe',
        email: 'john@example.com',
      });

      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect((user as Record<string, unknown>)['id']).toBeUndefined();
    });
  });

  describe('update variant', () => {
    it('should include generated fields', () => {
      const decode = Schema.decodeUnknownSync(User.update);
      const user = decode({
        id: 'user-123',
        name: 'John Updated',
        email: 'john.updated@example.com',
      });

      expect(user.id).toBe('user-123');
      expect(user.name).toBe('John Updated');
    });
  });

  describe('json variant', () => {
    it('should include generated fields', () => {
      const decode = Schema.decodeUnknownSync(User.json);
      const user = decode({
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
      });

      expect(user.id).toBe('user-123');
      expect(user.name).toBe('John Doe');
    });
  });

  describe('jsonAdd variant', () => {
    it('should not require generated fields', () => {
      const decode = Schema.decodeUnknownSync(User.jsonAdd);
      const user = decode({
        name: 'John Doe',
        email: 'john@example.com',
      });

      expect(user.name).toBe('John Doe');
      expect((user as Record<string, unknown>)['id']).toBeUndefined();
    });
  });
});

describe('Field', () => {
  it('should create a field with different schemas per variant', () => {
    const customField = Field({
      get: Schema.String,
      add: Schema.Number,
      update: Schema.Boolean,
      json: Schema.String,
    });

    expect(customField).toBeDefined();
  });
});

describe('Generated', () => {
  const Id = Schema.String.pipe(Schema.brand('Id'));

  class TestModel extends Class<TestModel>('TestModel')({
    id: Generated(Id),
    name: Schema.String,
  }) {}

  it('should be available in get variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel);
    const result = decode({ id: 'test-id', name: 'Test' });

    expect(result.id).toBe('test-id');
    expect(result.name).toBe('Test');
  });

  it('should not be required in add variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.add);
    const result = decode({ name: 'Test' });

    expect(result.name).toBe('Test');
    expect((result as Record<string, unknown>)['id']).toBeUndefined();
  });

  it('should be available in update variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.update);
    const result = decode({ id: 'test-id', name: 'Test Updated' });

    expect(result.id).toBe('test-id');
  });

  it('should be available in json variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.json);
    const result = decode({ id: 'test-id', name: 'Test' });

    expect(result.id).toBe('test-id');
  });
});

describe('GeneratedByApp', () => {
  const Slug = Schema.String.pipe(Schema.brand('Slug'));

  class TestModel extends Class<TestModel>('TestModel')({
    slug: GeneratedByApp(Slug),
    title: Schema.String,
  }) {}

  it('should be available in get variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel);
    const result = decode({ slug: 'my-post', title: 'My Post' });

    expect(result.slug).toBe('my-post');
  });

  it('should be required in add variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.add);
    const result = decode({ slug: 'my-post', title: 'My Post' });

    expect(result.slug).toBe('my-post');
  });

  it('should be available in update variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.update);
    const result = decode({ slug: 'my-post', title: 'My Post Updated' });

    expect(result.slug).toBe('my-post');
  });

  it('should be available in json variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.json);
    const result = decode({ slug: 'my-post', title: 'My Post' });

    expect(result.slug).toBe('my-post');
  });
});

describe('Sensitive', () => {
  class TestModel extends Class<TestModel>('TestModel')({
    email: Schema.String,
    password: Sensitive(Schema.String),
  }) {}

  it('should be available in get variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel);
    const result = decode({ email: 'test@example.com', password: 'secret123' });

    expect(result.password).toBe('secret123');
  });

  it('should be required in add variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.add);
    const result = decode({ email: 'test@example.com', password: 'secret123' });

    expect(result.password).toBe('secret123');
  });

  it('should be excluded from json variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.json);
    const result = decode({ email: 'test@example.com' });

    expect((result as Record<string, unknown>)['password']).toBeUndefined();
  });

  it('should be excluded from jsonAdd variant', () => {
    const decode = Schema.decodeUnknownSync(TestModel.jsonAdd);
    const result = decode({ email: 'test@example.com' });

    expect((result as Record<string, unknown>)['password']).toBeUndefined();
  });
});

describe('Optional', () => {
  class TestModel extends Class<TestModel>('TestModel')({
    name: Schema.String,
    bio: Optional(Schema.String),
  }) {}

  describe('get variant', () => {
    it('should decode value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
      expect(Option.getOrNull(result.bio)).toBe('Developer');
    });

    it('should decode null to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: null });

      expect(Option.isNone(result.bio)).toBe(true);
    });

    it('should decode undefined to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: undefined });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });

  describe('encoding get variant', () => {
    it('should encode Option.none as null', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.none() })
      );

      expect(result.bio).toBeNull();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.some('Developer') })
      );

      expect(result.bio).toBe('Developer');
    });
  });

  describe('json variant', () => {
    it('should decode present value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
    });

    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John' });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });
});

describe('OptionalNull', () => {
  class TestModel extends Class<TestModel>('TestModel')({
    name: Schema.String,
    bio: OptionalNull(Schema.String),
  }) {}

  describe('get variant', () => {
    it('should decode value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
      expect(Option.getOrNull(result.bio)).toBe('Developer');
    });

    it('should decode null to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({ name: 'John', bio: null });

      expect(Option.isNone(result.bio)).toBe(true);
    });

    it('should reject undefined', () => {
      const decode = Schema.decodeUnknownSync(TestModel);

      expect(() => decode({ name: 'John', bio: undefined })).toThrow();
    });
  });

  describe('encoding get variant', () => {
    it('should encode Option.none as null', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.none() })
      );

      expect(result.bio).toBeNull();
    });

    it('should encode Option.some with the value', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({ name: 'John', bio: Option.some('Developer') })
      );

      expect(result.bio).toBe('Developer');
    });
  });

  describe('json variant', () => {
    it('should decode present value to Option.some', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John', bio: 'Developer' });

      expect(Option.isSome(result.bio)).toBe(true);
    });

    it('should decode missing key to Option.none', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({ name: 'John' });

      expect(Option.isNone(result.bio)).toBe(true);
    });
  });
});
