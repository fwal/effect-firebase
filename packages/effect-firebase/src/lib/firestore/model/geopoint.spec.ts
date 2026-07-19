import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { Model } from 'effect/unstable/schema';
import { GeoPoint } from './geopoint.js';
import { GeoPoint as GeoPointClass } from '../schema/geopoint.js';

describe('Model.GeoPoint', () => {
  const PlaceId = Schema.String.pipe(Schema.brand('PlaceId'));

  class TestModel extends Model.Class<TestModel>('TestModel')({
    id: Model.GeneratedByDb(PlaceId),
    location: GeoPoint,
  }) {}

  describe('select variant', () => {
    it('should decode a GeoPoint instance to a GeoPoint instance', () => {
      const decode = Schema.decodeUnknownSync(TestModel);
      const result = decode({
        id: 'place-1',
        location: new GeoPointClass({
          latitude: 37.7749,
          longitude: -122.4194,
        }),
      });

      expect(result.location).toBeInstanceOf(GeoPointClass);
      expect(result.location.latitude).toBe(37.7749);
      expect(result.location.longitude).toBe(-122.4194);
    });

    it('should encode a GeoPoint instance to a GeoPoint instance', () => {
      const encode = Schema.encodeSync(TestModel);
      const result = encode(
        new TestModel({
          id: PlaceId.make('place-1'),
          location: new GeoPointClass({
            latitude: 37.7749,
            longitude: -122.4194,
          }),
        })
      );

      expect(result.location).toBeInstanceOf(GeoPointClass);
      expect(result.location.latitude).toBe(37.7749);
      expect(result.location.longitude).toBe(-122.4194);
    });
  });

  describe('insert variant', () => {
    it('should encode a GeoPoint instance to a GeoPoint instance', () => {
      const encode = Schema.encodeSync(TestModel.insert);
      const result = encode({
        location: new GeoPointClass({ latitude: 51.5074, longitude: -0.1278 }),
      });

      expect(result.location).toBeInstanceOf(GeoPointClass);
    });
  });

  describe('json variant', () => {
    it('should decode a plain object to a GeoPoint instance', () => {
      const decode = Schema.decodeUnknownSync(TestModel.json);
      const result = decode({
        id: 'place-1',
        location: { latitude: 35.6762, longitude: 139.6503 },
      });

      expect(result.location).toBeInstanceOf(GeoPointClass);
      expect(result.location.latitude).toBe(35.6762);
      expect(result.location.longitude).toBe(139.6503);
    });

    it('should encode a GeoPoint instance to a plain object', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const result = encode({
        id: PlaceId.make('place-1'),
        location: new GeoPointClass({ latitude: 35.6762, longitude: 139.6503 }),
      });

      expect(result.location).toEqual({
        latitude: 35.6762,
        longitude: 139.6503,
      });
      expect(result.location).not.toBeInstanceOf(GeoPointClass);
    });

    it('should survive a JSON.stringify/parse roundtrip', () => {
      const encode = Schema.encodeSync(TestModel.json);
      const decode = Schema.decodeUnknownSync(TestModel.json);

      const original = new TestModel({
        id: PlaceId.make('place-1'),
        location: new GeoPointClass({
          latitude: -33.8688,
          longitude: 151.2093,
        }),
      });

      const roundtripped = decode(JSON.parse(JSON.stringify(encode(original))));

      expect(roundtripped.location).toBeInstanceOf(GeoPointClass);
      expect(roundtripped.location.latitude).toBe(-33.8688);
      expect(roundtripped.location.longitude).toBe(151.2093);
    });
  });
});
