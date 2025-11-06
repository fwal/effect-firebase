import { Schema } from 'effect';
import { FirestoreSchema } from 'effect-firebase';

export const PostSchema = Schema.Struct({
  createdAt: FirestoreSchema.Date,
  title: Schema.String,
  content: Schema.String,
});
