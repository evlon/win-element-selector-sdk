# SDK 可用性设计 —— 错误信息、命名规范、默认值、枚举

> 目标：让 SDK 使用者（RPA 开发者 / 小白用户）在遇到运行时问题时能快速定位原因，
> 可选参数的命名和枚举值全局一致，默认值稳定优先。

---

## 一、运行时错误信息增强

### 原则
- **错误必须包含上下文**：哪个窗口、哪个元素、什么操作、失败原因
- **错误必须有中文提示**：面向中文 RPA 开发者
- **错误需有恢复建议**：告诉用户下一步可以做什么
- **统一使用 SDKError 体系**：不裸抛 `new Error(...)`

### 1.1 当前问题清单

| 位置 | 当前写法 | 问题 |
|------|---------|------|
| `click()` L459 | `throw new ActionFailedError('click', 'Click failed', undefined)` | 无窗口/元素/坐标信息 |
| `type()` L578 | `throw new Error('Type text failed: ' + ...)` | 裸 Error，非 SDKError 体系 |
| `type()` L593 | `throw new Error('Type text failed')` | 同上，无上下文 |
| `waitUntilGone()` L1757 | `throw new Error('Element did not disappear...')` | 应使用 TimeoutError |
| `waitFor()` L1808 | `throw new Error('Element did not appear...')` | 同上 |
| `findElement()` L1348 | `throw new Error('findOne 匹配到...')` | 应使用 SDKError |
| `rightClick()` L508 | `throw new ActionFailedError('rightClick', 'Click failed', undefined)` | 无上下文 |
| `dragTo()` L2029 | `throw new ActionFailedError('dragTo', '坐标拖拽暂不支持...')` | 勉强可接受 |
| `hover()` L2000 | `throw new ActionFailedError('hover', result.error...')` | 缺窗口/元素信息 |
| `scrollToVisible()` L1881 | `return { visible: false, scrolledToEnd: false, scrolled: 0 }` | 静默吞错，用户无法知道原因 |
| `flash()` L1966 | `throw new ActionFailedError('flash', ...)` | 缺窗口/元素信息 |

### 1.2 改进方案

#### A. 新增辅助函数 `buildErrorContext()`

```typescript
/** 构造统一的错误上下文对象 */
private buildErrorContext(operation: string, extra?: Record<string, any>): Record<string, any> {
    return {
        operation,
        window: this.windowSelector,
        element: this.findSelector,
        elementName: this.info.name || '(无名称)',
        elementType: this.info.controlType || '(未知类型)',
        runtimeId: this.runtimeId || '(无缓存)',
        suggestion: this.getSuggestion(operation),
        ...extra,
    };
}
```

#### B. 操作建议映射表

```typescript
private getSuggestion(operation: string): string {
    const map: Record<string, string> = {
        click: '元素可能被遮挡、不可见或已失效，请先调用 flash() 确认位置，或 refresh() 刷新状态',
        type: '确认元素已是可输入状态，可先 click() 聚焦再输入',
        find: '检查 XPath 是否正确，元素是否在当前窗口中',
        hover: '确认元素可见且鼠标可到达',
        scroll: '检查容器 XPath 是否正确，或增大 timeout 值',
        waitFor: '增加 timeout 值或检查触发条件',
        waitUntilGone: '增加 timeout 值或使用更长的等待间隔',
    };
    return map[operation] || '查看日志获取更多详情';
}
```

#### C. 改进后的错误抛出示例

```typescript
// click() - 改进后
if (!result.success) {
    const ctx = this.buildErrorContext('click', {
        clickPoint: result.clickPoint || '(未知)',
        backendError: result.error,
    });
    throw new ActionFailedError(
        `点击失败: ${this.info.name || this.findSelector}`,
        `click —— 后端返回失败: ${result.error || '未知原因'}
窗口: ${this.windowSelector}
元素: ${this.findSelector}
元素名称: ${this.info.name || '(无)'}
元素类型: ${this.info.controlType || '(未知)'}
建议: 请先调用 flash() 确认元素位置，检查是否被遮挡`,
    );
}
```

#### D. 错误信息格式规范

所有 SDKError 子类的 message 采用两层结构：
- **第一行**：简短摘要（中文，适合日志搜索）
- **后续行**：详细上下文（窗口、元素、参数、建议）

```typescript
// 格式：
`${简短摘要}
上下文:
  - 窗口: ${window}
  - 元素: ${element}
  - 参数: ${params}
建议: ${suggestion}`
```

---

## 二、可选参数命名规范

### 2.1 全局命名约定

| 语义 | 统一名称 | 类型 | 说明 |
|------|---------|------|------|
| 操作前等待 | `waitBefore` | `number` | 毫秒，所有动作类方法统一 |
| 操作后等待 | `waitAfter` | `number` | 毫秒，所有动作类方法统一 |
| 超时时间 | `timeout` | `number` | 毫秒，所有等待/滚动类方法统一 |
| 轮询间隔 | `interval` | `number` | 毫秒，所有轮询类方法统一 |
| 唯一性属性 | `propNames` (参数) | `string[]` | 作为独立 rest 参数，不放入 options（已统一） |
| 随机范围 | `randomRange` | `number` | 0-1 比例（已统一） |
| 拟人化 | `humanize` | `boolean` | 是否启用拟人化（已统一） |

### 2.2 当前不一致项及修正（已全部实施 ✅）

#### 参数名小白友好重命名

| 旧名 | 新名 | 影响范围 | 状态 |
|------|------|---------|------|
| `delta` | `scrollAmount` | ScrollOptions / ScrollConfig | ✅ 已实施 |
| `autoDelta` | `autoScrollAmount` | ScrollOptions / ScrollConfig | ✅ 已实施 |
| `deltaFactor` | `scrollAmountRatio` | ScrollOptions / ScrollConfig | ✅ 已实施 |
| `scrollIntervalMs` | `scrollInterval` | ScrollOptions / ScrollConfig / ScrollToVisibleOptions | ✅ 已实施 |
| `autoDeltaInitialDelayMs` | `autoScrollDelay` | ScrollOptions / ScrollConfig / ScrollToVisibleOptions | ✅ 已实施 |
| `minDeltaRatio` | `minScrollRatio` | ScrollOptions / ScrollConfig / ScrollToVisibleOptions | ✅ 已实施 |
| `scrollToCenterThreshold` | `centerSnapThreshold` | ScrollOptions / ScrollConfig / ScrollToVisibleOptions | ✅ 已实施 |
| `scrollToCenterAdjustTimes` | `centerAdjustTimes` | ScrollOptions / ScrollConfig / ScrollToVisibleOptions | ✅ 已实施 |
| `occlusionCheck` | `checkBlocked` | ClickOptions | ✅ 已实施 |
| `trajectory` | `movePath` | MoveOptions | ✅ 已实施 |
| `cacheTTL` | `cacheTime` | SDKConfig / FindOptions | ✅ 已实施 |
| `markClick` | `showDot` | ClickOptions | ✅ 已实施 |
| `markTimeout` | `dotDuration` | ClickOptions | ✅ 已实施 |
| `humanIntervention` | `humanDetect` | IdleOptions | ✅ 已实施 |
| `delayMs` (scrollToVisible) | `scrollInterval` | ScrollToVisibleOptions | ✅ 已实施 |

#### 枚举值小白友好重命名

| 旧值 | 新值 | 枚举类型 | 状态 |
|------|------|---------|------|
| `'coordinate'` | `'mouse'` | clickMode | ✅ 已实施 |
| `'keyboard'` | `'key'` | typeMode | ✅ 已实施 |
| `'value'` | `'set'` | typeMode | ✅ 已实施 |
| `'clipboard'` | `'paste'` | typeMode | ✅ 已实施 |
| `'linear'` | `'line'` | movePath (原 trajectory) | ✅ 已实施 |
| `'bezier'` | `'curve'` | movePath (原 trajectory) | ✅ 已实施 |

> **向后兼容策略**：所有旧名/旧值仍有效，标记 `@deprecated`。代码中通过 `normalize*()` 函数自动映射旧值到新值。旧字段与对应新字段同时存在时，新字段优先级更高。

---

## 三、默认值：稳定优先，然后提速

### 3.1 默认值设计原则

```
稳定性 > 速度
RPA 能跑 > RPA 跑得快
```

具体表现：
- 操作前等待：默认给应用充足响应时间
- 操作后等待：默认等待 UI 刷新完成
- 点击位置：默认加随机偏移（避免被反自动化检测）
- 移动轨迹：默认拟人化贝塞尔曲线（而非直线）
- 点击模式：默认鼠标移动+点击（兼容性最好），UIA Invoke 作为可选加速

### 3.2 click() 默认值分析

**当前默认值**：
```typescript
click: {
    humanize: true,      // ✅ 拟人化移动
    randomRange: 0.55,   // ✅ 随机偏移
    offset: 'center',    // ✅ 点击中心
    waitBefore: 1000,    // ⚠️ 偏长，可优化
    waitAfter: 2000,     // ⚠️ 偏长，可优化
}
```

**用户要求**：`click` 默认 = 鼠标移动过去 + 点击；可选 = UIA Invoke

**默认 `clickMode`**：当前未明确设置默认值（后端可能默认 coordinate）。
建议显式设为 `'mouse'`（见下方枚举重命名），明确表达"默认用鼠标点击"。

**建议默认值**：
```typescript
click: {
    humanize: true,
    randomRange: 0.55,
    offset: 'center',
    waitBefore: 200,      // 缩短：移动完成即点击，不需要等 1 秒
    waitAfter: 500,       // 缩短：大部分应用 500ms 足够响应
    clickMode: 'mouse',   // 新增默认：鼠标点击（稳定优先）
    occlusionCheck: true, // 新增默认：点击前检查遮挡（稳定优先）
}
```

### 3.3 type() 默认值分析

```typescript
type: {
    charDelay: { min: 50, max: 150 },  // ✅ 拟人化输入速度
    waitBefore: 500,                     // ✅ 合理
    waitAfter: 1000,                     // ✅ 合理
    typeMode: 'keyboard',                // 需确认默认值是否显式设置
}
```

默认 `typeMode` 应为 `'key'`（重命名后）——键盘模拟最稳定，兼容所有控件。

### 3.4 scrollToVisible() 默认值分析

```typescript
scrollToVisible: {
    direction: 'down',        // 需改为必传参数？或者保留默认？
    timeout: 60000,           // ✅ 充足
    scrollTimes: 100,         // ✅ 充足
    autoDelta: false,         // ⚠️ scrollToVisible 默认 false，其他 scroll 默认 true（不一致）
    deltaFactor: 0.8,         // ✅
    delayMs: 1000,            // ✅
    scrollToCenter: true,     // ✅ 稳定优先
    scrollToCenterAdjustTimes: 5,  // ✅
}
```

`autoDelta` 不一致：`DEFAULTS.scroll.autoDelta = true`，`DEFAULTS.scrollToVisible.autoDelta = true`，
但 `scrollToVisible()` 代码中 `autoDelta = options?.autoDelta ?? false` — 这里覆盖了 DEFAULT！

→ **Bug**：`scrollToVisible` 代码 L1843 `autoDelta = options?.autoDelta ?? false` 应该用 `?? DEFAULTS.scrollToVisible.autoDelta`

### 3.5 全局默认值调整总结

| 参数 | 旧值 | 新值 | 理由 |
|------|------|------|------|
| `click.waitBefore` | 1000 | 200 | 移动完毕即可点击，无需 1s 等待 |
| `click.waitAfter` | 2000 | 500 | 500ms 足够大多数UI响应 |
| `click.clickMode` | (隐式) | `'mouse'` | 显式默认：鼠标点击 |
| `click.occlusionCheck` | (无) | `true` | 稳定优先：默认检查遮挡 |
| `scrollToVisible.autoDelta` | `false`(代码) | `true` | 对齐 DEFAULTS 和代码 |

---

## 四、枚举值：小白友好、简短

### 4.1 重命名方案

| 类别 | 当前 | 新值 | 理由 |
|------|------|------|------|
| **clickMode** | `'coordinate'` | `'mouse'` | "coordinate" 是实现细节，用户关心的是"鼠标点"还是"程序调" |
| **clickMode** | `'invoke'` | `'invoke'` | ✅ 保持不变，简短且语义准确 |
| **typeMode** | `'keyboard'` | `'key'` | 缩短，小白理解"按键输入" |
| **typeMode** | `'value'` | `'set'` | "set" 比 "value" 更直观（"设置值"） |
| **typeMode** | `'clipboard'` | `'paste'` | "paste" 比 "clipboard" 更直白（"粘贴"） |
| **trajectory** | `'linear'` | `'line'` | 缩短，小白更熟悉 "line" |
| **trajectory** | `'bezier'` | `'curve'` | "curve" 比 "bezier" 更通俗 |
| **direction** | `'up'` / `'down'` | ✅ 不变 | 已足够简短清晰 |
| **speed** | `'slow'` / `'normal'` / `'fast'` | ✅ 不变 | 已足够简短清晰 |
| **visibility** | `'fully_visible'` | `'full'` | 缩短，意思不变 |
| **visibility** | `'partially_visible'` | `'part'` | 缩短，意思不变 |
| **visibility** | `'offscreen'` | `'off'` | 缩短 |
| **visibility** | `'not_found'` | `'none'` | 缩短 |
| **visibility** | `'error'` / `'unknown'` | ✅ 不变 | 已足够简短 |
| **position** | `'above'` / `'below'` / `'left'` / `'right'` / `'inside'` | ✅ 不变 | 已足够简短清晰 |

> ✅ **参数名和枚举值重命名已于 2026-06-07 全部实施完成。** 详情见 2.2 节。

### 4.2 向后兼容策略（已实现）

所有枚举字符串采用"新旧双接受"：
- 新值作为主推（文档和示例用新值）
- 旧值继续有效（标记 `@deprecated`），内部通过 `normalize*()` 函数映射到新值

已实现的 normalize 函数（位于 `src/element.ts`）：
- `normalizeTypeMode()` — 标准化 `'key'` / `'set'` / `'paste'`（兼容旧值 `'keyboard'` / `'value'` / `'clipboard'`）
- `normalizeClickMode()` — 标准化 `'mouse'` / `'invoke'`（兼容旧值 `'coordinate'`）
- `normalizeMovePath()` — 标准化 `'line'` / `'curve'`（兼容旧值 `'linear'` / `'bezier'`）

```typescript
/** 标准化 clickMode 枚举值 */
function normalizeClickMode(mode?: string): 'mouse' | 'invoke' {
    if (!mode) return 'mouse';
    switch (mode) {
        case 'mouse':
        case 'coordinate':  // 旧值兼容
            return 'mouse';
        case 'invoke':
            return 'invoke';
        default:
            return 'mouse';  // 未知值回退到安全默认
    }
}
```

---

## 五、实施计划

### Phase 1: 错误信息增强（优先级最高）⏳ 待实施
1. 新增 `buildErrorContext()` 和 `getSuggestion()` 辅助方法
2. 逐个修复所有 `throw new Error(...)` → SDKError 子类
3. 所有 ActionFailedError 携带完整上下文
4. `scrollToVisible` 静默失败改为抛异常（或至少 log warning）

### Phase 2: 可选参数命名规范化 ✅ 已完成（2026-06-07）
1. 重命名不一致的参数（保留旧名兼容）✅
2. 统一 `scrollToVisible` 的 `times` → `scrollTimes`，`delayMs` → `scrollInterval` ✅
3. 修复 `scrollToVisible` 中 `autoDelta` 默认值 bug ✅

### Phase 3: 枚举值简化 + 默认值调整 ✅ 已完成（2026-06-07）
1. 新增枚举 normalize 函数 ✅（normalizeTypeMode / normalizeClickMode / normalizeMovePath）
2. 修改所有选项接口的枚举类型为新值 ✅
3. 旧值映射兼容 ✅
4. 调整默认值（click waitBefore/After 缩短等）⏳ 待定

### Phase 4: 文档更新 ⏳ 待实施
1. 更新 README 示例使用新枚举值
2. 更新 examples/ 中的示例代码
3. 编写错误排查指南文档

---

## 六、变更影响评估

| 变更 | 破坏性 | 影响范围 | 兼容处理 |
|------|--------|---------|---------|
| 错误信息格式变更 | 无 | 用户代码不依赖错误格式 | 无需兼容 |
| 参数命名变更 | 有 | 用户使用旧参数名 | 新旧双接受 + @deprecated |
| 枚举值变更 | 有 | 用户使用旧枚举值 | normalize 映射兼容 |
| 默认值调整 | 有 | 脚本执行时序可能变化 | 显式文档说明，speedFactor 可全局调整 |
| scrollToVisible autoDelta | 有 | 滚动行为变化 | Bug 修复，行为更符合预期 |
