import { Schema } from 'effect';
import { Model } from 'effect-firebase';
import { AuthorRef } from './author.js';

export const PostId = Schema.String.pipe(Schema.brand('PostId'));
export const PostRef = Model.Reference(PostId, 'posts');

export class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.Generated(PostId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
  author: AuthorRef,
  title: Schema.String,
  content: Schema.String,
  checked: Schema.Boolean,
  optional: Model.OptionalDeletable(Schema.String),
  list: Model.Array(Schema.String),
}) {
  static idField = 'id' as const;
}
