import { Admin, makeRuntime } from '@effect-firebase/admin';
import { PostRepository } from '@example/shared';
import { Layer } from 'effect';

export const runtime = makeRuntime(
  PostRepository.Default.pipe(Layer.provideMerge(Admin.layer))
);
