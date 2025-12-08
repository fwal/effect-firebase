import { describe, expect, it } from 'vitest';
import { Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import { fromFirestoreDocumentData } from './converter.js';
import { FirestoreSchema } from 'effect-firebase';

describe('Firestore Converter', () => {
  describe('fromFirestoreDocumentData', () => {
    it('should convert Firestore Timestamp to FirestoreSchema.Timestamp', () => {
      const firebaseTimestamp = new FirebaseTimestamp(1705315800, 123000000);

      const result = fromFirestoreDocumentData({
        title: 'Test Post',
        createdAt: firebaseTimestamp,
      });

      expect(result.title).toBe('Test Post');
      expect(result.createdAt).toBeInstanceOf(FirestoreSchema.Timestamp);
      expect(result.createdAt.seconds).toBe(1705315800);
      expect(result.createdAt.nanoseconds).toBe(123000000);
    });

    it('should handle nested timestamps', () => {
      const firebaseTimestamp = new FirebaseTimestamp(1705315800, 0);

      const result = fromFirestoreDocumentData({
        post: {
          createdAt: firebaseTimestamp,
          title: 'Nested',
        },
      });

      expect(result.post.createdAt).toBeInstanceOf(FirestoreSchema.Timestamp);
    });

    it('should handle timestamps in arrays', () => {
      const firebaseTimestamp = new FirebaseTimestamp(1705315800, 0);

      const result = fromFirestoreDocumentData({
        timestamps: [firebaseTimestamp, firebaseTimestamp],
      });

      expect(result.timestamps[0]).toBeInstanceOf(FirestoreSchema.Timestamp);
      expect(result.timestamps[1]).toBeInstanceOf(FirestoreSchema.Timestamp);
    });

    it('should preserve null and undefined values', () => {
      const result = fromFirestoreDocumentData({
        nullValue: null,
        undefinedValue: undefined,
        stringValue: 'test',
      });

      expect(result.nullValue).toBeNull();
      expect(result.undefinedValue).toBeUndefined();
      expect(result.stringValue).toBe('test');
    });

    it('should NOT convert null to Timestamp', () => {
      const result = fromFirestoreDocumentData({
        createdAt: null,
      });

      // null should stay null, not be converted to Timestamp
      expect(result.createdAt).toBeNull();
    });
  });
});
