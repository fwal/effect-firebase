import { Schema } from 'effect';
import { Model as M } from '@effect/sql';
import { Model as F } from 'effect-firebase';

export const PostId = Schema.String.pipe(Schema.brand('PostId'));
export const postId = Schema.decode(PostId);

export class PostModel extends M.Class<PostModel>('PostModel')({
  id: M.Generated(PostId),
  createdAt: F.DateTimeInsert,
  updatedAt: F.DateTimeUpdate,
  title: Schema.String,
  content: Schema.String,
}) {}
