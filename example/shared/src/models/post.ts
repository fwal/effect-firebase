import { Effect, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { Firestore } from 'effect-firebase';
import { AuthorRef } from './author.js';

export const PostId = Schema.String.pipe(Schema.brand('PostId'));
export const PostRef = Firestore.Reference(PostId, 'posts');

export class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.Generated(PostId),
  createdAt: Firestore.DateTimeInsert,
  updatedAt: Firestore.DateTimeUpdate,
  author: AuthorRef,
  title: Schema.String,
  content: Schema.String,
  checked: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false))
  ),
  optional: Firestore.OptionalDeletable(Schema.String),
  list: Firestore.Array(Schema.String),
}) {
  static idField = 'id' as const;
}
