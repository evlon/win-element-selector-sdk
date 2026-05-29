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
} from './types';
import { NetworkError, TimeoutError, SDKError } from './errors';

/** 瞬态网络错误码，可安全重试 */
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN']);

export class HttpClient {
    private client: AxiosInstance;
    private maxRetries: number;
    private retryDelayMs: number;

    constructor(config: SDKConfig) {
        this.maxRetries = config.timeout ? 2 : 2;
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
    private async requestWithRetry<T>(fn: () => Promise<T>): Promise<T> {
        let lastError: unknown;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (attempt < this.maxRetries && this.isRetryableError(error)) {
                    const delay = this.retryDelayMs * (attempt + 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
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
            const raw = await this.client.post<any>('/api/element', {
                window: params.window,
                element: params.element,
                randomRange: params.randomRange ?? DEFAULTS.click.randomRange,
            });
            const data = raw.data;
            // 后端返回 findSelector（旧版返回 elementSelector，兼容映射）
            return {
                found: data.found,
                findSelector: data.findSelector || data.elementSelector || '',
                element: data.element ?? null,
                total: data.total ?? 0,
                error: data.error ?? null,
            } as ElementResponse;
        });
    }
    
    async moveMouse(target: Point, options?: MoveOptions): Promise<MoveResult> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<MoveResult>('/api/mouse/move', {
                target,
                options: options ? {
                    humanize: options.humanize ?? DEFAULTS.move.humanize,
                    trajectory: options.trajectory ?? DEFAULTS.move.trajectory,
                    duration: options.duration ?? DEFAULTS.move.duration,
                } : undefined,
            });
            return response.data;
        });
    }
    
    async clickMouse(params: ClickParams): Promise<ClickResult> {
        try {
            return await this.requestWithRetry(async () => {
                const response = await this.client.post<ClickResult>('/api/mouse/click', {
                    window: params.window,
                    element: params.element,
                    options: params.options ? {
                        humanize: params.options.humanize ?? DEFAULTS.click.humanize,
                        randomRange: params.options.randomRange ?? DEFAULTS.click.randomRange,
                        button: params.options.button ?? 'left',
                        clickArea: params.options.clickArea ?? undefined,
                        markClick: params.options.markClick ?? false,
                        markTimeout: params.options.markTimeout ?? 3000,
                    } : undefined,
                });
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
                humanIntervention: params.humanIntervention ? {
                    enabled: params.humanIntervention.enabled,
                    pauseOnMouse: params.humanIntervention.pauseOnMouse ?? DEFAULTS.idleMotion.humanIntervention.pauseOnMouse,
                    pauseOnKeyboard: params.humanIntervention.pauseOnKeyboard ?? DEFAULTS.idleMotion.humanIntervention.pauseOnKeyboard,
                    resumeDelay: params.humanIntervention.resumeDelay ?? DEFAULTS.idleMotion.humanIntervention.resumeDelay,
                } : DEFAULTS.idleMotion.humanIntervention,
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

    async scrollMouse(params: { window?: string; element: string; delta?: number; times?: number; wait?: string; waitMode?: string; timeout?: number; autoDelta?: boolean; deltaFactor?: number; scrollToCenter?: boolean; scrollToCenterAdjustTimes?: number; scrollIntervalMs?: number; autoDeltaInitialDelayMs?: number; minDeltaRatio?: number; scrollToCenterThreshold?: number }): Promise<ScrollResult> {
        const scrollTimeout = params.timeout ?? DEFAULTS.scroll.timeout;
        // HTTP 请求超时 = 滚动业务超时 + 10s 缓冲，避免 axios 提前中断后端长时操作
        const httpTimeout = scrollTimeout + 10000;
        return this.requestWithRetry(async () => {
            const body: any = {
                element: params.element,
                options: {
                    delta: params.delta ?? DEFAULTS.scroll.delta,
                    times: params.times ?? DEFAULTS.scroll.times,
                    wait: params.wait,
                    waitMode: params.waitMode,
                    timeout: scrollTimeout,
                    autoDelta: params.autoDelta ?? DEFAULTS.scroll.autoDelta,
                    deltaFactor: params.deltaFactor ?? DEFAULTS.scroll.deltaFactor,
                    scrollToCenter: params.scrollToCenter ?? DEFAULTS.scroll.scrollToCenter,
                    scrollToCenterAdjustTimes: params.scrollToCenterAdjustTimes ?? DEFAULTS.scroll.scrollToCenterAdjustTimes,
                    scrollIntervalMs: params.scrollIntervalMs ?? DEFAULTS.scroll.scrollIntervalMs,
                    autoDeltaInitialDelayMs: params.autoDeltaInitialDelayMs ?? DEFAULTS.scroll.autoDeltaInitialDelayMs,
                    minDeltaRatio: params.minDeltaRatio ?? DEFAULTS.scroll.minDeltaRatio,
                    scrollToCenterThreshold: params.scrollToCenterThreshold ?? DEFAULTS.scroll.scrollToCenterThreshold,
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
    
    async typeText(text: string, options?: TypeOptions): Promise<TypeResult> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<TypeResult>('/api/keyboard/type', {
                text,
                charDelay: options?.charDelay ?? DEFAULTS.type.charDelay,
            });
            return response.data;
        });
    }

    async hoverMouse(params: { window: string; element: string; duration?: number; humanize?: boolean }): Promise<{ success: boolean; hoverPoint: Point | null; error: string | null }> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post('/api/mouse/hover', {
                window: params.window,
                element: params.element,
                options: {
                    humanize: params.humanize ?? DEFAULTS.move.humanize,
                    duration: params.duration ?? 500,
                },
            });
            return response.data;
        });
    }

    async dragMouse(params: { window: string; sourceElement: string; targetElement: string; duration?: number }): Promise<{ success: boolean; sourcePoint: Point | null; targetPoint: Point | null; durationMs: number; error: string | null }> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post('/api/mouse/drag', {
                window: params.window,
                sourceElement: params.sourceElement,
                targetElement: params.targetElement,
                options: {
                    duration: params.duration ?? 1000,
                },
            });
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
    async activateWindow(windowSelector: string): Promise<{ success: boolean; error?: string }> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<{ success: boolean; windowSelector: string; error?: string }>('/api/window/activate', {
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
    async findAll(params: ElementQueryParams): Promise<{ found: boolean; elements: ElementInfo[]; total: number; error?: string }> {
        return this.requestWithRetry(async () => {
            const rawResp = await this.client.post<{ found: boolean; elements: { findSelector: string; info: ElementInfo }[]; total: number; error?: string }>('/api/element/all', {
                window: params.window,
                element: params.element,
                randomRange: params.randomRange ?? DEFAULTS.click.randomRange,
            });

            const raw = rawResp.data;
            const elements = raw.found && raw.elements
                ? raw.elements.map((e) => e.info)
                : [];

            return {
                found: raw.found,
                elements,
                total: raw.total,
                error: raw.error,
            };
        });
    }
    
    /**
     * 获取元素可视区域位置信息
     * @param windowSelector 窗口选择器 XPath
     * @param elementXPath 元素 XPath
     * @param containerXPath 可选的滚动容器 XPath，用于计算元素在容器内的可见矩形
     * @returns 元素可视区域位置信息
     */
    async getElementVisibility(windowSelector: string, elementXPath: string, containerXPath?: string): Promise<ElementVisibilityResult> {
        return this.requestWithRetry(async () => {
            const body: any = {
                window: windowSelector,
                element: elementXPath,
            };
            if (containerXPath) {
                body.container = containerXPath;
            }
            const response = await this.client.post<ElementVisibilityResult>('/api/element/visibility', body);
            return response.data;
        });
    }

    /**
     * 在元素位置显示高亮闪烁（绿色边框 + 标签）
     * @param windowSelector 窗口选择器 XPath
     * @param elementXPath 元素 XPath
     * @param timeout 闪烁持续时间（ms），默认 1000
     * @returns 闪烁结果
     */
    async flashElement(windowSelector: string, elementXPath: string, timeout?: number): Promise<FlashResult> {
        return this.requestWithRetry(async () => {
            const response = await this.client.post<FlashResult>('/api/element/flash', {
                window: windowSelector,
                element: elementXPath,
                timeout: timeout ?? 1000,
            });
            return response.data;
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