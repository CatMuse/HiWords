import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode, HiWordsSettings } from '../utils';
import { CanvasParser } from './canvas-parser';
import { normalizeLayout } from './layout';

/**
 * Canvas 文件编辑器
 * 用于处理 Canvas 文件的修改操作
 */
export class CanvasEditor {
    private app: App;
    private settings: HiWordsSettings;

    constructor(app: App, settings: HiWordsSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: HiWordsSettings) {
        this.settings = settings;
    }

    /**
     * 生成 16 位十六进制小写 ID（贴近标准 Canvas ID 风格）
     */
    private genHex16(): string {
        // 浏览器环境可用 crypto.getRandomValues
        const bytes = new Uint8Array(8);
        (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 添加词汇到 Canvas 文件
     * @param bookPath Canvas 文件路径
     * @param word 要添加的词汇
     * @param definition 词汇定义
     * @param color 可选的节点颜色
     * @param aliases 可选的词汇别名数组
     * @returns 操作是否成功
     */
    /**
     * 添加词汇到 Canvas 文件
     * 优化版本：限制别名数量，添加错误处理
     */
    async addWordToCanvas(bookPath: string, word: string, definition: string, color?: number, aliases?: string[]): Promise<boolean> {
        try {
            const file = this.app.vault.getAbstractFileByPath(bookPath);
            if (!file || !(file instanceof TFile) || !CanvasParser.isCanvasFile(file)) {
                console.error(`无效的 Canvas 文件: ${bookPath}`);
                return false;
            }

            // 过滤空别名
            if (aliases) {
                aliases = aliases.filter((alias) => alias && alias.trim().length > 0);
                if (aliases.length === 0) aliases = undefined;
            }

            // 使用原子更新，避免并发覆盖
            const parser = new CanvasParser(this.app);
            await this.app.vault.process(file, (current) => {
                const canvasData: CanvasData = JSON.parse(current || '{"nodes":[],"edges":[]}');
                if (!Array.isArray(canvasData.nodes)) canvasData.nodes = [];

                // 生成 16-hex ID
                const nodeId = this.genHex16();

                // 放置参数（与设置保持一致）
                const newW = this.settings.cardWidth ?? 260;
                const newH = this.settings.cardHeight ?? 120;
                const verticalGap = this.settings.verticalGap ?? 16;
                const groupPadding = this.settings.leftPadding ?? 24; // 与 Mastered 分组保持的水平间距

                // 简易几何工具（带兜底）
                const num = (v: any, def: number) => (typeof v === 'number' ? v : def);
                const rectOf = (n: Partial<CanvasNode>) => ({
                    x: num(n.x, 0),
                    y: num(n.y, 0),
                    w: num(n.width, 200),
                    h: num(n.height, 60),
                });
                const overlaps = (ax: number, aw: number, bx: number, bw: number) => ax < bx + bw && ax + aw > bx;

                // 定位 Mastered 分组（如果存在）
                const masteredGroup = canvasData.nodes.find(
                    (n) => n.type === 'group' && (n as any).label && ((n as any).label === 'Mastered' || (n as any).label === '已掌握')
                ) as CanvasNode | undefined;
                const g = masteredGroup ? rectOf(masteredGroup as Partial<CanvasNode>) : undefined;

                // 计算位置：默认 (0,0)。优先选择“最后一个不在 Mastered 分组内的普通节点”作为参考
                let x = 0;
                let y = 0;
                if (canvasData.nodes.length > 0) {
                    let ref: Partial<CanvasNode> | undefined;
                    for (let i = canvasData.nodes.length - 1; i >= 0; i--) {
                        const n = canvasData.nodes[i] as Partial<CanvasNode>;
                        if (n.type === 'group') continue;
                        if (g) {
                            const r = rectOf(n);
                            const insideHoriz = overlaps(r.x, r.w, g.x, g.w);
                            const insideVert = overlaps(r.y, r.h, g.y, g.h);
                            if (insideHoriz && insideVert) continue; // 跳过位于 Mastered 分组内的参考节点
                        }
                        ref = n;
                        break;
                    }
                    if (ref) {
                        const r = rectOf(ref);
                        x = r.x;
                        y = r.y + r.h + verticalGap;
                    }
                }

                // 若新位置与 Mastered 分组水平范围相交，则将其放到分组右侧留白处
                if (g && overlaps(x, newW, g.x!, g.w!)) {
                    x = g.x! + g.w! + groupPadding;
                }

                // 构建文本
                let nodeText = word;
                if (aliases && aliases.length > 0) nodeText = `${word}\n*${aliases.join(', ')}*`;
                if (definition) nodeText = `${nodeText}\n\n${definition}`;

                const newNode: CanvasNode = {
                    id: nodeId,
                    type: 'text',
                    x,
                    y,
                    width: newW,
                    height: newH,
                    text: nodeText,
                    color: color !== undefined ? color.toString() : undefined,
                };

                canvasData.nodes.push(newNode);

                // 统一使用可配置的自动布局
                normalizeLayout(canvasData, this.settings, parser);
                return JSON.stringify(canvasData);
            });

            return true;
        } catch (error) {
            console.error(`添加词汇到 Canvas 失败: ${error}`);
            return false;
        }
    }

    /**
     * 更新 Canvas 文件中的词汇
     * @param bookPath Canvas 文件路径
     * @param nodeId 要更新的节点ID
     * @param word 词汇
     * @param definition 词汇定义
     * @param color 可选的节点颜色
     * @param aliases 可选的词汇别名数组
     * @returns 操作是否成功
     */
    async updateWordInCanvas(bookPath: string, nodeId: string, word: string, definition: string, color?: number, aliases?: string[]): Promise<boolean> {
        try {
            const file = this.app.vault.getAbstractFileByPath(bookPath);
            if (!file || !(file instanceof TFile) || !CanvasParser.isCanvasFile(file)) {
                console.error(`无效的 Canvas 文件: ${bookPath}`);
                return false;
            }

            // 过滤空别名
            if (aliases) {
                aliases = aliases.filter((alias) => alias && alias.trim().length > 0);
                if (aliases.length === 0) aliases = undefined;
            }

            let updated = false;
            const parser = new CanvasParser(this.app);
            await this.app.vault.process(file, (current) => {
                const canvasData: CanvasData = JSON.parse(current || '{"nodes":[],"edges":[]}');
                if (!Array.isArray(canvasData.nodes)) canvasData.nodes = [];

                const index = canvasData.nodes.findIndex((n) => n.id === nodeId);
                if (index === -1) {
                    console.error(`未找到节点: ${nodeId}`);
                    return JSON.stringify(canvasData);
                }

                let nodeText = word;
                if (aliases && aliases.length > 0) nodeText = `${word}\n*${aliases.join(', ')}*`;
                if (definition) nodeText = `${nodeText}\n\n${definition}`;

                canvasData.nodes[index].text = nodeText;
                if (color !== undefined) canvasData.nodes[index].color = color.toString();

                // 自动布局
                normalizeLayout(canvasData, this.settings, parser);

                updated = true;
                return JSON.stringify(canvasData);
            });

            return updated;
        } catch (error) {
            console.error(`更新 Canvas 中的词汇失败: ${error}`);
            return false;
        }
    }

    /**
     * 从 Canvas 文件中删除词汇
     * @param bookPath Canvas 文件路径
     * @param nodeId 要删除的节点ID
     * @returns 操作是否成功
     */
    async deleteWordFromCanvas(bookPath: string, nodeId: string): Promise<boolean> {
        try {
            const file = this.app.vault.getAbstractFileByPath(bookPath);
            if (!file || !(file instanceof TFile) || !CanvasParser.isCanvasFile(file)) {
                console.error(`无效的 Canvas 文件: ${bookPath}`);
                return false;
            }

            let removed = false;
            const parser = new CanvasParser(this.app);
            await this.app.vault.process(file, (current) => {
                const canvasData: CanvasData = JSON.parse(current || '{"nodes":[],"edges":[]}');
                if (!Array.isArray(canvasData.nodes)) canvasData.nodes = [];

                const index = canvasData.nodes.findIndex((n) => n.id === nodeId);
                if (index === -1) {
                    console.warn(`未找到要删除的节点: ${nodeId}`);
                    return JSON.stringify(canvasData);
                }

                canvasData.nodes.splice(index, 1);
                // 自动布局
                normalizeLayout(canvasData, this.settings, parser);

                removed = true;
                return JSON.stringify(canvasData);
            });

            return removed;
        } catch (error) {
            console.error(`从 Canvas 中删除词汇失败: ${error}`);
            return false;
        }
    }
}
