import { Schema } from 'effect';
import { FirestoreSchema } from 'effect-firebase';

export const PostSchema = Schema.Struct({
  createdAt: FirestoreSchema.DateTime,
  title: Schema.String,
  content: Schema.String,
});
