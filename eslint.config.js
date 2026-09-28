import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const ignoreFiles = ['.gitignore', '.git/info/exclude']
  .map((file) => fileURLToPath(new URL(file, import.meta.url)))
  .filter((path) => existsSync(path))
  .map((path) => includeIgnoreFile(path));

export default tseslint.config(
  ...ignoreFiles,
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/web/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.js', '*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['packages/sim/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['Math', 'Date', 'performance', 'crypto'].map((name) => ({
          name,
          message: 'The simulation must be deterministic: use fixed-point helpers and ticks.',
        })),
      ],
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
