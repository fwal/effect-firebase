import { DateTime, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AnyTimestampDateTimeUtc,
  ServerTimestamp,
  Timestamp,
  TimestampDateTimeUtc,
} from './timestamp.js';

describe('Timestamp', () => {
  describe('class instantiation', () => {
    it('should create a Timestamp with seconds and nanoseconds', () => {
      const ts = new Timestamp({ seconds: 1234567890, nanoseconds: 123456789 });
      expect(ts.seconds).toBe(1234567890);
      expect(ts.nanoseconds).toBe(123456789);
    });
  });

  describe('fromDate', () => {
    it('should create a Timestamp from a Date', () => {
      const date = new Date('2024-01-15T10:30:00.123Z');
      const ts = Timestamp.fromDate(date);

      expect(ts.seconds).toBe(Math.floor(date.getTime() / 1000));
      expect(ts.nanoseconds).toBe(123 * 1000000);
    });

    it('should handle dates at epoch', () => {
      const date = new Date(0);
      const ts = Timestamp.fromDate(date);

      expect(ts.seconds).toBe(0);
      expect(ts.nanoseconds).toBe(0);
    });
  });

  describe('fromMillis', () => {
    it('should create a Timestamp from milliseconds', () => {
      const millis = 1705315800123; // 2024-01-15T10:30:00.123Z
      const ts = Timestamp.fromMillis(millis);

      expect(ts.seconds).toBe(1705315800);
      expect(ts.nanoseconds).toBe(123 * 1000000);
    });

    it('should handle zero milliseconds', () => {
      const ts = Timestamp.fromMillis(0);

      expect(ts.seconds).toBe(0);
      expect(ts.nanoseconds).toBe(0);
    });
  });

  describe('fromDateTime', () => {
    it('should create a Timestamp from DateTime.Utc', () => {
      const dt = DateTime.unsafeMake(1705315800123);
      const ts = Timestamp.fromDateTime(dt);

      expect(ts.seconds).toBe(1705315800);
      expect(ts.nanoseconds).toBe(123 * 1000000);
    });
  });

  describe('toDate', () => {
    it('should convert Timestamp to Date', () => {
      const ts = new Timestamp({ seconds: 1705315800, nanoseconds: 123000000 });
      const date = ts.toDate();

      expect(date.getTime()).toBe(1705315800123);
    });

    it('should handle fractional nanoseconds correctly', () => {
      const ts = new Timestamp({ seconds: 1705315800, nanoseconds: 500000 });
      const date = ts.toDate();

      // 500000 nanoseconds = 0.5 milliseconds, but Date.getTime() returns integers
      // so we use toMillis() to check the precise value
      expect(ts.toMillis()).toBe(1705315800000.5);
      // Date truncates to integer milliseconds
      expect(date.getTime()).toBe(1705315800000);
    });
  });

  describe('toMillis', () => {
    it('should convert Timestamp to milliseconds', () => {
      const ts = new Timestamp({ seconds: 1705315800, nanoseconds: 123000000 });
      expect(ts.toMillis()).toBe(1705315800123);
    });

    it('should handle zero values', () => {
      const ts = new Timestamp({ seconds: 0, nanoseconds: 0 });
      expect(ts.toMillis()).toBe(0);
    });
  });

  describe('roundtrip', () => {
    it('should maintain precision through Date roundtrip', () => {
      const original = new Date('2024-01-15T10:30:00.123Z');
      const ts = Timestamp.fromDate(original);
      const result = ts.toDate();

      expect(result.getTime()).toBe(original.getTime());
    });

    it('should maintain precision through millis roundtrip', () => {
      const originalMillis = 1705315800123;
      const ts = Timestamp.fromMillis(originalMillis);
      const result = ts.toMillis();

      expect(result).toBe(originalMillis);
    });
  });

  describe('Schema encoding/decoding', () => {
    const decode = Schema.decodeUnknownSync(Timestamp);
    const encode = Schema.encodeSync(Timestamp);

    it('should decode a valid object to Timestamp', () => {
      const input = { seconds: 1705315800, nanoseconds: 123000000 };
      const ts = decode(input);

      expect(ts).toBeInstanceOf(Timestamp);
      expect(ts.seconds).toBe(1705315800);
      expect(ts.nanoseconds).toBe(123000000);
    });

    it('should encode a Timestamp to plain object', () => {
      const ts = new Timestamp({ seconds: 1705315800, nanoseconds: 123000000 });
      const encoded = encode(ts);

      expect(encoded).toEqual({ seconds: 1705315800, nanoseconds: 123000000 });
    });

    it('should fail decoding invalid input', () => {
      expect(() => decode({ seconds: 'invalid', nanoseconds: 0 })).toThrow();
      expect(() => decode({ seconds: 0 })).toThrow();
      expect(() => decode(null)).toThrow();
    });
  });
});

describe('ServerTimestamp', () => {
  describe('class instantiation', () => {
    it('should create an empty ServerTimestamp', () => {
      const st = new ServerTimestamp({});
      expect(st).toBeInstanceOf(ServerTimestamp);
    });
  });

  describe('Schema encoding/decoding', () => {
    const decode = Schema.decodeUnknownSync(ServerTimestamp);
    const encode = Schema.encodeSync(ServerTimestamp);

    it('should decode an empty object to ServerTimestamp', () => {
      const st = decode({});
      expect(st).toBeInstanceOf(ServerTimestamp);
    });

    it('should encode a ServerTimestamp to empty object', () => {
      const st = new ServerTimestamp({});
      const encoded = encode(st);

      expect(encoded).toEqual({});
    });
  });
});

describe('TimestampDateTimeUtc', () => {
  const decode = Schema.decodeUnknownSync(TimestampDateTimeUtc);
  const encode = Schema.encodeSync(TimestampDateTimeUtc);

  describe('decoding', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const input = { seconds: 1705315800, nanoseconds: 123000000 };
      const dt = decode(input);

      expect(DateTime.isDateTime(dt)).toBe(true);
      expect(dt.epochMillis).toBe(1705315800123);
    });
  });

  describe('encoding', () => {
    it('should encode DateTime.Utc to Timestamp', () => {
      const dt = DateTime.unsafeMake(1705315800123);
      const encoded = encode(dt);

      expect(encoded).toEqual({ seconds: 1705315800, nanoseconds: 123000000 });
    });
  });

  describe('roundtrip', () => {
    it('should maintain precision through roundtrip', () => {
      const originalMillis = 1705315800123;
      const input = {
        seconds: Math.floor(originalMillis / 1000),
        nanoseconds: (originalMillis % 1000) * 1000000,
      };
      const dt = decode(input);
      const encoded = encode(dt);

      expect(encoded).toEqual(input);
    });
  });
});

describe('AnyTimestampDateTimeUtc', () => {
  const decode = Schema.decodeUnknownSync(AnyTimestampDateTimeUtc);
  const encode = Schema.encodeSync(AnyTimestampDateTimeUtc);

  describe('decoding', () => {
    it('should decode Timestamp to DateTime.Utc', () => {
      const ts = new Timestamp({ seconds: 1705315800, nanoseconds: 123000000 });
      const dt = decode(ts);

      expect(DateTime.isDateTime(dt)).toBe(true);
      expect(dt.epochMillis).toBe(1705315800123);
    });

    it('should fail to decode ServerTimestamp', () => {
      const st = new ServerTimestamp({});
      expect(() => decode(st)).toThrow(/ServerTimestamp cannot be decoded/);
    });
  });

  describe('encoding', () => {
    it('should encode DateTime.Utc to Timestamp (not ServerTimestamp)', () => {
      const dt = DateTime.unsafeMake(1705315800123);
      const encoded = encode(dt);

      // Encoding returns a plain object representation (Timestamp schema encoded form)
      expect(encoded).toEqual({ seconds: 1705315800, nanoseconds: 123000000 });
    });
  });
});
