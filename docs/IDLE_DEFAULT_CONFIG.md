# Idle 默认配置使用指南

## 📖 概述

从 SDK v0.0.2 开始，你可以在创建 SDK 实例时配置 idle 移动的默认值，这样每次调用 `flow.idle()` 时就不需要重复传递相同的配置。

---

## 🎯 使用方法

### 方法 1：在 SDK 初始化时设置（推荐）

```javascript
const sdk = new SDK({
    baseUrl: 'http://localhost:8080',
    
    // ✅ 在这里配置 idle 的默认值
    idleMotion: {
        speed: 'normal',
        moveInterval: 800,
        humanIntervention: {
            enabled: true,
            pauseOnMouse: true,
            pauseOnKeyboard: true,
            resumeDelay: 10000  // 10秒后恢复
        }
    }
});

const flow = sdk.flow();

// 现在调用 idle() 时会自动使用上面的默认配置
await flow.idle(`//Document[@AutomationId='RootWebArea']`);
```

### 方法 2：动态更新配置

```javascript
const sdk = new SDK({
    baseUrl: 'http://localhost:8080'
});

// 动态更新 idle 配置
sdk.configure({
    idleMotion: {
        speed: 'slow',
        humanIntervention: {
            resumeDelay: 5000
        }
    }
});

const flow = sdk.flow();
await flow.idle(xpath);  // 使用更新后的配置
```

### 方法 3：单次调用时覆盖默认值

```javascript
const sdk = new SDK({
    baseUrl: 'http://localhost:8080',
    idleMotion: {
        speed: 'normal',
        moveInterval: 800
    }
});

const flow = sdk.flow();

// 这次调用会使用默认配置
await flow.idle(xpath);

// 这次调用会覆盖默认配置
await flow.idle(xpath, {
    speed: 'fast',  // 覆盖默认的 'normal'
    moveInterval: 400  // 覆盖默认的 800
});
```

---

## ⚙️ 配置选项说明

### `speed` - 移动速度

- `'slow'` - 慢速（600ms/次），非常平滑
- `'normal'` - 正常（300ms/次），流畅连续
- `'fast'` - 快速（150ms/次），频繁变向

**默认值**: `'normal'`

### `moveInterval` - 移动间隔（已废弃）

⚠️ **注意**: 由于现在使用连续流畅移动模式，此参数已被忽略。保留仅为了向后兼容。

**默认值**: `800`

### `humanIntervention` - 人工干预配置

#### `enabled` - 是否启用检测

- `true` - 启用人工干预检测（默认）
- `false` - 禁用检测，idle 不会因人工操作而暂停

**默认值**: `true`

#### `pauseOnMouse` - 鼠标移动时暂停

- `true` - 检测到鼠标移动时暂停 idle（默认）
- `false` - 继续移动，不暂停

**默认值**: `true`

#### `pauseOnKeyboard` - 键盘输入时暂停

- `true` - 检测到键盘输入时暂停 idle（默认）
- `false` - 继续移动，不暂停

**默认值**: `true`

#### `resumeDelay` - 恢复延迟

- `0` - 不自动恢复，需要手动调用 `stopIdle()`
- `>0` - 用户静止指定毫秒数后自动恢复

**默认值**: `3000` (3秒)

---

## 💡 典型场景

### 场景 1：长时间后台运行

```javascript
const sdk = new SDK({
    idleMotion: {
        humanIntervention: {
            resumeDelay: 0  // 不自动恢复
        }
    }
});

const flow = sdk.flow();
await flow.idle(xpath);

// ... 程序持续运行，idle 一直工作
// 按 Ctrl+C 退出时会自动停止
```

### 场景 2：敏感环境（不干扰用户）

```javascript
const sdk = new SDK({
    idleMotion: {
        humanIntervention: {
            pauseOnMouse: false,   // 不因鼠标移动暂停
            pauseOnKeyboard: false, // 不因键盘输入暂停
            resumeDelay: 1000      // 快速恢复
        }
    }
});
```

### 场景 3：演示模式（缓慢优雅）

```javascript
const sdk = new SDK({
    idleMotion: {
        speed: 'slow',  // 慢速移动
        humanIntervention: {
            resumeDelay: 5000  // 5秒后恢复
        }
    }
});
```

---

## 🔧 配置优先级

配置的优先级从高到低：

1. **单次调用时的参数** (最高优先级)
   ```javascript
   await flow.idle(xpath, { speed: 'fast' });
   ```

2. **SDK 初始化时的配置**
   ```javascript
   const sdk = new SDK({
       idleMotion: { speed: 'normal' }
   });
   ```

3. **内置默认值** (最低优先级)
   ```typescript
   DEFAULTS.idleMotion = {
       speed: 'normal',
       moveInterval: 800,
       humanIntervention: {
           enabled: true,
           pauseOnMouse: true,
           pauseOnKeyboard: true,
           resumeDelay: 3000
       }
   }
   ```

---

## 📝 完整示例

```javascript
const { SDK } = require('element-selector-sdk-nodejs');

async function main() {
    // 1. 创建 SDK 并配置 idle 默认值
    const sdk = new SDK({
        baseUrl: 'http://localhost:8080',
        autoWait: {
            enabled: true,
            delays: {
                afterFind: 500,
                afterClick: 800,
                afterType: 600,
            }
        },
        logging: {
            enabled: true,
            level: 'info',
            showElementInfo: true,
        },
        // ✅ idle 默认配置
        idleMotion: {
            speed: 'normal',
            humanIntervention: {
                enabled: true,
                pauseOnMouse: true,
                pauseOnKeyboard: true,
                resumeDelay: 10000
            }
        }
    });

    const flow = sdk.flow();
    
    try {
        // 2. 激活窗口
        await flow.window({
            title: '应用名称',
            className: 'WindowClass',
            processName: 'process'
        });

        // 3. 启动 idle（使用默认配置）
        await flow.idle(`//Document[@AutomationId='RootWebArea']`);
        console.log('✅ idle 已启动，使用默认配置');

        // 4. 执行自动化操作...
        const button = await flow.find('//Button');
        await button.click();

        // 5. 停止 idle
        await flow.stopIdle();
        console.log('✅ idle 已停止');

    } catch (error) {
        console.error('❌ 发生错误:', error.message);
    }
}

main();
```

---

## ❓ 常见问题

### Q1: 为什么我设置了 `moveInterval` 但没有效果？

A: 因为现在的 idle 实现使用**连续流畅移动**模式，不再使用固定的移动间隔。`moveInterval` 参数保留仅为了向后兼容，实际已被忽略。

### Q2: 如何完全禁用人工干预检测？

A: 设置 `humanIntervention.enabled: false`：

```javascript
const sdk = new SDK({
    idleMotion: {
        humanIntervention: {
            enabled: false
        }
    }
});
```

### Q3: 如何让 idle 永久运行直到手动停止？

A: 设置 `resumeDelay: 0`：

```javascript
const sdk = new SDK({
    idleMotion: {
        humanIntervention: {
            resumeDelay: 0  // 不自动恢复
        }
    }
});

const flow = sdk.flow();
await flow.idle(xpath);

// idle 会一直运行，直到调用 stopIdle()
// await flow.stopIdle();
```

### Q4: 可以在运行时修改配置吗？

A: 可以，使用 `sdk.configure()` 方法：

```javascript
sdk.configure({
    idleMotion: {
        speed: 'fast',
        humanIntervention: {
            resumeDelay: 5000
        }
    }
});
```

注意：这只会影响**之后**创建的 Flow 实例，不会影响已经创建的实例。

---

## 📚 相关文档

- [IDLE_CONFIG_GUIDE.md](./IDLE_CONFIG_GUIDE.md) - 详细的 idle 配置指南
- [types.ts](../src/types.ts) - 完整的类型定义
- [flow.ts](../src/flow.ts) - Flow 类实现
