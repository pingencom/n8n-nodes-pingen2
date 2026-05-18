/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'nodes/**/*.ts',
    'credentials/**/*.ts',
    'utils/**/*.ts',
    'services/**/*.ts',
    'types/**/*.ts',
    'errors/**/*.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 99,
      branches: 97,
      functions: 100,
      lines: 99,
    },
  },
};
