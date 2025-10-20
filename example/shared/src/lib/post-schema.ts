import { Schema } from 'effect';
import { Date } from 'effect-firebase';

export const PostSchema = Schema.Struct({
  createdAt: Date,
  title: Schema.String,
  content: Schema.String,
});
