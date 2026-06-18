// 图像模板源归一化工具
//
// 把 base64 字符串 / 文件路径 / Buffer 统一规范化为 base64 字符串，
// 这样 SDK 上层 API 就能透明接受三种入参形式，HTTP 接口仍只接 base64。

import * as fs from 'fs/promises';
import { loadImageMeta, ImageMeta } from './image-meta';

/**
 * 模板入参类型：
 * - `string`：被解释为 base64（识别为 base64 形式）或文件路径（识别为路径形式）
 * - `Buffer`：图像字节流（PNG / JPG / BMP），自动转 base64
 */
export type Template = string | Buffer;

/** resolveTemplate 返回结果，含 base64 + 可选 meta */
export interface ResolvedTemplate {
    base64: string;
    meta: ImageMeta | null;
}

const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;
const IMAGE_EXT_RE = /\.(png|jpe?g|bmp)$/i;

/**
 * 规范化模板入参为 base64 字符串 + meta 信息。
 *
 * 启发式：
 * 1. `Buffer` → 直接 `toString('base64')`，无 meta
 * 2. 字符串带路径分隔符或图像扩展名 → 读文件 + 加载同名 .meta.json
 * 3. 字符串纯 base64 字符 → 直接返回，无 meta
 * 4. 其它（包含空格 / 非法字符）→ 抛错
 *
 * @throws Error 当入参既非合法 base64 也非可读文件路径
 */
export async function resolveTemplate(t: Template): Promise<ResolvedTemplate> {
    if (Buffer.isBuffer(t)) {
        return { base64: t.toString('base64'), meta: null };
    }
    if (typeof t !== 'string') {
        throw new Error('resolveTemplate: 入参必须是 string 或 Buffer');
    }

    const looksLikePath =
        t.length < 260 && (/[\\/]/.test(t) || IMAGE_EXT_RE.test(t));
    if (looksLikePath) {
        const buf = await fs.readFile(t);
        const meta = loadImageMeta(t);
        return { base64: buf.toString('base64'), meta };
    }

    if (BASE64_RE.test(t)) return { base64: t, meta: null };

    throw new Error(
        `resolveTemplate: 无法识别模板源（既非 base64 也非文件路径）: ${t.slice(0, 80)}`,
    );
}
