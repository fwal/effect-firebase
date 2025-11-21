import { Schema } from 'effect';
import { PostModel } from '../models/post.js';
import { ErrorSchema } from './error-schema.js';

export const name = 'onExampleCall';

export const Input = PostModel.json.pick('id');
export const Output = Schema.Union(PostModel.json, ErrorSchema);
