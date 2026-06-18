# SDK 图像族 Phase 2 实施计划

> 上一阶段（Phase 0+1）已落地：默认窗口区域查找、严格 API 分族、基础 wechat-rpa demo 全链路验证通过。
>
> 本期聚焦三件事：
> 1. **修两处与点击精度直接相关的 bug**（region 偏移、命中尺寸缺失）
> 2. **clickImage 引入 ClickArea (inset) 模型**，与元素族 click 一致
> 3. **记录"窗口相对位置缓存加速"为后续 Phase 6 候选**，本期不做

---

## 1. 现状新发现的两个 bug

### Bug A：region 偏移未叠加，导致命中坐标在 region 模式下是相对坐标

`win-element-selector-rs/src/api/image_match.rs:184-246` —— 当 `region` 非空时：
- `capture_region(x, y, w, h)` 截一张 `w × h` 的子图
- `segmented_ncc::fast_ncc_template_match()` 返回的 (x, y) 是**该子图左上角为原点**的坐标
- 当前代码直接 `x + template_w/2`，**未加上 region.x / region.y 屏幕偏移**

**后果**：
- demo 步骤 3 命中 `{x:30, y:356}` 应是 `{x:171+30=201, y:247+356=603}`
- 当前 `clickImage` 在窗口模式下会把鼠标点到屏幕 (30, 356) — 完全错位

**修复**：region 路径下，`MatchResult.x += region.x`、`y += region.y`。

### Bug B：findImage 不返回模板宽高，导致 SDK 无法基于命中矩形做百分比偏移

后端做 `x + template_w/2` 已经把 (x, y) 转成中心，但 SDK 拿不到 template_w/h，无法按 ClickArea inset 模型做"中心 ± 百分比"计算。

**修复**：`ImageMatch` 增加 `width: u32`、`height: u32`（命中矩形 = 模板尺寸）。

---

## 2. 设计原则

1. **ClickArea 复用元素族类型**：`flow.clickImage` 的 `clickArea` 字段类型 = 现有 `ClickArea` 接口（`types.ts:230`）。语义对齐：
   - 中心点 = 命中矩形中心（findImage 返回的 (x, y) 即中心）
   - `clickArea: { left: '20%', right: '20%', top: '30%', bottom: '30%' }` —— 内缩 20%/20%/30%/30% 后剩下的子矩形里随机选一点
   - 数字 0~1 视为百分比，与元素族向后兼容
   - 负值 / `"-5px"` 外扩
2. **不动后端**：ClickArea 计算放在 SDK 端。后端只多吐 width/height。
3. **删除 `offsetX/offsetY` 字段**：与 ClickArea 重叠，YAGNI。
   - **但用户已知现状：当前没人用 offsetX/Y（demo 也没用），删除安全**
4. **不引入命中位置缓存**：用户说"不急，记录待办"。本期不实现，写入 notes.md 已记。

---

## 3. 任务分解

### Task P2.1 — 修 region 偏移 bug（后端）

**Covers:** Bug A

**Files:** `win-element-selector-rs/src/api/image_match.rs:184-246`

- [ ] 步骤 1：在 `find_image` handler 里把 region 的 (x, y) 偏移叠加到结果坐标。

```rust
let region_offset = match &req.region {
    Some(r) => (r.x, r.y),
    None => (0, 0),
};

// ...
let result_matches: Vec<ImageMatch> = matches
    .into_iter()
    .map(|(x, y, conf)| ImageMatch {
        x: (x as i32 + region_offset.0) as u32 + template_luma.width() / 2,
        y: (y as i32 + region_offset.1) as u32 + template_luma.height() / 2,
        confidence: conf,
        width: template_luma.width(),
        height: template_luma.height(),
    })
    .collect();
```

注意：`x as i32 + region_offset.0` 的中间结果可能为负（不应该发生但要安全），保持 i32 直到加完再转 u32。

- [ ] 步骤 2：`cargo check`
- [ ] 步骤 3：手动测试（demo region 模式下命中点应是屏幕绝对坐标）

### Task P2.2 — `ImageMatch` 增加 width / height（后端 + SDK）

**Covers:** Bug B

**Files:**
- `win-element-selector-rs/src/api/image_match.rs:50-55`（结构体）
- `win-element-selector-sdk/src/types.ts:1093-1097`（FindImageMatch 类型）

后端：

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMatch {
    pub x: u32,
    pub y: u32,
    pub width: u32,    // 命中矩形宽（= 模板宽）
    pub height: u32,   // 命中矩形高（= 模板高）
    pub confidence: f32,
}
```

SDK：

```typescript
export interface FindImageMatch {
    x: number;       // 命中矩形中心 X（屏幕绝对坐标）
    y: number;       // 命中矩形中心 Y（屏幕绝对坐标）
    width: number;   // 命中矩形宽
    height: number;  // 命中矩形高
    confidence: number;
}
```

P2.1 已包含 width/height 填充，所以 P2.2 主要是结构体字段 + SDK 类型同步。

- [ ] 步骤 1：改 `ImageMatch` struct
- [ ] 步骤 2：改 `FindImageMatch` interface
- [ ] 步骤 3：`cargo check` + `npm run build`

### Task P2.3 — `clickImage` 支持 `clickArea` (inset) 模型

**Covers:** 用户需求 1

**Files:**
- `win-element-selector-sdk/src/image-template.ts`（新增内部工具：解析 ClickAreaValue）
- `win-element-selector-sdk/src/types.ts`（`ImageClickOptions` 增字段，删 offsetX/Y）
- `win-element-selector-sdk/src/flow.ts`（clickImage / clickImageOnDesktop 改造）

#### 步骤 1：新增 `image-click.ts` —— ClickArea 解析

```typescript
// src/image-click.ts
import { ClickAreaValue, ClickArea, FindImageMatch } from './types';

/** 解析单个 ClickAreaValue 为像素值 */
export function resolveClickAreaValue(v: ClickAreaValue | undefined, total: number): number {
    if (v === undefined) return 0;
    if (typeof v === 'number') {
        // 数字 0~1 视为百分比
        return v * total;
    }
    const trimmed = v.trim();
    if (trimmed.endsWith('%')) {
        const pct = parseFloat(trimmed.slice(0, -1));
        return (pct / 100) * total;
    }
    if (trimmed.endsWith('px')) {
        return parseFloat(trimmed.slice(0, -2));
    }
    return parseFloat(trimmed) || 0;
}

/**
 * 给定命中矩形（中心 + 模板宽高）和 ClickArea，返回最终点击点。
 *
 * - clickArea 不传：直接返回中心点
 * - clickArea 各边内缩后形成可点击子矩形，返回该子矩形的中心
 *   （随机抖动由后端 randomRange 处理，本函数返回确定中心点）
 */
export function computeImageClickPoint(
    match: FindImageMatch,
    area?: ClickArea,
): { x: number; y: number } {
    if (!area) return { x: match.x, y: match.y };

    const halfW = match.width / 2;
    const halfH = match.height / 2;
    const left   = match.x - halfW + resolveClickAreaValue(area.left, match.width);
    const right  = match.x + halfW - resolveClickAreaValue(area.right, match.width);
    const top    = match.y - halfH + resolveClickAreaValue(area.top, match.height);
    const bottom = match.y + halfH - resolveClickAreaValue(area.bottom, match.height);

    return {
        x: Math.round((left + right) / 2),
        y: Math.round((top + bottom) / 2),
    };
}
```

#### 步骤 2：单元测试

```typescript
// src/__tests__/image-click.test.ts
import { computeImageClickPoint } from '../image-click';

const MATCH = { x: 200, y: 100, width: 80, height: 40, confidence: 1 };

test('no clickArea returns center as-is', () => {
    expect(computeImageClickPoint(MATCH)).toEqual({ x: 200, y: 100 });
});

test('inset 20% on all sides shrinks to center (still at center)', () => {
    expect(computeImageClickPoint(MATCH, { left: '20%', right: '20%', top: '20%', bottom: '20%' }))
        .toEqual({ x: 200, y: 100 });
});

test('asymmetric inset shifts center', () => {
    // 模板 80×40，中心 (200, 100)
    // left:0, right:50% → x 区间 [160, 200]，中心 180
    expect(computeImageClickPoint(MATCH, { right: '50%' })).toEqual({ x: 180, y: 100 });
});

test('numeric 0.3 == 30%', () => {
    expect(computeImageClickPoint(MATCH, { left: 0.3 })).toEqual(
        computeImageClickPoint(MATCH, { left: '30%' })
    );
});

test('px outset', () => {
    expect(computeImageClickPoint(MATCH, { left: '-10px', right: '-10px' }))
        .toEqual({ x: 200, y: 100 });  // 等量外扩仍居中
});

test('px asymmetric', () => {
    // left -10, right 0 → x 区间 [150, 240]，中心 195
    expect(computeImageClickPoint(MATCH, { left: '-10px' })).toEqual({ x: 195, y: 100 });
});
```

#### 步骤 3：改 `ImageClickOptions`

```typescript
// types.ts
export interface ImageClickOptions {
    /** 选第几个命中（0 起），默认 0 */
    nth?: number;
    /** 鼠标按键，默认 left */
    button?: 'left' | 'right';
    /** 是否双击 */
    doubleClick?: boolean;
    /**
     * 点击区域（Inset 模型，与元素族 ClickArea 一致）
     * 不传：点命中矩形中心
     */
    clickArea?: ClickArea;
}
```

> 删除 `offsetX/offsetY` —— 与 ClickArea 重叠，YAGNI。

#### 步骤 4：改 `clickImage` / `clickImageOnDesktop`

```typescript
// flow.ts
async clickImage(template: Template, options?: FindImageOptions & ImageClickOptions): Promise<FindImageMatch> {
    const matches = await this.findImage(template, options);
    if (matches.length === 0) {
        throw new ElementNotFoundError('//image-match', '当前窗口未找到匹配图像');
    }
    const idx = options?.nth ?? 0;
    const m = matches[idx] ?? matches[0];
    const { x, y } = computeImageClickPoint(m, options?.clickArea);
    await this.client.clickAtCoordinate({
        x, y,
        window: this.windowSelector ?? undefined,
        options: { button: options?.button ?? 'left' },
    });
    if (options?.doubleClick) {
        await this.client.clickAtCoordinate({
            x, y,
            window: this.windowSelector ?? undefined,
            options: { button: options?.button ?? 'left' },
        });
    }
    return m;
}
```

`clickImageOnDesktop` 同改。

#### 步骤 5：导出新工具

```typescript
// index.ts
export { resolveTemplate } from './image-template';
export { computeImageClickPoint } from './image-click';
export type { Template } from './image-template';
```

#### 步骤 6：构建 + 跑全部 jest

### Task P2.4 — wechat-rpa demo 增加 ClickArea 验证

**Files:** `wechat-rpa/demos/find-image-demo.js`

新增步骤 8：

```js
// 用 clickArea 缩到命中矩形右下 1/4 后的中心点，验证点击位置确实偏移
const dotPoint = computeImageClickPoint(matches[0], { left: '50%', top: '50%' });
console.log('[8] computeImageClickPoint(右下1/4) =', dotPoint);
// 不实际点击；只验证函数结果
```

DRY_RUN，不实际触发点击。

### Task P2.5 — 更新 v2 规划文档

把 Phase 2 完成项 ☑，把 P2.X 任务标 done，并加注："P2.6 命中位置缓存推迟到 Phase 6 性能候选"。

---

## 4. 自检

**约束兑现**：
- ClickArea 用元素族同名类型 → API 一致 ✅
- 不引入 offsetX/Y 与 clickArea 并存 → 简洁 ✅
- 命中位置缓存推迟 → 用户已声明"不急" ✅
- 后端只加 width/height + 修 region 偏移，不增加新接口 ✅

**任务硬依赖**：P2.1 + P2.2（后端） → P2.3（SDK）→ P2.4（demo）→ P2.5（doc）。

**执行风格**：inline 串行。所有改动都很小，无并行收益。

**遗留**：用户提到"许多图片在窗口 RECT 相对位置固定"的缓存优化——本期不做，已记入 notes.md，归到未来 Phase 6（性能优化、证据驱动）。

---

## 5. 后续 Phase 调整

原 v2 规划的 Phase 2 内容（S11 element region、S12 findFirstImage、S13 nth/all）暂缓，本期"Phase 2"专注 ClickArea 这个**用户实际遇到的痛点**。原 S11-S13 内容并入 **Phase 2.5 / Phase 3** 后续再拆。
