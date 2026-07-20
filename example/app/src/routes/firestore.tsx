import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Cause, DateTime, Option, Schema } from 'effect';
import { AsyncResult } from 'effect/unstable/reactivity';
import { useForm } from '@tanstack/react-form';
import { useAtomValue, useAtomSet } from '@effect/atom-react';
import { PostModel, AuthorId } from '@example/shared';
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
import {
  latestPostsAtom,
  addPostAtom,
  updatePostAtom,
  deletePostAtom,
} from '../lib/atoms.js';

export const Route = createFileRoute('/firestore')({
  component: RouteComponent,
});

type Post = typeof PostModel.Type;
type EditingPost = Pick<Post, 'id' | 'title' | 'content'>;

const PostFormSchema = Schema.Struct({
  title: Schema.NonEmptyString,
  content: Schema.NonEmptyString,
});

const postFormValidator = Schema.toStandardSchemaV1(PostFormSchema);

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const formatDateTime = (date: DateTime.DateTime) =>
  DateTime.formatIntl(date, dateTimeFormat);

const fieldError = (field: {
  readonly state: {
    readonly meta: {
      readonly isTouched: boolean;
      readonly errors: ReadonlyArray<
        { readonly message?: string } | undefined
      >;
    };
  };
}) =>
  field.state.meta.isTouched
    ? field.state.meta.errors[0]?.message
    : undefined;

function PostForm({
  editing,
  onDone,
}: {
  editing: EditingPost | null;
  onDone: () => void;
}) {
  const create = useAtomSet(addPostAtom, { mode: 'promise' });
  const update = useAtomSet(updatePostAtom, { mode: 'promise' });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: editing
      ? { title: editing.title, content: editing.content }
      : { title: '', content: '' },
    validators: { onChange: postFormValidator },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        if (editing) {
          await update({
            id: editing.id,
            data: { title: value.title, content: value.content },
          });
        } else {
          await create({
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
      } catch {
        // form-core rethrows onSubmit errors out of handleSubmit, so an
        // unhandled failure here would become an unhandled rejection with
        // no user-visible feedback.
        setSubmitError('Failed to save post');
      }
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
            void form.handleSubmit();
          }}
        >
          <form.Field name="title">
            {(field) => (
              <Input
                placeholder="Post Title"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                error={fieldError(field)}
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
                error={fieldError(field)}
                onBlur={field.handleBlur}
                rows={3}
              />
            )}
          </form.Field>
          {submitError && (
            <p className="text-sm text-red-600" role="alert">
              {submitError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <form.Subscribe
              selector={(s) => [s.canSubmit, s.isSubmitting] as const}
            >
              {([canSubmit, isSubmitting]) => (
                <>
                  {editing && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isSubmitting}
                      onClick={() => {
                        form.reset();
                        onDone();
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    isLoading={isSubmitting}
                    disabled={!canSubmit}
                  >
                    {editing ? 'Update Post' : 'Create Post'}
                  </Button>
                </>
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
  const result = useAtomValue(latestPostsAtom);
  const remove = useAtomSet(deletePostAtom, { mode: 'promise' });
  const [deleteError, setDeleteError] = useState<string | null>(null);

  return (
    <>
      {deleteError && (
        <p className="text-sm text-red-600" role="alert">
          {deleteError}
        </p>
      )}
      {AsyncResult.builder(result)
        .onInitial(() => (
          <div className="flex justify-center p-8">
            <Spinner size="lg" />
          </div>
        ))
        .onFailure((cause) => (
          <EmptyState message={`Error: ${Cause.pretty(cause)}`} />
        ))
        .onSuccess((posts) =>
          posts.length === 0 ? (
            <EmptyState message="No posts found. Create one above!" />
          ) : (
            <>
              {posts.map((post) => (
                <Card
                  key={post.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="text-lg font-bold text-gray-900">
                        {post.title}
                      </h4>
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
                          onClick={() => {
                            setDeleteError(null);
                            void remove(post.id).catch(() =>
                              setDeleteError('Failed to delete post'),
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <p className="text-gray-600 whitespace-pre-wrap">
                      {post.content}
                    </p>
                    <div className="mt-4 text-xs text-gray-400">
                      ID: {post.id}
                      {post.createdAt && (
                        <span className="ml-2">
                          • {formatDateTime(post.createdAt)}
                        </span>
                      )}
                      {post.checked && <span className="ml-2">• Checked</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ),
        )
        .exhaustive()}
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
          onEdit={(post) => {
            setEditing(post);
            // The form renders above the list; bring it into view.
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </div>
    </div>
  );
}
