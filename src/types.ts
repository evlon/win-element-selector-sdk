// ═══════════════════════════════════════════════════════════════════════════════
// 基础类型
// ═══════════════════════════════════════════════════════════════════════════════

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SDK 配置
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 自动等待配置
 */
export interface AutoWaitConfig {
    enabled: boolean;
    delays: {
        afterFind?: number;      // 查找后等待 (ms)
        afterClick?: number;     // 点击后等待 (ms)
        afterType?: number;      // 输入后等待 (ms)
        beforeAction?: number;   // 操作前等待 (ms)
    };
}

/**
 * 日志配置
 */
export interface LoggingConfig {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
    showElementInfo?: boolean;   // 显示元素详细信息
    showCoordinates?: boolean;   // 显示坐标信息
}

/** 缓存时间配置。null = 永不过期，number = 毫秒 */
export type CacheTime = number | null;

export interface SDKConfig {
    baseUrl: string;
    timeout?: number;
    autoWait?: AutoWaitConfig;
    logging?: LoggingConfig;
    idleMotion?: IdleOptions;  // idle 移动的默认配置
    scroll?: ScrollConfig;     // 滚动的默认配置
    speedFactor?: number;      // 全局速度因子，默认 1
    /** 全局元素缓存时间（毫秒），默认 null = 永不过期 */
    cacheTime?: CacheTime;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 窗口相关
// ═══════════════════════════════════════════════════════════════════════════════

export interface WindowSelector {
    title?: string;
    className?: string;
    processName?: string;
    processId?: number;
}

export interface WindowInfo {
    title: string;
    className: string;
    processId: number;
    processName: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 元素相关
// ═══════════════════════════════════════════════════════════════════════════════

export interface ElementQueryParams {
    window: string;
    element: string;
    runtimeId?: string;
    randomRange?: number;
    /** Chrome TreeWalker 回退开关（默认 true）。
     *  当 Fast 模式 (ControlView) 的 descendant 步骤返回 0 结果时，
     *  自动回退到 Full 模式 (RawView) 重新搜索。
     *  适用于 Chrome/WebView 的 UIA Provider 无法被 FindAll(Subtree) 穿透的场景。
     *  设为 false 可禁用此回退行为。 */
    chromeTreewalkerFallback?: boolean;
}

/**
 * find 系列函数的选项
 */
export interface FindOptions {
    /** 覆盖全局缓存时间（毫秒），null = 永不过期 */
    cacheTime?: CacheTime;
    /** 用于唯一标识当前元素的属性名列表 */
    propNames?: string[];
    /** Chrome TreeWalker 回退开关（默认 true）。
     *  当 Fast 模式 descendant 步骤返回 0 结果时，自动回退到 Full 模式。
     *  设为 false 可禁用此回退行为。 */
    chromeTreewalkerFallback?: boolean;
}

export interface ElementInfo {
    findSelector?: string;
    rect?: Rect;
    /** 元素真正可见、可点击的矩形区域（元素矩形 ∩ 窗口视口矩形） */
    visibleRect?: Rect;
    center?: Point;
    centerRandom?: Point;
    /** 元素 RuntimeId（用于缓存快速查找） */
    runtimeId?: string;
    controlType: string;
    name: string;
    automationId: string;
    className: string;
    frameworkId: string;
    helpText: string;
    localizedControlType: string;
    isEnabled: boolean;
    isOffscreen: boolean;
    isPassword: boolean;
    acceleratorKey: string;
    accessKey: string;
    itemType: string;
    itemStatus: string;
    processId: number;
    // UIA Pattern availability
    isCheckable?: boolean;
    isChecked?: boolean | null;
    isClickable?: boolean;
    isScrollable?: boolean;
    isSelected?: boolean | null;
}

// 前向引用，Element 在 element.ts 中定义
import type { Element } from './element';

/**
 * findAll 返回的扩展数组，支持 position() 方法。
 */
export interface ElementList extends Array<Element> {
    /** 按 position 重新查询列表中第 N 个元素（1-based） */
    position(n: number): Promise<Element>;
}

/**
 * 元素查找响应
 * ElementInfo 以嵌套形式返回，SDK 直接消费。
 */
export interface ElementResponse {
    found: boolean;
    findSelector: string;
    /** 匹配到的元素总数 */
    total: number;
    error: string | null;
    element?: ElementInfo | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 元素导航 (Compass) 相关
// ═══════════════════════════════════════════════════════════════════════════════

/** 导航步骤类型 */
export type NavigateStep =
    | { type: 'parent'; levels: number }
    | { type: 'child'; index: number }
    | { type: 'sibling_abs'; index: number }
    | { type: 'sibling_left'; offset: number }
    | { type: 'sibling_right'; offset: number };

/** 导航响应 */
export interface NavigateResponse {
    found: boolean;
    findSelector?: string;
    element?: ElementInfo | null;
    error?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 鼠标操作相关
// ═══════════════════════════════════════════════════════════════════════════════

export interface MoveParams {
    target: Point;
    options?: MoveOptions;
}

export interface MoveResult {
    success: boolean;
    startPoint: Point;
    endPoint: Point;
    durationMs: number;
    error: string | null;
}

export interface ClickArea {
    left?: number;   // 0-1 比例
    right?: number;
    top?: number;
    bottom?: number;
}

/** 视口内边距值（支持像素或百分比） */
export type InsetValue = number | string;  // 如 50 或 "5%"

/** 视口内边距（用于排除固定遮挡区域如悬浮底部栏、顶部导航等） */
export interface ViewportInset {
    /** 左侧排除（像素数或百分比字符串如 "5%"） */
    left?: InsetValue;
    /** 顶部排除 */
    top?: InsetValue;
    /** 右侧排除 */
    right?: InsetValue;
    /** 底部排除 */
    bottom?: InsetValue;
}

export interface ClickParams {
    window: WindowSelector | string;
    element: string;
    runtimeId?: string;
    /** 是否使用缓存（默认 true）。false: 忽略 runtimeId，直接走 XPath 搜索 */
    useCache?: boolean;
    options?: ClickOptions;
}

export interface ClickedElement {
    controlType: string;
    name: string;
}

export interface ClickResult {
    success: boolean;
    clickPoint: Point;
    element: ClickedElement | null;
    error: string | null;
}

export interface TypeResult {
    success: boolean;
    charsTyped: number;
    durationMs: number;
    error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 空闲移动相关
// ═══════════════════════════════════════════════════════════════════════════════

export interface HumanDetectConfig {
    enabled: boolean;
    pauseOnMouse?: boolean;
    pauseOnKeyboard?: boolean;
    resumeDelay?: number;
}

export interface IdleMotionParams {
    window: WindowSelector;
    xpath: string;
    speed?: 'slow' | 'normal' | 'fast';
    moveInterval?: number;
    idleTimeout?: number;
    humanDetect?: HumanDetectConfig;
}

export type PauseReason = 'api_call' | 'human_mouse' | 'human_keyboard' | 'manual' | null;

export interface IdleMotionStatus {
    active: boolean;
    paused: boolean;
    pauseReason: PauseReason;
    currentRect: Rect | null;
    runningDurationMs: number | null;
    lastActivityMs: number | null;
}

export interface StopResult {
    success: boolean;
    durationMs: number;
    error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 健康检查
// ═══════════════════════════════════════════════════════════════════════════════

export interface HealthStatus {
    status: string;
    version: string;
    service: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 默认值
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULTS = {
    baseUrl: 'http://127.0.0.1:8080',
    timeout: 60000,  // 增加到 60 秒，避免长时间操作超时

    speedFactor: 1,  // 全局速度因子：1=正常，2=2倍速，0.5=半速
    
    move: {
        humanize: true,
        movePath: 'curve' as const,
        duration: 1000,
        waitBefore: 100,
        waitAfter: 500,
    },
    
    click: {
        humanize: true,
        randomRange: 0.55,
        offset: 'center',  // 默认使用 center + randomRange
        waitBefore: 1000,  // 点击前等待，让鼠标稳定
        waitAfter: 2000,   // 点击后等待，给应用响应时间
    },
    
    idleMotion: {
        speed: 'normal' as const,
        moveInterval: 800,
        idleTimeout: 60000,
        humanDetect: {
            enabled: true,
            pauseOnMouse: true,
            pauseOnKeyboard: true,
            resumeDelay: 3000,
        },
    },
    
    type: {
        charDelay: {
            min: 50,
            max: 150,
        },
        waitBefore: 500,
        waitAfter: 1000,
    },
    
    autoWait: {
        enabled: false,
        delays: {
            afterFind: 500,
            afterClick: 1000,
            afterType: 1000,
            beforeAction: 500,
        }
    },
    
    logging: {
        enabled: true,
        level: 'info' as const,
        showElementInfo: true,
        showCoordinates: false,
    },

    scroll: {
        scrollAmount: 120,
        times: 3,
        timeout: 60000,  // 增加到 60 秒，避免长时间滚动超时
        useIdle: true,
        autoScrollAmount: true,
        scrollAmountRatio: 0.8,
        scrollToCenter: true,
        centerAdjustTimes: 5,
        // 滚动间隔（每次滚动后等待 UI 响应时间，毫秒）
        scrollInterval: 1000,
        // autoScrollAmount 首次滚动后延迟（等待 UI 重新计算布局，毫秒）
        autoScrollDelay: 1000,
        // 最小滚动量比例（调整滚动时的最小滚动量占原始滚动量的比例）
        minScrollRatio: 0.1,
        // 居中吸附阈值（元素中心与目标中心距离小于此阈值时认为已居中，单位：视口高度比例）
        centerSnapThreshold: 0.10,
    },

    scrollToVisible: {
        direction: 'down' as const,
        timeout: 60000,
        scrollTimes: 100,
        autoScrollAmount: true,
        scrollAmountRatio: 0.8,
        scrollToCenter: true,
        centerAdjustTimes: 5,
        // 滚动间隔（每次滚动后等待 UI 响应时间，毫秒）
        scrollInterval: 1000,
        // autoScrollAmount 首次滚动后延迟（等待 UI 重新计算布局，毫秒）
        autoScrollDelay: 1000,
        // 最小滚动量比例（调整滚动时的最小滚动量占原始滚动量的比例）
        minScrollRatio: 0.1,
        // 居中吸附阈值（元素中心与目标中心距离小于此阈值时认为已居中，单位：视口高度比例）
        centerSnapThreshold: 0.10,
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 命令式 API 新增类型
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 等待选项
 */
export interface WaitOptions {
    timeout?: number;      // 最大等待时间 (ms)
    interval?: number;     // 检查间隔 (ms)
}

/**
 * 通用等待选项 - 适用于所有操作
 */
export interface WaitTiming {
    waitBefore?: number;   // 操作前等待 (ms)
    waitAfter?: number;    // 操作后等待 (ms)
}

/**
 * 点击偏移配置
 * 
 * 支持两种形式：
 * 1. 预设位置：'top' | 'bottom' | 'left' | 'right' | 'center'
 * 2. 自定义表达式：如 'left+20%', 'top-10px', 'right-5%', 'bottom+15px'
 *    - 参考边：left | right | top | bottom
 *    - 运算符：+ | -
 *    - 值：数字 + 单位 (% 或 px)
 */
export type ClickOffset = 
  | 'top' 
  | 'bottom' 
  | 'left' 
  | 'right' 
  | 'center'
  | string;  // 自定义表达式，如 'left+20%'

/**
 * 点击选项
 */
export interface ClickOptions extends WaitTiming {
    humanize?: boolean;          // 是否拟人化移动
    randomRange?: number;        // 随机偏移范围
    button?: 'left' | 'right';   // 点击按钮类型
    clickArea?: ClickArea;       // 点击区域限制
    /** 点击偏移配置（优先级高于 clickArea） */
    offset?: ClickOffset;
    /** 是否在点击位置显示圆点标记 */
    showDot?: boolean;
    /** 圆点显示持续时间（ms），默认 3000 */
    dotDuration?: number;
    /** 点击模式：'mouse'=鼠标点击，'invoke'=InvokePattern 调用 */
    clickMode?: 'mouse' | 'invoke';
    /** 是否检查被遮挡（点击前检查元素是否被挡住） */
    checkBlocked?: boolean;
    /**
     * 是否使用元素缓存（默认 true）。
     * - true: 将 runtimeId 传给后端，走缓存路径（缓存未命中则报错）
     * - false: 忽略 runtimeId，直接走 XPath 搜索
     */
    useCache?: boolean;
}

/**
 * 输入选项
 */
export interface TypeOptions extends WaitTiming {
    charDelay?: { min: number; max: number };  // 字符间隔延迟
    humanize?: boolean;                         // 是否拟人化输入
    /** 输入模式，默认 'key'
     *  - 'key':  键盘模拟逐字输入（默认），支持 {Enter} 等虚拟键
     *  - 'set':  UIA ValuePattern.SetValue()，直接设置控件文本值（无需焦点/可见）
     *  - 'paste': 剪贴板粘贴 Ctrl+V，适合长文本
     */
    typeMode?: 'key' | 'set' | 'paste';
}

/**
 * 移动选项
 */
export interface MoveOptions extends WaitTiming {
    humanize?: boolean;              // 是否拟人化移动
    /** 移动路径：'line'=直线，'curve'=曲线 */
    movePath?: 'line' | 'curve';
    duration?: number;               // 移动持续时间 (ms)
}

/**
 * 空闲移动选项
 */
export interface IdleOptions {
    speed?: 'slow' | 'normal' | 'fast';  // 移动速度
    moveInterval?: number;               // 移动间隔 (ms)
    /** 人工检测配置（检测到用户操作时自动暂停） */
    humanDetect?: HumanDetectConfig;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 滚动操作相关
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 滚动选项（Flow 层，包含 useIdle 控制）
 */
export interface ScrollOptions {
    /** 每次滚动量（WHEEL_DELTA 单位），默认 120 */
    scrollAmount?: number;
    wait?: string;         // 等待出现的 xpath
    timeout?: number;      // 等待超时 ms，默认 5000
    useIdle?: boolean;     // 是否启用 pushIdle/popIdle（默认 true）
    /** 是否自动计算滚动量 */
    autoScrollAmount?: boolean;
    /** 容器高度倍率（0-1） */
    scrollAmountRatio?: number;
    scrollToCenter?: boolean;            // 是否滚动到视口中心，默认 true
    /** 居中最大调整次数，默认 5 */
    centerAdjustTimes?: number;
    /** 滚动间隔（每次滚动后等待 UI 响应时间，毫秒），默认 1000 */
    scrollInterval?: number;
    /** autoScrollAmount 首次滚动后延迟（等待 UI 重新计算布局，毫秒），默认 1000 */
    autoScrollDelay?: number;
    /** 最小滚动量比例（调整滚动时的最小滚动量占原始滚动量的比例），默认 0.1 */
    minScrollRatio?: number;
    /** 居中吸附阈值（元素中心与目标中心距离小于此阈值时认为已居中，单位：视口高度比例），默认 0.10 */
    centerSnapThreshold?: number;
    /** 视口内边距（排除固定遮挡区域） */
    viewportInset?: ViewportInset;
    /** 平滑滚动步长（每次小步滚动的 delta），默认 40。设为 0 则使用原有 delta 逻辑。
     *  注意：与 autoScrollAmount=true 互斥，autoScrollAmount 优先 */
    smoothStepDelta?: number;
}

/**
 * 滚动结果
 */
export interface ScrollResult {
    success: boolean;
    scrolled: number;      // 实际滚动次数
    targetFound: boolean;  // 是否找到 wait xpath
    /** 目标元素的矩形区域（仅当 targetFound=true 时有值） */
    targetRect?: Rect;
    /** 目标元素在容器视口内可见的矩形区域（targetRect ∩ 容器rect） */
    visibleRect?: Rect;
    /** 是否滚动到了边界（内容不再移动） */
    scrolledToEnd?: boolean;
    error: string | null;
}

/**
 * 滚动配置
 */
export interface ScrollConfig {
    /** 每次滚动量（WHEEL_DELTA 单位），默认 120 */
    scrollAmount?: number;
    times?: number;
    timeout?: number;
    useIdle?: boolean;
    /** 是否自动计算滚动量 */
    autoScrollAmount?: boolean;
    /** 容器高度倍率（0-1） */
    scrollAmountRatio?: number;
    scrollToCenter?: boolean;     // 是否滚动到视口中心，默认 true
    /** 居中最大调整次数，默认 5 */
    centerAdjustTimes?: number;
    /** 滚动间隔（毫秒），默认 1000 */
    scrollInterval?: number;
    /** autoScrollAmount 首次滚动后延迟（毫秒），默认 1000 */
    autoScrollDelay?: number;
    /** 最小滚动量比例，默认 0.1 */
    minScrollRatio?: number;
    /** 居中吸附阈值，默认 0.10 */
    centerSnapThreshold?: number;
    /** 视口内边距（排除固定遮挡区域） */
    viewportInset?: ViewportInset;
    /** 平滑滚动步长（每次小步滚动的 delta），默认 40。设为 0 则使用原有 delta 逻辑。
     *  注意：与 autoScrollAmount=true 互斥，autoScrollAmount 优先 */
    smoothStepDelta?: number;
}

/**
 * scrollToVisible 选项
 */
export interface ScrollToVisibleOptions {
    direction?: 'up' | 'down';  // 目标不存在时的滚动方向，默认 'down'
    timeout?: number;           // 总超时，默认 60000ms
    scrollTimes?: number;       // 最大滚动次数，默认 100
    /** 是否自动计算滚动量，默认 true */
    autoScrollAmount?: boolean;
    /** 容器高度倍率（0-1），默认 0.8 */
    scrollAmountRatio?: number;
    /** 每次滚动后的等待时间（ms），默认 1000 */
    scrollInterval?: number;
    scrollToCenter?: boolean;   // 是否滚动到视口中心，默认 true
    /** 居中最大调整次数，默认 5 */
    centerAdjustTimes?: number;
    /** autoScrollAmount 首次滚动后延迟（毫秒），默认 1000 */
    autoScrollDelay?: number;
    /** 最小滚动量比例，默认 0.1 */
    minScrollRatio?: number;
    /** 居中吸附阈值，默认 0.10 */
    centerSnapThreshold?: number;
    /** 视口内边距（排除固定遮挡区域） */
    viewportInset?: ViewportInset;
    /** 平滑滚动步长（每次小步滚动的 delta），默认 40。设为 0 则使用原有 delta 逻辑。
     *  注意：与 autoScrollAmount=true 互斥，autoScrollAmount 优先 */
    smoothStepDelta?: number;
}

/**
 * scrollToVisible 返回结果
 */
export interface ScrollToVisibleResult {
    /** 目标元素是否可见 */
    visible: boolean;
    /** 是否滚动到了边界（内容不再移动） */
    scrolledToEnd: boolean;
    /** 实际滚动次数 */
    scrolled: number;
    /** 目标元素的矩形区域 */
    targetRect?: Rect;
    /** 目标元素在容器视口内可见的矩形区域（targetRect ∩ 容器rect） */
    visibleRect?: Rect;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 滚动边界检测
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 滚动边界检测结果
 */
export interface ScrollDetectResult {
    success: boolean;
    /** 是否到达边界（排除exclude后，所有监控元素位置均未变化） */
    atEnd: boolean;
    /** 监控的元素总数（排除后） */
    watchedCount: number;
    /** 发生位置变化的元素数 */
    changedCount: number;
    /** 变化元素的详情列表 */
    details: ScrollDetectElementChange[];
    /** 是否执行了反向回滚 */
    rolledBack: boolean;
    error: string | null;
}

/**
 * 元素变化详情（滚动前后对比）
 */
export interface ScrollDetectElementChange {
    /** 元素标识（automationId / name / className 组合） */
    identifier: string;
    /** 滚动前 bound.top */
    beforeTop?: number;
    /** 滚动后 bound.top */
    afterTop?: number;
    /** bound.top 变化量 */
    deltaTop?: number;
    /** isOffscreen 是否变化 */
    offscreenChanged: boolean;
}

/**
 * 滚动边界检测方向
 */
export type ScrollDetectDirection = 'up' | 'down';

// ═══════════════════════════════════════════════════════════════════════════════
// 元素可视区域位置
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 元素可视区域位置结果
 */
export interface ElementVisibilityResult {
    /** 是否找到元素 */
    found: boolean;
    /** UIA 的 IsOffscreen 属性 */
    isOffscreen: boolean | null;
    /** 可视性：fully_visible / partially_visible / offscreen / not_found / error / unknown */
    visibility: string;
    /** 相对位置：above / below / left / right / inside / unknown */
    position: string;
    /** 元素的边界矩形 */
    elementRect: Rect | null;
    /** 元素真正可见、可点击的矩形区域（元素矩形 ∩ 容器矩形 ∩ 视口矩形） */
    visibleRect: Rect | null;
    /** 窗口（视口）的边界矩形 */
    viewportRect: Rect | null;
    /** 各方向超出视口的像素数（正值=超出，0=在视口内） */
    overflow: {
        /** 元素顶部超出视口顶部的像素 */
        top: number;
        /** 元素底部超出视口底部的像素 */
        bottom: number;
        /** 元素左侧超出视口左侧的像素 */
        left: number;
        /** 元素右侧超出视口右侧的像素 */
        right: number;
    } | null;
    /** 建议滚动方向：up / down / left / right */
    scrollDirection: string | null;
    /** 错误信息 */
    error: string | null;
}

/**
 * 元素高亮闪烁选项
 */
export interface FlashOptions {
    timeout?: number;  // 闪烁持续时间（ms），默认 1000
}

/**
 * 元素高亮闪烁结果
 */
export interface FlashResult {
    success: boolean;
    elementRect: Rect | null;
    error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 元素 Inspect
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Inspect 区域过滤类型
 * 
 * 基于当前元素（父元素）的 Rect，将区域划分为 5 个部分：
 * - top: 上半部分
 * - bottom: 下半部分
 * - left: 左半部分
 * - right: 右半部分
 * - center: 中心区域（各边内缩 25%）
 * 
 * 仅保留与指定区域有非零 RECT 交集的子元素。
 */
export type InspectRegion = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * Inspect 区域过滤选项
 */
export interface InspectRegionFilter {
    /** 过滤区域：仅保留与该区域有交集的元素 */
    region: InspectRegion;
    /** 区域占比（0~1），默认 0.5。例如 region='top', ratio=0.3 表示上 30% 区域 */
    ratio?: number;
}

/**
 * Inspect 选项
 */
export interface InspectOptions {
    /** 返回格式：'json'（默认）返回结构化树，'txt'/'text' 返回缩进文本 */
    format?: 'json' | 'txt' | 'text';
    /** 用于唯一标识当前元素的属性名列表 */
    propNames?: string[];
    /** 仅保留可见元素（isOffscreen === false）。regionFilter 启用时自动生效 */
    visibleOnly?: boolean;
    /** 区域过滤：仅保留与指定区域有 RECT 交集的子元素（前提：isOffscreen === false） */
    regionFilter?: InspectRegionFilter;
}

/**
 * Inspect 返回的单个节点信息
 */
export interface InspectNodeInfo {
    /** 元素层级深度（根元素为 0） */
    depth: number;
    /** 控件类型，如 "Button"、"Text"、"Edit" 等 */
    controlType: string;
    /** 控件的 Name 属性 */
    name: string;
    /** 控件的 ClassName 属性 */
    className: string;
    /** 控件的 AutomationId 属性 */
    automationId: string;
    /** 控件的 FrameworkId 属性 */
    frameworkId: string;
    /** 控件的文本内容（通过 ValuePattern 获取） */
    textValue?: string;
    /** 控件的 HelpText 属性（辅助说明文字） */
    helpText?: string;
    /** 控件的 ItemType 属性 */
    itemType?: string;
    /** 控件的 ItemStatus 属性 */
    itemStatus?: string;
    /** 控件的区域位置 */
    rect: Rect | null;
    /** 是否在屏幕外 */
    isOffscreen: boolean;
    /** 选中该控件相对于根元素的 XPath 表达式 */
    xpath: string;
    /** 从根元素导航到此控件的罗盘路径（如 "c1>0"，根元素自身为 ""） */
    compass: string;
    /** 子节点列表 */
    children: InspectNodeInfo[];
}

/**
 * Inspect 扁平节点信息（无 children 嵌套，方便遍历和过滤）
 */
export interface FlatInspectNodeInfo {
    /** 元素层级深度（根元素为 0） */
    depth: number;
    /** 控件类型，如 "Button"、"Text"、"Edit" 等 */
    controlType: string;
    /** 控件的 Name 属性 */
    name: string;
    /** 控件的 ClassName 属性 */
    className: string;
    /** 控件的 AutomationId 属性 */
    automationId: string;
    /** 控件的 FrameworkId 属性 */
    frameworkId: string;
    /** 控件的文本内容（通过 ValuePattern 获取） */
    textValue?: string;
    /** 控件的 HelpText 属性（辅助说明文字） */
    helpText?: string;
    /** 控件的 ItemType 属性 */
    itemType?: string;
    /** 控件的 ItemStatus 属性 */
    itemStatus?: string;
    /** 控件的区域位置 */
    rect: Rect | null;
    /** 是否在屏幕外 */
    isOffscreen: boolean;
    /** 选中该控件相对于根元素的 XPath 表达式 */
    xpath: string;
    /** 从根元素导航到此控件的罗盘路径（如 "c1>0"，根元素自身为 ""） */
    compass: string;
}

/**
 * Inspect 过滤条件
 */
export interface InspectFilter {
    /** 按 name 包含匹配（模糊） */
    name?: string;
    /** 按 controlType 精确匹配 */
    controlType?: string;
    /** 按 className 包含匹配（模糊） */
    className?: string;
    /** 按 automationId 包含匹配（模糊） */
    automationId?: string;
    /** 按 textValue 包含匹配（模糊） */
    textValue?: string;
    /** 按 helpText 包含匹配（模糊） */
    helpText?: string;
}

/**
 * Inspect 请求参数
 */
export interface InspectRequest {
    /** 窗口选择器 XPath */
    window: string;
    /** 目标元素 XPath（inspect 此元素下的所有子元素） */
    element: string;
    /** 元素 RuntimeId（优先于 XPath 搜索） */
    runtimeId?: string;
    /** 返回格式：'json'（默认）或 'txt' */
    format?: 'json' | 'txt';
}

/**
 * Inspect 响应
 */
export interface InspectResponse {
    /** 是否成功 */
    success: boolean;
    /** 根元素 XPath */
    rootXpath: string;
    /** 结构化节点树（format='json' 时有值） */
    nodes: InspectNodeInfo | null;
    /** 扁平化节点列表（DFS 顺序，方便遍历和过滤） */
    flatNodes: FlatInspectNodeInfo[];
    /** 格式化文本（format='txt'/'text' 时有值） */
    text: string | null;
    /** 子元素总数 */
    totalChildren: number;
    /** 错误信息 */
    error: string | null;

    /**
     * 过滤 flatNodes，返回匹配的节点列表。
     *
     * 支持两种调用方式：
     * 1. 回调函数（与 Array.filter 一致）：可自由编写任意过滤逻辑
     * 2. InspectFilter 对象：字符串条件为包含匹配，controlType 为精确匹配
     *
     * @param predicate - 回调函数或过滤条件对象
     * @returns 匹配的扁平节点列表
     *
     * @example
     * const result = await element.inspect();
     * // 回调函数形式（推荐，灵活度最高）
     * const items = result.filter(node => node.name.includes('新华社'));
     * const items2 = result.filter(node => node.name.indexOf('sssss') > 0);
     * const buttons = result.filter(node => node.controlType === 'Button');
     * const deep = result.filter((node, i) => node.depth > 2 && i < 10);
     *
     * // 对象条件形式（便捷简写）
     * const items3 = result.filter({ name: '新华社' });
     * const buttons2 = result.filter({ controlType: 'Button' });
     */
    filter(predicate: (node: FlatInspectNodeInfo, index: number, array: FlatInspectNodeInfo[]) => unknown): FlatInspectNodeInfo[];
    filter(filter: InspectFilter): FlatInspectNodeInfo[];
}

/**
 * 性能统计
 */
export interface ProfileStats {
    startTime: number;
    endTime: number;
    totalTime: number;
    operations: Array<{
        type: string;
        duration: number;
        timestamp: number;
        details?: any;
    }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RuntimeId 缓存相关类型
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/element/refresh 请求
 */
export interface RefreshByRuntimeIdRequest {
    window: string;
    runtimeId: string;
}

/**
 * POST /api/element/refresh 响应
 */
export interface RefreshByRuntimeIdResponse {
    found: boolean;
    element: ElementInfo | null;
    error: string | null;
}

/**
 * PUT /api/element/cache/config 请求
 */
export interface CacheConfigRequest {
    /** 全局缓存时间（毫秒），null = 永不过期 */
    cacheTime?: number | null;
}

/**
 * GET /api/element/cache/stats 响应
 */
export interface CacheStatsResponse {
    size: number;
    maxSize: number;
    defaultCacheTime: number | null;
}

/**
 * POST /api/element/find-from 请求（从 RuntimeId 缓存元素查找子元素）
 */
export interface FindFromElementRequest {
    /** 父元素的 RuntimeId */
    runtimeId: string;
    /** 相对于父元素的 XPath 表达式 */
    xpath: string;
    /** 搜索策略 */
    searchStrategy?: 'Fast' | 'Full';
    /** 随机偏移范围 */
    randomRange?: number;
}

/**
 * POST /api/element/find-from 响应
 */
export interface FindFromElementResponse {
    found: boolean;
    elements: ElementInfo[];
    total: number;
    error: string | null;
    /** 未找到原因（如 InvalidParent / LeafNotUnique / StepNotFound 等） */
    notFoundReason?: NotFoundReason;
}

/**
 * 未找到元素的原因（与后端 NotFoundReason 枚举对应）
 */
export type NotFoundReason =
    | 'WindowNotFound'
    | { ChildHwndNotFound: { class: string } }
    | { StepNotFound: { step: number; xpath_step: string } }
    | 'ElementGone'
    | { Timeout: { budget_ms: number; elapsed_ms: number } }
    | { LeafNotUnique: { candidates: number } }
    | { InvalidParent: { runtime_id: string } };

/**
 * 鼠标悬停参数
 */
export interface HoverMouseParams {
    window: string;
    element: string;
    runtimeId?: string;
    duration?: number;
    humanize?: boolean;
}

/**
 * 拖拽参数
 */
export interface DragMouseParams {
    window: string;
    sourceElement: string;
    sourceRuntimeId?: string;
    targetElement: string;
    targetRuntimeId?: string;
    duration?: number;
}

/**
 * 导航请求参数（带 runtimeId）
 */
export interface NavigateRequest {
    window: string;
    element: string;
    runtimeId?: string;
    steps: NavigateStep[];
}