import type { Config } from 'jest';
import path from 'path';

const config: Config = {
  rootDir: __dirname.replaceAll('\\', '/'),
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: path.join(__dirname, 'tsconfig.test.json'),
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testRegex: 'src[/\\\\]__tests__[/\\\\].*[.]test[.]ts$',
  modulePathIgnorePatterns: ['[/\\\\]\\.next[/\\\\]'],
};

export default config;
