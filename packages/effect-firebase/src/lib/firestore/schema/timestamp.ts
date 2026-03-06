import { DateTime, ParseResult, Schema } from 'effect';

/**
 * Class representing a Timestamp in Firestore.
 */
export class Timestamp extends Schema.Class<Timestamp>('Timestamp')({
  seconds: Schema.Number,
  nanoseconds: Schema.Number,
}) {
  static fromDate(date: Date): Timestamp {
    return new Timestamp({
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: (date.getTime() % 1000) * 1000000,
    });
  }

  static fromMillis(millis: number): Timestamp {
    return new Timestamp({
      seconds: Math.floor(millis / 1000),
      nanoseconds: (millis % 1000) * 1000000,
    });
  }

  static fromDateTime(date: DateTime.Utc): Timestamp {
    return this.fromMillis(date.epochMillis);
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1000000;
  }
}

/**
 * Schema where Timestamp class instance is both Type and Encoded.
 * Using instanceOf ensures the class instance is preserved through Schema.encode.
 */
export const TimestampInstance = Schema.instanceOf(Timestamp);

/**
 * Schema representing a timestamp as a DateTime.Utc.
 */
export const TimestampDateTimeUtc = Schema.transform(
  TimestampInstance,
  Schema.DateTimeUtcFromSelf,
  {
    decode: (ts) => DateTime.unsafeMake(ts.toMillis()),
    encode: (date) => Timestamp.fromMillis(date.epochMillis),
    strict: true,
  }
);

/**
 * Class representing a server timestamp in Firestore.
 */
export class ServerTimestamp extends Schema.Class<ServerTimestamp>(
  'ServerTimestamp'
)({}) {}

/**
 * Schema where ServerTimestamp class instance is both Type and Encoded.
 * Using instanceOf ensures the class instance is preserved through Schema.encode.
 */
export const ServerTimestampInstance = Schema.instanceOf(ServerTimestamp);

export const AnyTimestampDateTimeUtc = Schema.transformOrFail(
  Schema.Union(TimestampInstance, ServerTimestampInstance),
  Schema.DateTimeUtcFromSelf,
  {
    strict: true,
    decode: (input, _, ast) => {
      if (input instanceof Timestamp) {
        return ParseResult.succeed(DateTime.unsafeMake(input.toMillis()));
      }
      return ParseResult.fail(
        new ParseResult.Forbidden(
          ast,
          input,
          'ServerTimestamp cannot be decoded to DateTime'
        )
      );
    },
    encode: (dt) => ParseResult.succeed(Timestamp.fromDateTime(dt)),
  }
);
