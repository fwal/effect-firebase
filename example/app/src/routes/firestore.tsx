import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Effect, Option, Schema, Stream, DateTime } from 'effect';
import { useForm } from '@tanstack/react-form';
import {
  PostRepository,
  PostModel,
  PostId,
  AuthorId,
} from '@example/shared';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  Input,
  Spinner,
  TextArea,
} from '../components/core';
import { useEffectMutation, useEffectStream } from '../lib/effect-react.js';

export const Route = createFileRoute('/firestore')({
  component: RouteComponent,
});

type Post = typeof PostModel.Type;
type PostInsert = typeof PostModel.insert.Type;
type PostUpdate = typeof PostModel.update.Type;
type EditingPost = { readonly id: typeof PostId.Type; readonly title: string; readonly content: string };

// Repository operations — the repository is itself an Effect, so we
// flatMap through it. The FirestoreService is supplied by the runtime layer.
const latestPostsStream = () =>
  Stream.unwrap(PostRepository.pipe(Effect.map((r) => r.latestPosts())));

const addPost = (data: PostInsert) =>
  PostRepository.pipe(Effect.flatMap((r) => r.add(data)));

const updatePost = (input: {
  readonly id: typeof PostId.Type;
  readonly data: Partial<Omit<PostUpdate, 'id'>>;
}) =>
  PostRepository.pipe(
    Effect.flatMap((r) => r.update(input.id, input.data)),
  );

const deletePost = (id: typeof PostId.Type) =>
  PostRepository.pipe(Effect.flatMap((r) => r.delete(id)));

const PostFormSchema = Schema.Struct({
  title: Schema.NonEmptyString,
  content: Schema.NonEmptyString,
});

const formatDateTime = (date: DateTime.DateTime) =>
  DateTime.formatLocal(date, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function PostForm({
  editing,
  onDone,
}: {
  editing: EditingPost | null;
  onDone: () => void;
}) {
  const create = useEffectMutation(addPost);
  const update = useEffectMutation(updatePost);

  const form = useForm({
    defaultValues: editing
      ? { title: editing.title, content: editing.content }
      : { title: '', content: '' },
    validators: { onChange: Schema.toStandardSchemaV1(PostFormSchema) },
    onSubmit: async ({ value }) => {
      if (editing) {
        await update.mutate({
          id: editing.id,
          data: { title: value.title, content: value.content },
        });
      } else {
        await create.mutate({
          title: value.title,
          content: value.content,
          author: AuthorId.make('1'),
          createdAt: undefined,
          updatedAt: undefined,
          checked: false,
          optional: Option.none(),
          list: [],
        });
      }
      form.reset();
      onDone();
    },
  });

  return (
    <Card>
      <CardHeader>{editing ? 'Edit Post' : 'Create New Post'}</CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <form.Field name="title">
            {(field) => (
              <Input
                placeholder="Post Title"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                error={
                  field.state.meta.isTouched
                    ? field.state.meta.errors[0]?.message
                    : undefined
                }
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="content">
            {(field) => (
              <TextArea
                placeholder="Post Content"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                error={
                  field.state.meta.isTouched
                    ? field.state.meta.errors[0]?.message
                    : undefined
                }
                onBlur={field.handleBlur}
                rows={3}
              />
            )}
          </form.Field>
          <div className="flex justify-end gap-2">
            {editing && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  form.reset();
                  onDone();
                }}
              >
                Cancel
              </Button>
            )}
            <form.Subscribe
              selector={(s) => [s.canSubmit, s.isSubmitting] as const}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  disabled={!canSubmit}
                >
                  {editing ? 'Update Post' : 'Create Post'}
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PostList({
  onEdit,
}: {
  onEdit: (post: Post) => void;
}) {
  const result = useEffectStream(latestPostsStream, []);
  const remove = useEffectMutation(deletePost);

  if (result._tag === 'Initial') {
    return (
      <div className="flex justify-center p-8">
        <Spinner size="lg" />
      </div>
    );
  }
  if (result._tag === 'Failure') {
    return <EmptyState message={`Error: ${String(result.error)}`} />;
  }
  if (result.value.length === 0) {
    return <EmptyState message="No posts found. Create one above!" />;
  }

  return (
    <>
      {result.value.map((post) => (
        <Card key={post.id} className="hover:shadow-md transition-shadow">
          <CardContent className="pt-6">
            <div className="flex justify-between items-start mb-2">
              <h4 className="text-lg font-bold text-gray-900">{post.title}</h4>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onEdit(post)}
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => remove.mutate(post.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
            <p className="text-gray-600 whitespace-pre-wrap">{post.content}</p>
            <div className="mt-4 text-xs text-gray-400">
              ID: {post.id}
              {post.createdAt && (
                <span className="ml-2">• {formatDateTime(post.createdAt)}</span>
              )}
              {post.checked && <span className="ml-2">• Checked</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function RouteComponent() {
  const [editing, setEditing] = useState<EditingPost | null>(null);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Firestore CRUD
        </h2>
        <p className="text-gray-600">
          Manage posts using the shared Effect repository and Firestore
        </p>
      </header>

      <PostForm
        key={editing?.id ?? 'new'}
        editing={editing}
        onDone={() => setEditing(null)}
      />

      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900">Recent Posts</h3>
        <PostList
          onEdit={(post) =>
            setEditing({
              id: post.id,
              title: post.title,
              content: post.content,
            })
          }
        />
      </div>
    </div>
  );
}
