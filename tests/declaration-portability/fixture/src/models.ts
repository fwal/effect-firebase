import { Schema } from 'effect';
import { Model } from 'effect-firebase';

// This mirrors the real downstream usage that triggered TS2742:
//
//   export const JobRef = Model.Reference(JobId, 'jobs')
//   export class Job extends Model.Class<Job>('Job')({ ... }) {}
//
// The inferred public types of these declarations reference effect-firebase's
// internal schema classes (`Reference`, `Timestamp`) and `@effect/experimental`
// `VariantSchema` types. If any of them is only nameable through a non-portable
// path, `tsc --emitDeclarationOnly` fails with TS2742.

export const JobId = Schema.String.pipe(Schema.brand('JobId'));
export const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

// Exercises the `Reference` schema class leak.
export const JobRef = Model.Reference(JobId, 'jobs');
export const AuthorRef = Model.Reference(AuthorId, 'authors');

export class Job extends Model.Class<Job>('Job')({
  id: Model.Generated(JobId),
  // Exercises the `Timestamp` / `ServerTimestamp` schema class leak.
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
  // Exercises the `Reference` leak inside a model field.
  author: AuthorRef,
  title: Schema.String,
  optional: Model.OptionalDeletable(Schema.String),
  tags: Model.Array(Schema.String),
}) {}
