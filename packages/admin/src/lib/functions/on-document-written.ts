import { Effect, Schema, Option } from 'effect';
import {
  onDocumentWritten,
  onDocumentWrittenWithAuthContext,
  DocumentOptions,
  FirestoreEvent,
  FirestoreAuthEvent,
  DocumentSnapshot,
  Change,
} from 'firebase-functions/v2/firestore';
import { CloudFunction } from 'firebase-functions/v2';
import { ParamsOf } from 'firebase-functions';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';
import { decodeDocumentData } from './decode-document-data.js';

interface DocumentWrittenEffectOptions<
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
 * For written events, before is None on create, after is None on delete.
 */
export interface TypedWrittenChange<A> {
  before: Option.Option<A>;
  after: Option.Option<A>;
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is created, updated, or deleted.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed before/after data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentWrittenEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: DocumentWrittenEffectOptions<R, Document, S, IdField>,
  handler: (
    data: TypedWrittenChange<Schema.Schema.Type<S>>,
    event: FirestoreEvent<
      Change<DocumentSnapshot> | undefined,
      ParamsOf<Document>
    >
  ) => Effect.Effect<void, never, R>
): CloudFunction<
  FirestoreEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentWritten(options, async (event) => {
    const effect = Effect.gen(function* () {
      const docId = event.data?.after.id ?? event.data?.before.id;
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();

      const before = beforeData
        ? Option.some(
            yield* decodeDocumentData(
              beforeData,
              docId,
              schema,
              options.idField
            )
          )
        : Option.none();
      const after = afterData
        ? Option.some(
            yield* decodeDocumentData(afterData, docId, schema, options.idField)
          )
        : Option.none();

      return yield* handler(
        {
          before,
          after,
        } as TypedWrittenChange<Schema.Schema.Type<S>>,
        event
      );
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Defect in onDocumentWritten', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is created, updated, or deleted,
 * with authentication context.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed before/after data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentWrittenWithAuthContextEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: DocumentWrittenEffectOptions<R, Document, S, IdField>,
  handler: (
    event: FirestoreAuthEvent<
      Change<DocumentSnapshot> | undefined,
      ParamsOf<Document>
    >,
    data: TypedWrittenChange<Schema.Schema.Type<S>>
  ) => Effect.Effect<void, never, R>
): CloudFunction<
  FirestoreAuthEvent<Change<DocumentSnapshot> | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentWrittenWithAuthContext(options, async (event) => {
    const effect = Effect.gen(function* () {
      const docId = event.data?.after.id ?? event.data?.before.id;
      const beforeData = event.data?.before.data();
      const afterData = event.data?.after.data();

      const before = beforeData
        ? Option.some(
            yield* decodeDocumentData(
              beforeData,
              docId,
              schema,
              options.idField
            )
          )
        : Option.none();
      const after = afterData
        ? Option.some(
            yield* decodeDocumentData(afterData, docId, schema, options.idField)
          )
        : Option.none();

      return yield* handler(event, {
        before,
        after,
      } as TypedWrittenChange<Schema.Schema.Type<S>>);
    });

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | Schema.Schema.Context<S>>
    ).catch((error) => {
      logger.error('Defect in onDocumentWrittenWithAuthContext', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  });
}
