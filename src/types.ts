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

export interface SDKConfig {
    baseUrl: string;
    timeout?: number;
    autoWait?: AutoWaitConfig;
    logging?: LoggingConfig;
    idleMotion?: IdleOptions;  // idle 移动的默认配置
    scroll?: ScrollConfig;     // 滚动的默认配置
    speedFactor?: number;      // 全局速度因子，默认 1
}

// ═══════════════════════════════════════════════════════════════════════════════
// 窗口相关
// ═══════════════════════════════════════════════════════════════════════════════

export interface WindowSelector {
    title?: string;
    className?: string;
    processName?: string;
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
    randomRange?: number;
}

export interface ElementInfo {
    listSelector?: string;
    rect?: Rect;
    center?: Point;
    centerRandom?: Point;
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
    listSelector: string;
    /** 匹配到的元素总数 */
    total: number;
    error: string | null;
    element?: ElementInfo | null;
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

export interface ClickParams {
    window: WindowSelector | string;
    element: string;
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

export interface HumanInterventionConfig {
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
    humanIntervention?: HumanInterventionConfig;
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
        trajectory: 'bezier' as const,
        duration: 1000,
        waitBefore: 100,
        waitAfter: 500,
    },
    
    click: {
        humanize: true,
        randomRange: 0.55,
        waitBefore: 1000,  // 点击前等待，让鼠标稳定
        waitAfter: 2000,   // 点击后等待，给应用响应时间
    },
    
    idleMotion: {
        speed: 'normal' as const,
        moveInterval: 800,
        idleTimeout: 60000,
        humanIntervention: {
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
        delta: 120,
        times: 3,
        timeout: 60000,  // 增加到 60 秒，避免长时间滚动超时
        useIdle: true,
        autoDelta: true,
        deltaFactor: 0.8,
    },

    scrollToVisible: {
        timeout: 60000,  // 增加到 60 秒，避免长时间滚动超时
        scrollDelta: 120,
        scrollTimes: 10,
        checkInterval: 150,
        autoDelta: true,
        deltaFactor: 0.8,
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
 * 点击选项
 */
export interface ClickOptions extends WaitTiming {
    humanize?: boolean;          // 是否拟人化移动
    randomRange?: number;        // 随机偏移范围
    button?: 'left' | 'right';   // 点击按钮类型
    clickArea?: ClickArea;       // 点击区域限制
}

/**
 * 输入选项
 */
export interface TypeOptions extends WaitTiming {
    charDelay?: { min: number; max: number };  // 字符间隔延迟
    humanize?: boolean;                         // 是否拟人化输入
}

/**
 * 移动选项
 */
export interface MoveOptions extends WaitTiming {
    humanize?: boolean;              // 是否拟人化移动
    trajectory?: 'linear' | 'bezier'; // 移动轨迹
    duration?: number;               // 移动持续时间 (ms)
}

/**
 * 空闲移动选项
 */
export interface IdleOptions {
    speed?: 'slow' | 'normal' | 'fast';  // 移动速度
    moveInterval?: number;               // 移动间隔 (ms)

    /**
     * 人工干预配置
     */
    humanIntervention?: {
        /**
         * 是否启用人工干预检测（默认: true）
         */
        enabled?: boolean;

        /**
         * 检测到鼠标移动时是否暂停（默认: true）
         * - true: 暂停 idle 移动
         * - false: 继续移动，不暂停
         */
        pauseOnMouse?: boolean;

        /**
         * 检测到键盘输入时是否暂停（默认: true）
         */
        pauseOnKeyboard?: boolean;

        /**
         * 用户静止后多少毫秒恢复（默认: 3000）
         * - 0: 不自动恢复，需要手动调用 stopIdle()
         * - >0: 用户静止指定时间后自动恢复
         */
        resumeDelay?: number;
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 滚动操作相关
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 滚动选项（Flow 层，包含 useIdle 控制）
 */
export interface ScrollOptions {
    delta?: number;        // WHEEL_DELTA 单位，默认 120
    wait?: string;         // 等待出现的 xpath
    timeout?: number;      // 等待超时 ms，默认 5000
    useIdle?: boolean;     // 是否启用 pushIdle/popIdle（默认 true）
    autoDelta?: boolean;   // 是否自动计算 delta
    deltaFactor?: number;  // 容器高度倍率（0-1）
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
    error: string | null;
}

/**
 * 滚动配置
 */
export interface ScrollConfig {
    delta?: number;
    times?: number;
    timeout?: number;
    useIdle?: boolean;
    autoDelta?: boolean;     // 是否自动计算 delta
    deltaFactor?: number;    // 容器高度倍率（0-1）
}

/**
 * scrollToVisible 选项
 */
export interface ScrollToVisibleOptions {
    timeout?: number;       // 总超时，默认 10000ms
    scrollDelta?: number;   // 每次滚动量，默认 120
    scrollTimes?: number;   // 最大滚动次数，默认 10
    checkInterval?: number; // 每次滚动后的检测间隔，默认 150ms
    autoDelta?: boolean;    // 是否自动计算 delta
    deltaFactor?: number;   // 容器高度倍率（0-1）
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