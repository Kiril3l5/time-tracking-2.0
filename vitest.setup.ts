
// Vitest setup file
import '@testing-library/jest-dom';

// Add custom matchers for Firebase rules testing
expect.extend({
  async toAllow(received) {
    try {
      await received;
      return {
        message: () => 'Expected operation to be denied, but it was allowed',
        pass: true,
      };
    } catch (err) {
      return {
        message: () => `Expected operation to be allowed, but it was denied with: ${err}`,
        pass: false,
      };
    }
  },
  async toDeny(received) {
    try {
      await received;
      return {
        message: () => 'Expected operation to be denied, but it was allowed',
        pass: false,
      };
    } catch (err) {
      return {
        message: () => `Expected operation to be denied and it was denied with: ${err}`,
        pass: true,
      };
    }
  },
});
