export type FindElementMode = 'first' | 'all' | 'one';

/**
 * 解析 xpath 末尾的模式标记。
 *
 * - `//Button:all` → { xpath: '//Button', mode: 'all' }
 * - `//Button:onlyone` → { xpath: '//Button', mode: 'one' }
 * - `//Button` → { xpath: '//Button', mode: 'first' }
 *
 * 标记只在 xpath 最后一个 `]` 之后（或整个字符串末尾）识别，
 * 不影响 xpath 属性值中的冒号。
 */
export function parseXpathMarker(xpath: string): { xpath: string; mode: FindElementMode } {
    if (!xpath) return { xpath, mode: 'first' };

    // 标记在 xpath 末尾，但要跳过 ] 内的属性值
    // 策略：找最后一个 ] 之后的后缀；如果没有 ]，则看整个字符串末尾
    const lastBracket = xpath.lastIndexOf(']');
    let searchFrom: number;
    if (lastBracket >= 0) {
        searchFrom = lastBracket + 1;
    } else {
        // 无 ]，直接在末尾找标记
        const colonIdx = xpath.lastIndexOf(':');
        if (colonIdx >= 0) {
            const maybeMarker = xpath.slice(colonIdx);
            if (maybeMarker === ':all' || maybeMarker === ':onlyone') {
                return { xpath: xpath.slice(0, colonIdx), mode: maybeMarker === ':all' ? 'all' : 'one' };
            }
        }
        return { xpath, mode: 'first' };
    }

    const suffix = xpath.slice(searchFrom).trim();

    if (suffix === ':all') {
        return { xpath: xpath.slice(0, searchFrom), mode: 'all' };
    }
    if (suffix === ':onlyone') {
        return { xpath: xpath.slice(0, searchFrom), mode: 'one' };
    }
    return { xpath, mode: 'first' };
}
