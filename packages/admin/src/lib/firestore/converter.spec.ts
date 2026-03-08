import { describe, expect, it } from 'vitest';
import {
  FieldValue,
  Firestore,
  GeoPoint as AdminGeoPoint,
  Timestamp as AdminTimestamp,
} from 'firebase-admin/firestore';
import {
  fromFirestoreDocumentData,
  toFirestoreDocumentData,
} from './converter.js';
import { FirestoreSchema } from 'effect-firebase';

describe('Firestore Converter', () => {
  describe('fromFirestoreDocumentData', () => {
    it('should convert Firestore Timestamp to FirestoreSchema.Timestamp', () => {
      const adminTimestamp = new AdminTimestamp(1705315800, 123000000);

      const result = fromFirestoreDocumentData({
        title: 'Test Post',
        createdAt: adminTimestamp,
      });

      expect(result.title).toBe('Test Post');
      expect(result.createdAt).toBeInstanceOf(FirestoreSchema.Timestamp);
      expect(result.createdAt.seconds).toBe(1705315800);
      expect(result.createdAt.nanoseconds).toBe(123000000);
    });

    it('should handle nested timestamps', () => {
      const adminTimestamp = new AdminTimestamp(1705315800, 0);

      const result = fromFirestoreDocumentData({
        post: {
          createdAt: adminTimestamp,
          title: 'Nested',
        },
      });

      expect(result.post.createdAt).toBeInstanceOf(FirestoreSchema.Timestamp);
    });

    it('should handle timestamps in arrays', () => {
      const adminTimestamp = new AdminTimestamp(1705315800, 0);

      const result = fromFirestoreDocumentData({
        timestamps: [adminTimestamp, adminTimestamp],
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

      expect(result.createdAt).toBeNull();
    });
  });

  describe('toFirestoreDocumentData', () => {
    it('should convert FirestoreSchema.Timestamp to Firestore Timestamp', () => {
      const fakeFirestore = {} as unknown as Firestore;
      const result = toFirestoreDocumentData(
        fakeFirestore,
        FirestoreSchema.Timestamp.fromMillis(1705315800123)
      );

      expect(result).toBeInstanceOf(AdminTimestamp);
      expect((result as AdminTimestamp).seconds).toBe(1705315800);
      expect((result as AdminTimestamp).nanoseconds).toBe(123000000);
    });

    it('should convert FirestoreSchema.GeoPoint to Firestore GeoPoint', () => {
      const fakeFirestore = {} as unknown as Firestore;
      const result = toFirestoreDocumentData(
        fakeFirestore,
        new FirestoreSchema.GeoPoint({
          latitude: 55.6761,
          longitude: 12.5683,
        })
      );

      expect(result).toBeInstanceOf(AdminGeoPoint);
      expect((result as AdminGeoPoint).latitude).toBe(55.6761);
      expect((result as AdminGeoPoint).longitude).toBe(12.5683);
    });

    it('should convert FirestoreSchema.Reference using db.doc(path)', () => {
      const docCalls: string[] = [];
      const fakeReference = { __tag: 'fake-doc-ref' };
      const fakeFirestore = {
        doc: (path: string) => {
          docCalls.push(path);
          return fakeReference;
        },
      } as unknown as Firestore;

      const result = toFirestoreDocumentData(
        fakeFirestore,
        FirestoreSchema.Reference.makeFromPath('posts/post-1')
      );

      expect(docCalls).toEqual(['posts/post-1']);
      expect(result).toBe(fakeReference);
    });

    it('should convert ServerTimestamp to Firestore field value', () => {
      const fakeFirestore = {} as unknown as Firestore;
      const result = toFirestoreDocumentData(
        fakeFirestore,
        FirestoreSchema.ServerTimestamp.make()
      );

      expect(result).toStrictEqual(FieldValue.serverTimestamp());
    });

    it('should convert Delete to Firestore field value', () => {
      const fakeFirestore = {} as unknown as Firestore;
      const result = toFirestoreDocumentData(
        fakeFirestore,
        FirestoreSchema.Delete.make()
      );

      expect(result).toStrictEqual(FieldValue.delete());
    });

    it('should convert ArrayUnion to arrayUnion FieldValue', () => {
      const fakeFirestore = {} as unknown as Firestore;
      const result = toFirestoreDocumentData(
        fakeFirestore,
        FirestoreSchema.ArrayUnion.make({ values: ['a', 'b'] })
      );
      expect(result).toStrictEqual(FieldValue.arrayUnion('a', 'b'));
    });

    it('should convert ArrayRemove to arrayRemove FieldValue', () => {
      const fakeFirestore = {} as unknown as Firestore;
      const result = toFirestoreDocumentData(
        fakeFirestore,
        FirestoreSchema.ArrayRemove.make({ values: ['a'] })
      );
      expect(result).toStrictEqual(FieldValue.arrayRemove('a'));
    });

    it('should recursively convert nested objects and arrays', () => {
      const fakeFirestore = {
        doc: (path: string) => ({ path, __tag: 'fake-doc-ref' }),
      } as unknown as Firestore;

      const result = toFirestoreDocumentData(fakeFirestore, {
        createdAt: FirestoreSchema.Timestamp.fromMillis(1705315800000),
        metadata: {
          location: new FirestoreSchema.GeoPoint({ latitude: 1, longitude: 2 }),
          postRef: FirestoreSchema.Reference.makeFromPath('posts/post-1'),
        },
        updates: [
          FirestoreSchema.Timestamp.fromMillis(1705315800123),
          FirestoreSchema.Delete.make(),
          null,
        ],
      });

      expect((result as Record<string, unknown>).createdAt).toBeInstanceOf(
        AdminTimestamp
      );
      expect(
        (
          (result as Record<string, unknown>).metadata as Record<
            string,
            unknown
          >
        ).location
      ).toBeInstanceOf(AdminGeoPoint);
      expect(
        (
          (result as Record<string, unknown>).metadata as Record<
            string,
            unknown
          >
        ).postRef
      ).toEqual({ path: 'posts/post-1', __tag: 'fake-doc-ref' });
      expect((result as Record<string, unknown>).updates).toHaveLength(3);
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[0]
      ).toBeInstanceOf(AdminTimestamp);
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[1]
      ).toStrictEqual(FieldValue.delete());
      expect(
        ((result as Record<string, unknown>).updates as unknown[])[2]
      ).toBeNull();
    });

    it('should preserve already-native Firestore values', () => {
      const fakeFirestore = {} as unknown as Firestore;
      const adminTimestamp = new AdminTimestamp(1705315800, 0);
      const adminGeoPoint = new AdminGeoPoint(10, 20);
      const adminDelete = FieldValue.delete();

      const result = toFirestoreDocumentData(fakeFirestore, {
        timestamp: adminTimestamp,
        geoPoint: adminGeoPoint,
        delete: adminDelete,
      });

      expect((result as Record<string, unknown>).timestamp).toBe(
        adminTimestamp
      );
      expect((result as Record<string, unknown>).geoPoint).toBe(adminGeoPoint);
      expect((result as Record<string, unknown>).delete).toBe(adminDelete);
    });
  });
});
