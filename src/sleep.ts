// sdk/nodejs/src/sleep.ts
// 全局延迟工具 — 受 speedFactor 控制

import { DEFAULTS } from './types';

let _globalSpeedFactor: number = DEFAULTS.speedFactor;

/**
 * 设置全局速度因子
 * @param factor - 速度因子，默认 1（正常）
 *   - 2 = 2倍速（等待时间减半）
 *   - 0.5 = 0.5倍速（等待时间翻倍）
 */
export function setSpeedFactor(factor: number): void {
    _globalSpeedFactor = Math.max(0.1, factor);
}

/**
 * 获取当前全局速度因子
 */
export function getSpeedFactor(): number {
    return _globalSpeedFactor;
}

/**
 * 延迟执行，受全局 speedFactor 控制
 * 实际等待时间 = ms / speedFactor
 */
export function delay(ms: number): Promise<void> {
    const adjusted = Math.round(ms / _globalSpeedFactor);
    return new Promise(r => setTimeout(r, Math.max(0, adjusted)));
}
