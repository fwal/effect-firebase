import { Cause, Effect, Option, Schema, Stream } from 'effect';

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
  const decode = Schema.decodeUnknownEffect(Schema.Array(options.Result));
  return (
    request: Req['Type']
  ): Effect.Effect<
    ReadonlyArray<Res['Type']>,
    E | Schema.SchemaError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
    Effect.flatMap(
      Effect.flatMap(encodeRequest(request), options.execute),
      decode
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
 * Run a query with a request schema and a result schema and return the first result.
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
    Option.Option<Res['Type']>,
    E | Schema.SchemaError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
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
 * @throws NoSuchElementError if the result is empty.
 */
export const single = <
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
        Array.isArray(arr) && arr.length > 0
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
  const decode = Schema.decodeUnknownEffect(Schema.Array(options.Result));
  return (
    request: Req['Type']
  ): Stream.Stream<
    ReadonlyArray<Res['Type']>,
    E | Schema.SchemaError,
    R | Req['EncodingServices'] | Res['DecodingServices']
  > =>
    Stream.flatMap(Stream.fromEffect(encodeRequest(request)), (encoded) =>
      options.execute(encoded).pipe(Stream.mapEffect((arr) => decode(arr)))
    );
};
