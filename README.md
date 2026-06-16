# Element Selector SDK

[![npm version](https://badge.fury.io/js/element-selector-sdk-nodejs.svg)](https://www.npmjs.com/package/element-selector-sdk-nodejs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

Enterprise-grade UI Automation SDK for Windows with imperative API and full TypeScript support.

## Features

- ✅ **Imperative API** - Full control flow support (if/else, while, try/catch)
- ✅ **Type Safety** - Complete TypeScript definitions
- ✅ **Element as First-Class** - Reusable element references
- ✅ **Flexible Error Handling** - Try/catch instead of auto-exit
- ✅ **Humanized Automation** - Bezier curves, random delays
- ✅ **XPath Support** - Powerful element querying
- ✅ **Image Matching** - Template-based image finding with DPI auto-adaptation
- ✅ **Unified Entry** - `findElement()` with `:all` / `:onlyone` markers
- ✅ **Image Acceleration** - `accel` option for faster repeated element finding

## Installation

```bash
npm install @element-selector-sdk-nodejs
```

## Quick Start

```typescript
import { SDK } from '@element-selector-sdk-nodejs';

async function main() {
  const sdk = new SDK({ baseUrl: 'http://localhost:8080' });
  const flow = sdk.flow();
  
  // Activate window
  await flow.window({ title: 'Notepad' });
  
  // Find and click button
  const button = await flow.find('//Button[@Name="Save"]');
  if (await button.isEnabled()) {
    await button.click();
  }
  
  // Type text
  const input = await flow.find('//Edit');
  await input.type('Hello, World!', { humanize: true });
}

main().catch(console.error);
```

## Image Finding

```typescript
// Find image in current window (requires flow.window() first)
const matches = await flow.findImage('./images/btn.png');
console.log(`Found at (${matches[0].x}, ${matches[0].y})`);

// Click image
await flow.clickImage('./images/btn.png', { clickArea: { left: '20%', right: '20%' } });

// Scroll to find image
await flow.scrollToImage('./images/scroll-target.png', { scrollContainer: '//Document' });
```

## Image Acceleration (accel)

Use `accel` to cache element images for faster repeated finding:

```typescript
// First call: UIA find + capture element image
// Subsequent calls: findImage (much faster)
await flow.click('//Button', { accel: true });
await flow.waitFor('//Text', { accel: true, timeout: 5000 });
await flow.exists('//Button', { accel: true });
```

## Unified findElement Entry

```typescript
// Default: findFirst
await flow.findElement('//Button');

// :onlyone = findOne (error if multiple)
await flow.findElement('//Button:onlyone');

// :all = findAll
await flow.findElement('//Button:all');
```

## Element Methods

| Primary | Alias | Description |
|---------|-------|-------------|
| `text()` | `getText()` | 元素文本 |
| `bounds()` | `getRect()`, `boundingBox()` | 位置和尺寸 |
| `attr(name)` | `getAttribute(name)` | 元素属性 |
| `parent()` | `parentElement()` | 父元素 |
| `next()` | `nextSiblingElement()` | 下一个兄弟元素 |
| `prev()` | `previousSiblingElement()` | 上一个兄弟元素 |
| `dblclick()` | `doubleClick()` | 双击 |
| `find(xpath)` | `locator(xpath)` | 子元素查找 |
| `findAll(xpath)` | — | 所有子元素 |
| `scrollIntoView()` | — | 滚动到元素可见（支持 autoDelta） |

### scrollIntoView

将屏幕外元素滚动到可视区域：

```typescript
const el = await flow.find('//Button[@Name="底部按钮"]');
await el.scrollIntoView({ delta: -120, times: 10 });
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `delta` | number | -120 | 滚动量（负=向下，正=向上） |
| `times` | number | 10 | 最大滚动次数 |
| `autoDelta` | boolean | true | 根据容器高度自动计算滚动量 |
| `deltaFactor` | number | 0.8 | autoDelta 乘数因子 |
| `timeout` | number | 10000 | 超时毫秒 |
| `propNames` | string[] | — | 用于生成唯一 wait XPath 的属性名 |

## Documentation

- 📖 [Migration Guide](docs/MIGRATION_GUIDE.md) - Detailed migration instructions from v1.x
- 📖 [Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md) - Technical implementation details
- 📖 [Examples](examples/README.md) - Complete working examples

## Examples

Check out the [examples directory](examples/) for complete working examples:

```bash
# Quick start
npm run example:quick

# Advanced usage
npm run example:advanced

# Full demo
npm run example:full
```

## Requirements

- Node.js >= 18.0.0
- element-selector-server running on localhost:8080

## License

MIT © Element Selector Team
