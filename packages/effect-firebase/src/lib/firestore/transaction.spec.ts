import { describe, expect, it, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { withTransaction, withBatch } from './transaction.js';
import { FirestoreService } from './firestore-service.js';
import type { FirestoreServiceShape } from './firestore-service.js';

const makeLayer = (overrides: Partial<FirestoreServiceShape>) =>
  Layer.succeed(FirestoreService, overrides as FirestoreServiceShape);

describe('withTransaction', () => {
  it('delegates to FirestoreService.withTransaction', async () => {
    // vitest's Mock type erases generic call signatures, so cast back.
    const withTransactionMock = vi.fn((self: Effect.Effect<unknown>) => self);
    const withTransaction_ =
      withTransactionMock as unknown as FirestoreServiceShape['withTransaction'];
    const result = await Effect.runPromise(
      withTransaction(Effect.succeed(42)).pipe(
        Effect.provide(makeLayer({ withTransaction: withTransaction_ })),
      ),
    );

    expect(result).toBe(42);
    expect(withTransactionMock).toHaveBeenCalledTimes(1);
  });
});

describe('withBatch', () => {
  it('delegates to FirestoreService.withBatch', async () => {
    const withBatchMock = vi.fn((self: Effect.Effect<unknown>) => self);
    const withBatch_ =
      withBatchMock as unknown as FirestoreServiceShape['withBatch'];
    const result = await Effect.runPromise(
      withBatch(Effect.succeed('ok')).pipe(
        Effect.provide(makeLayer({ withBatch: withBatch_ })),
      ),
    );

    expect(result).toBe('ok');
    expect(withBatchMock).toHaveBeenCalledTimes(1);
  });
});
