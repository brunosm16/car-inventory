export default {
  extends: ['@commitlint/config-conventional'],
  helpUrl:
    'https://github.com/conventional-changelog/commitlint/#what-is-commitlint',
  rules: {
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    'header-max-length': [2, 'always', 100],
    'subject-case': [
      2,
      'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
    ],
  },
};
