import { describe, expect, it } from 'vitest';
import { Schema, DateTime } from 'effect';
import { Class, DateTimeInsert, DateTimeUpdate, Generated } from './index.js';
import * as FirestoreSchema from '../schema/schema.js';

describe('Repository - DateTimeInsert encoding', () => {
  const PostId = Schema.String.pipe(Schema.brand('PostId'));

  class PostModel extends Class<PostModel>('PostModel')({
    id: Generated(PostId),
    createdAt: DateTimeInsert,
    updatedAt: DateTimeUpdate,
    title: Schema.String,
  }) {}

  describe('add variant encoding', () => {
    it('should convert undefined createdAt to ServerTimestamp', () => {
      const encode = Schema.encodeSync(PostModel.add);

      const result = encode({
        title: 'Test Post',
        createdAt: undefined,
        updatedAt: undefined,
      });

      // createdAt should be ServerTimestamp, not null or undefined
      expect(result.createdAt).toBeDefined();
      expect(result.createdAt).not.toBeNull();
      expect(result.createdAt).toBeInstanceOf(FirestoreSchema.ServerTimestamp);
    });

    it('should handle DateTime.Utc values', () => {
      const encode = Schema.encodeSync(PostModel.add);
      const millis = 1705315800000;
      const now = DateTime.unsafeMake(millis);

      const result = encode({
        title: 'Test Post',
        createdAt: now as any,
        updatedAt: undefined,
      });

      // Should be converted to Timestamp, not ServerTimestamp
      expect(result.createdAt).toBeDefined();
      expect(result.createdAt?.seconds).toBe(Math.floor(millis / 1000));
      expect(result.createdAt?.nanoseconds).toBe(0);
    });
  });

  describe('update variant encoding', () => {
    it('should not include createdAt in update', () => {
      const encode = Schema.encodeSync(PostModel.update);

      const result = encode({
        id: PostId.make('post-1'),
        title: 'Updated Post',
        updatedAt: undefined,
      });

      // createdAt should not be present in update
      expect((result as Record<string, unknown>).createdAt).toBeUndefined();
    });

    it('should convert undefined updatedAt to ServerTimestamp', () => {
      const encode = Schema.encodeSync(PostModel.update);

      const result = encode({
        id: PostId.make('post-1'),
        title: 'Updated Post',
        updatedAt: undefined,
      });

      // updatedAt should be ServerTimestamp
      expect(result.updatedAt).toBeDefined();
      expect(result.updatedAt).not.toBeNull();
      expect(result.updatedAt).toBeInstanceOf(FirestoreSchema.ServerTimestamp);
    });
  });
});
