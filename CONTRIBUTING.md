# Contributing to lnurl-auth

All contributions are welcome — code, docs, bug reports, and feature
requests.

## Issues

Found a bug or have an idea? [Open an issue](https://github.com/dyegolara/lnurl-auth-agents/issues).
Please include:

- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (Node.js version, OS)

## Pull requests

1. Fork the repository
2. Create a feature branch: `git checkout -b your-feature`
3. Make your changes
4. Ensure tests pass: `npm test`
5. Commit with a clear message
6. Push and open a pull request against `main`

All PRs run CI automatically. Keep changes focused — one feature or fix per
pull request makes review easier.

## Code style

- JavaScript (Node.js v18+)
- 2-space indentation (no tabs)
- Follow existing patterns in `lib/`, `test/`, and the main script

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run a specific test suite
node selftest.js
node test/unit.js
```