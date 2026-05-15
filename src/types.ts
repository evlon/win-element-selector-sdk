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
    windowSelector: string;
    xpath: string;
    randomRange?: number;
}

export interface ElementInfo {
    rect: Rect;
    center: Point;
    centerRandom: Point;
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
}

export interface ElementResponse {
    found: boolean;
    element: ElementInfo | null;
    error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 鼠标操作相关
// ═══════════════════════════════════════════════════════════════════════════════

export interface MoveOptions {
    humanize?: boolean;
    trajectory?: 'linear' | 'bezier';
    duration?: number;
}

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

export interface ClickOptions {
    humanize?: boolean;
    randomRange?: number;
    pauseBefore?: number;
    pauseAfter?: number;
}

export interface ClickParams {
    window: WindowSelector | string;  // 支持字符串形式 "Window[@Name='xxx']" 或对象形式
    xpath: string;
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

// ═══════════════════════════════════════════════════════════════════════════════
// 键盘操作相关
// ═══════════════════════════════════════════════════════════════════════════════

export interface TypeOptions {
    charDelay?: {
        min: number;
        max: number;
    };
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
    
    move: {
        humanize: true,
        trajectory: 'bezier' as const,
        duration: 600,
    },
    
    click: {
        humanize: true,
        randomRange: 0.55,
        pauseBefore: 150,  // 点击前等待 150ms，让鼠标稳定
        pauseAfter: 200,   // 点击后等待 200ms，给应用响应时间
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
    },
    
    autoWait: {
        enabled: false,
        delays: {
            afterFind: 500,
            afterClick: 800,
            afterType: 600,
            beforeAction: 300,
        }
    },
    
    logging: {
        enabled: true,
        level: 'info' as const,
        showElementInfo: true,
        showCoordinates: false,
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
 * 点击选项
 */
export interface ClickOptions {
    humanize?: boolean;          // 是否拟人化移动
    randomRange?: number;        // 随机偏移范围
    pauseBefore?: number;        // 点击前等待 (ms)
    pauseAfter?: number;         // 点击后等待 (ms)
}

/**
 * 输入选项
 */
export interface TypeOptions {
    charDelay?: { min: number; max: number };  // 字符间隔延迟
    humanize?: boolean;                         // 是否拟人化输入
}

/**
 * 移动选项
 */
export interface MoveOptions {
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