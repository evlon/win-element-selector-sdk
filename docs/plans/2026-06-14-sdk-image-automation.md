# SDK 图像自动化迭代规划

> **目的**：把当前"找元素 → 操作元素"的 UIA 单一路径，扩展为"找元素 / 找图像 → 操作"的双轨能力，让 RPA 脚本可以在 UIA 不可见、控件不可达、Canvas 渲染等场景下用图像兜底。
> **范围**：win-element-selector-rs（HTTP API）+ win-element-selector-sdk（Node.js）+ wechat-rpa（消费层）

---

## 1. 现状盘点

### 1.1 已有图像能力（feat-pic-locator 分支已合）

| 层 | 能力 | 接口 |
|---|---|---|
| Rust 后端 | 区域截图、桌面截图、模板匹配（Segmented NCC + FFT NCC）、按元素保存模板 | `POST /api/screenshot/capture`、`/api/screenshot/desktop`、`/api/image/find`、`/api/image/save-element` |
| SDK | `flow.captureScreenshot(region)` / `captureDesktopScreenshot()` / `findImage(b64, opts)` / `clickImage(b64, opts)` | `flow.ts:1483-1536` |
| GUI | "图像"Tab：库浏览、F8 框选捕获（Direct / HideAndCapture 两模式）、F9 校验、匹配高亮 | `iced_app.rs` |

### 1.2 未覆盖的关键场景（现实痛点）

| 场景 | 当前缺口 |
|---|---|
| **从模板文件查找**（路径而非 base64） | SDK 仅接受 base64，每次脚本都要 `fs.readFileSync` 转码 |
| **图像不在当前可视区域** | 没有 `scrollToFindImage`，UIA 的 `scrollToVisible` 用不了 |
| **图像出现等待** | 没有 `waitForImage(template, timeout)`，对应 UIA 的 `waitFor` |
| **图像消失等待** | 没有 `waitUntilImageGone` |
| **图像存在性探测** | 没有 `existsImage`（不抛错的布尔判断） |
| **多模板匹配** | 一次只能匹配一个模板，要找 N 选一只能串行 N 次 |
| **图像 + 偏移点击** | `clickImage` 只点中心，没有 `offsetX/offsetY`、子区域随机 |
| **图像区域 OCR / 文本读取** | 完全空白（外部能力，待评估） |
| **元素 fallback 到图像** | `find(xpath)` 失败后没有"再用图像找"的标准链路 |
| **窗口客户区相对坐标** | `findImage` 仅返回屏幕绝对坐标，DPI 切换 / 窗口移动会失效 |
| **匹配结果可视化** | 脚本调试时无可视化产物 |

### 1.3 性能 / 工程现状

- **算法**：Segmented NCC（默认快）、FFT NCC（大模板快）。`do_image_verify_sync` 走 `capture_desktop` → match。每次截全屏，对小区域不友好。
- **缓存**：模板 `PreparedData` 没缓存，重复匹配同模板会重复 prepare。
- **并发**：HTTP handler 是 async，但 match 是 sync 调用，单线程串行。
- **DPI**：未文档化处理。屏幕坐标即物理像素，Iced 主进程是 per-monitor DPI aware（待复核）。

---

## 2. 设计原则

1. **API 命名沿用 Playwright 习惯**（[`项目记忆 2026-05-27`]）：`findImage` / `waitForImage` / `existsImage` / `clickImage`，与 `find` / `waitFor` / `exists` / `click` 同形。
2. **模板源同时支持** ：`base64` / `path`（绝对或相对项目根的相对路径）/ `Buffer`。SDK 内部统一规范化为 base64，HTTP 接口仍只接 base64，**复杂度收敛在 SDK 一层**。
3. **单文件最小化新增**：HTTP 端点新增不另立文件，仍放 `src/api/image_match.rs`；SDK 新增方法仍在 `flow.ts`。避免引入 `image_locator.ts` / `image_actions.ts` 等过早抽象。
4. **算法 / 性能优化滞后**：本期不做缓存、并行、GPU；只做"语义层"。除非用户后续显式需要。
5. **不引入 OCR**：Tesseract / PaddleOCR 改动量大，单独立项。本期 SDK 留出 `// TODO ocr` 占位注释。
6. **DPI / 多显示器**：本期不主动重写。坐标按 `capture_desktop` 现行口径——物理像素全屏虚拟坐标。文档说明即可。

---

## 3. 迭代分期（递增交付，每期独立可用）

### Phase 1 — 基础便利层（必做，1-2 天）
让现有 API 在脚本里"好用"。

- [S1] 模板源归一化：`templateOf(string | Buffer)` 工具，自动判 base64 / 文件路径 / Buffer。
- [S2] 新增 `flow.findImageByPath(path, opts)` / `flow.clickImageByPath(path, opts)` —— 直接传文件路径。或更优：让 `flow.findImage` 第一参数类型扩为 `string | Buffer | { base64?, path? }`。
- [S3] 新增 `flow.existsImage(template, opts?)`：返回 `boolean`，不抛错。
- [S4] 新增 `flow.waitForImage(template, opts?)`：轮询 `findImage`，超时抛 `TimeoutError`。复用 `WaitOptions` 类型。
- [S5] 新增 `flow.waitUntilImageGone(template, opts?)`。
- [S6] `clickImage` 增加 `offsetX/offsetY`、`randomRange`（与 `click` 对齐 [`项目记忆 SDK flow.click randomRange`]）、`button: 'left' | 'right' | 'middle'`、`doubleClick: boolean`。

### Phase 2 — 区域 / 多模板 / 多匹配（2-3 天）
让"在哪找""找几次""找哪个"可控。

- [S7] `findImage(template, { region: Rect | 'window' | 'element', element?: Element })`：
   - `region: 'window'` 自动取 `_currentWindowInfo.rect`
   - `region: 'element', element`：用 `element.boundingBox()`
   - 现有 `region: Rect` 保留
- [S8] `findImage` 返回值新增 `index` 字段，`findAllImages(template, opts)` 返回所有 ≥precision 的命中（后端已经返回数组，SDK 包一层即可）。
- [S9] `findFirstImage(templates: Array<Template>, opts)`：第一个能命中的模板返回，用于"任一图标存在即可"。SDK 串行实现，后端不变。
- [S10] `clickImage` 支持选 `nth`（点第 N 个匹配），`all=true`（依次点所有匹配）。

### Phase 3 — 滚动找图（关键能力，2-3 天）
对应 UIA 的 `scrollToVisible`，是图像自动化的核心缺口。

- [S11] `flow.scrollToFindImage(template, options)`：
   - 在指定容器（`element` 或当前窗口）内滚动，每次滚动后 `findImage(region=容器矩形)`，命中即返回 `FindImageMatch`，否则继续滚动。
   - 复用现有 `flow.scrollDown` / `scrollDetect` 的滚动机制，不重写。
   - 选项：`maxScrolls`、`direction: 'down' | 'up'`、`stepDelay`、`scrollDetect` 自动判定到底。
- [S12] 实现复用 `scrollToVisible` 的 step 框架（`flow.ts:604-748`）：把 "命中条件" 从 `element.isOffscreen()` 抽象为 callback，**不改 `scrollToVisible`，复制并改造**（YAGNI：等用过后再统一）。

### Phase 4 — 元素 / 图像融合定位（1-2 天）
让"先找元素，找不到再用图像"成为一行 API。

- [S13] `flow.locate(target)`：
   - `target: { xpath?: string, image?: Template, region?: ... }` —— 先 xpath，失败回退 image，仍失败抛 `ElementNotFoundError`。
   - 返回 `{ kind: 'element', element } | { kind: 'image', match }` discriminated union。
   - 配套 `flow.click(target)` / `flow.hover(target)` 重载，内部调 `locate` 后分派。
- [S14] `Element.findImageInside(template, opts)`：在元素 `boundingBox` 内找图像，等价于 `findImage(template, { region: element })` 但更面向对象。

### Phase 5 — 调试 / 可视化（按需，1 天）
- [S15] `flow.captureMatchVisualization(template, opts)`：执行 `findImage` 后在截图上画框，返回 base64 PNG。便于 LLM 链路 / 单元测试 / 失败排查。
- [S16] OperationLogger 集成：`findImage` / `clickImage` 入参 / 命中数 / 第一命中坐标自动写入。

### Phase 6 — 性能 / 工程（明确证据后做）
**此阶段是 YAGNI 候选**，不在本规划承诺范围。先观测 wechat-rpa 实际跑起来的延迟，再决定是否：
- 后端 `PreparedData` LRU 缓存（key=模板内容 hash）
- `findImage` 增加 `region` 后只截区域而非全屏（已可由 `region` 触发，但要确认 `screenshot::capture_rect` 走的是 GDI BitBlt 区域而非裁切全图）
- 多模板批量匹配端点
- DPI 缩放显式归一化

---

## 4. HTTP API 改动清单

| 端点 | 现状 | Phase 改动 |
|---|---|---|
| `/api/screenshot/capture` | OK | — |
| `/api/screenshot/desktop` | OK | — |
| `/api/image/find` | 单模板，单/多匹配（数组返回） | Phase 2: 新增 `region` 字段（已有）, `maxMatches` 限制 |
| `/api/image/save-element` | OK | — |
| `/api/image/find-batch` | **新** | Phase 6 候选，本期不做。Phase 2 用 SDK 串行实现 |

**结论**：Phase 1-5 不需要任何 HTTP 端点改动，纯 SDK 工作。Phase 6 才考虑后端。这给 SDK 节奏完全自由。

---

## 5. 任务分解（Phase 1，立即可执行）

> Phase 2-5 等 Phase 1 提交并被使用一周后再展开任务。避免规划过期。

### Task P1.1：模板源归一化工具

**Covers:** S1, S2

**Files:**
- Create: `win-element-selector-sdk/src/image-template.ts`
- Test: `win-element-selector-sdk/src/__tests__/image-template.test.ts`
- Modify: `win-element-selector-sdk/src/types.ts:1119-1123`（FindImageOptions 不变，增 `Template` 类型导出）

- [ ] 步骤 1：写失败测试

```typescript
import { resolveTemplate } from '../image-template';
test('resolves base64 string', async () => {
  const b64 = Buffer.from('PNG').toString('base64');
  await expect(resolveTemplate(b64)).resolves.toBe(b64);
});
test('resolves Buffer to base64', async () => {
  const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  await expect(resolveTemplate(buf)).resolves.toBe(buf.toString('base64'));
});
test('resolves file path', async () => {
  const b64 = await resolveTemplate('./test-fixtures/sample.png');
  expect(typeof b64).toBe('string');
  expect(b64.length).toBeGreaterThan(0);
});
```

- [ ] 步骤 2：运行测试，确认失败

```
cd win-element-selector-sdk
npx jest image-template
```

期望：`Cannot find module '../image-template'`

- [ ] 步骤 3：实现 `image-template.ts`

```typescript
import * as fs from 'fs/promises';

export type Template = string | Buffer;

const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;

export async function resolveTemplate(t: Template): Promise<string> {
    if (Buffer.isBuffer(t)) return t.toString('base64');
    // 启发式：长度 < 260 且包含路径分隔符 / 后缀名 → 文件路径
    const looksLikePath =
        t.length < 260 &&
        (/[\\/]/.test(t) || /\.(png|jpg|jpeg|bmp)$/i.test(t));
    if (looksLikePath) {
        const buf = await fs.readFile(t);
        return buf.toString('base64');
    }
    if (BASE64_RE.test(t)) return t;
    throw new Error(`无法识别模板源（既非 base64 也非文件路径）: ${t.slice(0, 80)}`);
}
```

- [ ] 步骤 4：运行测试，确认通过

- [ ] 步骤 5：将 `flow.findImage` / `flow.clickImage` 第一参数类型从 `string` 改为 `Template`，内部首行加 `templateBase64 = await resolveTemplate(template)`。

```typescript
async findImage(template: Template, options?: FindImageOptions): Promise<FindImageMatch[]> {
    const templateBase64 = await resolveTemplate(template);
    const result = await this.client.findImage({ templateBase64, ... });
    ...
}
```

- [ ] 步骤 6：构建 SDK，确认编译通过

```
npm run build
npm run lint
```

- [ ] 步骤 7：提交

```
git add src/image-template.ts src/__tests__/image-template.test.ts src/flow.ts src/types.ts dist/
git commit -m "feat(sdk): findImage/clickImage 支持模板路径和 Buffer 入参"
```

### Task P1.2：existsImage / waitForImage / waitUntilImageGone

**Covers:** S3, S4, S5

**Files:**
- Modify: `win-element-selector-sdk/src/flow.ts`（在 `clickImage` 之后新增三个方法）

- [ ] 步骤 1：在 `flow.ts` 末尾（`clickImage` 之后）新增

```typescript
async existsImage(template: Template, options?: FindImageOptions): Promise<boolean> {
    try {
        const matches = await this.findImage(template, options);
        return matches.length > 0;
    } catch {
        return false;
    }
}

async waitForImage(template: Template, options?: FindImageOptions & WaitOptions): Promise<FindImageMatch> {
    const timeout = options?.timeout ?? DEFAULTS.WAIT_TIMEOUT;
    const interval = options?.interval ?? 500;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const matches = await this.findImage(template, options).catch(() => []);
        if (matches.length > 0) return matches[0];
        await delay(interval);
    }
    throw new TimeoutError(`waitForImage 超时 (${timeout}ms)`);
}

async waitUntilImageGone(template: Template, options?: FindImageOptions & WaitOptions): Promise<void> {
    const timeout = options?.timeout ?? DEFAULTS.WAIT_TIMEOUT;
    const interval = options?.interval ?? 500;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const matches = await this.findImage(template, options).catch(() => []);
        if (matches.length === 0) return;
        await delay(interval);
    }
    throw new TimeoutError(`waitUntilImageGone 超时 (${timeout}ms)`);
}
```

- [ ] 步骤 2：构建并跑现有测试

```
npm run build
npm test
```

- [ ] 步骤 3：在 wechat-rpa 里写一个手动验证脚本（main.js 之外，临时文件）

- [ ] 步骤 4：提交

```
git commit -am "feat(sdk): 新增 existsImage / waitForImage / waitUntilImageGone"
```

### Task P1.3：clickImage 增强（offset / button / doubleClick / randomRange）

**Covers:** S6

**Files:**
- Modify: `win-element-selector-sdk/src/flow.ts:1524-1536`
- Modify: `win-element-selector-sdk/src/types.ts`（新增 `ImageClickOptions`）

- [ ] 步骤 1：在 `types.ts` 新增

```typescript
export interface ImageClickOptions extends ClickOptions {
    offsetX?: number;
    offsetY?: number;
    randomRange?: { left?: number; right?: number; top?: number; bottom?: number };
    nth?: number;
}
```

- [ ] 步骤 2：改写 `clickImage`

```typescript
async clickImage(
    template: Template,
    options?: FindImageOptions & ImageClickOptions
): Promise<FindImageMatch> {
    const matches = await this.findImage(template, options);
    if (matches.length === 0) {
        throw new ElementNotFoundError('//image-match', '屏幕上未找到匹配图像');
    }
    const idx = options?.nth ?? 0;
    const match = matches[idx] ?? matches[0];
    let x = match.x + (options?.offsetX ?? 0);
    let y = match.y + (options?.offsetY ?? 0);
    // randomRange 抖动（与 flow.click 对齐）
    if (options?.randomRange) {
        // ... 复用 click 内现有逻辑或抽到 utils
    }
    await this.client.clickAtCoordinate({
        window: this.windowSelector!,
        x, y,
        button: options?.button ?? 'left',
        doubleClick: options?.doubleClick,
    });
    return match;
}
```

- [ ] 步骤 3：构建、提交

```
git commit -am "feat(sdk): clickImage 支持偏移/按钮选择/双击/nth"
```

---

## 6. 自检（Self-Review）

**Spec 覆盖**：
- S1, S2 → P1.1
- S3, S4, S5 → P1.2
- S6 → P1.3
- S7-S16 → 留作 Phase 2-5 的后续 plan，本期不展开。

**占位符扫描**：
- "TODO ocr" 出现一处，已注明是 OCR 显式留白（设计原则 #5），非编码工作占位。
- Task P1.3 步骤 2 内含 `// ... 复用 click 内现有逻辑或抽到 utils` —— 这是真实占位符，要求执行者实现时**先 grep `flow.click` 中 `randomRange` 的实际实现**，复制相同的偏移计算逻辑。如果发现 `flow.click` 的 randomRange 逻辑不在 SDK 而在 server 端，则改为传 `randomRange` 给 `clickAtCoordinate`。

**类型一致性**：
- `Template` 类型在 P1.1 创建并导出，P1.2 / P1.3 直接 import 使用。
- `FindImageMatch` 已有，所有方法返回值一致。

---

## 7. 执行交接

本期 Phase 1 三个任务（P1.1 - P1.3）建议**inline 执行**：单 SDK 包、单文件改动、依赖串联（P1.2 用 P1.1 的 `Template`，P1.3 用 P1.1 的 `Template`）。无并行价值。

Phase 2-5 在 Phase 1 落地并被 wechat-rpa 实际使用至少一周后再写新的 plan。这是有意的"延迟决策"：用真实使用反馈替代假想需求。
