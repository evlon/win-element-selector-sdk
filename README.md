# Element Selector SDK

[![npm version](https://badge.fury.io/js/@element-selector%2Fsdk.svg)](https://badge.fury.io/js/@element-selector%2Fsdk)
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
- ✅ **Logging & Debugging** - Structured logging with pino

## Installation

```bash
npm install @element-selector/sdk
```

## Quick Start

```typescript
import { SDK } from '@element-selector/sdk';

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
