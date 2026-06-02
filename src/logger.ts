// sdk/nodejs/src/logger.ts
// 操作日志工具类

import { LoggingConfig, ElementInfo } from './types';

/**
 * 操作日志记录器
 * 
 * 提供用户友好的操作日志，显示元素信息和操作结果
 */
export class OperationLogger {
    private config: LoggingConfig;
    
    constructor(config: LoggingConfig) {
        this.config = config;
    }
    
    /**
     * 记录操作开始
     */
    logOperation(operation: string, elementInfo?: ElementInfo, details?: any): void {
        if (!this.config.enabled) return;
        
        const message = this.formatMessage(operation, elementInfo, details);
        this.log('INFO', message);
    }
    
    /**
     * 记录窗口激活操作
     */
    logWindowActivation(selector: string, success: boolean): void {
        if (!this.config.enabled) return;
        
        if (success) {
            this.log('INFO', '✓ 已切换到目标窗口');
        } else {
            this.log('ERROR', '✗ 找不到窗口，请确认窗口已打开');
        }
    }
    
    /**
     * 记录元素查找操作
     */
    logElementFound(elementInfo: ElementInfo): void {
        if (!this.config.enabled || !this.config.showElementInfo) return;
        
        const name = elementInfo.name || '(无名称)';
        const type = elementInfo.controlType;
        this.log('INFO', `✓ 找到元素: ${type} "${name}"`);
    }
    
    /**
     * 记录元素未找到
     */
    logElementNotFound(xpath: string): void {
        if (!this.config.enabled) return;
        this.log('ERROR', `✗ 未找到匹配的元素，请检查 XPath 是否正确`);
    }
    
    /**
     * 记录操作成功
     */
    logSuccess(operation: string, details?: any): void {
        if (!this.config.enabled) return;
        
        let message = `✓ ${operation} 成功`;
        
        // 如果有点击坐标信息，添加到消息中
        if (details?.clickPoint && details?.elementInfo) {
            const point = details.clickPoint;
            const elementInfo = details.elementInfo;
            
            message += ` [point: (${point.x}, ${point.y})]`;
            
            // 计算相对坐标（百分比）
            if (elementInfo.rect && elementInfo.rect.width > 0 && elementInfo.rect.height > 0) {
                const rect = elementInfo.rect;
                const relativeX = ((point.x - rect.x) / rect.width).toFixed(2);
                const relativeY = ((point.y - rect.y) / rect.height).toFixed(2);
                message += ` [relative: (${relativeX}, ${relativeY})]`;
            }
        } else if (details?.clickPoint) {
            // 只有点击坐标，没有元素信息
            const point = details.clickPoint;
            message += ` [point: (${point.x}, ${point.y})]`;
        }
        
        this.log('INFO', message);
    }
    
    /**
     * 记录操作失败
     */
    logError(operation: string, error: Error): void {
        if (!this.config.enabled) return;
        this.log('ERROR', `✗ ${operation} 失败: ${error.message}`);
    }
    
    /**
     * 记录调试信息
     */
    logDebug(message: string, data?: any): void {
        if (!this.config.enabled || this.config.level !== 'debug') return;
        
        if (data) {
            this.log('DEBUG', `${message}`, JSON.stringify(data, null, 2));
        } else {
            this.log('DEBUG', message);
        }
    }
    
    /**
     * 格式化日志消息
     */
    private formatMessage(operation: string, elementInfo?: ElementInfo, details?: any): string {
        let msg = operation;
        
        if (elementInfo && this.config.showElementInfo) {
            const name = elementInfo.name || '(无名称)';
            const type = elementInfo.controlType;
            msg += `: ${type} "${name}"`;
            
            // 显示边界信息
            if (elementInfo.rect) {
                const rect = elementInfo.rect;
                msg += ` [bounds: (${rect.x}, ${rect.y}, ${rect.width}x${rect.height})]`;
            }
            
            // 显示中心坐标
            if (elementInfo.center) {
                msg += ` [center: (${elementInfo.center.x}, ${elementInfo.center.y})]`;
            }
            
            // 显示随机点击坐标（如果有）
            if (elementInfo.centerRandom && details?.clickPoint) {
                const clickPoint = details.clickPoint;
                const rect = elementInfo.rect;
                if (rect && rect.width > 0 && rect.height > 0) {
                    const relativeX = ((clickPoint.x - rect.x) / rect.width).toFixed(2);
                    const relativeY = ((clickPoint.y - rect.y) / rect.height).toFixed(2);
                    msg += ` [click: (${clickPoint.x}, ${clickPoint.y}), relative: (${relativeX}, ${relativeY})]`;
                } else {
                    msg += ` [click: (${clickPoint.x}, ${clickPoint.y})]`;
                }
            }
        }
        
        // 显示 xpath 信息
        if (details?.xpath) {
            msg += ` [xpath: ${details.xpath}]`;
        }
        
        return msg;
    }
    
    /**
     * 输出日志到控制台
     */
    private log(level: string, message: string, extra?: string): void {
        const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
        
        // 根据级别设置颜色
        const colors: Record<string, string> = {
            'INFO': '\x1b[32m',   // 绿色
            'WARN': '\x1b[33m',   // 黄色
            'ERROR': '\x1b[31m',  // 红色
            'DEBUG': '\x1b[36m',  // 青色
        };
        const reset = '\x1b[0m';
        
        const color = colors[level] || '';
        const levelStr = `[${level}]`;
        
        if (extra) {
            console.log(`${timestamp} ${color}${levelStr}${reset} ${message}\n${extra}`);
        } else {
            console.log(`${timestamp} ${color}${levelStr}${reset} ${message}`);
        }
    }
}
