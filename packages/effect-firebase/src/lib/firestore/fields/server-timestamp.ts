import { ServerTimestamp } from '../schema/timestamp.js';

/**
 * Write the server's timestamp to a timestamp field.
 * Use `WithServerTimestamp` to add support to a field's
 * `insert`/`update` variants.
 */
export const serverTimestamp = () => new ServerTimestamp();
