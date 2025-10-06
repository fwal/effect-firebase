import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {},
  },
  {
    files: ['*.json'],
    languageOptions: {
      parser: jsoncEslintParser,
    },
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: ['{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}'],
          ignoredDependencies: ['@effect-firebase/core'],
        },
      ],
    },
  },
];
