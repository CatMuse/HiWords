import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode } from './types';
import { CanvasParser } from './canvas-parser';

/**
 * Canvas 文件编辑器
 * 用于处理 Canvas 文件的修改操作
 */
export class CanvasEditor {
    private app: App;

    constructor(app: App) {
        this.app = app;
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
            
            // 限制别名数量
            const maxAliases = 10;
            if (aliases && aliases.length > maxAliases) {
                console.warn(`别名数量超过限制，将只使用前 ${maxAliases} 个别名`);
                aliases = aliases.slice(0, maxAliases);
            }
            
            // 过滤空别名
            if (aliases) {
                aliases = aliases.filter(alias => alias && alias.trim().length > 0);
                if (aliases.length === 0) {
                    aliases = undefined;
                }
            }
            
            // 读取 Canvas 文件内容
            const content = await this.app.vault.read(file);
            const canvasData: CanvasData = JSON.parse(content);
            
            if (!Array.isArray(canvasData.nodes)) {
                console.error(`无效的 Canvas 数据: ${bookPath}`);
                return false;
            }
            
            // 生成新节点 ID
            const nodeId = `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            
            // 计算新节点位置
            // 如果有其他节点，将新节点放在最后一个节点下方
            let x = 0;
            let y = 0;
            
            if (canvasData.nodes.length > 0) {
                const lastNode = canvasData.nodes[canvasData.nodes.length - 1];
                x = lastNode.x;
                y = lastNode.y + lastNode.height + 50; // 在最后一个节点下方 50 像素
            }
            
            // 创建新节点
            // 构建节点文本，如果有别名则添加别名
            let nodeText = word;
            if (aliases && aliases.length > 0) {
                nodeText = `${word} [${aliases.join(', ')}]`;
            }
            nodeText = `${nodeText}\n${definition}`;
            
            const newNode: CanvasNode = {
                id: nodeId,
                type: 'text',
                x: x,
                y: y,
                width: 250,
                height: 150,
                text: nodeText,
                color: color !== undefined ? color.toString() : undefined
            };
            
            // 添加新节点
            canvasData.nodes.push(newNode);
            
            // 保存更新后的 Canvas 文件
            await this.app.vault.modify(file, JSON.stringify(canvasData, null, 2));
            
            return true;
        } catch (error) {
            console.error(`添加词汇到 Canvas 失败: ${error}`);
            return false;
        }
    }
}
