import { Context, Duration, Effect, Schema, Stream } from 'effect';
import type { Fixture } from './fixture.js';
import type * as MockState from './state.js';
import type { StoreSnapshot } from './store.js';
import type { DocData } from './value.js';

export interface MockControllerShape {
  /**
   * Set the simulated state for a collection path. Live streams reading from
   * the collection switch immediately. Use {@link MockState.All} (`'*'`) to
   * apply to every collection without an explicit state.
   *
   * @example
   * ```ts
   * yield* controller.setState('posts', 'loading');
   * yield* controller.setState('posts', MockState.error('permission-denied'));
   * ```
   */
  readonly setState: (
    collectionPath: string,
    state: MockState.StateInput
  ) => Effect.Effect<void>;

  /**
   * Remove the simulated state for a collection path, falling back to the
   * wildcard state or `data`.
   */
  readonly clearState: (collectionPath: string) => Effect.Effect<void>;

  /**
   * The currently configured states, keyed by collection path.
   */
  readonly states: Effect.Effect<Readonly<Record<string, MockState.State>>>;

  /**
   * All stored documents, keyed by full document path.
   */
  readonly docs: Effect.Effect<Readonly<Record<string, DocData>>>;

  /**
   * A stream of the full backend state, emitting the current value on
   * subscription and again after every change. Drives devtools UIs.
   */
  readonly changes: Stream.Stream<StoreSnapshot>;

  /**
   * Seed additional documents from a fixture. Existing documents at the same
   * paths are replaced; live streams re-emit.
   */
  readonly seed: (fixture: Fixture) => Effect.Effect<void, Schema.SchemaError>;

  /**
   * Insert or replace a single document (bypasses states and latency).
   */
  readonly setDoc: (path: string, data: DocData) => Effect.Effect<void>;

  /**
   * Remove a single document (bypasses states and latency).
   */
  readonly removeDoc: (path: string) => Effect.Effect<void>;

  /**
   * Set the simulated latency applied to every operation.
   */
  readonly setLatency: (
    latency: Duration.Input
  ) => Effect.Effect<void>;

  /**
   * The currently simulated latency.
   */
  readonly latency: Effect.Effect<Duration.Duration>;

  /**
   * Restore the backend to its initial fixtures and states, and reset latency
   * to the value the layer was created with.
   */
  readonly reset: Effect.Effect<void>;
}

/**
 * Runtime controls for the mock backend, provided by `layer` alongside the
 * `FirestoreService` implementation. Toggle collection states, seed data and
 * simulate latency — from tests, a devtools panel, or anywhere else.
 */
export class MockController extends Context.Service<
  MockController,
  MockControllerShape
>()('@effect-firebase/mock/MockController') {}
