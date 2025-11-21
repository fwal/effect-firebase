import { Schema } from 'effect';
import { Model as SM } from '@effect/sql';
import { Model as FM } from 'effect-firebase';

export const PostId = Schema.String.pipe(Schema.brand('PostId'));
export const postId = Schema.decode(PostId);

export class PostModel extends SM.Class<PostModel>('PostModel')({
  id: SM.Generated(PostId),
  createdAt: FM.DateTimeInsert,
  title: Schema.String,
  content: Schema.String,
}) {}
