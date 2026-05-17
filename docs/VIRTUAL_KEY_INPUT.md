# 键盘输入功能完整指南

## 概述

element-selector SDK 提供了灵活的键盘输入 API，支持从简单文本到复杂组合键的各种场景。

## API 概览

| 方法 | 用途 | 示例 |
|------|------|------|
| **`type()`** | 混合智能输入（推荐） | `type('abc{Enter}{Ctrl+A}')` |
| **`typeText()`** | 专注纯文本输入 | `typeText('Hello')` |
| **`shortcut()`** | 执行快捷键/组合键 | `shortcut('Ctrl+C')` |
| **`pressKey()`** | 执行单个按键 | `pressKey('Enter')` |

## type() - 混合智能输入 ⭐

`type()` 是最强大的输入方法，支持在一次调用中组合：
- 普通文本
- 单个虚拟键（如 `{Enter}`, `{Tab}`）
- **组合键/快捷键**（如 `{Ctrl+A}`, `{Ctrl+C}`）

### 1. 纯文本输入

```javascript
await input.type('Hello World');
```

### 2. 文本 + 单键

```javascript
await input.type('用户名{Enter}');
await input.type('第一行{Enter}第二行{Enter}');
```

### 3. 文本 + 组合键 ⭐ 新特性

```javascript
// 输入文本后全选
await input.type('abc{Ctrl+A}');

// 输入、回车、再全选
await input.type('abc{Enter}{Ctrl+A}');

// 复杂操作序列
await input.type('内容{Ctrl+A}{Ctrl+C}{Tab}{Ctrl+V}{Enter}');
```

## typeText() - 专注纯文本

如果你只需要输入文本，不需要任何按键操作，可以使用 `typeText()`：

```javascript
await input.typeText('Hello World');
await input.typeText('这是一段纯文本');
```

`typeText()` 是 `type()` 的别名，语义更明确，表示只输入文本。

## 支持的虚拟键

| 虚拟键 | 说明 | 别名 |
|--------|------|------|
| `{Enter}` | 回车键 | `{Return}` |
| `{Tab}` | Tab 键 | - |
| `{Escape}` | ESC 键 | `{Esc}` |
| `{Backspace}` | 退格键 | `{Back}` |
| `{Delete}` | 删除键 | `{Del}` |
| `{Home}` | Home 键 | - |
| `{End}` | End 键 | - |
| `{PageUp}` | Page Up 键 | `{PgUp}` |
| `{PageDown}` | Page Down 键 | `{PgDn}` |
| `{Left}` | 左方向键 | - |
| `{Right}` | 右方向键 | - |
| `{Up}` | 上方向键 | - |
| `{Down}` | 下方向键 | - |
| `{F1}` - `{F12}` | 功能键 | - |

## 实际示例

### 示例 1: 表单填写

```javascript
const usernameField = await flow.find('//Edit[@AutomationId="username"]');
const passwordField = await flow.find('//Edit[@AutomationId="password"]');

// 方式 1: 分别输入
await usernameField.type('john_doe');
await passwordField.type('secret123{Enter}');

// 方式 2: 如果两个字段可以通过 Tab 切换
await usernameField.type('john_doe{Tab}secret123{Enter}');
```

### 示例 2: 代码编辑器

```javascript
const editor = await flow.find('//Edit[@AutomationId="code-editor"]');

await editor.type('function hello() {');
await editor.type('{Enter}  console.log("Hello");');
await editor.type('{Enter}}');
await editor.type('{Enter}{Enter}hello();');
```

### 示例 3: 导航和操作

```javascript
const list = await flow.find('//List[@AutomationId="items"]');

// 向下选择第3项并按回车
await list.type('{Down}{Down}{Enter}');
```

### 示例 4: 刷新页面

```javascript
// 按 F5 刷新
await page.type('{F5}');
```

## 注意事项

1. **虚拟键大小写不敏感**：`{enter}`、`{Enter}`、`{ENTER}` 都可以
2. **未闭合的花括号**：如果 `{` 后面没有对应的 `}`，会被当作普通字符处理
3. **未知虚拟键**：如果使用了不支持的虚拟键名称，会抛出错误
4. **延迟控制**：每个字符（包括虚拟键）之间都有随机延迟，可以通过 `charDelay` 选项控制

## shortcut() - 快捷键/组合键

对于单独的组合键操作，推荐使用 `shortcut()` 方法：

```javascript
// 基本组合键
await flow.shortcut('Ctrl+C');    // 复制
await flow.shortcut('Ctrl+V');    // 粘贴
await flow.shortcut('Ctrl+A');    // 全选
await flow.shortcut('Alt+F4');    // 关闭窗口

// 多修饰键组合
await flow.shortcut('Ctrl+Shift+S');  // 另存为
await flow.shortcut('Ctrl+Alt+Delete'); // 任务管理器
```

**支持的修饰键：**
- `Ctrl` / `Control`
- `Shift`
- `Alt` / `Menu`
- `Win` / `Windows`

## pressKey() - 单个按键

对于单独的按键操作，使用 `pressKey()`：

```javascript
await flow.pressKey('Enter');     // 回车
await flow.pressKey('Tab');       // Tab
await flow.pressKey('Escape');    // ESC
await flow.pressKey('F5');        // F5 刷新
```

## API 对比与选择

| 特性 | `type()` / `typeText()` | `pressKey()` | `shortcut()` |
|------|-------------------|----------------|---------------------|
| 用途 | 文本输入 + 单键/组合键 | 单独的按键操作 | 组合键操作 |
| 便利性 | 高（一次调用完成） | 需要多次调用 | 简洁明了 |
| 适用性 | 适合表单填写等场景 | 适合单键操作 | 适合快捷键、组合键 |
| 示例 | `type('text{Enter}')` | `pressKey('Enter')` | `shortcut('Ctrl+C')` |

**推荐做法**：
- 如果需要输入文本并立即按单键或组合键 → 使用 `type('text{Enter}{Ctrl+A}')`
- 如果只需要按单键 → 使用 `flow.pressKey('Enter')`
- 如果是单独的组合键 → 使用 `flow.shortcut('Ctrl+C')`

**方法名说明**：
- `type()` - 智能输入，支持文本+虚拟键+组合键 ⭐
- `typeText()` - 专注纯文本输入（`type()` 的别名）
- `shortcut()` - 执行快捷键/组合键（推荐）
- `pressShortcut()` - 向后兼容别名（已废弃）

### 组合键示例

```javascript
// 复制文本
await flow.shortcut('Ctrl+C');

// 粘贴文本
await flow.shortcut('Ctrl+V');

// 全选
await flow.shortcut('Ctrl+A');

// 保存
await flow.shortcut('Ctrl+S');

// 查找
await flow.shortcut('Ctrl+F');

// 多修饰键组合
await flow.shortcut('Ctrl+Shift+S');  // 另存为
await flow.shortcut('Ctrl+Alt+Delete'); // 任务管理器

// 支持的修饰键：Ctrl, Shift, Alt, Win
```

### 完整工作流程示例

```javascript
// 场景：选择文本并复制
const inputArea = await flow.find('//Edit[@AutomationId="editor"]');

// 方式 1: 使用 type() 输入文本
await inputArea.type('Hello World');

// 方式 2: 全选并复制
await flow.shortcut('Ctrl+A');  // 全选
await flow.shortcut('Ctrl+C');  // 复制

// 方式 3: 在另一个地方粘贴
const targetField = await flow.find('//Edit[@AutomationId="target"]');
await targetField.click();
await flow.shortcut('Ctrl+V');  // 粘贴
```

## 技术实现

该功能在后端通过解析文本中的 `{key}` 标记，识别虚拟键并调用 Windows API 的 `SendInput` 函数发送相应的键盘事件。整个过程保持了拟人化的打字效果，每个操作之间都有随机延迟。
