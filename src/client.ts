import axios, { AxiosInstance, AxiosError } from 'axios';
import {
    SDKConfig,
    DEFAULTS,
    HealthStatus,
    WindowInfo,
    ElementQueryParams,
    ElementResponse,
    ElementInfo,
    MoveParams,
    MoveResult,
    ClickParams,
    ClickResult,
    IdleMotionParams,
    IdleMotionStatus,
    StopResult,
    Point,
    MoveOptions,
    TypeOptions,
    TypeResult,
    ScrollOptions,
    ScrollResult,
    ScrollDetectResult,
    ElementVisibilityResult,
    FlashResult,
    ViewportInset,
    InspectResponse,
    RefreshByRuntimeIdRequest,
    RefreshByRuntimeIdResponse,
    CacheConfigRequest,
    CacheStatsResponse,
    FindFromElementRequest,
    FindFromElementResponse,
    HoverMouseParams,
    DragMouseParams,
    NavigateRequest,
    ScreenshotCaptureRequest,
    ScreenshotCaptureResponse,
    FindImageRequest,
    FindImageResponse,
    SaveElementImageRequest,
    SaveElementImageResponse,
} from './types';
import { NetworkError, TimeoutError, SDKError } from './errors';

/** 瞬态网络错误码，可安全重试 */
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN']);

interface RequestTraceContext {
    endpoint: string;
    operation?: string;
    window?: string;
    element?: string;
    extra?: Record<string, string | number | boolean | undefined>;
}

function shouldTraceHttp(): boolean {
    const trace = process.env.ELEMENT_SELECTOR_TRACE ?? process.env.LOG_LEVEL;
    return trace === '1' || trace === 'true' || trace === 'debug';
}

function hashString(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export class HttpClient {
    private client: AxiosInstance;
    private maxRetries: number;
    private retryDelayMs: number;

    constructor(config: SDKConfig) {
        this.maxRetries = 1;
        this.retryDelayMs = 500;
        this.client = axios.create({
            baseURL: config.baseUrl,
            timeout: config.timeout ?? DEFAULTS.timeout,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
            },
            // 确保 URL 参数正确编码
            paramsSerializer: {
                encode: (param: any) => encodeURIComponent(param),
            },
        });
    }

    /**
     * 判断错误是否为可重试的瞬态网络错误
     */
    private isRetryableError(error: unknown): boolean {
        if (axios.isAxiosError(error)) {
            const code = (error as AxiosError).code;
            if (code && RETRYABLE_CODES.has(code)) {
                return true;
            }
            // 5xx 服务端错误也可重试
            if (error.response && error.response.status >= 500 && error.response.status < 600) {
                return true;
            }
        }
        return false;
    }

    /**
     * 带自动重试的请求执行器
     */
    private async requestWithRetry<T>(fn: () => Promise<T>, trace?: RequestTraceContext): Promise<T> {
        let lastError: unknown;
        const totalStart = Date.now();
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            const attemptStart = Date.now();
            try {
                const result = await fn();
                this.logHttpTrace(trace, attempt, Date.now() - attemptStart, Date.now() - totalStart, 'ok');
                return result;
            } catch (error) {
                lastError = error;
                const retryable = attempt < this.maxRetries && this.isRetryableError(error);
                this.logHttpTrace(
                    trace,
                    attempt,
                    Date.now() - attemptStart,
                    Date.now() - totalStart,
                    retryable ? 'retry' : 'error',
                    error
                );
                if (retryable) {
                    const delay = this.retryDelayMs * (attempt + 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }

    private logHttpTrace(
        trace: RequestTraceContext | undefined,
        attempt: number,
        attemptMs: number,
        totalMs: number,
        status: 'ok' | 'retry' | 'error',
        error?: unknown,
    ): void {
        if (!trace || !shouldTraceHttp()) return;

        const parts = [
            `[PERF][SDK] ${trace.operation ?? trace.endpoint}`,
            `endpoint=${trace.endpoint}`,
            `attempt=${attempt + 1}`,
            `status=${status}`,
            `attempt_ms=${attemptMs}`,
            `total_ms=${totalMs}`,
        ];

        if (trace.window) {
            parts.push(`window_hash=${hashString(trace.window)}`);
        }
        if (trace.element) {
            parts.push(`xpath_hash=${hashString(trace.element)}`);
            parts.push(`xpath_len=${trace.element.length}`);
            parts.push(`descendant=${trace.element.startsWith('//') || trace.element.includes('//')}`);
        }
        if (trace.extra) {
            for (const [key, value] of Object.entries(trace.extra)) {
                if (value !== undefined) parts.push(`${key}=${value}`);
            }
        }
        if (error) {
            if (axios.isAxiosError(error)) {
                parts.push(`error_code=${error.code ?? 'unknown'}`);
                parts.push(`http_status=${error.response?.status ?? 'none'}`);
            } else if (error instanceof Error) {
                parts.push(`error=${error.message}`);
            }
        }

        console.log(parts.join(' '));
    }
    
    async health(): Promise<HealthStatus> {
        return this.requestWithRetry(async () => {
            const response = await this.client.get<HealthStatus>('/api/health');
            return response.data;
        });
    }
    
    async listWindows(): Promise<WindowInfo[]> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<{ windows: WindowInfo[] }>('/api/window/list');
            return response.data.windows;
        });
    }
    
    async find(params: ElementQueryParams): Promise<ElementResponse> {
        return this.requestWithRetry(async () => {
            const body: any = {
                window: params.window,
                element: params.element,
                randomRange: params.randomRange ?? DEFAULTS.click.randomRange,
            };
            if (params.runtimeId) body.runtimeId = params.runtimeId;
            if (params.chromeTreewalkerFallback !== undefined) body.chromeTreewalkerFallback = params.chromeTreewalkerFallback;
            const raw = await this.client.post<any>('/api/element', body);
            const data = raw.data;
            // 后端返回 findSelector（旧版返回 elementSelector，兼容映射）
            return {
                found: data.found,
                findSelector: data.findSelector || data.elementSelector || '',
                element: data.element ?? null,
                total: data.total ?? 0,
                error: data.error ?? null,
            } as ElementResponse;
        }, {
            endpoint: '/api/element',
            operation: 'find',
            window: params.window,
            element: params.element,
            extra: { randomRange: params.randomRange ?? DEFAULTS.click.randomRange },
        });
    }
    
    async moveMouse(target: Point, options?: MoveOptions): Promise<MoveResult> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<MoveResult>('/api/mouse/move', {
                target,
                options: options ? {
                    humanize: options.humanize ?? DEFAULTS.move.humanize,
                    movePath: options.movePath ?? DEFAULTS.move.movePath,
                    duration: options.duration ?? DEFAULTS.move.duration,
                } : undefined,
            });
            return response.data;
        });
    }
    
    async clickMouse(params: ClickParams): Promise<ClickResult> {
        try {
            return await this.requestWithRetry(async () => {
                const body: any = {
                    window: params.window,
                    element: params.element,
                    options: params.options ? {
                        humanize: params.options.humanize ?? DEFAULTS.click.humanize,
                        randomRange: params.options.randomRange ?? DEFAULTS.click.randomRange,
                        button: params.options.button ?? 'left',
                        clickArea: params.options.clickArea ?? undefined,
                        offset: params.options.offset ?? undefined,
                        showDot: params.options.showDot ?? false,
                        dotDuration: params.options.dotDuration ?? 3000,
                        clickMode: params.options.clickMode ?? 'mouse',
                        checkBlocked: params.options.checkBlocked ?? false,
                    } : undefined,
                };
                if (params.runtimeId) body.runtimeId = params.runtimeId;
                if (params.useCache !== undefined) body.useCache = params.useCache;
                const response = await this.client.post<ClickResult>('/api/mouse/click', body);
                return response.data;
            });
        } catch (error) {
            throw this.handleError(error, '/api/mouse/click');
        }
    }
    
    async startIdleMotion(params: IdleMotionParams): Promise<void> {
        await this.requestWithRetry(async () => {
            await this.client.post('/api/mouse/idle/start', {
                window: params.window,
                xpath: params.xpath,
                speed: params.speed ?? DEFAULTS.idleMotion.speed,
                moveInterval: params.moveInterval ?? DEFAULTS.idleMotion.moveInterval,
                idleTimeout: params.idleTimeout ?? DEFAULTS.idleMotion.idleTimeout,
                humanDetect: params.humanDetect ? {
                    enabled: params.humanDetect.enabled,
                    pauseOnMouse: params.humanDetect.pauseOnMouse ?? DEFAULTS.idleMotion.humanDetect.pauseOnMouse,
                    pauseOnKeyboard: params.humanDetect.pauseOnKeyboard ?? DEFAULTS.idleMotion.humanDetect.pauseOnKeyboard,
                    resumeDelay: params.humanDetect.resumeDelay ?? DEFAULTS.idleMotion.humanDetect.resumeDelay,
                } : DEFAULTS.idleMotion.humanDetect,
            });
        });
    }
    
    async stopIdleMotion(): Promise<StopResult> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<StopResult>('/api/mouse/idle/stop');
            return response.data;
        });
    }
    
    async getIdleMotionStatus(): Promise<IdleMotionStatus> {
        return this.requestWithRetry(async () => {
            const response = await this.client.get<IdleMotionStatus>('/api/mouse/idle/status');
            return response.data;
        });
    }

    async scrollMouse(params: { window?: string; element: string; delta?: number; times?: number; wait?: string; waitMode?: string; timeout?: number; autoScrollAmount?: boolean; scrollAmountRatio?: number; scrollToCenter?: boolean; centerAdjustTimes?: number; scrollInterval?: number; autoScrollDelay?: number; minScrollRatio?: number; centerSnapThreshold?: number; viewportInset?: ViewportInset; smoothStepDelta?: number }): Promise<ScrollResult> {
        const scrollTimeout = params.timeout ?? DEFAULTS.scroll.timeout;
        // autoScrollAmount=true 时强制 smoothStepDelta=0（两者互斥，autoScrollAmount 优先）
        const effectiveSmoothStepDelta = params.autoScrollAmount ? 0 : (params.smoothStepDelta ?? undefined);
        // HTTP 请求超时 = 滚动业务超时 + 10s 缓冲，避免 axios 提前中断后端长时操作
        const httpTimeout = scrollTimeout + 10000;
        return this.requestWithRetry(async () => {
            const body: any = {
                element: params.element,
                options: {
                    delta: params.delta ?? DEFAULTS.scroll.scrollAmount,
                    times: params.times ?? DEFAULTS.scroll.times,
                    wait: params.wait,
                    waitMode: params.waitMode,
                    timeout: scrollTimeout,
                    // 发送给后端时使用旧字段名（后端 API 未改名）
                    autoDelta: params.autoScrollAmount ?? DEFAULTS.scroll.autoScrollAmount,
                    deltaFactor: params.scrollAmountRatio ?? DEFAULTS.scroll.scrollAmountRatio,
                    scrollToCenter: params.scrollToCenter ?? DEFAULTS.scroll.scrollToCenter,
                    scrollToCenterAdjustTimes: params.centerAdjustTimes ?? DEFAULTS.scroll.centerAdjustTimes,
                    scrollIntervalMs: params.scrollInterval ?? DEFAULTS.scroll.scrollInterval,
                    autoDeltaInitialDelayMs: params.autoScrollDelay ?? DEFAULTS.scroll.autoScrollDelay,
                    minDeltaRatio: params.minScrollRatio ?? DEFAULTS.scroll.minScrollRatio,
                    scrollToCenterThreshold: params.centerSnapThreshold ?? DEFAULTS.scroll.centerSnapThreshold,
                    viewportInset: params.viewportInset,
                    // autoScrollAmount=true 时传 0（互斥，autoScrollAmount 优先）
                    smoothStepDelta: effectiveSmoothStepDelta,
                },
            };
            if (params.window) {
                body.window = params.window;
            }
            const response = await this.client.post<ScrollResult>('/api/mouse/scroll', body, {
                timeout: httpTimeout,
            });
            return response.data;
        });
    }

    /**
     * 滚动边界检测：滚动一次，检测是否到底/到顶
     * @param params.delta - 滚动方向，正=向上滚，负=向下滚，默认 -120（向下）
     * @param params.rollback - 检测后是否反向滚动抵消，默认 false
     */
    async scrollDetect(params: { window?: string; container: string; controlTypes?: string[]; direction?: 'up' | 'down'; exclude?: string[]; rollback?: boolean; scrollDelayMs?: number }): Promise<ScrollDetectResult> {
        return this.requestWithRetry(async () => {
            const body: any = {
                container: params.container,
                controlTypes: params.controlTypes ?? ['Text'],
                direction: params.direction ?? 'down',
                exclude: params.exclude ?? [],
                rollback: params.rollback ?? false,
                scrollDelayMs: params.scrollDelayMs ?? 500,
            };
            if (params.window) {
                body.window = params.window;
            }
            const response = await this.client.post<ScrollDetectResult>('/api/mouse/scroll-detect', body);
            return response.data;
        });
    }
    
    async typeText(text: string, options?: TypeOptions, window?: string, element?: string, runtimeId?: string): Promise<TypeResult> {
        return this.requestWithRetry(async () => {
            const body: Record<string, unknown> = {
                text,
                charDelay: options?.charDelay ?? DEFAULTS.type.charDelay,
            };
            if (options?.typeMode) {
                body.typeMode = options.typeMode;
            }
            if (window) {
                body.window = window;
            }
            if (element) {
                body.element = element;
            }
            if (runtimeId) {
                body.runtimeId = runtimeId;
            }
            const response = await this.client.post<TypeResult>('/api/keyboard/type', body);
            return response.data;
        });
    }

    async hoverMouse(params: HoverMouseParams): Promise<{ success: boolean; hoverPoint: Point | null; error: string | null }> {
        return this.requestWithRetry(async () => {
            const body: any = {
                window: params.window,
                element: params.element,
                options: {
                    humanize: params.humanize ?? DEFAULTS.move.humanize,
                    duration: params.duration ?? 500,
                },
            };
            if (params.runtimeId) body.runtimeId = params.runtimeId;
            const response = await this.client.post('/api/mouse/hover', body);
            return response.data;
        });
    }

    async dragMouse(params: DragMouseParams): Promise<{ success: boolean; sourcePoint: Point | null; targetPoint: Point | null; durationMs: number; error: string | null }> {
        return this.requestWithRetry(async () => {
            const body: any = {
                window: params.window,
                sourceElement: params.sourceElement,
                targetElement: params.targetElement,
                options: {
                    duration: params.duration ?? 1000,
                },
            };
            if (params.sourceRuntimeId) body.sourceRuntimeId = params.sourceRuntimeId;
            if (params.targetRuntimeId) body.targetRuntimeId = params.targetRuntimeId;
            const response = await this.client.post('/api/mouse/drag', body);
            return response.data;
        });
    }

    /**
     * 在指定屏幕坐标点击（移动 + 点击一步完成）
     * @param params 坐标点击参数
     */
    async clickAtCoordinate(params: {
        x: number;
        y: number;
        window?: string;
        options?: {
            humanize?: boolean;
            duration?: number;
            button?: 'left' | 'right';
            pauseBefore?: number;
            pauseAfter?: number;
        };
    }): Promise<{ success: boolean; clickPoint: Point; error: string | null }> {
        return this.requestWithRetry(async () => {
            const body: any = {
                x: params.x,
                y: params.y,
                options: {
                    humanize: params.options?.humanize ?? DEFAULTS.move.humanize,
                    duration: params.options?.duration ?? DEFAULTS.move.duration,
                    button: params.options?.button ?? 'left',
                    pauseBefore: params.options?.pauseBefore ?? 0,
                    pauseAfter: params.options?.pauseAfter ?? 0,
                },
            };
            if (params.window) body.window = params.window;
            const response = await this.client.post('/api/mouse/click-at', body);
            return response.data;
        });
    }
    
    /**
     * 检查指定窗口是否存在（不激活窗口，无副作用）
     * @param windowSelector 窗口选择器 XPath
     * @returns 窗口是否存在
     */
    async existsWindow(windowSelector: string): Promise<boolean> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<{ exists: boolean }>('/api/window/exists', {
                windowSelector,
            });
            return response.data.exists;
        });
    }

    /**
     * 激活指定窗口（使其成为前台窗口）
     * @param windowSelector 窗口选择器 XPath
     * @returns 激活结果
     */
    async activateWindow(windowSelector: string): Promise<{ success: boolean; error?: string; windowInfo?: WindowInfo }> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<{ success: boolean; windowSelector: string; error?: string; windowInfo?: WindowInfo }>('/api/window/activate', {
                windowSelector,
            });
            return response.data;
        });
    }
    
    /**
     * 激活窗口并使指定元素获得焦点
     * @param windowSelector 窗口选择器 XPath
     * @param xpath 元素 XPath
     * @returns 操作结果
     */
    async focusElement(windowSelector: string, xpath: string): Promise<{ success: boolean; error?: string }> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<{ success: boolean; error?: string }>('/api/window/focus-element', {
                windowSelector,
                xpath,
            });
            return response.data;
        });
    }
    
    /**
     * 获取所有匹配元素
     * @param params 查询参数
     * @returns 所有匹配的元素列表
     */
    async findAll(params: ElementQueryParams): Promise<{ found: boolean; elements: { findSelector: string; info: ElementInfo }[]; total: number; error?: string }> {
        return this.requestWithRetry(async () => {
            const body: any = {
                window: params.window,
                element: params.element,
                randomRange: params.randomRange ?? DEFAULTS.click.randomRange,
            };
            if (params.runtimeId) body.runtimeId = params.runtimeId;
            if (params.chromeTreewalkerFallback !== undefined) body.chromeTreewalkerFallback = params.chromeTreewalkerFallback;
            const rawResp = await this.client.post<{ found: boolean; elements: { findSelector: string; info: ElementInfo }[]; total: number; error?: string }>('/api/element/all', body);

            return rawResp.data;
        }, {
            endpoint: '/api/element/all',
            operation: 'findAll',
            window: params.window,
            element: params.element,
            extra: { randomRange: params.randomRange ?? DEFAULTS.click.randomRange },
        });
    }
    
    /**
     * 获取元素可视区域位置信息
     * @param windowSelector 窗口选择器 XPath
     * @param elementXPath 元素 XPath
     * @param containerXPath 可选的滚动容器 XPath，用于计算元素在容器内的可见矩形
     * @returns 元素可视区域位置信息
     */
    async getElementVisibility(windowSelector: string, elementXPath: string, containerXPath?: string, runtimeId?: string): Promise<ElementVisibilityResult> {
        return this.requestWithRetry(async () => {
            const body: any = {
                window: windowSelector,
                element: elementXPath,
            };
            if (containerXPath) {
                body.container = containerXPath;
            }
            if (runtimeId) {
                body.runtimeId = runtimeId;
            }
            const response = await this.client.post<ElementVisibilityResult>('/api/element/visibility', body);
            return response.data;
        }, {
            endpoint: '/api/element/visibility',
            operation: 'getElementVisibility',
            window: windowSelector,
            element: elementXPath,
            extra: { hasContainer: Boolean(containerXPath) },
        });
    }

    /**
     * 在元素位置显示高亮闪烁（绿色边框 + 标签）
     * @param windowSelector 窗口选择器 XPath
     * @param elementXPath 元素 XPath
     * @param timeout 闪烁持续时间（ms），默认 1000
     * @returns 闪烁结果
     */
    async flashElement(windowSelector: string, elementXPath: string, timeout?: number, runtimeId?: string): Promise<FlashResult> {
        return this.requestWithRetry(async () => {
            const body: any = {
                window: windowSelector,
                element: elementXPath,
                timeout: timeout ?? 1000,
            };
            if (runtimeId) body.runtimeId = runtimeId;
            const response = await this.client.post<FlashResult>('/api/element/flash', body);
            return response.data;
        }, {
            endpoint: '/api/element/flash',
            operation: 'flashElement',
            window: windowSelector,
            element: elementXPath,
            extra: { timeout: timeout ?? 1000 },
        });
    }

    /**
     * 执行快捷键组合（推荐方法名）
     * @param keys 快捷键字符串，如 "Ctrl+C", "Alt+F4"
     */
    async shortcut(keys: string): Promise<{ success: boolean; error?: string }> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<{ success: boolean; error?: string }>('/api/keyboard/shortcut', {
                keys,
            });
            return response.data;
        });
    }
    
    /**
     * 执行快捷键组合（向后兼容别名）
     * @deprecated 请使用 shortcut() 代替
     * @param keys 快捷键字符串，如 "Ctrl+C", "Alt+F4"
     */
    async executeShortcut(keys: string): Promise<{ success: boolean; error?: string }> {
        return this.shortcut(keys);
    }
    
    /**
     * 执行单个按键
     * @param key 按键名称，如 "Enter", "Tab", "Escape"
     */
    async executeKey(key: string): Promise<{ success: boolean; error?: string }> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<{ success: boolean; error?: string }>('/api/keyboard/key', {
                key,
            });
            return response.data;
        });
    }
    
    /**
     * 检查元素是否支持指定操作
     * @param windowSelector 窗口选择器 XPath
     * @param elementXPath 元素 XPath
     * @param patternName UIA Pattern 名称
     */
    async supportsPattern(windowSelector: string, elementXPath: string, patternName: string): Promise<boolean> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<{ supported: boolean }>('/api/element/supports-pattern', {
                window: windowSelector,
                element: elementXPath,
                pattern: patternName,
            });
            return response.data.supported;
        });
    }

    /**
     * 遍历元素下的所有子元素，提取层级/控件类型/name/Text/rect/相对xpath
     * @param windowSelector 窗口选择器 XPath
     * @param elementXPath 目标元素 XPath
     * @param format 返回格式：'json'（默认）、'txt' 或 'text'
     * @returns InspectResponse（带 filter 方法）
     */
    async inspectElement(windowSelector: string, elementXPath: string, format?: 'json' | 'txt' | 'text', runtimeId?: string): Promise<InspectResponse> {
        // Inspect 大子树遍历可能耗时很长（后端 TIMEOUT_INSPECT = 120s），
        // HTTP 请求超时需大于后端超时，避免 axios 提前中断
        const INSPECT_HTTP_TIMEOUT = 180_000;
        return this.requestWithRetry(async () => {
            const body: any = {
                window: windowSelector,
                element: elementXPath,
                format: format ?? 'json',
            };
            if (runtimeId) body.runtimeId = runtimeId;
            const response = await this.client.post('/api/element/inspect', body, {
                timeout: INSPECT_HTTP_TIMEOUT,
            });
            const data = response.data;
            // 附加 filter 方法到响应对象上（支持回调和对象两种形式）
            data.filter = (arg: any) => {
                const nodes = data.flatNodes ?? [];
                if (typeof arg === 'function') {
                    // 回调函数形式，与 Array.filter 一致
                    return nodes.filter(arg);
                }
                // InspectFilter 对象形式
                return nodes.filter((node: import('./types').FlatInspectNodeInfo) => {
                    if (arg.name && !(node.name || '').includes(arg.name)) return false;
                    if (arg.controlType && node.controlType !== arg.controlType) return false;
                    if (arg.className && !(node.className || '').includes(arg.className)) return false;
                    if (arg.automationId && !(node.automationId || '').includes(arg.automationId)) return false;
                    if (arg.textValue && !(node.textValue || '').includes(arg.textValue)) return false;
                    if (arg.helpText && !(node.helpText || '').includes(arg.helpText)) return false;
                    return true;
                });
            };
            return data;
        }, {
            endpoint: '/api/element/inspect',
            operation: 'inspectElement',
            window: windowSelector,
            element: elementXPath,
            extra: { format: format ?? 'json' },
        });
    }

    /**
     * Compass 导航：找到基准元素后逐步 TreeWalker 导航
     * @param windowSelector 窗口选择器 XPath
     * @param baseXPath 基准元素 XPath
     * @param steps 导航步骤列表
     * @returns 导航结果
     */
    async navigateElement(windowSelector: string, baseXPath: string, steps: import('./types').NavigateStep[], runtimeId?: string): Promise<import('./types').NavigateResponse> {
        return this.requestWithRetry(async () => {
            const body: any = {
                window: windowSelector,
                element: baseXPath,
                steps,
            };
            if (runtimeId) body.runtimeId = runtimeId;
            const response = await this.client.post<import('./types').NavigateResponse>('/api/element/navigate', body);
            return response.data;
        }, {
            endpoint: '/api/element/navigate',
            operation: 'navigateElement',
            window: windowSelector,
            element: baseXPath,
            extra: { steps: steps.length },
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // RuntimeId 缓存相关 API
    // ═══════════════════════════════════════════════════════════════════════════════

    /**
     * 通过 runtimeId 刷新元素信息（从缓存获取最新属性）
     */
    async refreshByRuntimeId(
        windowSelector: string,
        runtimeId: string
    ): Promise<RefreshByRuntimeIdResponse> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<RefreshByRuntimeIdResponse>('/api/element/refresh', {
                window: windowSelector,
                runtimeId,
            });
            return response.data;
        }, {
            endpoint: '/api/element/refresh',
            operation: 'refreshByRuntimeId',
            window: windowSelector,
            extra: { runtimeId: runtimeId.substring(0, 16) },
        });
    }

    /**
     * 从 RuntimeId 缓存元素查找子元素
     */
    async findFromElement(params: FindFromElementRequest): Promise<FindFromElementResponse> {
        return this.requestWithRetry(async () => {
            const body: any = {
                runtimeId: params.runtimeId,
                xpath: params.xpath,
                randomRange: params.randomRange ?? DEFAULTS.click.randomRange,
            };
            if (params.searchStrategy) {
                // Rust SearchStrategy enum expects { Fast: { max_depth: N } } or { Full: { max_depth: N } }
                // (not a plain string like 'Fast' or 'Full')
                const maxDepth = 50; // Default max depth for find-from operations
                body.searchStrategy = { [params.searchStrategy]: { max_depth: maxDepth } };
            }
            const raw = await this.client.post<any>('/api/element/find-from', body);
            const data = raw.data;
            return {
                found: data.found,
                elements: data.elements ?? [],
                total: data.total ?? 0,
                error: data.error ?? null,
                notFoundReason: data.notFoundReason,
            } as FindFromElementResponse;
        }, {
            endpoint: '/api/element/find-from',
            operation: 'findFromElement',
            extra: { runtimeId: params.runtimeId.substring(0, 16) },
        });
    }

    /**
     * 设置全局缓存 TTL
     */
    async setCacheConfig(config: CacheConfigRequest): Promise<void> {
        await this.requestWithRetry(async () => {
            const body: any = {};
            if (config.cacheTime !== undefined) body.cacheTime = config.cacheTime;
            await this.client.put('/api/element/cache/config', body);
        }, {
            endpoint: '/api/element/cache/config',
            operation: 'setCacheConfig',
        });
    }

    /**
     * 获取缓存统计
     */
    async getCacheStats(): Promise<CacheStatsResponse> {
        return this.requestWithRetry(async () => {
            const response = await this.client.get<CacheStatsResponse>('/api/element/cache/stats');
            return response.data;
        }, {
            endpoint: '/api/element/cache/stats',
            operation: 'getCacheStats',
        });
    }

    /**
     * 清除所有缓存
     */
    async clearElementCache(): Promise<void> {
        await this.requestWithRetry(async () => {
            await this.client.post('/api/element/cache/clear');
        }, {
            endpoint: '/api/element/cache/clear',
            operation: 'clearElementCache',
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 截图 & 图像匹配 API
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 截取指定屏幕区域
     */
    async captureScreenshot(params: ScreenshotCaptureRequest): Promise<ScreenshotCaptureResponse> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<ScreenshotCaptureResponse>('/api/screenshot/capture', params);
            return response.data;
        }, {
            endpoint: '/api/screenshot/capture',
            operation: 'captureScreenshot',
        });
    }

    /**
     * 截取全屏
     */
    async captureDesktopScreenshot(): Promise<ScreenshotCaptureResponse> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<ScreenshotCaptureResponse>('/api/screenshot/capture-desktop', {});
            return response.data;
        }, {
            endpoint: '/api/screenshot/capture-desktop',
            operation: 'captureDesktopScreenshot',
        });
    }

    /**
     * 通过模板图像在屏幕上查找匹配位置
     */
    async findImage(params: FindImageRequest): Promise<FindImageResponse> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<FindImageResponse>('/api/image/find', params);
            return response.data;
        }, {
            endpoint: '/api/image/find',
            operation: 'findImage',
        });
    }

    /**
     * 截取区域并保存到文件
     */
    async saveElementImage(params: SaveElementImageRequest): Promise<SaveElementImageResponse> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<SaveElementImageResponse>('/api/image/save', params);
            return response.data;
        }, {
            endpoint: '/api/image/save',
            operation: 'saveElementImage',
        });
    }

    handleError(error: unknown, endpoint?: string): never {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<{ error?: string }>;
            
            // 超时错误
            if (axiosError.code === 'ECONNABORTED') {
                throw new TimeoutError(
                    endpoint || 'unknown', 
                    this.client.defaults.timeout || 30000
                );
            }
            
            // 网络错误（无响应）
            if (!axiosError.response) {
                throw new NetworkError(
                    axiosError, 
                    endpoint || 'unknown'
                );
            }
            
            // HTTP 错误
            const message = axiosError.response?.data?.error ?? axiosError.message;
            throw new SDKError(
                `HTTP ${axiosError.response.status}: ${message}`,
                `HTTP_${axiosError.response.status}`,
                { 
                    endpoint, 
                    status: axiosError.response.status,
                    responseData: axiosError.response.data
                }
            );
        }
        
        // 其他错误
        if (error instanceof Error) {
            throw new SDKError(
                error.message, 
                'UNKNOWN_ERROR', 
                { stack: error.stack }
            );
        }
        
        throw new SDKError(String(error), 'UNKNOWN_ERROR');
    }
}