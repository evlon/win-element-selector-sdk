import axios, { AxiosInstance, AxiosError } from 'axios';
import {
    SDKConfig,
    DEFAULTS,
    HealthStatus,
    WindowInfo,
    ElementQueryParams,
    ElementResponse,
    ElementInfo,
    ElementWithSelector,
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
} from './types';
import { NetworkError, TimeoutError, SDKError } from './errors';

export class HttpClient {
    private client: AxiosInstance;
    
    constructor(config: SDKConfig) {
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
    
    async health(): Promise<HealthStatus> {
        const response = await this.client.get<HealthStatus>('/api/health');
        return response.data;
    }
    
    async listWindows(): Promise<WindowInfo[]> {
        const response = await this.client.post<{ windows: WindowInfo[] }>('/api/window/list');
        return response.data.windows;
    }
    
    async getElement(params: ElementQueryParams): Promise<ElementResponse> {
        const startTime = Date.now();

        try {
            // 使用 POST 请求避免 URL 编码问题
            const response = await this.client.post<ElementResponse>('/api/element', {
                window: params.window,
                element: params.element,
                randomRange: params.randomRange ?? DEFAULTS.click.randomRange,
            });

            // Rust 端使用 #[serde(flatten)] 将 ElementInfo 扁平化到顶层，
            // 这里重新组装为 element 对象，方便 SDK 侧使用。
            const raw = response.data;
            if (raw.found && raw.rect && !raw.element) {
                raw.element = {
                    elementSelector: raw.elementSelector,
                    rect: raw.rect,
                    center: raw.center!,
                    centerRandom: raw.centerRandom!,
                    controlType: raw.controlType!,
                    name: raw.name!,
                    automationId: raw.automationId!,
                    className: raw.className!,
                    frameworkId: raw.frameworkId!,
                    helpText: raw.helpText!,
                    localizedControlType: raw.localizedControlType!,
                    isEnabled: raw.isEnabled!,
                    isOffscreen: raw.isOffscreen!,
                    isPassword: raw.isPassword!,
                    acceleratorKey: raw.acceleratorKey!,
                    accessKey: raw.accessKey!,
                    itemType: raw.itemType!,
                    itemStatus: raw.itemStatus!,
                    processId: raw.processId!,
                    isCheckable: raw.isCheckable,
                    isChecked: raw.isChecked,
                    isClickable: raw.isClickable,
                    isScrollable: raw.isScrollable,
                    isSelected: raw.isSelected,
                };
            }

            return response.data;
        } catch (error) {
            throw this.handleError(error, '/api/element');
        }
    }
    
    async moveMouse(target: Point, options?: MoveOptions): Promise<MoveResult> {
        const response = await this.client.post<MoveResult>('/api/mouse/move', {
            target,
            options: options ? {
                humanize: options.humanize ?? DEFAULTS.move.humanize,
                trajectory: options.trajectory ?? DEFAULTS.move.trajectory,
                duration: options.duration ?? DEFAULTS.move.duration,
            } : undefined,
        });
        return response.data;
    }
    
    async clickMouse(params: ClickParams): Promise<ClickResult> {
        const startTime = Date.now();
        // this.logger.debug('POST /api/mouse/click', { 
        //     window: params.window,
        //     xpath: params.xpath.substring(0, 80) + '...' 
        // });
        
        try {
            const response = await this.client.post<ClickResult>('/api/mouse/click', {
                window: params.window,
                element: params.element,
                options: params.options ? {
                    humanize: params.options.humanize ?? DEFAULTS.click.humanize,
                    randomRange: params.options.randomRange ?? DEFAULTS.click.randomRange,
                    button: params.options.button ?? 'left',
                    clickArea: params.options.clickArea ?? undefined,
                } : undefined,
            });
            
            const duration = Date.now() - startTime;
            // this.logger.debug('Click completed', { 
            //     duration, 
            //     success: response.data.success,
            //     clickPoint: response.data.success ? response.data.clickPoint : undefined
            // });
            
            return response.data;
        } catch (error) {
            // this.logger.error('Click failed', { params, error: (error as Error).message });
            throw this.handleError(error, '/api/mouse/click');
        }
    }
    
    async startIdleMotion(params: IdleMotionParams): Promise<void> {
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
    }
    
    async stopIdleMotion(): Promise<StopResult> {
        const response = await this.client.post<StopResult>('/api/mouse/idle/stop');
        return response.data;
    }
    
    async getIdleMotionStatus(): Promise<IdleMotionStatus> {
        const response = await this.client.get<IdleMotionStatus>('/api/mouse/idle/status');
        return response.data;
    }

    async scrollMouse(params: { element: string; delta?: number; times?: number; wait?: string; timeout?: number; autoDelta?: boolean; deltaFactor?: number }): Promise<ScrollResult> {
        const response = await this.client.post<ScrollResult>('/api/mouse/scroll', {
            element: params.element,
            options: {
                delta: params.delta ?? DEFAULTS.scroll.delta,
                times: params.times ?? DEFAULTS.scroll.times,
                wait: params.wait,
                timeout: params.timeout ?? DEFAULTS.scroll.timeout,
                autoDelta: params.autoDelta ?? DEFAULTS.scroll.autoDelta,
                deltaFactor: params.deltaFactor ?? DEFAULTS.scroll.deltaFactor,
            },
        });
        return response.data;
    }
    
    async typeText(text: string, options?: TypeOptions): Promise<TypeResult> {
        const response = await this.client.post<TypeResult>('/api/keyboard/type', {
            text,
            charDelay: options?.charDelay ?? DEFAULTS.type.charDelay,
        });
        return response.data;
    }

    async hoverMouse(params: { window: string; element: string; duration?: number; humanize?: boolean }): Promise<{ success: boolean; hoverPoint: Point | null; error: string | null }> {
        const response = await this.client.post('/api/mouse/hover', {
            window: params.window,
            element: params.element,
            options: {
                humanize: params.humanize ?? DEFAULTS.move.humanize,
                duration: params.duration ?? 500,
            },
        });
        return response.data;
    }

    async dragMouse(params: { window: string; sourceElement: string; targetElement: string; duration?: number }): Promise<{ success: boolean; sourcePoint: Point | null; targetPoint: Point | null; durationMs: number; error: string | null }> {
        const response = await this.client.post('/api/mouse/drag', {
            window: params.window,
            sourceElement: params.sourceElement,
            targetElement: params.targetElement,
            options: {
                duration: params.duration ?? 1000,
            },
        });
        return response.data;
    }
    
    /**
     * 激活指定窗口（使其成为前台窗口）
     * @param windowSelector 窗口选择器 XPath
     * @returns 激活结果
     */
    async activateWindow(windowSelector: string): Promise<{ success: boolean; error?: string }> {
        const response = await this.client.post<{ success: boolean; windowSelector: string; error?: string }>('/api/window/activate', {
            windowSelector,
        });
        return response.data;
    }
    
    /**
     * 激活窗口并使指定元素获得焦点
     * @param windowSelector 窗口选择器 XPath
     * @param xpath 元素 XPath
     * @returns 操作结果
     */
    async focusElement(windowSelector: string, xpath: string): Promise<{ success: boolean; error?: string }> {
        const response = await this.client.post<{ success: boolean; error?: string }>('/api/window/focus-element', {
            windowSelector,
            xpath,
        });
        return response.data;
    }
    
    /**
     * 获取所有匹配元素
     * @param params 查询参数
     * @returns 所有匹配的元素列表
     */
    async getAllElements(params: ElementQueryParams): Promise<{ found: boolean; elements: ElementWithSelector[]; total: number; error?: string }> {
        // 使用 POST 请求避免 URL 编码问题
        const response = await this.client.post<{ found: boolean; elements: ElementWithSelector[]; total: number; error?: string }>('/api/element/all', {
            window: params.window,
            element: params.element,
            randomRange: params.randomRange ?? DEFAULTS.click.randomRange,
        });

        // Rust 端 ElementWithSelector 使用 #[serde(flatten)]，
        // 每个元素的 ElementInfo 属性被扁平化到顶层，这里重新组装。
        const raw = response.data;
        if (raw.found && raw.elements && raw.elements.length > 0) {
            for (const item of raw.elements as any[]) {
                if (item.rect && !item.info) {
                    // 扁平化 → 嵌套结构
                    item.info = {
                        rect: item.rect,
                        center: item.center,
                        centerRandom: item.centerRandom,
                        controlType: item.controlType,
                        name: item.name,
                        automationId: item.automationId,
                        className: item.className,
                        frameworkId: item.frameworkId,
                        helpText: item.helpText,
                        localizedControlType: item.localizedControlType,
                        isEnabled: item.isEnabled,
                        isOffscreen: item.isOffscreen,
                        isPassword: item.isPassword,
                        acceleratorKey: item.acceleratorKey,
                        accessKey: item.accessKey,
                        itemType: item.itemType,
                        itemStatus: item.itemStatus,
                        processId: item.processId,
                        isCheckable: item.isCheckable,
                        isChecked: item.isChecked,
                        isClickable: item.isClickable,
                        isScrollable: item.isScrollable,
                        isSelected: item.isSelected,
                    };
                }
            }
        }

        return response.data;
    }
    
    /**
     * 执行快捷键组合（推荐方法名）
     * @param keys 快捷键字符串，如 "Ctrl+C", "Alt+F4"
     */
    async shortcut(keys: string): Promise<{ success: boolean; error?: string }> {
        const response = await this.client.post<{ success: boolean; error?: string }>('/api/keyboard/shortcut', {
            keys,
        });
        return response.data;
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
        const response = await this.client.post<{ success: boolean; error?: string }>('/api/keyboard/key', {
            key,
        });
        return response.data;
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