import { describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import * as Firestore from '../firestore.js';
import * as FirestoreSchema from './schema.js';

const lower = (schema: Schema.Top) =>
  Schema.toJsonSchemaDocument(schema as any).schema;

const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

class PlaceModel extends Model.Class<PlaceModel>('PlaceModel')({
  id: Model.GeneratedByDb(Schema.String),
  location: Firestore.GeoPoint,
  author: Firestore.Reference(AuthorId, 'authors'),
  authorPath: Firestore.AnyPathReference,
  createdAt: Firestore.DateTimeInsert,
  likes: Firestore.Number,
  tags: Firestore.Array(Schema.String),
  note: Firestore.OptionalDeletable(Schema.String),
}) {}

describe('JSON Schema generation', () => {
  it('lowers instanceOf declarations to object schemas instead of {}', () => {
    expect(lower(FirestoreSchema.GeoPointInstance)).toMatchObject({
      type: 'object',
      required: ['latitude', 'longitude'],
    });
    expect(lower(FirestoreSchema.ReferenceInstance)).toMatchObject({
      type: 'object',
      required: ['id', 'path'],
    });
    expect(lower(FirestoreSchema.AnyReferencePath)).toMatchObject({
      type: 'object',
      required: ['id', 'path'],
    });
    expect(lower(FirestoreSchema.TimestampInstance)).toMatchObject({
      type: 'object',
      required: ['seconds', 'nanoseconds'],
    });
    expect(lower(FirestoreSchema.TimestampDateTimeUtc)).toMatchObject({
      type: 'object',
      required: ['seconds', 'nanoseconds'],
    });
  });

  it('lowers ReferenceId through its $defs entry', () => {
    const doc = Schema.toJsonSchemaDocument(
      FirestoreSchema.ReferenceId(AuthorId, 'authors'),
    );
    expect(doc.definitions['TypedReferenceId<authors>Encoded']).toMatchObject({
      type: 'object',
      required: ['id', 'path'],
    });
  });

  it('lowers the sentinels in the update variant', () => {
    const schema = lower(PlaceModel.update) as any;
    expect(JSON.stringify(schema.properties.likes)).toContain('"Increment"');
    expect(JSON.stringify(schema.properties.tags)).toContain('"ArrayUnion"');
    expect(JSON.stringify(schema.properties.tags)).toContain('"ArrayRemove"');
    expect(JSON.stringify(schema.properties.note)).toContain('"Delete"');
  });

  it('keeps format/description on the json variant of date-time fields', () => {
    const schema = lower(PlaceModel.json) as any;
    expect(schema.properties.createdAt).toEqual({
      type: 'string',
      format: 'date-time',
      description: 'ISO 8601 UTC date-time',
    });
    expect(lower(FirestoreSchema.DateTimeUtcFromString)).toMatchObject({
      format: 'date-time',
    });
  });

  it('never produces an empty schema for any DB variant field', () => {
    const doc = Schema.toJsonSchemaDocument(PlaceModel);
    const props = (doc.definitions['PlaceModelEncoded'] as any).properties;
    for (const [key, value] of Object.entries(props)) {
      expect(value, key).not.toEqual({});
    }
  });

  it('json codecs derived from the declarations round-trip', () => {
    const geo = Schema.toCodecJson(FirestoreSchema.GeoPointInstance);
    const encoded = Schema.encodeSync(geo)(
      new FirestoreSchema.GeoPoint({ latitude: 1, longitude: 2 }),
    );
    expect(encoded).toEqual({ latitude: 1, longitude: 2 });
    expect(Schema.decodeSync(geo)(encoded)).toBeInstanceOf(
      FirestoreSchema.GeoPoint,
    );

    const ref = Schema.toCodecJson(FirestoreSchema.ReferenceInstance);
    const decoded = Schema.decodeSync(ref)({ id: 'd', path: 'a/b/c/d' });
    expect(decoded).toBeInstanceOf(FirestoreSchema.Reference);
    expect(decoded.parent?.path).toBe('a/b');
  });

  it('reference json codec rejects an id that does not match the path', () => {
    const ref = Schema.toCodecJson(FirestoreSchema.ReferenceInstance);
    expect(() =>
      Schema.decodeSync(ref)({ id: 'wrong', path: 'users/doc123' }),
    ).toThrow(/Id must match the last part of the path/);
    expect(() => Schema.decodeSync(ref)({ id: 'a', path: 'a' })).toThrow(
      /even number of parts/,
    );
  });
});
