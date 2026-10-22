import { describe, expect, it } from '@effect/vitest';
import { DateTime, Effect, Exit, Schema } from 'effect';
import { PubSub as GooglePubSub } from '@google-cloud/pubsub';
import * as PubSub from './pubsub.js';

/** Encode with the codec, send through JSON, decode with the codec. */
const roundtrip = <S extends Schema.Codec<unknown, unknown>>(
  schema: S,
  value: S['Type'],
) => {
  const codec = PubSub.messageCodec(schema);
  const encoded = Schema.encodeSync(codec)(value);
  return Schema.decodeUnknownSync(codec)(JSON.parse(JSON.stringify(encoded)));
};

const Tagged = Schema.Union([
  Schema.TaggedStruct('Created', {
    id: Schema.String,
    networkId: Schema.NullishOr(Schema.String),
  }),
  Schema.TaggedStruct('Deleted', {
    id: Schema.String,
    reason: Schema.optional(Schema.String),
  }),
]);

const shapes = {
  NullishOr: Schema.Struct({ a: Schema.NullishOr(Schema.String) }),
  NullOr: Schema.Struct({ a: Schema.NullOr(Schema.Number) }),
  optional: Schema.Struct({ a: Schema.optional(Schema.String) }),
  optionalKey: Schema.Struct({ a: Schema.optionalKey(Schema.String) }),
  optionalNullOr: Schema.Struct({
    a: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  taggedUnion: Tagged,
  Date: Schema.Struct({ at: Schema.Date }),
  DateTimeUtc: Schema.Struct({ at: Schema.DateTimeUtc }),
};

/**
 * JSON has no `undefined`, so the codec writes `null` instead. For a
 * `NullishOr` field that comes back as `null` (both are valid), so compare
 * with `undefined` folded into `null`. JSON also writes `-0` as `0`.
 * Dates compare by instant.
 */
const normalize = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (Object.is(value, -0)) return 0;
  if (DateTime.isDateTime(value)) return DateTime.toEpochMillis(value);
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map((item) => normalize(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
};

describe('PubSub.messageCodec', () => {
  for (const [name, schema] of Object.entries(shapes)) {
    it.prop(
      `${name} survives JSON`,
      { value: schema as Schema.Codec<unknown, unknown> },
      ({ value }) => {
        const decoded = roundtrip(
          schema as Schema.Codec<unknown, unknown>,
          value,
        );
        expect(Schema.is(schema)(decoded)).toBe(true);
        expect(normalize(decoded)).toEqual(normalize(value));
      },
    );
  }

  it('encodes undefined as null for a required NullishOr field', () => {
    const encoded = Schema.encodeSync(PubSub.messageCodec(shapes.NullishOr))({
      a: undefined,
    });
    expect(encoded).toEqual({ a: null });
  });

  it('still rejects a missing key on a required NullishOr field', () => {
    const exit = Schema.decodeUnknownExit(
      PubSub.messageCodec(shapes.NullishOr),
    )({});
    expect(Exit.isFailure(exit)).toBe(true);
  });
});

type Published = {
  topic: string;
  json: unknown;
  attributes?: Record<string, string>;
  orderingKey?: string;
};

const mockClient = (
  published: Array<Published>,
  result: () => Promise<string> = () => Promise.resolve('message-1'),
): PubSub.Client => ({
  topic: (topic) => ({
    publishMessage: (message) => {
      published.push({ topic, ...message });
      return result();
    },
  }),
});

const Event = Schema.Struct({
  id: Schema.String,
  networkId: Schema.NullishOr(Schema.String),
  at: Schema.Date,
});

describe('PubSub.publish', () => {
  it.effect('publishes JSON-safe output with attributes', () =>
    Effect.gen(function* () {
      const published: Array<Published> = [];
      const id = yield* PubSub.publish(
        'events',
        Event,
        {
          id: 'e1',
          networkId: undefined,
          at: new Date('2024-01-01T00:00:00.000Z'),
        },
        { attributes: { source: 'test' }, orderingKey: 'k' },
      ).pipe(Effect.provide(PubSub.layer(mockClient(published))));

      expect(id).toBe('message-1');
      expect(published).toEqual([
        {
          topic: 'events',
          json: {
            id: 'e1',
            networkId: null,
            at: '2024-01-01T00:00:00.000Z',
          },
          attributes: { source: 'test' },
          orderingKey: 'k',
        },
      ]);
      // What goes on the wire is exactly what the consumer will parse.
      expect(JSON.parse(JSON.stringify(published[0].json))).toEqual(
        published[0].json,
      );
    }),
  );

  it.effect('omits attributes when none are given', () =>
    Effect.gen(function* () {
      const published: Array<Published> = [];
      yield* PubSub.publish('events', Schema.String, 'hello').pipe(
        Effect.provide(PubSub.layer(mockClient(published))),
      );
      expect(published).toEqual([{ topic: 'events', json: 'hello' }]);
    }),
  );

  it.effect('maps encode failures to PubSubPublishError', () =>
    Effect.gen(function* () {
      const published: Array<Published> = [];
      const error = yield* PubSub.publish(
        'events',
        Schema.String.check(Schema.isMinLength(3)),
        'x',
      ).pipe(Effect.provide(PubSub.layer(mockClient(published))), Effect.flip);
      expect(error._tag).toBe('PubSubPublishError');
      expect(error.phase).toBe('encode-message');
      expect(error.topic).toBe('events');
      expect(published).toEqual([]);
    }),
  );

  it.effect('maps client failures to PubSubPublishError', () =>
    Effect.gen(function* () {
      const error = yield* PubSub.publish('events', Schema.String, 'x').pipe(
        Effect.provide(
          PubSub.layer(
            mockClient([], () => Promise.reject(new Error('unavailable'))),
          ),
        ),
        Effect.flip,
      );
      expect(error._tag).toBe('PubSubPublishError');
      expect(error.phase).toBe('publish');
      expect(error.cause.message).toBe('unavailable');
    }),
  );

  it('accepts a @google-cloud/pubsub client', () => {
    // Type-level check: the real client satisfies `PubSub.Client`.
    const client: PubSub.Client = new GooglePubSub({ projectId: 'test' });
    expect(PubSub.layer(client)).toBeDefined();
  });
});
