// sdk/nodejs/src/config.ts
// 配置文件加载 — 自动查找 .flow.json5 / .flow.json，不存在时自动生成

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DEFAULTS } from './types';

export interface FlowConfigFile {
    // 连接配置
    baseUrl?: string;
    timeout?: number;
    speedFactor?: number;
    // 操作配置（所有 DEFAULTS 键）
    move?: { humanize?: boolean; trajectory?: string; duration?: number; waitBefore?: number; waitAfter?: number };
    click?: { humanize?: boolean; randomRange?: number; waitBefore?: number; waitAfter?: number };
    idleMotion?: Record<string, any>;
    type?: { charDelay?: { min?: number; max?: number }; waitBefore?: number; waitAfter?: number };
    autoWait?: { enabled?: boolean; delays?: Record<string, number> };
    logging?: { enabled?: boolean; level?: string; showElementInfo?: boolean; showCoordinates?: boolean };
    scroll?: { delta?: number; times?: number; timeout?: number; useIdle?: boolean; autoDelta?: boolean; deltaFactor?: number };
    scrollToVisible?: { timeout?: number; scrollDelta?: number; scrollTimes?: number; checkInterval?: number; autoDelta?: boolean; deltaFactor?: number };
}

/**
 * 加载配置文件
 * 搜索顺序：当前工作目录 → 用户主目录
 * 如果都不存在，自动在当前工作目录生成 .flow.json5 模板
 */
export function loadConfig(): FlowConfigFile {
    const candidates = [
        path.join(process.cwd(), '.flow.json5'),
        path.join(process.cwd(), '.flow.json'),
        path.join(os.homedir(), '.flow.json5'),
        path.join(os.homedir(), '.flow.json'),
    ];

    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const config = parseConfig(content);
                return config;
            } catch {
                // 文件解析失败，继续尝试下一个
            }
        }
    }

    // 都不存在，自动生成模板
    const defaultPath = path.join(process.cwd(), '.flow.json5');
    try {
        const template = generateDefaultTemplate();
        fs.writeFileSync(defaultPath, template, 'utf-8');
        console.log(`[FlowConfig] 已自动生成配置文件: ${defaultPath}`);
        return parseConfig(template);
    } catch (e) {
        console.warn(`[FlowConfig] 无法生成配置文件: ${(e as Error).message}`);
    }

    // 返回空配置（SDK 会使用 DEFAULTS 兜底）
    return {};
}

/**
 * 生成默认的 .flow.json5 模板（带注释）
 * 从 DEFAULTS 动态生成，确保与代码默认值完全一致
 */
function generateDefaultTemplate(): string {
    // 构建配置对象，从 DEFAULTS 读取所有值
    const config = {
        // ── 连接配置 ──
        baseUrl: DEFAULTS.baseUrl,
        timeout: DEFAULTS.timeout,

        // ── 全局变速 (1=正常, 2=2倍速, 0.5=半速) ──
        speedFactor: DEFAULTS.speedFactor,

        // ── 鼠标点击 ──
        click: DEFAULTS.click,

        // ── 鼠标移动 ──
        move: DEFAULTS.move,

        // ── 键盘输入 ──
        type: DEFAULTS.type,

        // ── 空闲移动 ──
        idleMotion: DEFAULTS.idleMotion,

        // ── 滚动 ──
        scroll: DEFAULTS.scroll,

        // ── 滚动到可见 ──
        scrollToVisible: DEFAULTS.scrollToVisible,

        // ── 自动等待 ──
        autoWait: DEFAULTS.autoWait,

        // ── 日志 ──
        logging: DEFAULTS.logging,
    };

    // 格式化为美观的 JSON（4空格缩进）
    const jsonContent = JSON.stringify(config, null, 4);

    // 添加注释头
    return `// Flow 配置文件 — 按项目/计算机自定义默认值
// 修改后重启生效，所有字段可选，未设置时使用内置默认值

${jsonContent}
`;
}

function parseConfig(content: string): FlowConfigFile {
    // 尝试 json5 解析（支持注释和尾随逗号）
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const json5 = require('json5');
        return json5.parse(content) as FlowConfigFile;
    } catch {
        // json5 不可用，回退到标准 JSON
    }

    // 对于 .flow.json5，手动去除注释后再 JSON.parse
    const cleaned = content
        .split('\n')
        .filter(line => {
            const trimmed = line.trim();
            // 跳过纯注释行
            if (trimmed.startsWith('//')) return false;
            return true;
        })
        .map(line => {
            // 移除行尾注释（不在字符串内的 //）
            let inString = false;
            let escape = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (escape) { escape = false; continue; }
                if (ch === '\\') { escape = true; continue; }
                if (ch === '"') { inString = !inString; continue; }
                if (!inString && ch === '/' && line[i + 1] === '/') {
                    return line.substring(0, i);
                }
            }
            return line;
        })
        .join('\n');

    return JSON.parse(cleaned) as FlowConfigFile;
}

/**
 * 深合并多个对象（从左到右，后面的覆盖前面的）
 */
export function deepMerge<T = Record<string, any>>(...sources: (T | undefined | null)[]): T {
    const result: Record<string, any> = {};

    for (const source of sources) {
        if (!source) continue;
        for (const key of Object.keys(source)) {
            const value = (source as Record<string, any>)[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = deepMerge(result[key] || {}, value);
            } else if (value !== undefined) {
                result[key] = value;
            }
        }
    }

    return result as T;
}
