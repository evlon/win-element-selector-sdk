# Idle 功能配置指南

## 概述

`flow.idle()` 功能可以在指定元素范围内模拟人类空闲时的鼠标随机移动，常用于防检测场景。

## 基本用法

```javascript
// 最简单的用法 - 使用默认配置
await flow.idle(`//Document[@AutomationId='RootWebArea']`);
```

## 配置选项

### 1. 基础配置

```javascript
await flow.idle(xpath, {
    speed: 'normal',        // 移动速度: 'slow' | 'normal' | 'fast'
    moveInterval: 800       // 移动间隔（毫秒），默认 800ms
});
```

### 2. 人工干预配置

通过 `humanIntervention` 选项控制检测到用户活动时的行为：

```javascript
await flow.idle(xpath, {
    humanIntervention: {
        enabled: true,          // 是否启用人工干预检测（默认: true）
        pauseOnMouse: true,     // 检测到鼠标移动时暂停（默认: true）
        pauseOnKeyboard: true,  // 检测到键盘输入时暂停（默认: true）
        resumeDelay: 3000       // 用户静止后多少毫秒恢复（默认: 3000）
    }
});
```

## 常见场景配置

### 场景 1: 防检测 - 持续移动不受干扰

适用于需要持续模拟人类活动的场景，即使用户操作也不中断。

```javascript
await flow.idle(xpath, {
    speed: 'normal',
    moveInterval: 800,
    humanIntervention: {
        enabled: false  // 完全禁用人工干预检测
    }
});
```

**特点**：
- ✅ 鼠标会持续移动
- ✅ 不受用户操作影响
- ⚠️ 可能与用户操作冲突

---

### 场景 2: 友好交互 - 给用户更多时间

检测到用户操作后暂停，但给用户更长的时间来完成任务。

```javascript
await flow.idle(xpath, {
    speed: 'normal',
    moveInterval: 800,
    humanIntervention: {
        enabled: true,
        pauseOnMouse: true,
        resumeDelay: 10000  // 10秒后恢复（默认是3秒）
    }
});
```

**特点**：
- ✅ 检测到用户操作会暂停
- ✅ 给用户充足时间（10秒）
- ✅ 用户完成后自动恢复

---

### 场景 3: 完全手动控制

检测到用户操作后暂停，但不自动恢复，需要手动调用 `stopIdle()`。

```javascript
await flow.idle(xpath, {
    speed: 'normal',
    moveInterval: 800,
    humanIntervention: {
        enabled: true,
        pauseOnMouse: true,
        resumeDelay: 0  // 0 = 不自动恢复
    }
});

// ... 执行其他操作 ...

// 手动停止
await flow.stopIdle();
```

**特点**：
- ✅ 完全由代码控制
- ✅ 适合复杂的自动化流程
- ⚠️ 需要记得手动停止

---

### 场景 4: 仅检测不暂停

记录用户活动但不暂停 idle 移动（用于日志或统计）。

```javascript
await flow.idle(xpath, {
    speed: 'normal',
    moveInterval: 800,
    humanIntervention: {
        enabled: true,
        pauseOnMouse: false,  // 检测到但不暂停
        pauseOnKeyboard: false
    }
});
```

**特点**：
- ✅ 持续移动
- ✅ 可以记录用户活动（后端日志）
- ⚠️ 可能与用户操作有视觉冲突

---

## 完整示例

```javascript
const { SDK } = require('element-selector-sdk-nodejs');

async function example() {
    const sdk = new SDK({
        baseUrl: 'http://localhost:8080',
        logging: { enabled: true }
    });

    const flow = sdk.flow();
    
    // 激活窗口
    await flow.window({
        title: 'My App',
        className: 'MainWindow'
    });

    // 启动 idle - 防检测模式
    await flow.idle(`//Document`, {
        speed: 'normal',
        moveInterval: 800,
        humanIntervention: {
            enabled: false  // 持续移动，不受干扰
        }
    });

    // 执行自动化任务
    const button = await flow.find('//Button[@Name="Submit"]');
    await button.click();

    // 停止 idle
    await flow.stopIdle();
}

example();
```

## 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `speed` | `'slow' \| 'normal' \| 'fast'` | `'normal'` | 移动速度 |
| `moveInterval` | `number` | `800` | 每次移动的间隔时间（毫秒） |
| `humanIntervention.enabled` | `boolean` | `true` | 是否启用人工干预检测 |
| `humanIntervention.pauseOnMouse` | `boolean` | `true` | 检测到鼠标移动时是否暂停 |
| `humanIntervention.pauseOnKeyboard` | `boolean` | `true` | 检测到键盘输入时是否暂停 |
| `humanIntervention.resumeDelay` | `number` | `3000` | 用户静止后多少毫秒恢复（0=不自动恢复） |

## 注意事项

1. **性能影响**：较短的 `moveInterval` 会产生更频繁的移动，可能影响性能
2. **用户体验**：启用人工干预检测可以避免与用户操作冲突
3. **防检测效果**：禁用人工干预可以获得更好的防检测效果，但可能干扰用户
4. **资源占用**：idle 会在后台持续运行，记得在不需要时调用 `stopIdle()`

## 常见问题

### Q: 为什么我移动鼠标后 idle 没有暂停？

A: 检查 `humanIntervention.enabled` 是否为 `true`，以及 `pauseOnMouse` 是否为 `true`。

### Q: 如何让 idle 永久运行直到我手动停止？

A: 设置 `resumeDelay: 0`，这样暂停后不会自动恢复，需要调用 `stopIdle()`。

### Q: idle 会影响我的自动化操作吗？

A: 如果启用了人工干预检测，当你的脚本执行点击等操作时，idle 会自动暂停并在操作完成后恢复。
