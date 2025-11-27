import { Effect, Schema } from 'effect';
import {
  onDocumentDeleted,
  onDocumentDeletedWithAuthContext,
  DocumentOptions,
  FirestoreEvent,
  FirestoreAuthEvent,
  QueryDocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { CloudFunction } from 'firebase-functions/v2';
import { ParamsOf } from 'firebase-functions';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';

interface DocumentDeletedEffectOptions<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>
> extends DocumentOptions<Document> {
  runtime: Runtime<R | Schema.Schema.Context<S>>;
  schema?: S;
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is deleted.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed document data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentDeletedEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>
>(
  options: DocumentDeletedEffectOptions<R, Document, S>,
  handler: (
    event: FirestoreEvent<
      QueryDocumentSnapshot | undefined,
      ParamsOf<Document>
    >,
    data: Schema.Schema.Type<S>
  ) => Effect.Effect<void, never, R>
): CloudFunction<
  FirestoreEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentDeleted(options, async (event) => {
    const effect = Effect.gen(function* () {
      const rawData = event.data?.data();
      const data = yield* Schema.decodeUnknown(schema)(rawData).pipe(
        Effect.orDie
      );
      return yield* handler(event, data as Schema.Schema.Type<S>);
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Unrecoverable error in onDocumentDeleted', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is deleted,
 * with authentication context.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed document data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentDeletedWithAuthContextEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>
>(
  options: DocumentDeletedEffectOptions<R, Document, S>,
  handler: (
    event: FirestoreAuthEvent<
      QueryDocumentSnapshot | undefined,
      ParamsOf<Document>
    >,
    data: Schema.Schema.Type<S>
  ) => Effect.Effect<void, never, R>
): CloudFunction<
  FirestoreAuthEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentDeletedWithAuthContext(options, async (event) => {
    const effect = Effect.gen(function* () {
      const rawData = event.data?.data();
      const data = yield* Schema.decodeUnknown(schema)(rawData).pipe(
        Effect.orDie
      );
      return yield* handler(event, data as Schema.Schema.Type<S>);
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Unrecoverable error in onDocumentDeletedWithAuthContext', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}
