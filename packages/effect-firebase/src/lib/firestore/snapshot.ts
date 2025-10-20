import { Option, Data } from 'effect';

type Ref = {
  readonly id: string;
  readonly path: string;
};

type Data = {
  readonly [x: string]: unknown;
};

export type Snapshot = Option.Option<readonly [Ref, Data]>;

interface SnapshotLike {
  readonly exists: boolean | (() => boolean);
  readonly ref: Ref | (() => Ref);
  readonly data: () => Data | undefined;
}

export function packSnapshot(snapshot: SnapshotLike): Snapshot {
  const data = snapshot.data();
  if (!data) {
    return Option.none();
  }
  const ref =
    typeof snapshot.ref === 'function' ? snapshot.ref() : snapshot.ref;
  return Option.some(
    Data.tuple({ id: ref.id, path: ref.path }, Data.struct(data))
  );
}
