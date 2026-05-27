# 示例代码索引

本目录包含 Element Selector SDK v2.0 命令式 API 的示例代码。

## 快速开始

### 0. 简单示例 - 00-simple-notepad.ts ⭐ 推荐新手

**运行方式**：
```bash
npm run example:simple
```

**展示内容**：
- ✅ SDK 初始化
- ✅ 窗口激活（使用记事本）
- ✅ 元素查找
- ✅ 文本输入
- ✅ 读取文本

**适合人群**：第一次使用 SDK 的用户，需要先打开记事本

**前置条件**：先打开一个 Windows 记事本窗口

---

### 1. 基础示例 - 01-quick-start.ts

**运行方式**：
```bash
npm run example:quick
```

**展示内容**：
- ✅ SDK 初始化
- ✅ 窗口激活
- ✅ 元素查找
- ✅ 点击操作
- ✅ 文本输入

**适合人群**：第一次使用 SDK 的用户

---

### 2. 高级示例 - 02-advanced-usage.ts

**运行方式**：
```bash
npm run example:advanced
```

**展示内容**：
- ✅ 条件分支（if/else）
- ✅ 循环重试（while + try/catch）
- ✅ 等待元素（waitFor）
- ✅ 多元素操作（findAll + for 循环）
- ✅ 截图功能

**适合人群**：需要编写复杂自动化脚本的用户

---

### 3. 完整示例 - test-imperative-api.ts

**运行方式**：
```bash
npm run example:imperative
```

**展示内容**：
- ✅ 完整的自动化流程
- ✅ 所有控制流特性
- ✅ 详细的日志输出
- ✅ 错误处理最佳实践

**适合人群**：想要全面了解 API 的用户

---

## 学习路径建议

### 第 1 步：阅读文档
1. 阅读 `README.md` 了解 SDK 概述
2. 阅读 `MIGRATION_GUIDE.md` 了解 API 变化

### 第 2 步：运行示例
1. 先运行 `01-quick-start.ts` 体验基础用法
2. 再运行 `02-advanced-usage.ts` 学习高级功能
3. 最后查看 `test-imperative-api.ts` 了解完整用法

### 第 3 步：编写自己的脚本
1. 复制一个示例作为模板
2. 修改 XPath 和目标应用
3. 添加业务逻辑
4. 运行测试

---

## 常用代码片段

### 基础操作
```typescript
const sdk = new SDK();
const flow = sdk.flow();

await flow.window({ title: 'App' });
const button = await flow.find('//Button');
await button.click();
```

### 条件分支
```typescript
const button = await flow.find('//Button');
if (await button.isEnabled()) {
    await button.click();
}
```

### 循环重试
```typescript
let retry = 0;
while (retry < 3) {
    try {
        const element = await flow.find('//Element');
        await element.click();
        break;
    } catch (e) {
        retry++;
        await flow.wait(1000);
    }
}
```

### 等待元素
```typescript
const element = await flow.waitFor('//Loading', { timeout: 5000 });
await element.waitUntilGone({ timeout: 10000 });
```

---

## 常见问题

### Q: 如何修改示例中的目标应用？

A: 修改 `flow.window()` 的参数：
```typescript
await flow.window({ 
    title: '你的应用标题', 
    className: '窗口类名',
    processName: '进程名' 
});
```

### Q: 如何获取元素的 XPath？

A: 使用 element-selector GUI 工具或查看后端日志。

### Q: 示例运行失败怎么办？

A: 
1. 确保后端服务正在运行（`cargo run --bin element-selector-server`）
2. 确保目标应用程序已打开
3. 检查 XPath 是否正确
4. 查看详细错误信息

---

## 下一步

- 📖 阅读 [MIGRATION_GUIDE.md](../docs/MIGRATION_GUIDE.md) - 详细的 API 文档
- 📖 阅读 [ELEMENT_XPATH.md](../docs/ELEMENT_XPATH.md) - Element.xpath 双重类型指南
- 📖 阅读 [IMPLEMENTATION_SUMMARY.md](../docs/IMPLEMENTATION_SUMMARY.md) - 实施总结
- 💬 提交 Issue 到 GitHub - 遇到问题时寻求帮助
