# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-05-15

### Added
- Imperative API with Element and Flow classes
- Full TypeScript control flow support (if/else, while, try/catch)
- Element as first-class citizen
- Flexible error handling with try/catch
- Comprehensive type definitions
- Structured logging with pino
- Migration guide from chain API

### Changed
- **BREAKING**: Removed chain API (`sdk.flow().find().click().run()`)
- **BREAKING**: All methods are now async/await
- **BREAKING**: find() returns Element object instead of chaining

### Removed
- Chain class and all chain-based methods
- Auto-exit on error (process.exit)
- Implicit state management

### Migration
See [MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md) for detailed migration instructions.

## [1.0.0] - 2026-04-XX

Initial release with chain-based API.
