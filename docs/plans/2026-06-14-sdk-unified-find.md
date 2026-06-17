# SDK 元素/图像统一查找重构计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `findElement(xpath)` 统一入口，通过 xpath 末尾标记控制查找模式；所有查找方法支持图像加速 opt-in。

**Architecture:** `findElement(xpath, opts)` 解析 xpath 末尾标记（`:all` / `:onlyone` / 默认 findFirst），分派到现有 UIA 查找逻辑。图像加速通过 options 参数 opt-in：首次 UIA 查找后截取元素图像缓存，后续调用优先 `findImage`，未命中 fallback UIA。

**Tech Stack:** TypeScript SDK，无后端改动。

---

## 设计要点

### 1. 向后兼容

- `find()` / `findOne()` / `findAll()` **保持不变**，wechat-rpa 零改动
- 这三个方法也支持新的 `imageAcceleration` options

### 2. `findElement(xpath, opts?)` 统一入口

解析 xpath 末尾标记：

```
xpath = "//Button[@Name='发送']"          → findFirst（默认）
xpath = "//Button[@Name='发送']:all"      → findAll
xpath = "//Button[@Name='发送']:onlyone"  → findOne
```

标记从 xpath 末尾提取，不影响实际查询（提取后去掉标记再传给后端）。

### 3. 图像加速（opt-in）

```typescript
interface FindOptions {
    chromeTreewalkerFallback?: boolean;
    /** 图像加速：首次 UIA 查找后截取元素图像，后续通过 findImage 加速 */
    imageAcceleration?: {
        enabled: boolean;
        /** 模板缓存路径（默认: images/ 目录下自动生成） */
        templatePath?: string;
    };
}
```

**工作流：**

```
findElement("//Button", { imageAcceleration: { enabled: true } })
│
├─ 第一次调用：
│  ├─ 检查缓存 templatePath 是否存在
│  ├─ 不存在 → UIA findFirst → 获取 element.rect
│  ├─ captureScreenshot(rect) → 保存到 templatePath
│  └─ 返回 Element
│
├─ 第二次调用：
│  ├─ 检查缓存 templatePath 存在
│  ├─ findImage(templatePath) → 获取命中坐标
│  ├─ 命中 → 用命中坐标构造 ElementInfo → 返回 Element
│  └─ 未命中 → fallback UIA findFirst → 重新截取模板 → 返回 Element
│
└─ findElement("xpath:all", { imageAcceleration })：
   ├─ 不支持图像加速（多元素匹配无法用单模板）
   └─ 直接走 UIA findAll
```

**注意：** `:all` 模式下 `imageAcceleration` 被忽略（单模板无法匹配多元素）。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/flow.ts` | 新增 `findElement` 方法 + 修改 `find`/`findOne`/`findFirst`/`findAll` 支持 imageAcceleration |
| `src/types.ts` | `FindOptions` 增加 `imageAcceleration` 字段 |
| `src/image-acceleration.ts` | **新建**：图像加速逻辑（截取模板、findImage 匹配、构造 ElementInfo） |
| `src/__tests__/image-acceleration.test.ts` | **新建**：单元测试 |
| `src/index.ts` | 导出新类型 |

后端：**无改动**。

---

## Task 分解

### Task 1: 解析 xpath 标记工具

**Covers:** S2

**Files:**
- Create: `src/xpath-marker.ts`
- Create: `src/__tests__/xpath-marker.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// src/__tests__/xpath-marker.test.ts
import { parseXpathMarker } from '../xpath-marker';

test('no marker → findFirst', () => {
    expect(parseXpathMarker('//Button')).toEqual({ xpath: '//Button', mode: 'first' });
});

test(':all marker → findAll', () => {
    expect(parseXpathMarker('//Button:all')).toEqual({ xpath: '//Button', mode: 'all' });
});

test(':onlyone marker → findOne', () => {
    expect(parseXpathMarker('//Button:onlyone')).toEqual({ xpath: '//Button', mode: 'one' });
});

test('marker in attribute value is ignored', () => {
    expect(parseXpathMarker("//Button[@Name='test:onlyone']")).toEqual({
        xpath: "//Button[@Name='test:onlyone']",
        mode: 'first',
    });
});

test('marker after ] is extracted', () => {
    expect(parseXpathMarker('//Button[@Name="发送"]:all')).toEqual({
        xpath: '//Button[@Name="发送"]',
        mode: 'all',
    });
});

test('empty xpath', () => {
    expect(parseXpathMarker('')).toEqual({ xpath: '', mode: 'first' });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest xpath-marker
```

- [ ] **Step 3: 实现**

```typescript
// src/xpath-marker.ts
export type FindElementMode = 'first' | 'all' | 'one';

/**
 * 解析 xpath 末尾的模式标记。
 *
 * - `//Button:all` → { xpath: '//Button', mode: 'all' }
 * - `//Button:onlyone` → { xpath: '//Button', mode: 'one' }
 * - `//Button` → { xpath: '//Button', mode: 'first' }
 *
 * 标记只在 xpath 最后一个 `]` 之后（或整个字符串末尾）识别，
 * 不影响 xpath 属性值中的冒号。
 */
export function parseXpathMarker(xpath: string): { xpath: string; mode: FindElementMode } {
    if (!xpath) return { xpath, mode: 'first' };

    // 找最后一个 ] 的位置
    const lastBracket = xpath.lastIndexOf(']');
    const searchFrom = lastBracket >= 0 ? lastBracket + 1 : xpath.length;
    const suffix = xpath.slice(searchFrom).trim();

    if (suffix === ':all') {
        return { xpath: xpath.slice(0, searchFrom), mode: 'all' };
    }
    if (suffix === ':onlyone') {
        return { xpath: xpath.slice(0, searchFrom), mode: 'one' };
    }
    return { xpath, mode: 'first' };
}
```

- [ ] **Step 4: 运行测试确认通过**

- [ ] **Step 5: 提交**

```bash
git add src/xpath-marker.ts src/__tests__/xpath-marker.test.ts
git commit -m "feat(sdk): xpath 标记解析 (:all/:onlyone/:first)"
```

### Task 2: FindOptions 增加 imageAcceleration

**Covers:** S3

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 修改 FindOptions**

```typescript
export interface FindOptions {
    chromeTreewalkerFallback?: boolean;
    /**
     * 图像加速（opt-in）。
     *
     * 开启后：首次 UIA 查找截取元素图像缓存到 templatePath；
     * 后续调用优先 findImage，未命中 fallback UIA。
     *
     * `:all` 模式下此选项被忽略。
     */
    imageAcceleration?: {
        enabled: boolean;
        /** 模板缓存目录（默认: 当前目录/images/） */
        templateDir?: string;
        /** 模板文件名（默认: 基于 xpath hash 自动生成） */
        templateName?: string;
    };
}
```

- [ ] **Step 2: 构建确认**

```bash
npm run build
```

- [ ] **Step 3: 提交**

```bash
git add src/types.ts
git commit -m "feat(sdk): FindOptions 增加 imageAcceleration"
```

### Task 3: 图像加速核心逻辑

**Covers:** S3

**Files:**
- Create: `src/image-acceleration.ts`
- Create: `src/__tests__/image-acceleration.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// src/__tests__/image-acceleration.test.ts
import { resolveTemplatePath, shouldUseImageAcceleration } from '../image-acceleration';

test('resolveTemplatePath generates path from xpath', () => {
    const result = resolveTemplatePath('//Button[@Name="发送"]', undefined, undefined);
    expect(result).toMatch(/images\/.*\.png$/);
});

test('resolveTemplatePath uses custom dir', () => {
    const result = resolveTemplatePath('//Button', '/tmp/templates', undefined);
    expect(result).toMatch(/^\/tmp\/templates\//);
});

test('resolveTemplatePath uses custom name', () => {
    const result = resolveTemplatePath('//Button', undefined, 'my-btn');
    expect(result).toMatch(/my-btn\.png$/);
});

test('shouldUseImageAcceleration respects mode', () => {
    expect(shouldUseImageAcceleration('first', { enabled: true })).toBe(true);
    expect(shouldUseImageAcceleration('one', { enabled: true })).toBe(true);
    expect(shouldUseImageAcceleration('all', { enabled: true })).toBe(false);
});
```

- [ ] **Step 2: 实现**

```typescript
// src/image-acceleration.ts
import * as crypto from 'crypto';
import type { FindElementMode } from './xpath-marker';

/**
 * 生成模板缓存路径。
 * 基于 xpath 的 sha256 前 8 位作为文件名，避免冲突。
 */
export function resolveTemplatePath(
    xpath: string,
    templateDir?: string,
    templateName?: string,
): string {
    const dir = templateDir || 'images';
    if (templateName) return `${dir}/${templateName}.png`;
    const hash = crypto.createHash('sha256').update(xpath).digest('hex').slice(0, 8);
    return `${dir}/${hash}.png`;
}

/**
 * 判断是否应使用图像加速。
 * :all 模式不支持（单模板无法匹配多元素）。
 */
export function shouldUseImageAcceleration(
    mode: FindElementMode,
    imageAcceleration?: { enabled: boolean },
): boolean {
    if (!imageAcceleration?.enabled) return false;
    if (mode === 'all') return false; // 多元素不支持图像加速
    return true;
}
```

- [ ] **Step 3: 测试通过**

- [ ] **Step 4: 提交**

```bash
git add src/image-acceleration.ts src/__tests__/image-acceleration.test.ts
git commit -m "feat(sdk): 图像加速核心工具（模板路径生成 + 模式判断）"
```

### Task 4: 实现 findElement + 修改 find/findOne/findFirst/findAll

**Covers:** S1, S2, S3

**Files:**
- Modify: `src/flow.ts`
- Modify: `src/index.ts`（导出）

**这是核心任务**，分步：

- [ ] **Step 1: 在 flow.ts import 新模块**

```typescript
import { parseXpathMarker, FindElementMode } from './xpath-marker';
import { resolveTemplatePath, shouldUseImageAcceleration } from './image-acceleration';
import * as fs from 'fs';
```

- [ ] **Step 2: 新增私有方法 `_findOneWithImage`**

在 Flow 类中新增：

```typescript
/**
 * 带图像加速的 findOne。
 *
 * 1. 检查模板文件是否存在
 * 2. 存在 → findImage 匹配 → 命中则用坐标构造 ElementInfo → 返回 Element
 * 3. 不存在或未命中 → UIA findOne → 截取元素图像保存 → 返回 Element
 */
private async _findOneWithImage(
    xpath: string,
    options?: FindOptions,
    templatePath?: string,
): Promise<Element> {
    const path = templatePath || resolveTemplatePath(xpath, options?.imageAcceleration?.templateDir, options?.imageAcceleration?.templateName);

    // 尝试图像加速
    if (fs.existsSync(path)) {
        try {
            const matches = await this.findImage(path, { precision: 0.85 });
            if (matches.length > 0) {
                const m = matches[0];
                // 用命中坐标构造伪 ElementInfo
                const pseudoInfo = this._buildPseudoElementInfo(m);
                this.logger.logDebug(`findElement [图像加速命中]: (${m.x}, ${m.y}) conf=${m.confidence}`);
                await this.maybeAutoWait('afterFind');
                return new Element(
                    this.client, xpath, this.windowSelector!,
                    xpath, pseudoInfo, this.autoWaitConfig, this.logger, 1,
                );
            }
        } catch {
            // findImage 失败，fallback UIA
        }
    }

    // UIA fallback
    const el = await this.findOne(xpath, options);
    await this._captureAndSaveTemplate(el, path);
    return el;
}

/**
 * 用 Element 的 boundingBox 截取元素图像并保存。
 */
private async _captureAndSaveTemplate(el: Element, path: string): Promise<void> {
    try {
        const rect = el.info.rect;
        if (!rect || rect.width < 5 || rect.height < 5) return;
        const base64 = await this.captureScreenshot(rect);
        const dir = require('path').dirname(path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path, Buffer.from(base64, 'base64'));
    } catch {
        // 截图失败不阻塞主流程
    }
}

/**
 * 用图像命中坐标构造伪 ElementInfo（与 UIA 返回格式一致）。
 */
private _buildPseudoElementInfo(match: FindImageMatch): any {
    const halfW = (match.width || 30) / 2;
    const halfH = (match.height || 20) / 2;
    return {
        rect: { x: match.x - halfW, y: match.y - halfH, width: match.width || 30, height: match.height || 20 },
        center: { x: match.x, y: match.y },
        centerRandom: { x: match.x, y: match.y },
        controlType: '',
        name: '',
        automationId: '',
        className: '',
        frameworkId: '',
        helpText: '',
        localizedControlType: '',
        isEnabled: true,
        isOffscreen: false,
        isPassword: false,
        acceleratorKey: '',
        accessKey: '',
        itemType: '',
        itemStatus: '',
        processId: 0,
        isCheckable: false,
        isChecked: false,
        isClickable: true,
        isScrollable: false,
        isSelected: false,
    };
}
```

- [ ] **Step 3: 新增公开方法 `findElement`**

```typescript
/**
 * 统一查找入口。
 *
 * 通过 xpath 末尾标记控制模式：
 * - `//Button` → findFirst（默认）
 * - `//Button:all` → findAll
 * - `//Button:onlyone` → findOne
 *
 * 支持 `imageAcceleration` opt-in。
 */
async findElement<T extends string>(
    xpath: string,
    options?: FindOptions,
): Promise<T extends `${string}:all` ? ElementList : Element> {
    const { xpath: cleanXpath, mode } = parseXpathMarker(xpath);
    const useImage = shouldUseImageAcceleration(mode, options?.imageAcceleration);

    switch (mode) {
        case 'all': {
            // :all 不支持图像加速
            return this.findAll(cleanXpath, options) as any;
        }
        case 'one': {
            if (useImage) {
                const templatePath = resolveTemplatePath(cleanXpath, options?.imageAcceleration?.templateDir, options?.imageAcceleration?.templateName);
                return this._findOneWithImage(cleanXpath, options, templatePath) as any;
            }
            return this.findOne(cleanXpath, options) as any;
        }
        case 'first':
        default: {
            if (useImage) {
                const templatePath = resolveTemplatePath(cleanXpath, options?.imageAcceleration?.templateDir, options?.imageAcceleration?.templateName);
                return this._findOneWithImage(cleanXpath, options, templatePath) as any;
            }
            return this.findFirst(cleanXpath, options) as any;
        }
    }
}
```

- [ ] **Step 4: 给 find/findOne/findFirst/findAll 也加 imageAcceleration 支持**

在 `findOne` 方法开头加：

```typescript
async findOne(xpath: string, options?: FindOptions): Promise<Element> {
    // 图像加速
    if (options?.imageAcceleration?.enabled) {
        const templatePath = resolveTemplatePath(xpath, options.imageAcceleration.templateDir, options.imageAcceleration.templateName);
        return this._findOneWithImage(xpath, options, templatePath);
    }
    // ... 原有逻辑不变
```

同理改 `findFirst`。

`findAll` 不改（:all 不支持图像加速）。

`find`（findFirst 别名）自动继承。

- [ ] **Step 5: index.ts 导出**

```typescript
export type { FindElementMode } from './xpath-marker';
export { parseXpathMarker } from './xpath-marker';
```

- [ ] **Step 6: 构建 + 测试**

```bash
npm run build
npm test
```

- [ ] **Step 7: 提交**

```bash
git add src/flow.ts src/index.ts
git commit -m "feat(sdk): findElement 统一入口 + 图像加速 opt-in
findElement(xpath) 解析 :all/:onlyone 标记分派到 findAll/findOne/findFirst。
图像加速：首次 UIA 查找截取元素图像缓存，后续 findImage 加速，未命中 fallback。
find/findOne/findFirst 也支持 imageAcceleration options。"
```

### Task 5: wechat-rpa 兼容性验证

**Covers:** S1

- [ ] **Step 1: 在 wechat-rpa 目录验证 SDK 编译**

```bash
cd ../wechat-rpa && node -e "const { SDK } = require('element-selector-sdk-nodejs'); const sdk = new SDK(); const f = sdk.flow(); console.log(typeof f.find, typeof f.findOne, typeof f.findAll, typeof f.findElement);"
```

期望输出：`function function function function`

- [ ] **Step 2: 确认 main.js 零改动**

```bash
git diff main.js
```

期望：无 diff。

---

## 自检

**Spec 覆盖：**
- S1（向后兼容）→ Task 5 验证
- S2（findElement 统一入口 + 标记解析）→ Task 1 + Task 4
- S3（图像加速 opt-in）→ Task 2 + Task 3 + Task 4

**类型一致性：**
- `FindElementMode` 在 `xpath-marker.ts` 定义，`image-acceleration.ts` 和 `flow.ts` 引用
- `FindOptions.imageAcceleration` 在 `types.ts` 定义，`flow.ts` 使用
- `resolveTemplatePath` 返回 `string`，`fs.existsSync` / `fs.writeFileSync` 接收 `string`

**占位符：** 无 TBD/TODO。所有步骤含完整代码。

---

## 执行交接

所有任务都在 SDK 内（单仓库），任务间有硬依赖（Task 1 → Task 3 → Task 4）。
建议 **Inline 串行执行**。Task 5 是验证步骤，不产生代码改动。
