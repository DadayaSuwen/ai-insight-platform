module.exports = {
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        diagnostics: {
          ignoreCodes: ['TS151002'],
        },
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/main.ts',
    '!**/*.module.ts',
    '!**/*.controller.ts',
  ],
  coverageDirectory: '../coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/packages/types/'],
  // Controllers are thin routing layers; service (the real logic) is fully covered.
  coverageReporters: ['text', 'lcov'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@workspace/types$': '<rootDir>/../../../packages/types/src/index.ts',
  },
};
