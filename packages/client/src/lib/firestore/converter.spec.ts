import { describe, expect, it } from 'vitest';
import {
  arrayRemove,
  arrayUnion,
  deleteField,
  GeoPoint as FirebaseGeoPoint,
  serverTimestamp,
  Timestamp as FirebaseTimestamp,
  Firestore,
} from 'firebase/firestore';
import { firestoreDecode, firestoreEncode } from './converter.js';
import { FirestoreSchema, FirestoreField } from 'effect-firebase';

describe('Firestore Converter', () => {
  describe('firestoreDecode', () => {
    it('should convert Firestore Timestamp to FirestoreSchema.Timestamp', () => {
      const firebaseTimestamp = new FirebaseTimestamp(1705315800, 123000000);

      const result = firestoreDecode({
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

      const result = firestoreDecode({
        post: {
          createdAt: firebaseTimestamp,
          title: 'Nested',
        },
      });

      expect(result.post.createdAt).toBeInstanceOf(FirestoreSchema.Timestamp);
    });

    it('should handle timestamps in arrays', () => {
      const firebaseTimestamp = new FirebaseTimestamp(1705315800, 0);

      const result = firestoreDecode({
        timestamps: [firebaseTimestamp, firebaseTimestamp],
      });

      expect(result.timestamps[0]).toBeInstanceOf(FirestoreSchema.Timestamp);
      expect(result.timestamps[1]).toBeInstanceOf(FirestoreSchema.Timestamp);
    });

    it('should preserve null and undefined values', () => {
      const result = firestoreDecode({
        nullValue: null,
        undefinedValue: undefined,
        stringValue: 'test',
      });

      expect(result.nullValue).toBeNull();
      expect(result.undefinedValue).toBeUndefined();
      expect(result.stringValue).toBe('test');
    });

    it('should NOT convert null to Timestamp', () => {
      const result = firestoreDecode({
        createdAt: null,
      });

      // null should stay null, not be converted to Timestamp
      expect(result.createdAt).toBeNull();
    });
  });

  describe('firestoreEncode', () => {
    const fakeFirestore = {} as unknown as Firestore;

    it('should convert FirestoreSchema.Timestamp to Firestore Timestamp', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreSchema.Timestamp.fromMillis(1705315800123)
      );

      expect(result).toBeInstanceOf(FirebaseTimestamp);
      expect((result as FirebaseTimestamp).seconds).toBe(1705315800);
      expect((result as FirebaseTimestamp).nanoseconds).toBe(123000000);
    });

    it('should convert FirestoreSchema.GeoPoint to Firestore GeoPoint', () => {
      const result = firestoreEncode(
        fakeFirestore,
        new FirestoreSchema.GeoPoint({
          latitude: 55.6761,
          longitude: 12.5683,
        })
      );

      expect(result).toBeInstanceOf(FirebaseGeoPoint);
      expect((result as FirebaseGeoPoint).latitude).toBe(55.6761);
      expect((result as FirebaseGeoPoint).longitude).toBe(12.5683);
    });

    it('should convert ServerTimestamp to Firestore field value', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreSchema.ServerTimestamp.make()
      );
      expect(result).toStrictEqual(serverTimestamp());
    });

    it('should convert Delete to Firestore field value', () => {
      const result = firestoreEncode(fakeFirestore, FirestoreField.delete());
      expect(result).toStrictEqual(deleteField());
    });

    it('should convert ArrayUnion to arrayUnion FieldValue', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreField.arrayUnion(['a', 'b'])
      );
      expect(result).toStrictEqual(arrayUnion('a', 'b'));
    });

    it('should convert ArrayRemove to arrayRemove FieldValue', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreField.arrayRemove(['a'])
      );
      expect(result).toStrictEqual(arrayRemove('a'));
    });

    it('should recursively encode values inside ArrayUnion', () => {
      const ts = FirestoreSchema.Timestamp.fromMillis(1705315800000);
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreField.arrayUnion([ts])
      );
      expect(result).toStrictEqual(
        arrayUnion(FirebaseTimestamp.fromMillis(1705315800000))
      );
    });

    it('should recursively encode values inside ArrayRemove', () => {
      const ts = FirestoreSchema.Timestamp.fromMillis(1705315800000);
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreField.arrayRemove([ts])
      );
      expect(result).toStrictEqual(
        arrayRemove(FirebaseTimestamp.fromMillis(1705315800000))
      );
    });

    it('should recursively convert nested objects and arrays', () => {
      const result = firestoreEncode(fakeFirestore, {
        createdAt: FirestoreSchema.Timestamp.fromMillis(1705315800000),
        metadata: {
          location: new FirestoreSchema.GeoPoint({ latitude: 1, longitude: 2 }),
        },
        updates: [
          FirestoreSchema.Timestamp.fromMillis(1705315800123),
          FirestoreField.delete(),
          null,
        ],
      });

      expect((result as Record<string, unknown>).createdAt).toBeInstanceOf(
        FirebaseTimestamp
      );
      expect(
        (
          (result as Record<string, unknown>).metadata as Record<
            string,
            unknown
          >
        ).location
      ).toBeInstanceOf(FirebaseGeoPoint);
      expect((result as Record<string, unknown>).updates).toHaveLength(3);
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[0]
      ).toBeInstanceOf(FirebaseTimestamp);
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[1]
      ).toStrictEqual(deleteField());
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[2]
      ).toBeNull();
    });

    it('should preserve already-native Firestore values', () => {
      const firebaseTimestamp = new FirebaseTimestamp(1705315800, 0);
      const firebaseGeoPoint = new FirebaseGeoPoint(10, 20);
      const firebaseDelete = deleteField();

      const result = firestoreEncode(fakeFirestore, {
        timestamp: firebaseTimestamp,
        geoPoint: firebaseGeoPoint,
        delete: firebaseDelete,
      });

      expect((result as Record<string, unknown>).timestamp).toBe(
        firebaseTimestamp
      );
      expect((result as Record<string, unknown>).geoPoint).toBe(
        firebaseGeoPoint
      );
      expect((result as Record<string, unknown>).delete).toBe(firebaseDelete);
    });
  });
});
