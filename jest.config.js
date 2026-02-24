/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  // No transform — run native ES modules via --experimental-vm-modules
  transform: {},
  testMatch: ['**/__tests__/**/*.test.js'],
  // Collect coverage from source files
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/lib/firebase.admin.js', // external SDK wrapper — not unit-testable
  ],
  coverageReporters: ['text', 'lcov'],
};
