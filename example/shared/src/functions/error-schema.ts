import { Schema } from 'effect';

const BasicError = Schema.Struct({
  message: Schema.String,
  tag: Schema.String,
});

const ParseError = Schema.Struct({
  ...BasicError.fields,
  failures: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      message: Schema.String,
    })
  ),
});

export const ErrorSchema = Schema.Struct({
  error: Schema.Union(ParseError, BasicError),
});
