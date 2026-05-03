module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'prettier'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [
    '.eslintrc.js',
    'commitlint.config.js',
    '.lintstagedrc.js',
    'dist/',
    'node_modules/',
    'coverage/',
  ],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',       // Allow _unused params
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        'ignoreRestSiblings': true,
        'vars': 'all',
        'args': 'after-used'
      },
    ],
    'no-console': [
      'warn',
      {
        allow: ['warn', 'error'],     // Allow console.warn and console.error
      },
    ],
    'prettier/prettier': [
      'error',
      {
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 80,
        tabWidth: 2,
        semi: true,
        endOfLine: 'lf',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'scripts/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', {
                'varsIgnorePattern': '^_',
                'argsIgnorePattern': '^_',
                'ignoreRestSiblings': true,
                'vars': 'all',
                'args': 'none'
            }],
      },
    },
  ],
};
