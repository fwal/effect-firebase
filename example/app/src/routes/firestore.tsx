import { PostModel, PostRepository, PostId } from '@example/shared';
import { layer as FirestoreLive } from '@effect-firebase/client';
import { FirestoreSchema } from 'effect-firebase';
import { createFileRoute } from '@tanstack/react-router';
import { Effect, Schema } from 'effect';
import {
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
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

export const Route = createFileRoute('/firestore')({
  component: RouteComponent,
});

type Post = typeof PostModel.Type;

function RouteComponent() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Repository instance state
  const [repo, setRepo] = useState<Effect.Effect.Success<typeof PostRepository> | null>(
    null
  );

  useEffect(() => {
    // Initialize repository
    const makeRepo = PostRepository.pipe(Effect.provide(FirestoreLive()));

    Effect.runPromise(makeRepo)
      .then((r) => setRepo(r))
      .catch((err) => {
        console.error('Failed to create repository:', err);
        setError('Failed to initialize repository');
      });
  }, []);

  useEffect(() => {
    // Subscribe to posts
    const db = getFirestore();
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const postsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Post[];
        setPosts(postsData);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching posts:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleCreate = async () => {
    if (!repo || !title || !content) return;

    setSubmitting(true);
    try {
      if (editingId) {
        const updateEffect = repo.update({
          id: editingId as Schema.Schema.Type<typeof PostId>,
          title,
          content,
          updatedAt: undefined
        });
        await Effect.runPromise(updateEffect as any);
        setEditingId(null);
      } else {
        const createEffect = repo.insert({
          title,
          content,
          createdAt: undefined,
          updatedAt: undefined
        });
        await Effect.runPromise(createEffect);
      }
      setTitle('');
      setContent('');
    } catch (err) {
      console.error('Failed to save post:', err);
      setError('Failed to save post');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (post: Post) => {
    setEditingId(post.id);
    setTitle(post.title);
    setContent(post.content);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
  };

  const handleDelete = async (id: string) => {
    if (!repo) return;

    try {
      const deleteEffect = repo.delete(id as Schema.Schema.Type<typeof PostId>);
      await Effect.runPromise(deleteEffect as any);
    } catch (err) {
      console.error('Failed to delete post:', err);
      setError('Failed to delete post');
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Firestore CRUD</h2>
        <p className="text-gray-600">
          Manage posts using the shared Effect repository and Firestore
        </p>
      </header>

      {/* Create Post Form */}
      <Card>
        <CardHeader>
          {editingId ? 'Edit Post' : 'Create New Post'}
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Post Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextArea
            placeholder="Post Content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={submitting}
              >
                Cancel
              </Button>
            )}
            <Button
              onClick={handleCreate}
              isLoading={submitting}
              disabled={!title || !content || !repo}
            >
              {editingId ? 'Update Post' : 'Create Post'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Posts List */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900">Recent Posts</h3>
        
        {loading ? (
          <div className="flex justify-center p-8">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <EmptyState message={error} />
        ) : posts.length === 0 ? (
          <EmptyState message="No posts found. Create one above!" />
        ) : (
          posts.map((post) => (
            <Card key={post.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-lg font-bold text-gray-900">
                    {post.title}
                  </h4>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEdit(post)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(post.id)}
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
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      • {new Date((post.createdAt as any).seconds * 1000).toLocaleString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
