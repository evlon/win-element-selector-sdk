import * as crypto from 'crypto';
import type { FindElementMode } from './xpath-marker';

/**
 * 生成模板缓存路径。
 * 基于 xpath 的 sha256 前 8 位作为文件名，避免冲突。
 */
export function resolveTemplatePath(
    xpath: string,
    templateDir?: string,
    templateName?: string,
): string {
    const dir = templateDir || 'images';
    if (templateName) return `${dir}/${templateName}.png`;
    const hash = crypto.createHash('sha256').update(xpath).digest('hex').slice(0, 8);
    return `${dir}/${hash}.png`;
}

/**
 * 判断是否应使用图像加速。
 * :all 模式不支持（单模板无法匹配多元素）。
 */
export function shouldUseImageAcceleration(
    mode: FindElementMode,
    imageAcceleration?: { enabled: boolean },
): boolean {
    if (!imageAcceleration?.enabled) return false;
    if (mode === 'all') return false;
    return true;
}
