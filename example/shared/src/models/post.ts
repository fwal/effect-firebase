import { Schema } from 'effect';
import { Model } from 'effect-firebase';

export const PostId = Schema.String.pipe(Schema.brand('PostId'));
export const postId = Schema.decode(PostId);

export class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.Generated(PostId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
  title: Schema.String,
  content: Schema.String,
}) {}
