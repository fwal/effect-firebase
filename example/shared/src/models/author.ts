import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { Firestore } from 'effect-firebase';

export const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
export const AuthorRef = Firestore.Reference(AuthorId, 'authors');

export class AuthorModel extends Model.Class<AuthorModel>('AuthorModel')({
  id: Model.Generated(AuthorId),
  createdAt: Firestore.DateTimeInsert,
  updatedAt: Firestore.DateTimeUpdate,
  name: Schema.String,
}) {}
