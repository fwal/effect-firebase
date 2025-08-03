import { onCall } from 'firebase-functions/v2/https';

export const setTaskState = onCall(() => {
  return { message: 'Hello, world!' };
})
