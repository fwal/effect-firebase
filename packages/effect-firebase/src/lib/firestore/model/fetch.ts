import { Cause, Effect, Option, Schema, Stream } from 'effect';
import { ParseError } from 'effect/ParseResult';

/**
 * Find all records in the collection.
 */
export const findAll = <IR, II, IA, AR, AI, A, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly Result: Schema.Schema<A, AI, AR>;
  readonly execute: (
    request: II
  ) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encode(options.Request);
  const decode = Schema.decodeUnknown(Schema.Array(options.Result));
  return (
    request: IA
  ): Effect.Effect<ReadonlyArray<A>, E | ParseError, R | IR | AR> =>
    Effect.flatMap(
      Effect.flatMap(encodeRequest(request), options.execute),
      decode
    );
};

/**
 * Run a query with a request schema and discard the result.
 */
const _void = <IR, II, IA, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly execute: (request: II) => Effect.Effect<unknown, E, R>;
}) => {
  const encode = Schema.encode(options.Request);
  return (request: IA): Effect.Effect<void, E | ParseError, R | IR> =>
    Effect.asVoid(Effect.flatMap(encode(request), options.execute));
};

export { _void as void };

/**
 * Run a query with a request schema and a result schema and return the first result.
 */
export const findOne = <IR, II, IA, AR, AI, A, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly Result: Schema.Schema<A, AI, AR>;
  readonly execute: (
    request: II
  ) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encode(options.Request);
  const decode = Schema.decodeUnknown(options.Result);
  return (
    request: IA
  ): Effect.Effect<Option.Option<A>, E | ParseError, R | IR | AR> =>
    Effect.flatMap(
      Effect.flatMap(encodeRequest(request), options.execute),
      (arr) =>
        Array.isArray(arr) && arr.length > 0
          ? Effect.asSome(decode(arr[0]))
          : Effect.succeedNone
    );
};

/**
 * Run a query with a request schema and a result schema and return the first result.
 * @throws NoSuchElementException if the result is empty.
 */
export const single = <IR, II, IA, AR, AI, A, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly Result: Schema.Schema<A, AI, AR>;
  readonly execute: (
    request: II
  ) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encode(options.Request);
  const decode = Schema.decodeUnknown(options.Result);
  return (
    request: IA
  ): Effect.Effect<
    A,
    E | ParseError | Cause.NoSuchElementException,
    R | IR | AR
  > =>
    Effect.flatMap(
      Effect.flatMap(encodeRequest(request), options.execute),
      (arr): Effect.Effect<A, ParseError | Cause.NoSuchElementException, AR> =>
        Array.isArray(arr) && arr.length > 0
          ? decode(arr[0])
          : Effect.fail(new Cause.NoSuchElementException())
    );
};

/**
 * Stream a single optional result.
 */
export const streamOne = <IR, II, IA, AR, AI, A, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly Result: Schema.Schema<A, AI, AR>;
  readonly execute: (
    request: II
  ) => Stream.Stream<Option.Option<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encode(options.Request);
  const decode = Schema.decodeUnknown(options.Result);
  return (
    request: IA
  ): Stream.Stream<Option.Option<A>, E | ParseError, R | IR | AR> =>
    Stream.flatMap(Stream.fromEffect(encodeRequest(request)), (encoded) =>
      options.execute(encoded).pipe(
        Stream.mapEffect((opt) =>
          Option.match(opt, {
            onNone: () => Effect.succeedNone,
            onSome: (value) => decode(value).pipe(Effect.map(Option.some)),
          })
        )
      )
    );
};

/**
 * Stream all results from a query.
 */
export const streamAll = <IR, II, IA, AR, AI, A, R, E>(options: {
  readonly Request: Schema.Schema<IA, II, IR>;
  readonly Result: Schema.Schema<A, AI, AR>;
  readonly execute: (
    request: II
  ) => Stream.Stream<ReadonlyArray<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encode(options.Request);
  const decode = Schema.decodeUnknown(Schema.Array(options.Result));
  return (
    request: IA
  ): Stream.Stream<ReadonlyArray<A>, E | ParseError, R | IR | AR> =>
    Stream.flatMap(Stream.fromEffect(encodeRequest(request)), (encoded) =>
      options.execute(encoded).pipe(Stream.mapEffect((arr) => decode(arr)))
    );
};
