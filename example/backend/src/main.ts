import { initializeApp } from 'firebase-admin/app';
initializeApp();

export * from './lib/on-request.js';
export * from './lib/on-call.js';
export * from './lib/on-post-updated.js';
