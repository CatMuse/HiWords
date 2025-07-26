import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode, WordDefinition } from './types';

export class CanvasParser {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 解析 Canvas 文件，提取词汇定义
     */
    async parseCanvasFile(file: TFile): Promise<WordDefinition[]> {
        try {
            const content = await this.app.vault.read(file);
            const canvasData: CanvasData = JSON.parse(content);
            
            const definitions: WordDefinition[] = [];
            
            for (const node of canvasData.nodes) {
                if (node.type === 'text' && node.text) {
                    const wordDef = this.parseTextNode(node, file.path);
                    if (wordDef) {
                        definitions.push(wordDef);
                    }
                }
            }
            
            return definitions;
        } catch (error) {
            console.error(`Failed to parse canvas file ${file.path}:`, error);
            return [];
        }
    }

    /**
     * 解析文本节点，提取词汇和定义
     * 支持多种格式：
     * 1. "word: definition"
     * 2. "word\ndefinition"
     * 3. "# word\ndefinition"
     */
    private parseTextNode(node: CanvasNode, sourcePath: string): WordDefinition | null {
        if (!node.text) return null;

        const text = node.text.trim();
        let word = '';
        let definition = '';

        // 格式1: "word: definition"
        if (text.includes(':')) {
            const parts = text.split(':', 2);
            word = parts[0].trim();
            definition = parts[1].trim();
        }
        // 格式2: "# word\ndefinition" 或 "word\ndefinition"
        else if (text.includes('\n')) {
            const lines = text.split('\n');
            word = lines[0].replace(/^#+\s*/, '').trim(); // 移除 markdown 标题符号
            definition = lines.slice(1).join('\n').trim();
        }
        // 格式3: 单行文本，假设是词汇（无定义）
        else {
            word = text.replace(/^#+\s*/, '').trim();
            definition = ''; // 无定义
        }

        if (!word) return null;

        return {
            word: word.toLowerCase(), // 统一转为小写进行匹配
            definition,
            source: sourcePath,
            nodeId: node.id,
            color: node.color
        };
    }

    /**
     * 检查文件是否为 Canvas 文件
     */
    static isCanvasFile(file: TFile): boolean {
        return file.extension === 'canvas';
    }

    /**
     * 验证 Canvas 文件格式
     */
    async validateCanvasFile(file: TFile): Promise<boolean> {
        try {
            const content = await this.app.vault.read(file);
            const data = JSON.parse(content);
            return Array.isArray(data.nodes) && Array.isArray(data.edges);
        } catch {
            return false;
        }
    }
}
