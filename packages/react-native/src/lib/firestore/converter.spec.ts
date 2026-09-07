import { DateTime } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { firestoreDecode, firestoreEncode } from './converter.js';
import { FirestoreSchema, Firestore as FirestoreHelper } from 'effect-firebase';

// The real @react-native-firebase/firestore pulls in react-native native
// module glue that cannot load under vitest, so the SDK values used by the
// converter are replaced with structurally equivalent fakes.
vi.mock('@react-native-firebase/firestore', () => {
  class Timestamp {
    constructor(
      readonly seconds: number,
      readonly nanoseconds: number,
    ) {}
    static fromMillis(millis: number) {
      return new Timestamp(Math.floor(millis / 1000), (millis % 1000) * 1e6);
    }
    toMillis() {
      return this.seconds * 1000 + this.nanoseconds / 1e6;
    }
  }
  class GeoPoint {
    constructor(
      readonly latitude: number,
      readonly longitude: number,
    ) {}
  }
  class FieldValue {
    constructor(
      readonly _type: string,
      readonly _values: ReadonlyArray<unknown>,
    ) {}
  }
  return {
    Timestamp,
    GeoPoint,
    FieldValue,
    serverTimestamp: () => new FieldValue('serverTimestamp', []),
    deleteField: () => new FieldValue('delete', []),
    arrayUnion: (...values: unknown[]) => new FieldValue('arrayUnion', values),
    arrayRemove: (...values: unknown[]) =>
      new FieldValue('arrayRemove', values),
    doc: (_db: unknown, path: string) => ({
      id: path.split('/').pop(),
      path,
      firestore: {},
      get: async () => undefined,
    }),
  };
});

// Imported after the mock so the spec and converter share the same fakes.
import {
  arrayRemove,
  arrayUnion,
  deleteField,
  GeoPoint as FirebaseGeoPoint,
  serverTimestamp,
  Timestamp as FirebaseTimestamp,
  Firestore,
} from '@react-native-firebase/firestore';

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

    it('should convert document references to FirestoreSchema.Reference', () => {
      const result = firestoreDecode({
        author: {
          id: '1',
          path: 'users/1',
          firestore: {},
          get: async () => undefined,
        },
      });

      expect(result.author).toBeInstanceOf(FirestoreSchema.Reference);
      expect(result.author.path).toBe('users/1');
    });
  });

  describe('firestoreEncode', () => {
    const fakeFirestore = {} as unknown as Firestore;

    it('should convert FirestoreSchema.Timestamp to Firestore Timestamp', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreSchema.Timestamp.fromMillis(1705315800123),
      );

      expect(result).toBeInstanceOf(FirebaseTimestamp);
      expect((result as FirebaseTimestamp).seconds).toBe(1705315800);
      expect((result as FirebaseTimestamp).nanoseconds).toBe(123000000);
    });

    it('should convert Effect DateTime to Firestore Timestamp', () => {
      const result = firestoreEncode(
        fakeFirestore,
        DateTime.makeUnsafe(1705315800123),
      );

      expect(result).toBeInstanceOf(FirebaseTimestamp);
      expect((result as FirebaseTimestamp).toMillis()).toBe(1705315800123);
    });

    it('should convert Effect DateTime nested in objects and arrays', () => {
      const result = firestoreEncode(fakeFirestore, {
        createdAt: DateTime.makeUnsafe(1705315800123),
        history: [DateTime.makeUnsafe(1705315800000)],
      }) as Record<string, unknown>;

      expect(result.createdAt).toBeInstanceOf(FirebaseTimestamp);
      expect((result.history as unknown[])[0]).toBeInstanceOf(
        FirebaseTimestamp,
      );
    });

    it('should convert FirestoreSchema.GeoPoint to Firestore GeoPoint', () => {
      const result = firestoreEncode(
        fakeFirestore,
        new FirestoreSchema.GeoPoint({
          latitude: 55.6761,
          longitude: 12.5683,
        }),
      );

      expect(result).toBeInstanceOf(FirebaseGeoPoint);
      expect((result as FirebaseGeoPoint).latitude).toBe(55.6761);
      expect((result as FirebaseGeoPoint).longitude).toBe(12.5683);
    });

    it('should convert FirestoreSchema.Reference to a document reference', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreSchema.Reference.makeFromPath('users/1'),
      );

      expect((result as { path: string }).path).toBe('users/1');
    });

    it('should convert ServerTimestamp to Firestore field value', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreSchema.ServerTimestamp.make(),
      );
      expect(result).toStrictEqual(serverTimestamp());
    });

    it('should convert Delete to Firestore field value', () => {
      const result = firestoreEncode(fakeFirestore, FirestoreHelper.delete());
      expect(result).toStrictEqual(deleteField());
    });

    it('should convert ArrayUnion to arrayUnion FieldValue', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreHelper.arrayUnion(['a', 'b']),
      );
      expect(result).toStrictEqual(arrayUnion('a', 'b'));
    });

    it('should convert ArrayRemove to arrayRemove FieldValue', () => {
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreHelper.arrayRemove(['a']),
      );
      expect(result).toStrictEqual(arrayRemove('a'));
    });

    it('should recursively encode values inside ArrayUnion', () => {
      const ts = FirestoreSchema.Timestamp.fromMillis(1705315800000);
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreHelper.arrayUnion([ts]),
      );
      expect(result).toStrictEqual(
        arrayUnion(FirebaseTimestamp.fromMillis(1705315800000)),
      );
    });

    it('should recursively encode values inside ArrayRemove', () => {
      const ts = FirestoreSchema.Timestamp.fromMillis(1705315800000);
      const result = firestoreEncode(
        fakeFirestore,
        FirestoreHelper.arrayRemove([ts]),
      );
      expect(result).toStrictEqual(
        arrayRemove(FirebaseTimestamp.fromMillis(1705315800000)),
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
          FirestoreHelper.delete(),
          null,
        ],
      });

      expect((result as Record<string, unknown>).createdAt).toBeInstanceOf(
        FirebaseTimestamp,
      );
      expect(
        (
          (result as Record<string, unknown>).metadata as Record<
            string,
            unknown
          >
        ).location,
      ).toBeInstanceOf(FirebaseGeoPoint);
      expect((result as Record<string, unknown>).updates).toHaveLength(3);
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[0],
      ).toBeInstanceOf(FirebaseTimestamp);
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[1],
      ).toStrictEqual(deleteField());
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[2],
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
        firebaseTimestamp,
      );
      expect((result as Record<string, unknown>).geoPoint).toBe(
        firebaseGeoPoint,
      );
      expect((result as Record<string, unknown>).delete).toBe(firebaseDelete);
    });
  });
});
