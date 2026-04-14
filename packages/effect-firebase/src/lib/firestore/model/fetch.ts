import { Array as Arr, Cause, Effect, Option, Schema, Stream } from 'effect';

/**
 * Find all records in the collection.
 */
export const findAll = <
  Req extends Schema.Top,
  Res extends Schema.Top,
  E,
  R
>(options: {
  readonly Request: Req;
  readonly Result: Res;
  readonly execute: (
    request: Req['Encoded']
  ) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encodeEffect(options.Request);
  const decode = Schema.decodeUnknownEffect(
    Schema.mutable(Schema.Array(options.Result))
  );
  return (
    request: Req['Type']
  ): Effect.Effect<
    Array<Res['Type']>,
    E | Schema.SchemaError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
    Effect.flatMap(
      Effect.flatMap(encodeRequest(request), options.execute),
      decode
    );
};

/**
 * Find all records in the collection, failing with NoSuchElementError if the result is empty.
 */
export const findNonEmpty = <
  Req extends Schema.Top,
  Res extends Schema.Top,
  E,
  R
>(options: {
  readonly Request: Req;
  readonly Result: Res;
  readonly execute: (
    request: Req['Encoded']
  ) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => {
  const find = findAll(options);
  return (
    request: Req['Type']
  ): Effect.Effect<
    Arr.NonEmptyArray<Res['Type']>,
    E | Schema.SchemaError | Cause.NoSuchElementError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
    Effect.flatMap(find(request), (results) =>
      Arr.isArrayNonEmpty(results)
        ? Effect.succeed(results)
        : Effect.fail(new Cause.NoSuchElementError())
    );
};

/**
 * Run a query with a request schema and discard the result.
 */
const _void = <Req extends Schema.Top, E, R>(options: {
  readonly Request: Req;
  readonly execute: (request: Req['Encoded']) => Effect.Effect<unknown, E, R>;
}) => {
  const encode = Schema.encodeEffect(options.Request);
  return (
    request: Req['Type']
  ): Effect.Effect<void, E | Schema.SchemaError, R | Req['EncodingServices']> =>
    Effect.asVoid(Effect.flatMap(encode(request), options.execute));
};

export { _void as void };

/**
 * Run a query and return the first result as an Option.
 */
export const findOneOption = <
  Req extends Schema.Top,
  Res extends Schema.Top,
  E,
  R
>(options: {
  readonly Request: Req;
  readonly Result: Res;
  readonly execute: (
    request: Req['Encoded']
  ) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encodeEffect(options.Request);
  const decode = Schema.decodeUnknownEffect(options.Result);
  return (
    request: Req['Type']
  ): Effect.Effect<
    Option.Option<Res['Type']>,
    E | Schema.SchemaError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
    Effect.flatMap(
      Effect.flatMap(encodeRequest(request), options.execute),
      (
        arr
      ): Effect.Effect<
        Option.Option<Res['Type']>,
        Schema.SchemaError,
        Res['DecodingServices']
      > =>
        Arr.isReadonlyArrayNonEmpty(arr)
          ? Effect.asSome(decode(arr[0]))
          : Effect.succeedNone
    );
};

/**
 * Run a query and return the first result, failing with NoSuchElementError if empty.
 */
export const findOne = <
  Req extends Schema.Top,
  Res extends Schema.Top,
  E,
  R
>(options: {
  readonly Request: Req;
  readonly Result: Res;
  readonly execute: (
    request: Req['Encoded']
  ) => Effect.Effect<ReadonlyArray<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encodeEffect(options.Request);
  const decode = Schema.decodeUnknownEffect(options.Result);
  return (
    request: Req['Type']
  ): Effect.Effect<
    Res['Type'],
    E | Schema.SchemaError | Cause.NoSuchElementError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
    Effect.flatMap(
      Effect.flatMap(encodeRequest(request), options.execute),
      (
        arr
      ): Effect.Effect<
        Res['Type'],
        Schema.SchemaError | Cause.NoSuchElementError,
        Res['DecodingServices']
      > =>
        Arr.isReadonlyArrayNonEmpty(arr)
          ? decode(arr[0])
          : Effect.fail(new Cause.NoSuchElementError())
    );
};

/**
 * Stream a single optional result.
 */
export const streamOne = <
  Req extends Schema.Top,
  Res extends Schema.Top,
  E,
  R
>(options: {
  readonly Request: Req;
  readonly Result: Res;
  readonly execute: (
    request: Req['Encoded']
  ) => Stream.Stream<Option.Option<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encodeEffect(options.Request);
  const decode = Schema.decodeUnknownEffect(options.Result);
  return (
    request: Req['Type']
  ): Stream.Stream<
    Option.Option<Res['Type']>,
    E | Schema.SchemaError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
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
export const streamAll = <
  Req extends Schema.Top,
  Res extends Schema.Top,
  E,
  R
>(options: {
  readonly Request: Req;
  readonly Result: Res;
  readonly execute: (
    request: Req['Encoded']
  ) => Stream.Stream<ReadonlyArray<unknown>, E, R>;
}) => {
  const encodeRequest = Schema.encodeEffect(options.Request);
  const decode = Schema.decodeUnknownEffect(
    Schema.mutable(Schema.Array(options.Result))
  );
  return (
    request: Req['Type']
  ): Stream.Stream<
    Array<Res['Type']>,
    E | Schema.SchemaError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
    Stream.flatMap(Stream.fromEffect(encodeRequest(request)), (encoded) =>
      options.execute(encoded).pipe(Stream.mapEffect((arr) => decode(arr)))
    );
};
