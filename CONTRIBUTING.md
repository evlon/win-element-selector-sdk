# Contributing to Element Selector SDK

Thank you for your interest in contributing! Here are some guidelines.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/element-selector/element-selector-sdk.git
cd element-selector-sdk

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Code Style

- Use TypeScript strict mode
- Follow ESLint rules
- Write JSDoc comments for public APIs
- Add tests for new features

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test
npm test -- tests/element.test.ts
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new APIs
- Update API reference docs if needed

## Questions?

Feel free to open an issue or discussion!
