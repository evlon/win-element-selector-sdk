# SDK 图像族 Phase 2.5/3 实施计划

> 用户明确要求 scrollToFindImage 采用双线程方案：一个滚动、一个截图匹配。

---

## 设计

### scrollToFindImage 双线程架构

```
┌─────────────────────────────────────┐
│ scrollToFindImage(template, opts)   │
│                                     │
│  ┌─── scrollThread ───┐  ┌── matchThread ─┐
│  │ scrollDown(xpath)   │  │ findImage()    │
│  │ scrollDetect()      │  │ 每 500ms 一次  │
│  │ 滚动间隔 1000ms     │  │                │
│  └─────────┬───────────┘  └───────┬────────┘
│            │  found!              │  found!
│            └──── Promise.race ────┘
│                     │
│            AbortController 通知对方停止
└─────────────────────────────────────┘
```

**同步机制：**
- 共享 `state = { found: false, match: null, scrollEnded: false }`
- 匹配线程命中 → 设 `state.found = true`，resolve promise
- 滚动线程到底 → 设 `state.scrollEnded = true`，resolve promise
- `Promise.race` 两者先完成的决定结果

**region 参数：**
- `'window'`（默认）：匹配线程在当前窗口矩形内搜索
- `'element'` + `scrollContainer: string`：匹配线程在 scrollContainer 的 boundingRect 内搜索
- `Rect`：显式矩形

**滚动到底检测：** 复用现有 `scrollDetect` API（UIA 元素位移判断），不重新发明。

### Phase 2.5 小项（并行实现）

- [S11] `findImage` opts 的 `region: 'element'` —— 需要 `element` 选项传入 Element 对象
- [S12] `findFirstImage(templates[])` —— 已实现，确认无遗漏
- [S13] `clickImage` 的 `all: true` —— 依次点所有命中

---

## Task 分解

### Task P2.5.1 — scrollToFindImage 实现

**Files:** `win-element-selector-sdk/src/flow.ts`

```typescript
async scrollToFindImage(
    template: Template,
    options?: {
        /** 滚动容器 XPath（鼠标移到此元素上执行滚动） */
        scrollContainer: string;
        /** 搜索区域。'window'=当前窗口矩形；'element'=scrollContainer 的矩形；或显式 Rect */
        region?: 'window' | 'element' | Rect;
        /** 匹配参数 */
        precision?: number;
        algorithm?: 'segmented' | 'fft';
        /** 最大滚动次数，默认 50 */
        maxScrolls?: number;
        /** 每次滚动间隔 ms，默认 1000 */
        scrollInterval?: number;
        /** 每次匹配间隔 ms，默认 500（匹配线程独立于滚动间隔） */
        matchInterval?: number;
        /** 总超时 ms，默认 60000 */
        timeout?: number;
    },
): Promise<FindImageMatch>
```

**实现要点：**

```typescript
async scrollToFindImage(template, options) {
    const maxScrolls = options?.maxScrolls ?? 50;
    const scrollInterval = options?.scrollInterval ?? 1000;
    const matchInterval = options?.matchInterval ?? 500;
    const timeout = options?.timeout ?? 60000;
    const startTime = Date.now();

    // 1. 解析搜索区域
    const getRegion = async (): Promise<Rect> => {
        const r = options?.region ?? 'window';
        if (r === 'window') return this.resolveImageRegion();
        if (r === 'element') {
            const el = await this._getContainerRect(options!.scrollContainer);
            if (!el) throw new Error(`滚动容器未找到: ${options!.scrollContainer}`);
            return el;
        }
        return r; // 显式 Rect
    };

    // 2. 共享状态
    const state = { found: false, match: null as FindImageMatch | null, scrollEnded: false };

    // 3. 匹配线程
    const matchThread = (async () => {
        while (!state.found && !state.scrollEnded && Date.now() - startTime < timeout) {
            const region = await getRegion();
            const matches = await this.findImage(template, {
                precision: options?.precision,
                algorithm: options?.algorithm,
                region,
            }).catch(() => []);
            if (matches.length > 0) {
                state.match = matches[0];
                state.found = true;
                return matches[0];
            }
            await delay(matchInterval);
        }
        return null;
    })();

    // 4. 滚动线程
    const scrollThread = (async () => {
        for (let i = 0; i < maxScrolls; i++) {
            if (state.found || Date.now() - startTime >= timeout) break;
            try {
                await this.scrollDown(options!.scrollContainer, 1, {
                    scrollInterval,
                    useIdle: false,
                });
                // 检测是否到底
                const detect = await this.scrollDetect(options!.scrollContainer, {
                    direction: 'down',
                    rollback: false,
                });
                if (detect.atEnd) {
                    state.scrollEnded = true;
                    break;
                }
            } catch {
                state.scrollEnded = true;
                break;
            }
        }
        state.scrollEnded = true;
    })();

    // 5. 等待任一线程完成
    const result = await Promise.race([matchThread, scrollThread]);

    if (state.match) return state.match;
    if (!state.found) {
        throw new ElementNotFoundError('//image-match', '滚动后未找到匹配图像');
    }
    return state.match!;
}
```

### Task P2.5.2 — findImage region: 'element' 支持

**Files:** `types.ts`, `flow.ts`

`FindImageOptions` 增加 `region: 'element'` 变体，`flow.ts` 的 `resolveImageRegion` 处理 `'element'` + `element: Element`。

但 `findImage` 的签名目前是 `findImage(template, options?)`，options 没有 element 字段。加一个 `element?: Element` 字段到 `FindImageOptions`。

### Task P2.5.3 — clickImage all 模式

**Files:** `types.ts`, `flow.ts`

`ImageClickOptions` 增加 `all?: boolean`。`clickImage` 在 `all: true` 时遍历所有命中逐个点击，返回数组。

### Task P2.5.4 — 构建 + 测试 + demo

### Task P2.5.5 — 更新规划文档

---

## 硬依赖

P2.5.1 + P2.5.2 + P2.5.3 串行实现（flow.ts 同一文件）。P2.5.4 验证。P2.5.5 收尾。

---

## 不做

- 不引入 AbortController（Promise.race + 共享 state 足够简洁）
- 不缓存命中位置（Phase 6 候选）
- 不修改后端（纯 SDK 层工作）
