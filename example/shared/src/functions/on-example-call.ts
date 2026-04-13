import { Schema, Struct } from 'effect';
import { PostModel } from '../models/post.js';
import { ErrorSchema } from './error-schema.js';

export const name = 'onExampleCall' as const;

export const Input = PostModel.json.mapFields(Struct.pick(['id']));
export const Output = Schema.Union([PostModel.json, ErrorSchema]);
