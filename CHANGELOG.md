# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-06-15

### Added
- **图像族 API**：`findImage` / `findAllImages` / `findFirstImage` / `existsImage` / `waitForImage` / `waitUntilImageGone` / `clickImage`（窗口区域默认）
- **全屏族 API**：`findImageOnDesktop` / `clickImageOnDesktop` / `waitForImageOnDesktop`
- **滚动找图**：`scrollToImage`（双线程：滚动+匹配并行）
- **可视化调试**：`captureMatchVisualization`（截图+红框标注→base64 PNG）
- **统一入口**：`findElement(xpath)` 通过 `:all` / `:onlyone` 标记分派
- **图像加速**：`accel` 选项支持 `click` / `waitFor` / `exists` / `scrollToVisible` 等全部操作函数
- **ClickArea**：`clickImage` 支持 Inset 模型（`{ left: '20%', right: '20%' }`）
- **meta.json**：模板 DPI 自适应，`resolveTemplate` 返回 `ResolvedTemplate`（base64 + meta）
- **命中位置缓存**：`findImage` 的 `usePositionCache` opt-in

### Changed
- `exists(xpath)` 签名变更：`exists(xpath, timeout?)` → `exists(xpath, options?)`
- `resolveTemplate` 返回类型从 `string` 改为 `ResolvedTemplate`
- `ImageMatch` 新增 `width` / `height` 字段

### Refactored
- 三层架构分离：`findElement*`（纯 UIA）→ `findImage*`（纯图像）→ 入口路由层
- `findOne`/`findFirst` 按 accel + 模板存在性分派，不再递归
- `findImageOne` 不回退 UIA（更高效），首次调用自动截图缓存模板
- `findElement(xpath)` 标记路由（`:all`/`:onlyone`/`:first`）委托到 `findElementAll`/`findElementOne`/`findElementFirst`

## [0.2.1] - 2026-05-27

### Fixed
- `scrollIntoView` 修复：使用 `buildXpathFromProps()` 生成唯一 wait XPath（替代 `listSelector`）
- `scrollIntoView` 修复：传递 `windowSelector` 给 `scrollMouse`，避免遍历所有系统窗口
- `scrollMouse` 添加 `window` 参数，传递给后端 `/api/mouse/scroll`
- `buildXpathFromProps` 添加 `parseExistingAttrs()` 去重，避免生成重复谓词（如 `@FrameworkId='Chrome'` 出现两次）

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
