import type { Config } from 'jest';
import path from 'path';

const config: Config = {
  rootDir: __dirname,
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: path.join(__dirname, 'tsconfig.test.json'),
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.next'],
};

export default config;
