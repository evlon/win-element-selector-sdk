# SDK 图像自动化迭代规划 (v2)

> **本规划替代 v1**（`2026-06-14-sdk-image-automation.md` 的初版内容）。  
> 用户明确两条硬约束，v1 违反，故重写：
>
> 1. **`find` (XPath) 与 `findImage` API 必须严格区分**，语义清晰，不做"元素失败回退图像"或"在元素内找图"这类跨语义融合 API。
> 2. **`findImage` 默认在 `flow.window()` 指定的当前窗口区域查找**；全屏查找必须使用单独命名的函数，不能靠选项 flag 切换。

---

## 1. 现状盘点（保留 v1 §1.1）

| 层 | 能力 | 接口 |
|---|---|---|
| Rust 后端 | 区域截图、桌面截图、模板匹配（Segmented NCC + FFT NCC）、按元素保存模板 | `POST /api/screenshot/capture`、`/api/screenshot/desktop`、`/api/image/find`、`/api/image/save-element` |
| SDK | `flow.captureScreenshot(region)` / `captureDesktopScreenshot()` / `findImage(b64, opts)` / `clickImage(b64, opts)` | `flow.ts:1483-1536` |
| GUI | "图像"Tab：库浏览、F8 框选、F9 校验、匹配高亮 | `iced_app.rs` |

### 与 v2 约束相关的现状缺口

| 项 | 现状 | v2 约束影响 |
|---|---|---|
| `flow.findImage` 默认作用域 | **桌面全屏**（后端 `capture_desktop`） | ❌ 违约束 2，必须改为窗口默认 |
| `flow.findImage` 与 `flow.find` 命名 | 已分离，但 v1 提议加 `flow.locate(target)` 融合 | ❌ 违约束 1，v2 删除 |
| 后端 `WindowInfo` | `{ title, className, processId, processName }`，**无 rect** | 默认窗口区域查找需要 rect，必须补 |
| 后端 `findImage` 接口 | 接 `region: ImageRegion`（屏幕坐标矩形） | OK，能力足够，SDK 层把"当前窗口"翻译成 region 即可 |
| `Element.findImageInside` (v1 提议) | 不存在 | v1 想加；v2 **删除**（混搭语义） |

---

## 2. v2 核心设计原则（变更项标注 ⚡）

1. ⚡ **API 严格分两族，不交叉**：
   - **元素族**（XPath / UIA）：`find` / `findAll` / `findFirst` / `waitFor` / `exists` / `waitUntilGone` / `click` / ...（已存在）
   - **图像族**：`findImage` / `findAllImages` / `findFirstImage` / `waitForImage` / `existsImage` / `waitUntilImageGone` / `clickImage` / ...（待补）
   - **不做** `locate({xpath, image})`、`element.findImageInside(...)`、`find(xpath).orImage(t)` 这类跨族 API。
   - 跨族组合由用户脚本显式串接：

     ```ts
     try { await flow.click(xpath); }
     catch { await flow.clickImage('./icons/btn.png'); }
     ```

2. ⚡ **图像族默认作用域 = 当前窗口**：
   - `flow.findImage(template)` ≡ `flow.findImage(template, { region: 'window' })`，且 `region: 'window'` 是**默认值**。
   - 当 `flow.window()` 未调用（`_currentWindowInfo == null`）→ 抛 `StateError("findImage 需要先 flow.window(...)")`，**绝不静默 fallback 全屏**。
   - 显式覆盖 region：`region: { x, y, width, height }`（屏幕绝对坐标）。

3. ⚡ **全屏查找另立函数命名**：
   - `flow.findImageOnDesktop(template, opts)` —— 全屏查找，不依赖 `flow.window()`。
   - `flow.clickImageOnDesktop(template, opts)`。
   - `flow.waitForImageOnDesktop(template, opts)`。
   - 命名后缀 `OnDesktop` 取代任何 `fullscreen: true` flag。
   - 不提供 `findImageOnElement(element, template)` —— 跨族 API（违约束 1）；用户需要时自行 `findImage(template, { region: el.boundingBox() })`。

4. **模板源同时支持** base64 / 文件路径 / Buffer，SDK 层归一化（v1 此项保留，未违约束）。

5. **OCR / DPI / 性能优化** 仍延后（v1 §2.5/2.6 保留）。

6. **新约束的副作用**：后端 `WindowInfo` 必须暴露 `rect: { x, y, width, height }`，否则 SDK 拿不到"当前窗口区域"。这是本期**唯一一处后端必改项**。

---

## 3. 迭代分期

### Phase 0 — 后端 WindowInfo 补 rect（**新增，唯一后端改动，前置依赖**）

- [S0] `/api/window/list` 返回的 `WindowInfo` 增加 `rect: { x, y, width, height }`（屏幕物理坐标）。
- [S0.1] `/api/window/exists` / `/api/window/activate` 命中后的 `WindowInfo` 同步带上 `rect`。
- 数据来源：`uiautomation::UIElement::get_bounding_rectangle()`（窗口顶层元素）；若该 API 不可用，回退 `GetWindowRect(HWND)`。
- 不做：`window_id` / 多窗口 rect 缓存等无需求功能。

### Phase 1 — SDK 图像族核心 API（**最小可用闭环**）

> 范围：让 wechat-rpa 能用 `flow.findImage('./images/btn.png')` 完成"在当前微信窗口内找按钮并点击"的全闭环。

- [S1] `Template` 类型 + `resolveTemplate()` 工具（base64 / 路径 / Buffer 归一化）。
- [S2] `flow.findImage(template, opts?)`：默认 `region='window'`，未 `flow.window()` 抛 `StateError`。
- [S3] `flow.findAllImages(template, opts?)`：返回 ≥precision 的全部命中。
- [S4] `flow.existsImage(template, opts?)` —— 默认窗口区域，不抛错。
- [S5] `flow.waitForImage(template, opts?)`。
- [S6] `flow.waitUntilImageGone(template, opts?)`。
- [S7] `flow.clickImage(template, opts?)`：默认窗口区域，支持 `offsetX/Y` / `randomRange` / `button` / `doubleClick` / `nth`。
- [S8] `flow.findImageOnDesktop(template, opts?)`：**唯一**全屏查找入口。
- [S9] `flow.clickImageOnDesktop(template, opts?)`。
- [S10] `flow.waitForImageOnDesktop(template, opts?)`。

> 显式不做：`flow.existsImageOnDesktop` / `flow.waitUntilImageGoneOnDesktop` —— 真实场景几乎不需要"等桌面某图消失"；YAGNI。需要时再补。

### Phase 2 — 子区域 / 多模板（窗口族内细化）

- [S11] `findImage` opts 增加 `region: 'window' | 'element' | Rect`，`region:'element'` 时通过 `element` 选项传入；统一**屏幕物理坐标**为底层入参（Rust 端不变）。
- [S12] `flow.findFirstImage(templates: Template[], opts?)`：串行匹配，第一个命中即返回，包含命中模板索引。
- [S13] `clickImage` 的 `nth` / `all=true`（依次点全部命中，沿用 v1 设计）。

### Phase 3 — 滚动找图（在窗口或子元素内）

- [S14] `flow.scrollToFindImage(template, options)`：在 `region` 限定的容器内滚动 + `findImage` 重试，不命中则 `scrollDown` 一次再试，到底自动停。
- 复用 `flow.scrollDown` / `scrollDetect` 现有机制，**不改 `scrollToVisible`**（不混搭元素族）。
- options：`region: 'window' | 'element' | Rect`、`element?`、`maxScrolls`、`direction`、`stepDelay`。

### Phase 4 — 调试与可视化（按需，1 天）

- [S15] `flow.captureMatchVisualization(template, opts)`：返回带高亮框的 base64 PNG，便于失败排查。
- [S16] OperationLogger 自动记录 `findImage*` / `clickImage*` 的入参摘要（template path 或 base64 hash）+ 命中数 + 第一命中坐标。

### Phase 5 — 性能优化（YAGNI 候选，证据驱动）

> 仅在 wechat-rpa 实测出延迟问题时才启动。

- 后端 `PreparedData` LRU 缓存（key=template hash）。
- 区域截图直走 GDI BitBlt（确认 `screenshot::capture_rect` 是否已是区域而非裁全屏）。
- 多模板批量端点 `/api/image/find-multi`。
- DPI 物理像素归一化文档 + 单测。

### 显式不做（v2 删除项，与 v1 差异）

| v1 编号 | 内容 | 删除原因 |
|---|---|---|
| v1 S13 | `flow.locate({xpath, image})` 融合定位 | 违约束 1（API 严格分族） |
| v1 S14 | `Element.findImageInside(template, opts)` | 违约束 1（Element 族不挂图像方法） |
| v1 S6 / 默认全屏 | `findImage` 默认全屏 | 违约束 2（默认必须窗口） |

---

## 4. HTTP API 改动清单（v2）

| 端点 | 现状 | v2 改动 | Phase |
|---|---|---|---|
| `/api/window/list` | 返回 `WindowInfo` 无 rect | **加 `rect`** | Phase 0 |
| `/api/window/exists` | 同上 | **加 `rect`** | Phase 0 |
| `/api/window/activate` | 同上 | **加 `rect`** | Phase 0 |
| `/api/screenshot/capture` | OK | — | — |
| `/api/screenshot/desktop` | OK | — | — |
| `/api/image/find` | 接 `region: ImageRegion`，区域内匹配 | — | — |
| `/api/image/save-element` | OK | — | — |

**结论**：Phase 1-4 后端零改动，全在 SDK；Phase 0 是唯一一次 Rust 端改动（仅响应字段新增，向后兼容）。

---

## 5. Phase 0 + Phase 1 任务分解（立即可执行）

### Task P0.1 — 后端 WindowInfo 补 rect

**Covers:** S0, S0.1

**Files:**
- Modify: `win-element-selector-rs/src/api/window.rs`（list/exists/activate 三个 handler 的响应结构）
- Modify: `win-element-selector-rs/src/core/window.rs` 或同等位置（数据收集处）

- [ ] 步骤 1：grep 现有 `WindowInfo` Serialize 结构

```
rg "struct WindowInfo" win-element-selector-rs/src
```

- [ ] 步骤 2：在结构上加字段

```rust
#[derive(Debug, Serialize)]
pub struct WindowInfo {
    pub title: String,
    pub class_name: String,
    pub process_id: u32,
    pub process_name: String,
    pub rect: Option<RectDto>,  // 新增，可空兜底
}

#[derive(Debug, Serialize)]
pub struct RectDto { pub x: i32, pub y: i32, pub width: i32, pub height: i32 }
```

- [ ] 步骤 3：填充 rect。优先用 `UIElement::get_bounding_rectangle()`：

```rust
let rect = element.get_bounding_rectangle().ok().map(|r| RectDto {
    x: r.get_left(), y: r.get_top(),
    width: r.get_right() - r.get_left(),
    height: r.get_bottom() - r.get_top(),
});
```

- [ ] 步骤 4：`cargo check --message-format=short`
- [ ] 步骤 5：手测 `curl http://127.0.0.1:8080/api/window/list` 看是否带 rect
- [ ] 步骤 6：提交

```
git commit -am "feat(api): WindowInfo 增加 rect 字段（窗口屏幕坐标）"
```

### Task P0.2 — SDK WindowInfo 类型同步

**Covers:** S0

**Files:**
- Modify: `win-element-selector-sdk/src/types.ts:70-75`（WindowInfo 加 rect）

- [ ] 步骤 1：

```typescript
export interface WindowInfo {
    title: string;
    className: string;
    processId: number;
    processName: string;
    rect?: Rect;  // 新增，与后端一致；Rect 接口已存在
}
```

- [ ] 步骤 2：`npm run build && npm run lint`
- [ ] 步骤 3：提交

```
git commit -am "feat(sdk): WindowInfo 增加 rect 字段同步"
```

### Task P1.1 — 模板归一化工具

**Covers:** S1（与 v1 P1.1 内容一致，复用）

**Files:**
- Create: `win-element-selector-sdk/src/image-template.ts`
- Test: `win-element-selector-sdk/src/__tests__/image-template.test.ts`
- Modify: `win-element-selector-sdk/src/types.ts`（导出 `Template`）

实现见 v1 文档 P1.1（已通过自检），略。

### Task P1.2 — 重写 `flow.findImage`：默认窗口区域 + 严格守卫

**Covers:** S2

**Files:**
- Modify: `win-element-selector-sdk/src/flow.ts:1508-1519`（findImage 现有实现）

- [ ] 步骤 1：写测试（mock client）—— 未 `flow.window()` 时应抛 StateError

```typescript
test('findImage throws StateError without window()', async () => {
    const flow = new Flow(mockClient);  // 没调 window
    await expect(flow.findImage('./x.png')).rejects.toThrow(StateError);
});
test('findImage uses currentWindowInfo.rect as default region', async () => {
    const flow = new Flow(mockClient);
    flow['_currentWindowInfo'] = { ..., rect: { x: 100, y: 200, width: 800, height: 600 } };
    await flow.findImage('./x.png');
    expect(mockClient.findImage).toHaveBeenCalledWith(expect.objectContaining({
        region: { x: 100, y: 200, width: 800, height: 600 }
    }));
});
```

- [ ] 步骤 2：实现

```typescript
async findImage(template: Template, options?: FindImageOptions): Promise<FindImageMatch[]> {
    const templateBase64 = await resolveTemplate(template);
    const region = this.resolveImageRegion(options?.region);  // 默认走窗口
    const result = await this.client.findImage({
        templateBase64,
        precision: options?.precision,
        algorithm: options?.algorithm,
        region,
    });
    if (result.error) throw new Error(result.error);
    return result.matches;
}

private resolveImageRegion(opt: FindImageOptions['region']): Rect {
    if (opt && typeof opt === 'object') return opt;  // 显式 Rect
    // 默认 / 'window'
    if (!this._currentWindowInfo?.rect) {
        throw new StateError(
            'findImage 需要先 flow.window(...) 设置当前窗口；' +
            '或使用 flow.findImageOnDesktop(...) 进行全屏查找'
        );
    }
    return this._currentWindowInfo.rect;
}
```

- [ ] 步骤 3：构建 + 测试通过
- [ ] 步骤 4：提交

```
git commit -am "feat(sdk): findImage 默认在当前窗口区域查找，未 window() 抛 StateError"
```

### Task P1.3 — 全屏族函数

**Covers:** S8, S9, S10

**Files:**
- Modify: `win-element-selector-sdk/src/flow.ts`

- [ ] 步骤 1：在 flow.ts 新增（与 findImage / clickImage 并列）

```typescript
async findImageOnDesktop(template: Template, options?: Omit<FindImageOptions, 'region'> & { region?: Rect }): Promise<FindImageMatch[]> {
    const templateBase64 = await resolveTemplate(template);
    const result = await this.client.findImage({
        templateBase64,
        precision: options?.precision,
        algorithm: options?.algorithm,
        region: options?.region,  // 不传即全屏
    });
    if (result.error) throw new Error(result.error);
    return result.matches;
}

async clickImageOnDesktop(template: Template, options?: ImageClickOptions & FindImageOptions): Promise<FindImageMatch> {
    const matches = await this.findImageOnDesktop(template, options);
    if (matches.length === 0) throw new ElementNotFoundError('//image-match', '桌面未找到匹配图像');
    const m = matches[options?.nth ?? 0] ?? matches[0];
    await this.client.clickAtCoordinate({
        x: m.x + (options?.offsetX ?? 0),
        y: m.y + (options?.offsetY ?? 0),
        button: options?.button ?? 'left',
        doubleClick: options?.doubleClick,
    });
    return m;
}

async waitForImageOnDesktop(template: Template, options?: FindImageOptions & WaitOptions): Promise<FindImageMatch> {
    const timeout = options?.timeout ?? DEFAULTS.WAIT_TIMEOUT;
    const interval = options?.interval ?? 500;
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const matches = await this.findImageOnDesktop(template, options).catch(() => []);
        if (matches.length > 0) return matches[0];
        await delay(interval);
    }
    throw new TimeoutError(`waitForImageOnDesktop 超时 (${timeout}ms)`);
}
```

注意：`clickImageOnDesktop` 不要求 `flow.window()`，所以也不带 `window: this.windowSelector` 字段（如 `clickAtCoordinate` 当前必须传 window，需要后端放宽，或 SDK 内部传 `window: ''`，**先用现有路径，后端兼容性留 P1.3 验证步骤检查**）。

- [ ] 步骤 2：构建 + 简单脚本测一次
- [ ] 步骤 3：提交

```
git commit -am "feat(sdk): 新增 findImageOnDesktop / clickImageOnDesktop / waitForImageOnDesktop 全屏族"
```

### Task P1.4 — 窗口族 exists / waitFor / waitUntilGone / clickImage 增强

**Covers:** S4, S5, S6, S7

**Files:**
- Modify: `win-element-selector-sdk/src/flow.ts`
- Modify: `win-element-selector-sdk/src/types.ts`（新增 `ImageClickOptions`）

实现要点：

```typescript
async existsImage(template: Template, options?: FindImageOptions): Promise<boolean> {
    try {
        const matches = await this.findImage(template, options);
        return matches.length > 0;
    } catch (e) {
        if (e instanceof StateError) throw e;  // 未 window() 仍要抛
        return false;
    }
}

async waitForImage(template: Template, options?: FindImageOptions & WaitOptions): Promise<FindImageMatch> { /* 类似 */ }
async waitUntilImageGone(template: Template, options?: FindImageOptions & WaitOptions): Promise<void> { /* 类似 */ }

async clickImage(template: Template, options?: FindImageOptions & ImageClickOptions): Promise<FindImageMatch> {
    const matches = await this.findImage(template, options);
    if (matches.length === 0) throw new ElementNotFoundError('//image-match', '当前窗口未找到匹配图像');
    const m = matches[options?.nth ?? 0] ?? matches[0];
    await this.client.clickAtCoordinate({
        window: this.windowSelector!,
        x: m.x + (options?.offsetX ?? 0),
        y: m.y + (options?.offsetY ?? 0),
        button: options?.button ?? 'left',
        doubleClick: options?.doubleClick,
    });
    return m;
}
```

- [ ] 提交

```
git commit -am "feat(sdk): 窗口族 existsImage/waitForImage/waitUntilImageGone + clickImage 增强 (offset/nth/button)"
```

### Task P1.5 — `findAllImages` / `findFirstImage`

**Covers:** S3, S12

**Files:** `flow.ts`

```typescript
async findAllImages(template: Template, options?: FindImageOptions): Promise<FindImageMatch[]> {
    return this.findImage(template, options);  // 后端已返回数组
}

async findFirstImage(templates: Template[], options?: FindImageOptions): Promise<{ match: FindImageMatch; index: number; template: Template }> {
    for (let i = 0; i < templates.length; i++) {
        const matches = await this.findImage(templates[i], options).catch(() => []);
        if (matches.length > 0) return { match: matches[0], index: i, template: templates[i] };
    }
    throw new ElementNotFoundError('//image-match-any', `任一模板均未命中 (尝试 ${templates.length} 个)`);
}
```

- [ ] 提交

```
git commit -am "feat(sdk): findAllImages / findFirstImage"
```

---

## 6. 自检（v2 Self-Review）

**约束 1（API 严格分族）**：本规划全部图像 API 都在 `flow.*Image*` 命名空间，元素 API 不变。删除了 v1 的 `locate({xpath, image})` 和 `Element.findImageInside`。Element 类不新增任何图像方法。✅

**约束 2（默认窗口）**：
- `findImage` / `findAllImages` / `existsImage` / `waitForImage` / `waitUntilImageGone` / `clickImage` —— 全部默认 `region='window'`，未 `flow.window()` 抛 `StateError`。✅
- 全屏使用必须显式 `findImageOnDesktop` / `clickImageOnDesktop` / `waitForImageOnDesktop`。后缀 `OnDesktop` 而非选项 flag。✅

**Spec 覆盖**：S0-S10 → P0.1, P0.2, P1.1-P1.5 全部覆盖；S11-S16 留待后续 plan。✅

**类型一致性**：`Template`、`Rect`、`FindImageMatch`、`FindImageOptions`、`ImageClickOptions`、`WindowInfo.rect` 在所有任务步骤中签名一致。✅

**占位符**：仅 P1.3 步骤 1 的"后端兼容性留 P1.3 验证步骤检查"是真实待验证项，不是占位符。无 TBD/TODO。✅

---

## 7. 执行交接

- **执行顺序硬依赖**：P0.1 → P0.2 → P1.2（findImage 默认窗口）→ 其余 P1.x。
- **Inline 执行**：P0.1 单独一次（Rust 后端，要重启 server 验证）；其余 SDK 任务可连续 inline 完成。
- **暂不并行化**：所有任务都在同一 SDK 文件 `flow.ts`，并行无收益。
- Phase 2-5 等 Phase 1 在 wechat-rpa 实测一周后再拆任务。
