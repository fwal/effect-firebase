import { describe, expect, it, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { withTransaction, withBatch } from './transaction.js';
import { FirestoreService } from './firestore-service.js';
import type { FirestoreServiceShape } from './firestore-service.js';

const makeLayer = (overrides: Partial<FirestoreServiceShape>) =>
  Layer.succeed(FirestoreService, overrides as FirestoreServiceShape);

describe('withTransaction', () => {
  it('delegates to FirestoreService.withTransaction', async () => {
    const withTransactionMock = vi.fn(
      <A, E, R>(self: Effect.Effect<A, E, R>) => self
    );
    const result = await Effect.runPromise(
      withTransaction(Effect.succeed(42)).pipe(
        Effect.provide(makeLayer({ withTransaction: withTransactionMock }))
      )
    );

    expect(result).toBe(42);
    expect(withTransactionMock).toHaveBeenCalledTimes(1);
  });
});

describe('withBatch', () => {
  it('delegates to FirestoreService.withBatch', async () => {
    const withBatchMock = vi.fn(
      <A, E, R>(self: Effect.Effect<A, E, R>) => self
    );
    const result = await Effect.runPromise(
      withBatch(Effect.succeed('ok')).pipe(
        Effect.provide(makeLayer({ withBatch: withBatchMock }))
      )
    );

    expect(result).toBe('ok');
    expect(withBatchMock).toHaveBeenCalledTimes(1);
  });
});
