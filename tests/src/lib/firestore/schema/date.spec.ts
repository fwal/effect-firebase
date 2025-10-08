import { Effect, Schema } from 'effect';
import { describe, it, expect } from '@effect/vitest';
import { DateFromFirestore, UnexpectedTypeError } from 'effect-firebase';
import { firestoreService } from '@effect-firebase/mock';

describe('DateFromFirestore', () => {
  it.effect('Calls service to convert to timestamp when encoding', () =>
    Effect.gen(function* () {
      const date = new Date();
      const convertToTimestamp = vi.fn(() => Effect.succeed('from callback'));
      const service = firestoreService({ convertToTimestamp });
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
      const service = firestoreService({ convertFromTimestamp });
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
      const service = firestoreService({ convertFromTimestamp });
      yield* Schema.decodeUnknown(DateFromFirestore)('MockTimestamp').pipe(
        Effect.provide(service)
      );
    })
  );
});
