import { Snapshot } from 'effect-firebase';
import type * as MockState from './state.js';
import { type DocData } from './value.js';

/**
 * The full state of the mock backend at a point in time: every stored
 * document (keyed by full document path) and every simulated collection state.
 */
export interface StoreSnapshot {
  readonly docs: Readonly<Record<string, DocData>>;
  readonly states: Readonly<Record<string, MockState.State>>;
}

/**
 * The collection path a document path belongs to (everything before the
 * final segment).
 */
export const parentPath = (path: string): string => {
  const segments = path.split('/');
  return segments.slice(0, -1).join('/');
};

/**
 * The document ID (final segment) of a document path.
 */
export const idOf = (path: string): string => {
  const segments = path.split('/');
  return segments[segments.length - 1];
};

/**
 * Build a snapshot tuple for a stored document.
 */
export const makeSnapshot = (path: string, data: DocData): Snapshot => [
  { id: idOf(path), path },
  data,
];

/**
 * All direct child documents of a collection, ordered by document ID.
 */
export const docsInCollection = (
  docs: Readonly<Record<string, DocData>>,
  collectionPath: string,
): ReadonlyArray<Snapshot> => {
  const prefix = `${collectionPath}/`;
  return Object.entries(docs)
    .filter(
      ([path]) =>
        path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, data]) => makeSnapshot(path, data));
};

/**
 * Validate a path, returning an error message when it is malformed.
 * Documents sit at an even number of segments, collections at an odd number;
 * `split` never yields fewer than one segment, so requiring every segment to
 * be non-empty already rules out the empty path.
 */
const validatePath = (path: string, kind: 'document' | 'collection') => {
  const segments = path.split('/');
  const parity = kind === 'document' ? 0 : 1;
  return segments.length % 2 === parity &&
    segments.every((segment) => segment.length > 0)
    ? undefined
    : `Invalid ${kind} path '${path}': expected a non-empty path with an ${
        parity === 0 ? 'even' : 'odd'
      } number of segments`;
};

export const validateDocPath = (path: string): string | undefined =>
  validatePath(path, 'document');

export const validateCollectionPath = (path: string): string | undefined =>
  validatePath(path, 'collection');
