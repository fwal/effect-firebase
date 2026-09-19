import { vi } from 'vitest';
import { describe, expect, it, beforeEach } from '@effect/vitest';
import { Effect } from 'effect';
import { FirestoreService } from 'effect-firebase';
import type { App as FirebaseAdminApp } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('firebase-admin/app', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-admin/app')>();
  return {
    ...actual,
    getApp: vi.fn(),
    getApps: vi.fn(),
    initializeApp: vi.fn(),
  };
});

vi.mock('firebase-admin/firestore', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('firebase-admin/firestore')>();
  return {
    ...actual,
    getFirestore: vi.fn(),
  };
});

import { layer } from './admin.js';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = (name: string, projectId: string): FirebaseAdminApp =>
  ({ name, options: { projectId } }) as unknown as FirebaseAdminApp;

const fakeDb = (): Firestore => ({}) as unknown as Firestore;

const build = (l: ReturnType<typeof layer>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* FirestoreService;
    }).pipe(Effect.provide(l)),
  );

describe('Admin.layer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getFirestore).mockReturnValue(fakeDb());
  });

  describe('app resolution', () => {
    it('uses the explicitly provided app and never consults getApp/initializeApp', async () => {
      const explicit = app('[DEFAULT]', 'EXPLICIT');

      await build(layer({ app: explicit }));

      expect(vi.mocked(getFirestore)).toHaveBeenCalledWith(explicit);
      expect(vi.mocked(getApp)).not.toHaveBeenCalled();
      expect(vi.mocked(getApps)).not.toHaveBeenCalled();
      expect(vi.mocked(initializeApp)).not.toHaveBeenCalled();
    });

    it('binds the [DEFAULT] app (getApp()), not the first-registered named app, when no app is provided', async () => {
      const namedFirst = app('namedFirst', 'NAMED-FIRST');
      const defaultApp = app('[DEFAULT]', 'DEFAULT');
      vi.mocked(getApp).mockReturnValue(defaultApp);
      vi.mocked(getApps).mockReturnValue([namedFirst, defaultApp]);

      await build(layer());

      expect(vi.mocked(getFirestore)).toHaveBeenCalledWith(defaultApp);
      expect(vi.mocked(getFirestore)).not.toHaveBeenCalledWith(namedFirst);
      expect(vi.mocked(getApp)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(initializeApp)).not.toHaveBeenCalled();
    });

    it('initializes a fresh default app when no default exists, even if named apps are present', async () => {
      const namedOnly = app('onlyNamed', 'NAMED-ONLY');
      const freshDefault = app('[DEFAULT]', 'FRESH');
      vi.mocked(getApp).mockImplementation(() => {
        throw new Error('no default app');
      });
      vi.mocked(getApps).mockReturnValue([namedOnly]);
      vi.mocked(initializeApp).mockReturnValue(freshDefault);

      await build(layer());

      expect(vi.mocked(initializeApp)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(getFirestore)).toHaveBeenCalledWith(freshDefault);
      expect(vi.mocked(getFirestore)).not.toHaveBeenCalledWith(namedOnly);
    });

    it('initializes a fresh default app when no apps exist at all', async () => {
      const freshDefault = app('[DEFAULT]', 'FRESH');
      vi.mocked(getApp).mockImplementation(() => {
        throw new Error('no app');
      });
      vi.mocked(getApps).mockReturnValue([]);
      vi.mocked(initializeApp).mockReturnValue(freshDefault);

      await build(layer());

      expect(vi.mocked(initializeApp)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(getFirestore)).toHaveBeenCalledWith(freshDefault);
    });
  });

  describe('firestore option', () => {
    it('uses the provided firestore directly and skips app resolution entirely', async () => {
      await build(layer({ firestore: fakeDb() }));

      expect(vi.mocked(getFirestore)).not.toHaveBeenCalled();
      expect(vi.mocked(getApp)).not.toHaveBeenCalled();
      expect(vi.mocked(getApps)).not.toHaveBeenCalled();
      expect(vi.mocked(initializeApp)).not.toHaveBeenCalled();
    });
  });

  describe('invalid options', () => {
    it('throws when both app and firestore are provided', () => {
      expect(() =>
        layer({ app: app('[DEFAULT]', 'X'), firestore: fakeDb() }),
      ).toThrow(/pass either \{ app \} or \{ firestore \}, not both/);
    });
  });
});
