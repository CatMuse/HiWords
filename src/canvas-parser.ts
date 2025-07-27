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
     * 支持两种格式：
     * 1. 第一行为词汇，后面的行为定义
     * 2. 第一行为词汇 [别名1, 别名2, ...]，后面的行为定义
     */
    /**
     * 解析文本节点，提取单词、别名和定义
     * 优化版本：更健壮地处理别名解析，限制别名数量
     */
    private parseTextNode(node: CanvasNode, sourcePath: string): WordDefinition | null {
        if (!node.text) return null;

        const text = node.text.trim();
        let word = '';
        let aliases: string[] = [];
        let definition = '';

        try {
            // 分割文本行
            const lines = text.split('\n');
            
            // 解析第一行，提取单词和别名
            const firstLine = lines[0].replace(/^#+\s*/, '').trim();
            
            // 使用更健壮的正则表达式匹配格式：word [alias1, alias2, ...]
            const aliasMatch = firstLine.match(/^(.+?)\s*\[(.*?)\]$/);
            if (aliasMatch) {
                word = aliasMatch[1].trim();
                
                // 限制别名数量，防止过多别名导致性能问题
                const maxAliases = 10;
                aliases = aliasMatch[2].split(',')
                    .map(alias => alias.trim().toLowerCase())
                    .filter(alias => alias.length > 0) // 过滤空别名
                    .slice(0, maxAliases); // 限制别名数量
            } else {
                word = firstLine;
            }
            
            // 如果有多行，则后面的行作为定义
            if (lines.length > 1) {
                definition = lines.slice(1).join('\n').trim();
            } else {
                definition = ''; // 无定义
            }

            if (!word) return null;

            return {
                word: word.toLowerCase(), // 统一转为小写进行匹配
                aliases: aliases.length > 0 ? aliases : undefined,
                definition,
                source: sourcePath,
                nodeId: node.id,
                color: node.color
            };
        } catch (error) {
            console.error(`解析节点文本时出错: ${error}`);
            return null;
        }
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
