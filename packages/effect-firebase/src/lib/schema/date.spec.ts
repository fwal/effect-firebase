import { Effect, Layer, Schema } from 'effect';
import { describe, it, expect } from '@effect/vitest';
import { DateFromFirestore } from './date.js';
import {
  FirestoreService,
  FirestoreServiceShape,
  UnexpectedTypeError,
} from '../firestore/firestore-service.js';

const makeService = (overrides: Partial<FirestoreServiceShape>) =>
  Layer.succeed(FirestoreService, {
    get: () => {
      throw new Error('Function not implemented.');
    },
    convertToTimestamp: () => {
      throw new Error('Function not implemented.');
    },
    convertFromTimestamp: () => {
      throw new Error('Function not implemented.');
    },
    convertToGeoPoint: () => {
      throw new Error('Function not implemented.');
    },
    convertFromGeoPoint: () => {
      throw new Error('Function not implemented.');
    },
    convertFromReference: () => {
      throw new Error('Function not implemented.');
    },
    convertToReference: () => {
      throw new Error('Function not implemented.');
    },
    ...overrides,
  });

describe('DateFromFirestore', () => {
  it.effect('Calls service to convert to timestamp when encoding', () =>
    Effect.gen(function* () {
      const date = new Date();
      const convertToTimestamp = vi.fn(() => Effect.succeed('from callback'));
      const service = makeService({ convertToTimestamp });
      const result = yield* Schema.encodeUnknown(DateFromFirestore)(date).pipe(
        Effect.provide(service)
      );
      expect(convertToTimestamp).toHaveBeenCalledWith(date);
      expect(result).toEqual('from callback');
    })
  );

  it.effect('Calls service to convert from timestamp when decoding', () =>
    Effect.gen(function* () {
      const date = new Date();
      const convertFromTimestamp = vi.fn(() => Effect.succeed(date));
      const service = makeService({ convertFromTimestamp });
      const result = yield* Schema.decodeUnknown(DateFromFirestore)(
        'MockTimestamp'
      ).pipe(Effect.provide(service));
      expect(convertFromTimestamp).toHaveBeenCalledWith('MockTimestamp');
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
      const service = makeService({ convertFromTimestamp });
      yield* Schema.decodeUnknown(DateFromFirestore)('MockTimestamp').pipe(
        Effect.provide(service)
      );
    })
  );
});
