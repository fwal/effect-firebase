import { FirestoreError } from 'effect-firebase';

/**
 * The simulated state of a collection in the mock backend.
 *
 * - `Data` — reads resolve against the in-memory store (the default).
 * - `Empty` — reads succeed but resolve to no documents.
 * - `Loading` — reads and writes never resolve, streams never emit.
 * - `Error` — reads and writes fail with the given {@link FirestoreError}.
 */
export type State =
  | { readonly _tag: 'Data' }
  | { readonly _tag: 'Empty' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Error'; readonly error: FirestoreError };

/**
 * Convenience input accepted anywhere a {@link State} is expected.
 * The string shorthands map to their respective states, with `'error'`
 * producing a `FirestoreError` with code `unavailable`.
 */
export type StateInput = 'data' | 'empty' | 'loading' | 'error' | State;

/**
 * Reads resolve against the in-memory store (the default state).
 */
export const data: State = { _tag: 'Data' };

/**
 * Reads succeed but resolve to no documents.
 */
export const empty: State = { _tag: 'Empty' };

/**
 * Reads and writes never resolve, streams never emit.
 */
export const loading: State = { _tag: 'Loading' };

/**
 * Reads and writes fail.
 * @param codeOrError - A Firestore error code (defaults to `unavailable`) or a full {@link FirestoreError}.
 */
export const error = (codeOrError?: string | FirestoreError): State => ({
  _tag: 'Error',
  error:
    typeof codeOrError === 'object'
      ? codeOrError
      : new FirestoreError({
          code: codeOrError ?? 'unavailable',
          name: 'FirebaseError',
          message: `Simulated error (${codeOrError ?? 'unavailable'})`,
        }),
});

/**
 * Normalize a {@link StateInput} shorthand into a {@link State}.
 */
export const fromInput = (input: StateInput): State => {
  if (typeof input !== 'string') {
    return input;
  }
  switch (input) {
    case 'data':
      return data;
    case 'empty':
      return empty;
    case 'loading':
      return loading;
    case 'error':
      return error();
  }
};

/**
 * Wildcard key that applies to every collection without an explicit state.
 */
export const All = '*';

/**
 * Resolve the effective state for a collection path.
 * An exact entry wins over the {@link All} wildcard, which wins over {@link data}.
 */
export const resolve = (
  states: Readonly<Record<string, State>>,
  collectionPath: string
): State => states[collectionPath] ?? states[All] ?? data;
