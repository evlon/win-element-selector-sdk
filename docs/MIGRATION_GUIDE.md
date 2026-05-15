# 迁移指南：从链式 API 到命令式 API

## 概述

Element Selector SDK v2.0 引入了全新的命令式 API，取代了原有的链式调用 API。新 API 支持完整的 TypeScript 控制流，让您能够编写更复杂、更灵活的自动化脚本。

## 为什么迁移？

### 链式 API 的局限性

```typescript
// 旧版链式 API - 无法使用条件分支和循环
sdk.flow()
    .window({ title: 'App' })
    .find('//Button')
    .click()
    .find('//Input')
    .type('text')
    .run();
```

**问题**：
- ❌ 无法使用 `if/else` 条件分支
- ❌ 无法使用 `while/for` 循环
- ❌ 无法根据运行时状态动态决策
- ❌ 错误处理不灵活（自动退出）

### 命令式 API 的优势

```typescript
// 新版命令式 API - 完整的编程能力
const flow = sdk.flow();
await flow.window({ title: 'App' });

const button = await flow.find('//Button');
if (await button.isEnabled()) {
    await button.click();
}

let retry = 0;
while (retry < 3) {
    try {
        const input = await flow.find('//Input');
        await input.type('text');
        break;
    } catch (e) {
        retry++;
        await flow.wait(1000);
    }
}
```

**优势**：
- ✅ 完整的 TypeScript 控制流
- ✅ 灵活的错误处理
- ✅ 可复用元素引用
- ✅ 更符合开发者习惯

---

## 核心变化

### 1. API 入口变化

**之前**：
```typescript
sdk.flow()
    .window(...)
    .find(...)
    .click()
    .run();
```

**之后**：
```typescript
const flow = sdk.flow();
await flow.window(...);
const element = await flow.find(...);
await element.click();
```

**关键区别**：
- 不再需要 `.run()`
- 所有方法都是 `async`，需要 `await`
- `find()` 返回 `Element` 对象

### 2. 元素操作变化

**之前**：
```typescript
sdk.flow()
    .find('//Button')
    .click();  // click 作用于最近一次 find 的元素
```

**之后**：
```typescript
const button = await flow.find('//Button');
await button.click();  // click 作用于 button 对象
```

**关键区别**：
- 元素是一等公民
- 操作明确绑定到 Element 对象
- 可以复用元素引用

### 3. 错误处理变化

**之前**：
```typescript
// 自动截图并退出进程
sdk.flow()
    .find('//Button')
    .click()
    .run();  // 失败时 process.exit(1)
```

**之后**：
```typescript
try {
    const button = await flow.find('//Button');
    await button.click();
} catch (error) {
    if (error instanceof ElementNotFoundError) {
        console.error('元素未找到');
    }
    // 由开发者决定如何处理
}
```

**关键区别**：
- 通过 try/catch 处理异常
- 不会自动退出进程
- 更灵活的错误恢复策略

---

## 迁移示例

### 示例 1：基础操作

**之前**：
```typescript
await sdk.flow()
    .window({ title: '微信' })
    .find("//Edit[@Name='输入']")
    .click()
    .type("你好")
    .run();
```

**之后**：
```typescript
const flow = sdk.flow();
await flow.window({ title: '微信' });

const input = await flow.find("//Edit[@Name='输入']");
await input.click();
await input.type("你好");
```

### 示例 2：条件分支

**之前**：
```typescript
// 无法实现条件分支
sdk.flow()
    .window({ title: 'App' })
    .find('//Button')
    .click()  // 无论按钮是否可用都会点击
    .run();
```

**之后**：
```typescript
const flow = sdk.flow();
await flow.window({ title: 'App' });

const button = await flow.find('//Button');
if (await button.isEnabled()) {
    await button.click();
    console.log('按钮已点击');
} else {
    console.log('按钮不可用，跳过');
}
```

### 示例 3：循环重试

**之前**：
```typescript
// 无法实现循环重试
sdk.flow()
    .retry(3, 1000)  // SDK 内部提供的有限重试
    .window({ title: 'App' })
    .find('//DynamicElement')
    .click()
    .run();
```

**之后**：
```typescript
const flow = sdk.flow();
await flow.window({ title: 'App' });

let retryCount = 0;
const maxRetries = 3;

while (retryCount < maxRetries) {
    try {
        const element = await flow.find('//DynamicElement');
        await element.click();
        console.log(`成功（尝试 ${retryCount + 1} 次）`);
        break;
    } catch (e) {
        retryCount++;
        console.log(`失败，重试 ${retryCount}/${maxRetries}`);
        if (retryCount >= maxRetries) {
            throw e;
        }
        await flow.wait(1000);
    }
}
```

### 示例 4：等待元素

**之前**：
```typescript
await sdk.flow()
    .window({ title: 'App' })
    .waitFor('//Loading', { timeout: 5000 })
    .waitUntilGone('//Loading')
    .find('//Content')
    .click()
    .run();
```

**之后**：
```typescript
const flow = sdk.flow();
await flow.window({ title: 'App' });

// 等待加载动画出现
await flow.waitFor('//Loading', { timeout: 5000 });

// 等待加载动画消失
await flow.waitUntilGone('//Loading', { timeout: 10000 });

// 点击内容
const content = await flow.find('//Content');
await content.click();
```

### 示例 5：数据提取

**之前**：
```typescript
const items = await sdk.flow()
    .window({ title: 'App' })
    .findAll("//ListItem");

const texts = await sdk.flow()
    .window({ title: 'App' })
    .extractList("//ListItem");
```

**之后**：
```typescript
const flow = sdk.flow();
await flow.window({ title: 'App' });

const items = await flow.findAll("//ListItem");

// 遍历元素提取文本
const texts = [];
for (const item of items) {
    const text = await item.getText();
    texts.push(text);
}

console.log('提取的文本:', texts);
```

---

## API 对照表

| 功能 | 链式 API | 命令式 API |
|------|---------|-----------|
| 创建流程 | `sdk.flow()` | `sdk.flow()` |
| 激活窗口 | `.window(selector)` | `await flow.window(selector)` |
| 查找元素 | `.find(xpath)` | `await flow.find(xpath)` |
| 点击 | `.click()` | `await element.click()` |
| 输入 | `.type(text)` | `await element.type(text)` |
| 等待 | `.wait(ms)` | `await flow.wait(ms)` |
| 条件等待 | `.waitFor(xpath)` | `await flow.waitFor(xpath)` |
| 截图 | `.screenshot(path)` | `await flow.screenshot(path)` |
| 执行 | `.run()` | 不需要 |

---

## 常见陷阱

### 陷阱 1：忘记 await

**错误**：
```typescript
const button = flow.find('//Button');  // 缺少 await
button.click();  // 错误：button 是 Promise
```

**正确**：
```typescript
const button = await flow.find('//Button');
await button.click();
```

### 陷阱 2：在循环中重复查找

**低效**：
```typescript
for (let i = 0; i < 10; i++) {
    const button = await flow.find('//Button');  // 每次都重新查找
    await button.click();
}
```

**高效**：
```typescript
const button = await flow.find('//Button');  // 查找一次
for (let i = 0; i < 10; i++) {
    await button.click();  // 复用元素引用
}
```

### 陷阱 3：忽略错误处理

**不安全**：
```typescript
const button = await flow.find('//Button');
await button.click();  // 如果失败会抛出异常
```

**安全**：
```typescript
try {
    const button = await flow.find('//Button');
    await button.click();
} catch (error) {
    console.error('操作失败:', error.message);
    // 决定如何处理：重试、跳过、还是终止
}
```

---

## 最佳实践

### 1. 使用 async/await 包装函数

```typescript
async function automateApp() {
    const sdk = new SDK();
    const flow = sdk.flow();
    
    await flow.window({ title: 'App' });
    // ... 自动化逻辑
}

automateApp().catch(console.error);
```

### 2. 封装常用操作

```typescript
async function clickWithRetry(flow: Flow, xpath: string, maxRetries = 3) {
    let retry = 0;
    while (retry < maxRetries) {
        try {
            const element = await flow.find(xpath);
            await element.click();
            return;
        } catch (e) {
            retry++;
            if (retry >= maxRetries) throw e;
            await flow.wait(1000);
        }
    }
}

// 使用
await clickWithRetry(flow, '//Button', 3);
```

### 3. 使用类型守卫

```typescript
import { ElementNotFoundError } from 'element-selector-sdk';

try {
    const button = await flow.find('//Button');
    await button.click();
} catch (error) {
    if (error instanceof ElementNotFoundError) {
        // 特定处理
        console.error('元素不存在');
    } else if (error instanceof Error) {
        // 通用处理
        console.error('其他错误:', error.message);
    }
}
```

### 4. 日志记录

```typescript
import { createLogger } from 'element-selector-sdk';

const logger = createLogger('Automation');

async function automateApp() {
    logger.info('开始自动化');
    
    try {
        const flow = sdk.flow();
        await flow.window({ title: 'App' });
        logger.info('窗口已激活');
        
        const button = await flow.find('//Button');
        await button.click();
        logger.info('按钮已点击');
    } catch (error) {
        logger.error('自动化失败', { error: error.message });
        throw error;
    }
}
```

---

## 升级步骤

1. **更新依赖**
   ```bash
   npm install element-selector-sdk@latest
   ```

2. **更新导入**
   ```typescript
   // 之前
   import { SDK } from 'element-selector-sdk';
   
   // 之后（相同，无需更改）
   import { SDK, Element, Flow } from 'element-selector-sdk';
   ```

3. **重写自动化脚本**
   - 将链式调用改为 async/await
   - 使用 Element 对象进行操作
   - 添加 try/catch 错误处理

4. **测试验证**
   ```bash
   npx ts-node examples/test-imperative-api.ts
   ```

5. **逐步迁移**
   - 先迁移简单的脚本
   - 再迁移复杂的流程
   - 保留旧版本代码作为参考

---

## 常见问题

### Q: 我必须立即迁移吗？

A: 不需要。v1.x 版本会继续维护一段时间，但建议尽快迁移以享受新 API 的强大功能。

### Q: 迁移需要多长时间？

A: 取决于脚本复杂度：
- 简单脚本（< 50 行）：30 分钟
- 中等脚本（50-200 行）：2-4 小时
- 复杂脚本（> 200 行）：1-2 天

### Q: 有自动迁移工具吗？

A: 目前没有。由于两种 API 差异较大，建议手动重写以确保代码质量。

### Q: 遇到问题怎么办？

A: 
1. 查看本文档的示例
2. 参考 `examples/test-imperative-api.ts`
3. 查阅 API 文档
4. 提交 Issue 到 GitHub

---

## 总结

命令式 API 带来了：
- ✅ 完整的编程能力
- ✅ 更好的错误处理
- ✅ 更清晰的代码结构
- ✅ 更强的灵活性

虽然迁移需要一些工作量，但长期来看会显著提升自动化脚本的可维护性和可靠性。

**立即开始迁移，体验企业级 UI 自动化的强大功能！**
