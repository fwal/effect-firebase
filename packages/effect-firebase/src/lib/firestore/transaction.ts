import { Effect } from 'effect';
import { UnknownError } from 'effect/Cause';
import { FirestoreError } from './errors.js';
import { FirestoreService } from './firestore-service.js';

/**
 * Run an effect inside a Firestore transaction.
 *
 * Every {@link FirestoreService} read and write performed by the effect —
 * including reads and writes made through repositories — is routed through
 * the transaction. The transaction commits when the effect succeeds and
 * rolls back when it fails.
 *
 * The SDK may retry the transaction on contention, re-running the effect, so
 * the effect must be safe to run more than once. See
 * `FirestoreService.withTransaction` for the full semantics.
 *
 * @param self - The effect to run inside the transaction.
 * @returns The result of the effect after the transaction has committed.
 *
 * @example
 * ```ts
 * import { Effect, Option } from 'effect';
 * import { Firestore } from 'effect-firebase';
 * import { AccountRepository } from './account-repository.js';
 *
 * const transfer = (from: AccountId, to: AccountId, amount: number) =>
 *   Firestore.withTransaction(
 *     Effect.gen(function* () {
 *       const repo = yield* AccountRepository;
 *       const source = Option.getOrThrow(yield* repo.getById(from));
 *       const target = Option.getOrThrow(yield* repo.getById(to));
 *       // ... all reads happen before the first write
 *       yield* repo.update(from, { balance: source.balance - amount });
 *       yield* repo.update(to, { balance: target.balance + amount });
 *     })
 *   );
 * ```
 */
export const withTransaction = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E | FirestoreError | UnknownError, R | FirestoreService> =>
  Effect.gen(function* () {
    const firestore = yield* FirestoreService;
    return yield* firestore.withTransaction(self);
  });

/**
 * Run an effect inside a Firestore write batch.
 *
 * Every {@link FirestoreService} write performed by the effect — including
 * writes made through repositories — is staged on the batch and committed
 * atomically when the effect succeeds. When the effect fails, nothing is
 * committed.
 *
 * Batches are write-only: reads inside the effect execute immediately against
 * the database and do not observe the staged writes. See
 * `FirestoreService.withBatch` for the full semantics.
 *
 * @param self - The effect to run inside the batch.
 * @returns The result of the effect after the batch has committed.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import { Firestore } from 'effect-firebase';
 * import { PostRepository } from './post-repository.js';
 *
 * const archiveAll = (ids: ReadonlyArray<PostId>) =>
 *   Firestore.withBatch(
 *     Effect.gen(function* () {
 *       const repo = yield* PostRepository;
 *       yield* Effect.forEach(ids, (id) =>
 *         repo.update(id, { status: 'archived' })
 *       );
 *     })
 *   );
 * ```
 */
export const withBatch = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E | FirestoreError | UnknownError, R | FirestoreService> =>
  Effect.gen(function* () {
    const firestore = yield* FirestoreService;
    return yield* firestore.withBatch(self);
  });
