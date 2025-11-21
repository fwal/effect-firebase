import { DateTime, Effect, Schema } from 'effect';
import { describe, it, expect } from '@effect/vitest';
import { FirestoreSchema, UnexpectedTypeError } from 'effect-firebase';
import { MockFirestoreService, MockTimestamp } from '@effect-firebase/mock';

describe('FirestoreSchema.Date', () => {
  it.effect('Calls service to convert to timestamp when encoding', () =>
    Effect.gen(function* () {
      const date = yield* DateTime.now;
      const timestamp = MockTimestamp.mockFromDateTime(date);

      const convertToTimestamp = vi.fn(() => Effect.succeed(timestamp));
      const service = MockFirestoreService({ convertToTimestamp });

      const result = yield* Schema.encodeUnknown(FirestoreSchema.DateTime)(
        date
      ).pipe(Effect.provide(service));

      expect(convertToTimestamp).toHaveBeenCalledWith(date);
      expect(result).toEqual(timestamp);
    })
  );

  it.effect('Calls service to convert from timestamp when decoding', () =>
    Effect.gen(function* () {
      const date = yield* DateTime.now;
      const timestamp = MockTimestamp.mockFromDateTime(date);

      const convertFromTimestamp = vi.fn((timestamp) =>
        Effect.succeed(
          DateTime.toUtc(DateTime.unsafeMake(timestamp.toMillis()))
        )
      );
      const service = MockFirestoreService({ convertFromTimestamp });

      const result = yield* Schema.decodeUnknown(FirestoreSchema.DateTime)(
        timestamp
      ).pipe(Effect.provide(service));

      expect(convertFromTimestamp).toHaveBeenCalledWith(timestamp);
      expect(result).toEqual(date);
    })
  );

  it.effect.fails('Fails when converting from timestamp fails', () =>
    Effect.gen(function* () {
      const convertFromTimestamp = vi.fn(() =>
        Effect.fail(
          new UnexpectedTypeError({
            expected: 'Timestamp',
            actual: 'unknown',
          })
        )
      );
      const service = MockFirestoreService({ convertFromTimestamp });

      yield* Schema.decodeUnknown(FirestoreSchema.DateTime)(
        'NotATimestamp'
      ).pipe(Effect.provide(service));
    })
  );

  it.effect('Decodes timestamp to date', () =>
    Effect.gen(function* () {
      const date = yield* DateTime.now;
      const timestamp = MockTimestamp.mockFromDateTime(date);

      const service = MockFirestoreService();

      const schema = Schema.Struct({
        createdAt: FirestoreSchema.DateTime,
      });

      const result = yield* Schema.decodeUnknown(schema)({
        createdAt: timestamp,
      }).pipe(Effect.provide(service));
      expect(result).toEqual({ createdAt: date });
    })
  );

  it.effect('Encodes date to timestamp', () =>
    Effect.gen(function* () {
      const date = yield* DateTime.now;
      const timestamp = MockTimestamp.mockFromDateTime(date);

      const service = MockFirestoreService();

      const schema = Schema.Struct({
        createdAt: FirestoreSchema.DateTime,
      });

      const result = yield* Schema.encodeUnknown(schema)({
        createdAt: date,
      }).pipe(Effect.provide(service));

      expect(result).toEqual({ createdAt: timestamp });
    })
  );
});
