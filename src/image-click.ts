// 图像命中矩形的 ClickArea 计算
//
// 根据命中矩形（中心 + 模板宽高）和 ClickArea (inset 模型)，
// 计算最终点击点。语义与元素族一致：正值内缩，负值外扩。

import type { ClickArea, ClickAreaValue, FindImageMatch } from './types';

/** 解析单个 ClickAreaValue 为像素偏移量 */
function resolveValue(v: ClickAreaValue | undefined, total: number): number {
    if (v === undefined) return 0;
    if (typeof v === 'number') return v * total; // 0~1 视为百分比
    const s = v.trim();
    if (s.endsWith('%')) return (parseFloat(s.slice(0, -1)) / 100) * total;
    if (s.endsWith('px')) return parseFloat(s.slice(0, -2));
    return parseFloat(s) || 0;
}

/**
 * 根据命中矩形和 ClickArea 计算最终点击点（屏幕绝对坐标）。
 *
 * - `clickArea` 不传：返回命中矩形中心（findImage 返回的 x/y 已是中心）
 * - `clickArea` 传了：各边内缩后形成子矩形，返回该子矩形中心
 *   （randomRange 由后端在该点周围抖动）
 *
 * @example
 * // 命中矩形 200×100，中心 (500,300)
 * // { left: '50%', top: '50%' } → 右下 1/4 子矩形中心 = (550, 325)
 */
export function computeImageClickPoint(
    match: FindImageMatch,
    area?: ClickArea,
): { x: number; y: number } {
    if (!area) return { x: match.x, y: match.y };

    const halfW = match.width / 2;
    const halfH = match.height / 2;
    const left   = match.x - halfW + resolveValue(area.left, match.width);
    const right  = match.x + halfW - resolveValue(area.right, match.width);
    const top    = match.y - halfH + resolveValue(area.top, match.height);
    const bottom = match.y + halfH - resolveValue(area.bottom, match.height);

    return {
        x: Math.round((left + right) / 2),
        y: Math.round((top + bottom) / 2),
    };
}
