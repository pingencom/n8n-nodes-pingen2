module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'n8n-nodes-base'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:n8n-nodes-base/community',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    curly: ['error', 'all'],
    '@typescript-eslint/no-floating-promises': 'error',
  },
  overrides: [
    {
      files: ['credentials/**/*.ts'],
      extends: ['plugin:n8n-nodes-base/credentials'],
      rules: {
        // The plugin's autofixer mangles our HTTPS documentationUrl into camelCase.
        // The rule conflicts with `cred-class-field-documentation-url-not-http-url`.
        'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
      },
    },
    {
      files: ['nodes/**/*.ts'],
      extends: ['plugin:n8n-nodes-base/nodes'],
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'gulpfile.js', 'test/', 'coverage/'],
};
