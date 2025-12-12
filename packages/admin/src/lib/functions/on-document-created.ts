import { Effect, Schema } from 'effect';
import {
  onDocumentCreated,
  onDocumentCreatedWithAuthContext,
  DocumentOptions,
  FirestoreEvent,
  FirestoreAuthEvent,
  QueryDocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { CloudFunction } from 'firebase-functions/v2';
import { ParamsOf } from 'firebase-functions';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';
import { decodeDocumentData } from './decode-document-data.js';

interface DocumentCreatedEffectOptions<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
> extends DocumentOptions<Document> {
  runtime: Runtime<R | Schema.Schema.Context<S>>;
  schema?: S;
  idField?: IdField;
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is created.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed document data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentCreatedEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: DocumentCreatedEffectOptions<R, Document, S, IdField>,
  handler: (
    data: Schema.Schema.Type<S>,
    event: FirestoreEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>
  ) => Effect.Effect<void, never, R>
): CloudFunction<
  FirestoreEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentCreated(options, async (event) => {
    const effect = Effect.gen(function* () {
      const data = yield* decodeDocumentData(
        event.data?.data(),
        event.data?.id,
        schema,
        options.idField
      );
      return yield* handler(data as Schema.Schema.Type<S>, event);
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Defect in onDocumentCreated', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is created,
 * with authentication context.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed document data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentCreatedWithAuthContextEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: DocumentCreatedEffectOptions<R, Document, S, IdField>,
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

  return onDocumentCreatedWithAuthContext(options, async (event) => {
    const effect = Effect.gen(function* () {
      const data = yield* decodeDocumentData(
        event.data?.data(),
        event.data?.id,
        schema,
        options.idField
      );
      return yield* handler(event, data as Schema.Schema.Type<S>);
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Defect in onDocumentCreatedWithAuthContext', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}
