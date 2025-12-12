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
import { decodeDocumentData } from './decode-document-data.js';

interface DocumentUpdatedEffectOptions<
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
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: DocumentUpdatedEffectOptions<R, Document, S, IdField>,
  handler: (
    data: TypedChange<Schema.Schema.Type<S>>,
    event: FirestoreEvent<
      Change<QueryDocumentSnapshot> | undefined,
      ParamsOf<Document>
    >
  ) => Effect.Effect<void, never, R>
): CloudFunction<
  FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentUpdated(options, async (event) => {
    const effect = Effect.gen(function* () {
      const docId = event.data?.before.id;

      const before = decodeDocumentData(
        event.data?.before.data(),
        docId,
        schema,
        options.idField
      );
      const after = yield* decodeDocumentData(
        event.data?.after.data(),
        docId,
        schema,
        options.idField
      );

      return yield* handler(
        {
          before,
          after,
        } as TypedChange<Schema.Schema.Type<S>>,
        event
      );
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Defect in onDocumentUpdated', {
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
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: DocumentUpdatedEffectOptions<R, Document, S, IdField>,
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
      const docId = event.data?.before.id;
      const before = yield* decodeDocumentData(
        event.data?.before.data(),
        docId,
        schema,
        options.idField
      );
      const after = yield* decodeDocumentData(
        event.data?.after.data(),
        docId,
        schema,
        options.idField
      );
      return yield* handler(event, {
        before,
        after,
      } as TypedChange<Schema.Schema.Type<S>>);
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Defect in onDocumentUpdatedWithAuthContext', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}
