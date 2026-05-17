# type() 混合智能输入功能

## 概述

`type()` 方法现在支持**混合智能输入**，可以在一次调用中组合：
- 普通文本
- 单个虚拟键（如 `{Enter}`, `{Tab}`）
- **组合键/快捷键**（如 `{Ctrl+A}`, `{Ctrl+C}`）

## 基本用法

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

## 支持的格式

### 普通字符
直接输入任何文本字符。

### 单个虚拟键
格式：`{KeyName}`

| 按键 | 示例 |
|------|------|
| Enter | `{Enter}` |
| Tab | `{Tab}` |
| Escape | `{Escape}` 或 `{Esc}` |
| Backspace | `{Backspace}` 或 `{Back}` |
| Delete | `{Delete}` 或 `{Del}` |
| F1-F12 | `{F1}` - `{F12}` |
| 方向键 | `{Left}`, `{Right}`, `{Up}`, `{Down}` |
| Home/End | `{Home}`, `{End}` |
| PageUp/PageDown | `{PageUp}`, `{PageDown}` |

### 组合键/快捷键
格式：`{Modifier+Key}`

| 组合键 | 示例 |
|--------|------|
| Ctrl + 键 | `{Ctrl+C}`, `{Ctrl+V}`, `{Ctrl+A}` |
| Shift + 键 | `{Shift+A}` |
| Alt + 键 | `{Alt+F4}` |
| Win + 键 | `{Win+D}` |
| 多修饰键 | `{Ctrl+Shift+S}`, `{Ctrl+Alt+Delete}` |

**支持的修饰键：**
- `Ctrl` / `Control`
- `Shift`
- `Alt` / `Menu`
- `Win` / `Windows`

## 实际示例

### 示例 1: 表单填写并提交

```javascript
const form = await flow.find('//Form');

// 输入用户名，按Tab，输入密码，按Enter提交
await form.type('john_doe{Tab}secret123{Enter}');
```

### 示例 2: 代码编辑器操作

```javascript
const editor = await flow.find('//Edit[@AutomationId="code"]');

// 输入代码，全选，复制
await editor.type('function hello() { return "world"; }{Ctrl+A}{Ctrl+C}');
```

### 示例 3: 多步骤操作

```javascript
const input = await flow.find('//Edit');

// 输入文本 → 全选 → 复制 → 切换到下一个字段 → 粘贴 → 提交
await input.type(
    '原始内容' +
    '{Ctrl+A}' +      // 全选
    '{Ctrl+C}' +      // 复制
    '{Tab}' +         // 切换到下一个字段
    '{Ctrl+V}' +      // 粘贴
    '{Enter}'         // 提交
);
```

### 示例 4: 窗口管理

```javascript
// 按 Alt+F4 关闭窗口
await window.type('{Alt+F4}');

// 按 Win+D 显示桌面
await desktop.type('{Win+D}');
```

## 转义字符

如果要输入字面意义的花括号：
- `{{` → 输出 `{`
- `}}` → 输出 `}`

```javascript
// 输入: Config: {key} = value
await input.type('Config: {{key}} = value');
```

## API 对比

| 方法 | 用途 | 示例 |
|------|------|------|
| **`type()`** | 混合智能输入（推荐） | `type('abc{Enter}{Ctrl+A}')` |
| **`typeText()`** | 专注纯文本 | `typeText('Hello')` |
| **`shortcut()`** | 单独的组合键 | `shortcut('Ctrl+C')` |
| **`pressKey()`** | 单独的单键 | `pressKey('Enter')` |

## 注意事项

1. **大小写不敏感**：`{ctrl+a}` 和 `{Ctrl+A}` 效果相同
2. **空格处理**：修饰键和键名之间的空格会被忽略，`{Ctrl + A}` 等同于 `{Ctrl+A}`
3. **错误处理**：如果使用了不支持的键名，会抛出错误
4. **延迟控制**：每个操作（字符或按键）之间都有随机延迟，保持拟人化效果

## 技术实现

后端通过解析 `{...}` 中的内容：
- 如果包含 `+` → 识别为组合键，调用 `send_shortcut()`
- 如果不包含 `+` → 识别为单键，调用 `send_virtual_key()`
- 其他情况 → 作为普通字符处理

整个过程保持了拟人化的打字效果，每个操作之间都有随机延迟。

## 最佳实践

✅ **推荐**：使用 `type()` 进行复杂的输入序列
```javascript
await input.type('username{Tab}password{Enter}');
```

✅ **推荐**：简单的组合键操作使用 `shortcut()`
```javascript
await flow.shortcut('Ctrl+C');
```

❌ **避免**：过长的操作序列（可读性差）
```javascript
// 不好 - 太长，难以阅读
await input.type('a{Enter}b{Enter}c{Ctrl+A}{Ctrl+C}{Tab}{Ctrl+V}{Enter}');

// 更好 - 分解为多个步骤
await input.type('a{Enter}b{Enter}c');
await flow.shortcut('Ctrl+A');
await flow.shortcut('Ctrl+C');
await flow.pressKey('Tab');
await flow.shortcut('Ctrl+V');
await flow.pressKey('Enter');
```
