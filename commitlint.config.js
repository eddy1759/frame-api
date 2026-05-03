module.exports = {
  extends: ['@commitlint/config-conventional'],

  /*
   * Custom rules for Frame App
   * Rule format: [level, applicable, value]
   *   level: 0 = disable, 1 = warning, 2 = error
   *   applicable: 'always' | 'never'
   */
  rules: {
    // ── Type Rules ──
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'refactor', // Refactoring
        'test', // Tests
        'docs', // Documentation
        'chore', // Maintenance
        'style', // Formatting
        'perf', // Performance
        'ci', // CI/CD
        'build', // Build system
        'revert', // Revert commit
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    // ── Scope Rules ──
    'scope-enum': [
      2,
      'always',
      [
        'auth', // Authentication module
        'config', // Configuration
        'redis', // Redis module
        'health', // Health checks
        'database', // Migrations, seeds
        'common', // Shared utilities
        'deps', // Dependencies
        'release', // Releases
        'docs', // Documentation
        'ci', // CI/CD
        'frame', // Core framework changes
        'image', // Image processing
        'album', // Album management
        "ai", // AI features
      ],
    ],
    'scope-case': [2, 'always', 'lower-case'],
    'scope-empty': [2, 'never'], // Scope is REQUIRED

    // ── Subject Rules ──
    'subject-case': [2, 'always', 'lower-case'],
    'subject-empty': [2, 'never'],
    'subject-full-stop': [2, 'never', '.'],
    'subject-max-length': [2, 'always', 72],
    'subject-min-length': [2, 'always', 10],

    // ── Header Rules ──
    'header-max-length': [2, 'always', 100],

    // ── Body Rules ──
    'body-leading-blank': [2, 'always'], // Blank line between subject and body
    'body-max-line-length': [2, 'always', 100],

    // ── Footer Rules ──
    'footer-leading-blank': [2, 'always'], // Blank line before footer
    'footer-max-line-length': [2, 'always', 100],
  },

  /*
   * Custom help message displayed on validation failure
   */
  helpUrl:
    'https://github.com/your-org/frame-api/blob/main/docs/COMMIT_CONVENTION.md',
};
