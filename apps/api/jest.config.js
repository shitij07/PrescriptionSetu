/**
 * Jest configuration for the PrescriptionSetu API (D-026: npm, no workspaces).
 *
 * ts-jest 29 consumes the TypeScript compiler API via `require('typescript')`, so the
 * TypeScript major is pinned below 7 in package.json. The single `tsconfig.json` is shared
 * with `npm run typecheck`, so the test transform and the typecheck cannot disagree about
 * what compiles.
 *
 * @type {import('ts-jest').JestConfigWithTsJest}
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
};
