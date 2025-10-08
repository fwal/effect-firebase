import { MockTimestamp } from './timestamp.js';

describe('MockTimestamp', () => {
  it('should be able to create a timestamp', () => {
    const timestamp = MockTimestamp.now();
    expect(timestamp).toBeDefined();
  });
});
