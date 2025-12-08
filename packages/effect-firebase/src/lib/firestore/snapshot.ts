import { Option, Data } from 'effect';
import { type FirestoreDataOptions } from './firestore-service.js';

export type Ref = {
  readonly id: string;
  readonly path: string;
};

export type Data = {
  readonly [x: string]: unknown;
};

export type Snapshot = readonly [Ref, Data];

interface SnapshotLike {
  readonly exists: boolean | (() => boolean);
  readonly ref: Ref | (() => Ref);
  readonly data: (options?: FirestoreDataOptions) => Data | undefined;
}

/**
 * Packs a snapshot into a tuple of the reference and data.
 * @param converter A function to convert the data to a structured format.
 * @returns
 */
export function makeSnapshotPacker(
  converter: (data: Data) => Data
): (
  snapshot: SnapshotLike,
  options?: FirestoreDataOptions
) => Option.Option<Snapshot> {
  return (snapshot, options) => {
    const data = snapshot.data(options);
    if (!data) {
      return Option.none();
    }
    const ref =
      typeof snapshot.ref === 'function' ? snapshot.ref() : snapshot.ref;
    return Option.some(
      Data.tuple({ id: ref.id, path: ref.path }, Data.struct(converter(data)))
    );
  };
}
