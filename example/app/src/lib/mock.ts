import { DateTime, Option } from 'effect';
import { fixture, make } from '@effect-firebase/mock';
import { AuthorId, AuthorModel, PostId, PostModel } from '@example/shared';

const at = (iso: string) => DateTime.makeUnsafe(iso);

const author = (id: string, name: string, created: string) =>
  new AuthorModel({
    id: AuthorId.make(id),
    name,
    createdAt: at(created),
    updatedAt: at(created),
  });

const post = (
  id: string,
  title: string,
  content: string,
  created: string,
  authorId = 'ada'
) =>
  new PostModel({
    id: PostId.make(id),
    title,
    content,
    author: AuthorId.make(authorId),
    createdAt: at(created),
    updatedAt: at(created),
    checked: false,
    optional: Option.none(),
    list: [],
  });

/**
 * A static mock backend for developing pages without the Firebase emulator.
 *
 * Enabled by starting the app with `VITE_MOCK_BACKEND=1` (see `app.tsx`).
 * The handle is shared between the app runtime (which provides
 * `mockBackend.layer` through `firestoreLayerAtom`) and the Firestore Mock
 * devtools panel (which drives `mockBackend.controller`).
 */
export const mockBackend = make({
  fixtures: [
    fixture(AuthorModel, {
      collectionPath: 'authors',
      idField: 'id',
      docs: [author('ada', 'Ada Lovelace', '2024-01-01T09:00:00Z')],
    }),
    fixture(PostModel, {
      collectionPath: 'posts',
      idField: 'id',
      docs: [
        post(
          'welcome',
          'Welcome to mock mode',
          'This post is served from the in-memory mock backend — no emulator running. Open the TanStack Devtools panel to toggle this collection between data, empty, loading and error.',
          '2024-05-03T10:00:00Z'
        ),
        post(
          'fixtures',
          'Fixtures are schema-encoded',
          'These documents were written through PostModel, so timestamps, references and options decode exactly like production data.',
          '2024-05-02T15:30:00Z'
        ),
        post(
          'try-writing',
          'Writes are live',
          'Create, edit or delete posts — the mock store is reactive, so the stream behind this list re-emits just like onSnapshot.',
          '2024-05-01T08:15:00Z'
        ),
      ],
    }),
  ],
});
