import { describe, expect, it } from 'vitest';
import { Effect, Layer, ManagedRuntime, Schema } from 'effect';
import {
  FirestoreEvent,
  QueryDocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { onDocumentCreatedEffect } from './on-document-created.js';
import { FunctionSetupError } from './setup-error.js';

const runtime = ManagedRuntime.make(Layer.empty);

const Post = Schema.Struct({
  title: Schema.String,
  views: Schema.Number,
});

const makeEvent = (
  data: Record<string, unknown>,
): FirestoreEvent<QueryDocumentSnapshot | undefined, { postId: string }> =>
  ({
    data: {
      id: 'post-1',
      ref: { path: 'posts/post-1' },
      data: () => data,
    },
    params: { postId: 'post-1' },
  }) as unknown as FirestoreEvent<
    QueryDocumentSnapshot | undefined,
    { postId: string }
  >;

describe('onDocumentCreatedEffect', () => {
  it('decodes document data and runs the handler', async () => {
    let received: { title: string; views: number } | undefined;
    const fn = onDocumentCreatedEffect(
      { document: 'posts/{postId}', runtime, schema: Post },
      (data) =>
        Effect.sync(() => {
          received = data;
        }),
    );

    await fn.run(makeEvent({ title: 'hello', views: 3 }));
    expect(received).toEqual({ title: 'hello', views: 3 });
  });

  it('invokes onSetupError instead of the handler when document data is invalid', async () => {
    let handlerRan = false;
    let setupError: FunctionSetupError | undefined;
    let seenPostId: string | undefined;

    const fn = onDocumentCreatedEffect(
      {
        document: 'posts/{postId}',
        runtime,
        schema: Post,
        onSetupError: (error, event) =>
          Effect.sync(() => {
            setupError = error;
            seenPostId = event.params.postId;
          }),
      },
      () =>
        Effect.sync(() => {
          handlerRan = true;
        }),
    );

    await fn.run(makeEvent({ title: 'hello', views: 'not-a-number' }));

    expect(handlerRan).toBe(false);
    expect(setupError?.phase).toBe('decode-document');
    expect(seenPostId).toBe('post-1');
  });

  it('treats invalid document data as a logged defect by default', async () => {
    let handlerRan = false;
    const fn = onDocumentCreatedEffect(
      { document: 'posts/{postId}', runtime, schema: Post },
      () =>
        Effect.sync(() => {
          handlerRan = true;
        }),
    );

    // Resolves without throwing: the defect is caught and logged by the wrapper.
    await fn.run(makeEvent({ title: 'hello', views: 'not-a-number' }));
    expect(handlerRan).toBe(false);
  });
});
