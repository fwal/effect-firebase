import { Cause, Effect, Option, Schema } from 'effect';
import { FirestoreService } from '../firestore-service.js';
import { Snapshot } from '../snapshot.js';
import { NoSuchElementException, UnknownException } from 'effect/Cause';
import { ParseError } from 'effect/ParseResult';
import { FirestoreError } from '../errors.js';
import { Any } from './core.js';

export type ModelError =
  | FirestoreError
  | UnknownException
  | NoSuchElementException
  | ParseError;

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
 * Create a repository for a model.
 */
export const makeRepository = <
  S extends Any,
  Id extends keyof S['Type'] & keyof S['update']['Type'] & keyof S['fields'],
  IdSchema extends S['fields'][Id] extends Schema.Schema.Any
    ? S['fields'][Id]
    : never
>(
  Model: S,
  options: {
    readonly collectionPath: string;
    readonly idField: Id;
    readonly spanPrefix: string;
  }
) =>
  Effect.gen(function* () {
    const firestore = yield* FirestoreService;

    const idSchema = Model.fields[options.idField] as Schema.Schema.Any;

    const structFromSnapshot = (snapshot: Snapshot) => {
      const [ref, data] = snapshot;
      return { ...data, [options.idField]: ref.id };
    };

    const insertSchema = single({
      Request: Model.insert,
      Result: idSchema,
      execute: (data: S['insert']['Type']) =>
        firestore
          .add(options.collectionPath, data)
          .pipe(Effect.flatMap((value) => Effect.succeed([value.id]))),
    });

    const insert = (
      data: S['insert']['Type']
    ): Effect.Effect<
      Schema.Schema.Type<IdSchema>,
      ModelError,
      S['Context'] | S['insert']['Context']
    > =>
      insertSchema(data).pipe(
        Effect.withSpan(`${options.spanPrefix}.insert`, {
          captureStackTrace: false,
          attributes: { data },
        })
      );

    const updateSchema = _void({
      Request: Model.update,
      execute: ({ [options.idField]: _id, ...data }: S['update']['Type']) =>
        firestore.update(`${options.collectionPath}/${_id}`, data),
    });

    const update = (data: S['update']['Type']) =>
      updateSchema(data).pipe(
        Effect.withSpan(`${options.spanPrefix}.update`, {
          captureStackTrace: false,
          attributes: { data },
        })
      );

    const findByIdSchema = findOne({
      Request: idSchema,
      Result: Model,
      execute: (id: string) =>
        firestore
          .get(`${options.collectionPath}/${id}`)
          .pipe(
            Effect.flatMap(Option.map((value) => [structFromSnapshot(value)]))
          ),
    });

    const findById = (
      id: Schema.Schema.Type<IdSchema>
    ): Effect.Effect<
      Option.Option<S['Type']>,
      ModelError,
      S['Context'] | Schema.Schema.Context<S['fields'][Id]>
    > =>
      findByIdSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.findById`, {
          captureStackTrace: false,
          attributes: { id },
        })
      );

    const deleteSchema = _void({
      Request: idSchema,
      execute: (id: string) =>
        firestore.remove(`${options.collectionPath}/${id}`),
    });

    const deleteById = (
      id: Schema.Schema.Type<IdSchema>
    ): Effect.Effect<void, ModelError, S['Context']> =>
      deleteSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.deleteById`, {
          captureStackTrace: false,
          attributes: { id },
        })
      );

    return {
      insert,
      update,
      findById,
      delete: deleteById,
    };
  });
