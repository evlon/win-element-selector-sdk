import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import type { FindElementMode } from './xpath-marker';

// 程序启动时间戳（秒），用于隔离不同会话的缓存
const SESSION_ID = Math.floor(Date.now() / 1000);

/**
 * 生成模板缓存路径。
 *
 * 默认目录：`<系统临时目录>/element-selector-cache/<SESSION_ID>/`
 * - 每次程序启动生成独立目录，不会跨会话污染
 * - 程序退出后由 OS 清理临时目录
 *
 * 文件名：基于 xpath 的 sha256 前 8 位。
 */
export function resolveTemplatePath(
    xpath: string,
    templateDir?: string,
    templateName?: string,
): string {
    const dir = templateDir || path.join(os.tmpdir(), 'element-selector-cache', String(SESSION_ID));
    if (templateName) return path.join(dir, `${templateName}.png`);
    const hash = crypto.createHash('sha256').update(xpath).digest('hex').slice(0, 8);
    return path.join(dir, `${hash}.png`);
}

/**
 * 判断是否应使用图像加速。
 * 默认禁用，必须用户显式传 enabled: true。
 * `:all` 模式不支持（单模板无法匹配多元素）。
 */
export function shouldUseImageAcceleration(
    mode: FindElementMode,
    imageAcceleration?: { enabled: boolean },
): boolean {
    if (!imageAcceleration?.enabled) return false;
    if (mode === 'all') return false;
    return true;
}
