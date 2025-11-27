import { Effect, Schema } from 'effect';
import {
  onDocumentUpdated,
  onDocumentUpdatedWithAuthContext,
  DocumentOptions,
  FirestoreEvent,
  FirestoreAuthEvent,
  QueryDocumentSnapshot,
  Change,
} from 'firebase-functions/v2/firestore';
import { CloudFunction } from 'firebase-functions/v2';
import { ParamsOf } from 'firebase-functions';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';

interface DocumentUpdatedEffectOptions<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>
> extends DocumentOptions<Document> {
  runtime: Runtime<R | Schema.Schema.Context<S>>;
  schema?: S;
}

/**
 * Typed change object containing before and after document data.
 */
export interface TypedChange<A> {
  before: A;
  after: A;
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is updated.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed before/after data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentUpdatedEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>
>(
  options: DocumentUpdatedEffectOptions<R, Document, S>,
  handler: (
    event: FirestoreEvent<
      Change<QueryDocumentSnapshot> | undefined,
      ParamsOf<Document>
    >,
    data: TypedChange<Schema.Schema.Type<S>>
  ) => Effect.Effect<void, never, R>
): CloudFunction<
  FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentUpdated(options, async (event) => {
    const effect = Effect.gen(function* () {
      const decode = (data: unknown) =>
        Schema.decodeUnknown(schema)(data).pipe(Effect.orDie);
      const before = yield* decode(event.data?.before.data());
      const after = yield* decode(event.data?.after.data());
      return yield* handler(event, {
        before,
        after,
      } as TypedChange<Schema.Schema.Type<S>>);
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Unrecoverable error in onDocumentUpdated', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is updated,
 * with authentication context.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed before/after data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentUpdatedWithAuthContextEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>
>(
  options: DocumentUpdatedEffectOptions<R, Document, S>,
  handler: (
    event: FirestoreAuthEvent<
      Change<QueryDocumentSnapshot> | undefined,
      ParamsOf<Document>
    >,
    data: TypedChange<Schema.Schema.Type<S>>
  ) => Effect.Effect<void, never, R>
): CloudFunction<
  FirestoreAuthEvent<
    Change<QueryDocumentSnapshot> | undefined,
    ParamsOf<Document>
  >
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentUpdatedWithAuthContext(options, async (event) => {
    const effect = Effect.gen(function* () {
      const decode = (data: unknown) =>
        Schema.decodeUnknown(schema)(data).pipe(Effect.orDie);
      const before = yield* decode(event.data?.before.data());
      const after = yield* decode(event.data?.after.data());
      return yield* handler(event, {
        before,
        after,
      } as TypedChange<Schema.Schema.Type<S>>);
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Unrecoverable error in onDocumentUpdatedWithAuthContext', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}
