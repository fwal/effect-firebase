import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { GeoPoint } from './geopoint.js';

describe('GeoPoint', () => {
  describe('class instantiation', () => {
    it('should create a GeoPoint with latitude and longitude', () => {
      const geoPoint = new GeoPoint({
        latitude: 37.7749,
        longitude: -122.4194,
      });

      expect(geoPoint.latitude).toBe(37.7749);
      expect(geoPoint.longitude).toBe(-122.4194);
    });

    it('should handle zero coordinates', () => {
      const geoPoint = new GeoPoint({ latitude: 0, longitude: 0 });

      expect(geoPoint.latitude).toBe(0);
      expect(geoPoint.longitude).toBe(0);
    });

    it('should handle extreme coordinates', () => {
      const northPole = new GeoPoint({ latitude: 90, longitude: 0 });
      expect(northPole.latitude).toBe(90);

      const southPole = new GeoPoint({ latitude: -90, longitude: 0 });
      expect(southPole.latitude).toBe(-90);

      const dateLine = new GeoPoint({ latitude: 0, longitude: 180 });
      expect(dateLine.longitude).toBe(180);

      const dateLineNeg = new GeoPoint({ latitude: 0, longitude: -180 });
      expect(dateLineNeg.longitude).toBe(-180);
    });

    it('should handle decimal precision', () => {
      const precise = new GeoPoint({
        latitude: 37.7749295,
        longitude: -122.4194155,
      });

      expect(precise.latitude).toBe(37.7749295);
      expect(precise.longitude).toBe(-122.4194155);
    });
  });

  describe('Schema encoding/decoding', () => {
    const decode = Schema.decodeUnknownSync(GeoPoint);
    const encode = Schema.encodeSync(GeoPoint);

    describe('decoding', () => {
      it('should decode a valid object to GeoPoint', () => {
        const input = { latitude: 37.7749, longitude: -122.4194 };
        const geoPoint = decode(input);

        expect(geoPoint).toBeInstanceOf(GeoPoint);
        expect(geoPoint.latitude).toBe(37.7749);
        expect(geoPoint.longitude).toBe(-122.4194);
      });

      it('should decode integer coordinates', () => {
        const input = { latitude: 40, longitude: -74 };
        const geoPoint = decode(input);

        expect(geoPoint.latitude).toBe(40);
        expect(geoPoint.longitude).toBe(-74);
      });

      it('should fail decoding missing latitude', () => {
        expect(() => decode({ longitude: -122.4194 })).toThrow();
      });

      it('should fail decoding missing longitude', () => {
        expect(() => decode({ latitude: 37.7749 })).toThrow();
      });

      it('should fail decoding null', () => {
        expect(() => decode(null)).toThrow();
      });

      it('should fail decoding undefined', () => {
        expect(() => decode(undefined)).toThrow();
      });

      it('should fail decoding string coordinates', () => {
        expect(() =>
          decode({ latitude: '37.7749', longitude: '-122.4194' })
        ).toThrow();
      });
    });

    describe('encoding', () => {
      it('should encode a GeoPoint to plain object', () => {
        const geoPoint = new GeoPoint({
          latitude: 37.7749,
          longitude: -122.4194,
        });
        const encoded = encode(geoPoint);

        expect(encoded).toEqual({ latitude: 37.7749, longitude: -122.4194 });
      });

      it('should encode zero coordinates', () => {
        const geoPoint = new GeoPoint({ latitude: 0, longitude: 0 });
        const encoded = encode(geoPoint);

        expect(encoded).toEqual({ latitude: 0, longitude: 0 });
      });
    });

    describe('roundtrip', () => {
      it('should maintain precision through roundtrip', () => {
        const original = { latitude: 37.7749295, longitude: -122.4194155 };
        const geoPoint = decode(original);
        const encoded = encode(geoPoint);

        expect(encoded).toEqual(original);
      });

      it('should maintain negative coordinates through roundtrip', () => {
        const original = { latitude: -33.8688, longitude: 151.2093 }; // Sydney
        const geoPoint = decode(original);
        const encoded = encode(geoPoint);

        expect(encoded).toEqual(original);
      });
    });
  });

  describe('real-world coordinates', () => {
    const decode = Schema.decodeUnknownSync(GeoPoint);

    it('should handle San Francisco coordinates', () => {
      const sf = decode({ latitude: 37.7749, longitude: -122.4194 });
      expect(sf).toBeInstanceOf(GeoPoint);
    });

    it('should handle Tokyo coordinates', () => {
      const tokyo = decode({ latitude: 35.6762, longitude: 139.6503 });
      expect(tokyo).toBeInstanceOf(GeoPoint);
    });

    it('should handle London coordinates', () => {
      const london = decode({ latitude: 51.5074, longitude: -0.1278 });
      expect(london).toBeInstanceOf(GeoPoint);
    });

    it('should handle coordinates near the equator and prime meridian', () => {
      const accra = decode({ latitude: 5.6037, longitude: -0.187 });
      expect(accra).toBeInstanceOf(GeoPoint);
    });
  });
});
