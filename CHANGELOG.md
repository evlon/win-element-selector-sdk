# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-27

### Added
- Short method aliases: `text()`, `bounds()`, `attr()`, `parent()`, `next()`, `prev()`, `dblclick()`

### Changed
- **BREAKING**: `HttpClient.getElement()` → `find()`, `getAllElements()` → `findAll()`
- **BREAKING**: `Element.text()` is now the primary method (`getText()` is an alias)
- **BREAKING**: `Element.bounds()` is now the primary method (`getRect()` / `boundingBox()` are aliases)
- **BREAKING**: `Element.attr()` is now the primary method (`getAttribute()` is an alias)
- **BREAKING**: `Element.dblclick()` is now the primary method (`doubleClick()` is an alias)
- **BREAKING**: `Element.parent()` is now the primary method (`parentElement()` is an alias)
- **BREAKING**: `Element.next()` is now the primary method (`nextSiblingElement()` is an alias)
- **BREAKING**: `Element.prev()` is now the primary method (`previousSiblingElement()` is an alias)
- Consolidated `ElementInfo` and `ElementWithSelector` into a single type
- Simplified `ElementResponse` — ElementInfo returned as nested `element` field (no more flatten)
- Removed duplicate `TypeOptions` and `MoveOptions` type declarations
- `client.findAll()` now returns `ElementInfo[]` directly (no more client-side reassembly)

### Backend Changes
- `/api/element/all` now returns `{ elementSelector, info: ElementInfo }` per element
- `/api/element` now returns nested `element: ElementInfo` (removed `#[serde(flatten)]`)

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
