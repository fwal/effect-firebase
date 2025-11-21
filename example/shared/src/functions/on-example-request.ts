import { Schema } from 'effect';
import { PostModel } from '../models/post.js';
import { ErrorSchema } from './error-schema.js';

export const name = 'onExampleRequest';

export const Input = Schema.Struct({
  id: Schema.String,
});

export const Output = Schema.Union(PostModel.json, ErrorSchema);
