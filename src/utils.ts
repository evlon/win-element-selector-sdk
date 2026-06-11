import type { InspectResponse, InspectNodeInfo } from './types';

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/**
 * 将字符串转为 XPath 字符串字面量，正确处理引号转义。
 * - 无引号 → 'value'
 * - 含双引号 → 'value'
 * - 含单引号 → "value"
 * - 同时含单双引号 → concat('part1', "'", 'part2')
 */
export function xpathStr(s: string | null | undefined): string {
    if (s == null) return "''";
    if (!s.includes("'") && !s.includes('"')) {
        return `'${s}'`;
    }
    if (!s.includes('"')) {
        return `"${s}"`;
    }
    const parts = s.split("'").map(p => `'${p}'`);
    return `concat(${parts.join(", \"'\", ")})`;
}

export function buildWindowSelector(selector: {
    title?: string;
    className?: string;
    processName?: string;
    processId?: number;
}): string {
    const predicates: string[] = [];
    
    if (selector.title) {
        predicates.push(`@Name='${selector.title}'`);
    }
    if (selector.className) {
        predicates.push(`@ClassName='${selector.className}'`);
    }
    if (selector.processName) {
        predicates.push(`@ProcessName='${selector.processName}'`);
    }

    if(selector.processId){
        predicates.push(`@ProcessId='${selector.processId}'`);
    }
    
    if (predicates.length === 0) {
        return 'Window';
    }
    return `Window[${predicates.join(' and ')}]`;
}



/**
 * 为 inspect 结果的所有节点计算罗盘路径（compass 字段）。
 *
 * 根元素 compass 为 ""（自身），其子节点为 "c0"、"c1"，
 * 更深层为 "c1>0"、"c1>0>2" 等。
 */
export function assignCompassPaths(result: InspectResponse): void {
    const compassMap = new Map<string, string>();

    const traverse = (node: InspectNodeInfo, parentCompass: string): void => {
        const children = node.children ?? [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childCompass = parentCompass === ''
                ? `c${i}`
                : `${parentCompass}>${i}`;
            child.compass = childCompass;
            compassMap.set(child.xpath, childCompass);
            traverse(child, childCompass);
        }
    };

    if (result.nodes) {
        result.nodes.compass = '';
        compassMap.set(result.nodes.xpath, '');
        traverse(result.nodes, '');
    }

    if (result.flatNodes) {
        for (const node of result.flatNodes) {
            node.compass = compassMap.get(node.xpath) ?? '';
        }
    }
}