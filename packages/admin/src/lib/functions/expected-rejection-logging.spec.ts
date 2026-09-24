import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from '@effect/vitest';
import {
  Data,
  Effect,
  ErrorReporter,
  Layer,
  ManagedRuntime,
  Schema,
} from 'effect';
import { logger } from 'firebase-functions';
import { CallableRequest, HttpsError } from 'firebase-functions/https';
import { CloudEvent } from 'firebase-functions/v2';
import { MessagePublishedData } from 'firebase-functions/v2/pubsub';
import { Request, TaskQueueFunction } from 'firebase-functions/v2/tasks';
import { ScheduledEvent } from 'firebase-functions/v2/scheduler';
import {
  Change,
  DocumentSnapshot,
  FirestoreEvent,
  QueryDocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { type Response } from 'express';
import {
  onDocumentCreatedEffect,
  onDocumentCreatedWithAuthContextEffect,
} from './on-document-created.js';
import {
  onDocumentDeletedEffect,
  onDocumentDeletedWithAuthContextEffect,
} from './on-document-deleted.js';
import {
  onDocumentUpdatedEffect,
  onDocumentUpdatedWithAuthContextEffect,
} from './on-document-updated.js';
import {
  onDocumentWrittenEffect,
  onDocumentWrittenWithAuthContextEffect,
} from './on-document-written.js';
import { onMessagePublishedEffect } from './on-message-published.js';
import { onTaskDispatchedEffect } from './on-task-dispatched.js';
import { onScheduleEffect } from './on-schedule.js';
import { onCallEffect } from './on-call.js';

const runtime = ManagedRuntime.make(Layer.empty);

/** DecodingServices = never, so an empty runtime satisfies the contract. */
const Doc = Schema.Struct({ v: Schema.Number });

/**
 * Expected rejection: an error the handler deliberately raises to fail the
 * function. Per the documented contract it must NOT be logged as a defect,
 * but it must still escape the wrapper (swallowed by Firestore/PubSub,
 * rethrown by Tasks/Schedule so retries apply).
 */
class QuietError extends Data.TaggedError('QuietError')<{
  readonly reason: string;
}> {
  override readonly [ErrorReporter.ignore] = true;
}

/**
 * A genuine defect: an ordinary tagged error without the
 * `ErrorReporter.ignore` annotation. It IS logged as a defect.
 */
class LoudError extends Data.TaggedError('LoudError')<{
  readonly reason: string;
}> {}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  errorSpy.mockRestore();
});

/**
 * Asserts the wrapper did NOT emit its `"Defect in <name>"` line. Asserts on
 * the specific message (rather than `not.toHaveBeenCalled()`) so Cloud Tasks'
 * SDK `onDispatchHandler` noise cannot mask a contract regression.
 */
const expectNoDefectLog = (name: string) => {
  const calls = errorSpy.mock.calls.filter(
    ([msg]: [unknown, ...unknown[]]) => msg === `Defect in ${name}`,
  );
  expect(calls).toHaveLength(0);
};

/**
 * Asserts the wrapper DID emit its `"Defect in <name>"` line carrying the
 * escaping error as `inner`.
 */
const expectDefectLog = (name: string, innerType: unknown) => {
  expect(errorSpy).toHaveBeenCalledWith(
    `Defect in ${name}`,
    expect.objectContaining({ inner: expect.any(innerType as never) }),
  );
};

// ---------------------------------------------------------------------------
// Event / request / response factories (mirrors the sibling *.spec.ts files)
// ---------------------------------------------------------------------------

const snapshot = (data: Record<string, unknown> = { v: 1 }) => ({
  id: 'doc-1',
  ref: { path: 'posts/post-1' },
  data: () => data,
});

const makeDocEvent = <
  Data = QueryDocumentSnapshot | undefined,
>(): FirestoreEvent<Data, { postId: string }> =>
  ({
    data: snapshot() as unknown as Data,
    params: { postId: 'post-1' },
  }) as unknown as FirestoreEvent<Data, { postId: string }>;

const makeChangeEvent = <
  Data = Change<QueryDocumentSnapshot> | undefined,
>(): FirestoreEvent<Data, { postId: string }> =>
  ({
    data: { before: snapshot(), after: snapshot({ v: 2 }) },
    params: { postId: 'post-1' },
  }) as unknown as FirestoreEvent<Data, { postId: string }>;

const makeWrittenEvent = <
  Data = Change<DocumentSnapshot> | undefined,
>(): FirestoreEvent<Data, { postId: string }> =>
  ({
    data: { before: snapshot(), after: snapshot({ v: 2 }) },
    params: { postId: 'post-1' },
  }) as unknown as FirestoreEvent<Data, { postId: string }>;

const makePubSubEvent = <T = unknown>(
  raw = '{"x":1}',
): CloudEvent<MessagePublishedData<T>> =>
  ({
    data: {
      message: {
        get json() {
          return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        },
      },
    },
  }) as unknown as CloudEvent<MessagePublishedData<T>>;

const makeScheduledEvent = (): ScheduledEvent =>
  ({ scheduleTime: '2026-09-24T00:00:00Z' }) as ScheduledEvent;

const taskHeaders: Record<string, string> = {
  'content-type': 'application/json',
  'x-cloudtasks-queuename': 'projects/p/locations/l/queues/q',
  'x-cloudtasks-taskname': 'projects/p/locations/l/queues/q/tasks/t',
};

const makeTaskRequest = (data: unknown): Request =>
  ({
    method: 'POST',
    headers: taskHeaders,
    header(name: string) {
      const lower = name.toLowerCase();
      const key = Object.keys(taskHeaders).find(
        (k) => k.toLowerCase() === lower,
      );
      return key ? taskHeaders[key] : undefined;
    },
    body: { data },
  }) as unknown as Request;

interface TaskSent {
  status?: number;
  ended: boolean;
}

const makeTaskResponse = (): { response: Response; sent: TaskSent } => {
  const sent: TaskSent = { ended: false };
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    end() {
      sent.ended = true;
      return this;
    },
    send() {
      sent.ended = true;
      return this;
    },
  } as unknown as Response;
  return { response, sent };
};

const dispatchTask = (
  fn: TaskQueueFunction,
  request: Request,
  response: Response,
) => fn(request as unknown as Parameters<TaskQueueFunction>[0], response);

const makeCallableRequest = (data: unknown): CallableRequest =>
  ({ data, rawRequest: {}, acceptsStreaming: false }) as CallableRequest;

const runFn = (
  fn: { run: (event: never) => unknown },
  event: unknown,
): Promise<unknown> => Promise.resolve(fn.run(event as never));

// ---------------------------------------------------------------------------
// Contract: expected rejections are not logged as defects by any background
// trigger, while genuine defects still are. Each trigger's swallow (Firestore
// / PubSub) or rethrow (Tasks / Schedule) behaviour is unchanged.
//
// `run(error)` builds the trigger with a handler that escapes with `error`
// and drives it, returning the drive promise. `resolves` indicates whether
// the wrapper swallows (resolves) or rethrows (rejects); the promise is
// awaited accordingly.
// ---------------------------------------------------------------------------

const contract = (
  name: string,
  run: (error: Error) => Promise<unknown>,
  resolves = true,
) => {
  it('does not log an HttpsError as a defect', async () => {
    const p = run(new HttpsError('unavailable', 'retry later'));
    if (resolves) await expect(p).resolves.toBeUndefined();
    else await expect(p).rejects.toBeDefined();
    expectNoDefectLog(name);
  });

  it('does not log an ErrorReporter.ignore-annotated error as a defect', async () => {
    const p = run(new QuietError({ reason: 'expected' }));
    if (resolves) await expect(p).resolves.toBeUndefined();
    else await expect(p).rejects.toBeDefined();
    expectNoDefectLog(name);
  });

  it('logs an unannotated error as a defect', async () => {
    const p = run(new LoudError({ reason: 'boom' }));
    if (resolves) await expect(p).resolves.toBeUndefined();
    else await expect(p).rejects.toBeDefined();
    expectDefectLog(name, LoudError);
  });
};

// --- Firestore triggers (never error channel: handler escapes via die) -----

describe('onDocumentCreatedEffect', () => {
  contract('onDocumentCreated', (error) =>
    runFn(
      onDocumentCreatedEffect(
        { document: 'posts/{postId}', runtime, schema: Doc },
        () => Effect.die(error),
      ),
      makeDocEvent(),
    ),
  );
});

describe('onDocumentCreatedWithAuthContextEffect', () => {
  contract('onDocumentCreatedWithAuthContext', (error) =>
    runFn(
      onDocumentCreatedWithAuthContextEffect(
        { document: 'posts/{postId}', runtime, schema: Doc },
        () => Effect.die(error),
      ),
      makeDocEvent(),
    ),
  );
});

describe('onDocumentDeletedEffect', () => {
  contract('onDocumentDeleted', (error) =>
    runFn(
      onDocumentDeletedEffect(
        { document: 'posts/{postId}', runtime, schema: Doc },
        () => Effect.die(error),
      ),
      makeDocEvent(),
    ),
  );
});

describe('onDocumentDeletedWithAuthContextEffect', () => {
  contract('onDocumentDeletedWithAuthContext', (error) =>
    runFn(
      onDocumentDeletedWithAuthContextEffect(
        { document: 'posts/{postId}', runtime, schema: Doc },
        () => Effect.die(error),
      ),
      makeDocEvent(),
    ),
  );
});

describe('onDocumentUpdatedEffect', () => {
  contract('onDocumentUpdated', (error) =>
    runFn(
      onDocumentUpdatedEffect(
        { document: 'posts/{postId}', runtime, schema: Doc },
        () => Effect.die(error),
      ),
      makeChangeEvent(),
    ),
  );
});

describe('onDocumentUpdatedWithAuthContextEffect', () => {
  contract('onDocumentUpdatedWithAuthContext', (error) =>
    runFn(
      onDocumentUpdatedWithAuthContextEffect(
        { document: 'posts/{postId}', runtime, schema: Doc },
        () => Effect.die(error),
      ),
      makeChangeEvent(),
    ),
  );
});

describe('onDocumentWrittenEffect', () => {
  contract('onDocumentWritten', (error) =>
    runFn(
      onDocumentWrittenEffect(
        { document: 'posts/{postId}', runtime, schema: Doc },
        () => Effect.die(error),
      ),
      makeWrittenEvent(),
    ),
  );
});

describe('onDocumentWrittenWithAuthContextEffect', () => {
  contract('onDocumentWrittenWithAuthContext', (error) =>
    runFn(
      onDocumentWrittenWithAuthContextEffect(
        { document: 'posts/{postId}', runtime, schema: Doc },
        () => Effect.die(error),
      ),
      makeWrittenEvent(),
    ),
  );
});

// --- Pub/Sub trigger (typed error channel: handler escapes via fail) ------

describe('onMessagePublishedEffect', () => {
  contract('onMessagePublished', (error) =>
    runFn(
      onMessagePublishedEffect({ runtime, topic: 't' }, () =>
        Effect.fail(error),
      ),
      makePubSubEvent(),
    ),
  );
});

// --- Scheduled trigger (typed error channel; rethrows for retry) ----------

describe('onScheduleEffect', () => {
  contract(
    'onSchedule',
    (error) =>
      runFn(
        onScheduleEffect({ schedule: 'every 5 minutes', runtime }, () =>
          Effect.fail(error),
        ),
        makeScheduledEvent(),
      ),
    false,
  );
});

// --- Cloud Tasks trigger (typed error channel; rethrows for retry) --------

describe('onTaskDispatchedEffect', () => {
  // FUNCTIONS_EMULATOR=1 skips the SDK's bearer-token check so a fake request
  // without an Authorization header reaches the inner handler.
  const previous = process.env.FUNCTIONS_EMULATOR;
  beforeAll(() => {
    process.env.FUNCTIONS_EMULATOR = '1';
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.FUNCTIONS_EMULATOR;
    else process.env.FUNCTIONS_EMULATOR = previous;
  });

  const drive = (fn: TaskQueueFunction): Promise<TaskSent> => {
    const { response, sent } = makeTaskResponse();
    return Promise.resolve(
      dispatchTask(fn, makeTaskRequest(null), response),
    ).then(() => sent);
  };

  it('does not log an HttpsError as a defect and still rethrows (503)', async () => {
    const fn = onTaskDispatchedEffect(
      { runtime, retryConfig: { maxAttempts: 5 } },
      () => Effect.fail(new HttpsError('unavailable', 'retry later')),
    );
    const sent = await drive(fn);
    expectNoDefectLog('onTaskDispatched');
    // Rethrow preserved: the HttpsError status reaches Cloud Tasks for retry.
    expect(sent.status).toBe(503);
    expect(sent.ended).toBe(true);
  });

  it('does not log an ErrorReporter.ignore-annotated error as a defect and still rethrows (500)', async () => {
    const fn = onTaskDispatchedEffect(
      { runtime, retryConfig: { maxAttempts: 5 } },
      () => Effect.fail(new QuietError({ reason: 'retry later' })),
    );
    const sent = await drive(fn);
    expectNoDefectLog('onTaskDispatched');
    // Rethrow preserved: a non-HttpsError maps to 500 (still retry-class).
    expect(sent.status).toBe(500);
    expect(sent.ended).toBe(true);
  });

  it('logs an unannotated error as a defect and still rethrows (500)', async () => {
    const fn = onTaskDispatchedEffect(
      { runtime, retryConfig: { maxAttempts: 5 } },
      () => Effect.fail(new LoudError({ reason: 'boom' })),
    );
    const sent = await drive(fn);
    expectDefectLog('onTaskDispatched', LoudError);
    expect(sent.status).toBe(500);
    expect(sent.ended).toBe(true);
  });
});

// --- Callable (contract parity; already covered in report.spec.ts) --------

describe('onCallEffect (contract parity)', () => {
  it('does not log an HttpsError as a defect', async () => {
    const fn = onCallEffect({ runtime }, () =>
      Effect.fail(new HttpsError('not-found', 'nope')),
    );
    const error = await fn.run(makeCallableRequest({})).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(HttpsError);
    expectNoDefectLog('onCall');
  });

  it('logs an unannotated error as a defect', async () => {
    const fn = onCallEffect({ runtime }, () =>
      Effect.fail(new LoudError({ reason: 'boom' })),
    );
    const error = await fn.run(makeCallableRequest({})).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LoudError);
    expectDefectLog('onCall', LoudError);
  });
});
