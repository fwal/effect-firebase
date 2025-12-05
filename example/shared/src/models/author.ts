import { Schema } from 'effect';
import { Model } from 'effect-firebase';

export const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
export const AuthorRef = Model.Reference(AuthorId, 'authors');

export class AuthorModel extends Model.Class<AuthorModel>('AuthorModel')({
  id: Model.Generated(AuthorId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
  name: Schema.String,
}) {}
