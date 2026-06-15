// 图像模板 meta.json 读取
//
// meta.json 伴随模板 PNG 存储，记录截取时的 DPI、窗口位置等信息。
// SDK 读取后将 DPI 信息传给后端，后端据此自动缩放模板。

import * as fs from 'fs';

export interface ImageMeta {
    version: number;
    dpi: number;
    screenWidth: number;
    screenHeight: number;
    windowRect?: { x: number; y: number; width: number; height: number };
    relativePosition?: { x: number; y: number };
    templateWidth: number;
    templateHeight: number;
}

/**
 * 加载模板的 meta.json（如果存在）。
 * meta.json 与模板 PNG 同名，后缀 .meta.json。
 *
 * @example
 * // 模板: images/btn.png → meta: images/btn.png.meta.json
 * const meta = loadImageMeta('images/btn.png');
 */
export function loadImageMeta(templatePath: string): ImageMeta | null {
    const metaPath = `${templatePath}.meta.json`;
    try {
        const data = fs.readFileSync(metaPath, 'utf-8');
        return JSON.parse(data) as ImageMeta;
    } catch {
        return null;
    }
}

/**
 * 获取当前系统 DPI（96=100%，192=200%）
 * 在 Node.js 中无法直接调用 Windows API，通过后端获取。
 * 这里返回 meta 中的 DPI 值供后端判断是否需要缩放。
 */
export function getTemplateDpi(meta: ImageMeta | null): number | undefined {
    return meta?.dpi;
}
