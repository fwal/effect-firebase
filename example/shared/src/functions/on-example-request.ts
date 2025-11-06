import { Schema } from 'effect';
import { PostSchema } from '../models/post-schema.js';
import { ErrorSchema } from './error-schema.js';

export const name = 'onExampleRequest';

export const Input = Schema.Struct({
  id: Schema.String,
});

export const Output = Schema.Union(PostSchema, ErrorSchema);
