import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode, WordDefinition } from './types';

export class CanvasParser {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * 去除文本中的 Markdown 格式符号
     * @param text 要处理的文本
     * @returns 处理后的文本
     */
    private removeMarkdownFormatting(text: string): string {
        if (!text) return text;
        
        // 去除加粗格式 **text** 或 __text__
        text = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/__(.*?)__/g, '$1');
        
        // 去除斜体格式 *text* 或 _text_
        text = text.replace(/\*(.*?)\*/g, '$1').replace(/_(.*?)_/g, '$1');
        
        // 去除行内代码格式 `text`
        text = text.replace(/`(.*?)`/g, '$1');
        
        // 去除删除线格式 ~~text~~
        text = text.replace(/~~(.*?)~~/g, '$1');
        
        // 去除高亮格式 ==text==
        text = text.replace(/==(.*?)==/g, '$1');
        
        // 去除链接格式 [text](url)
        text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
        
        return text.trim();
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
     * 优化版本：支持主名字换行后的斜体格式作为别名格式
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
            if (lines.length === 0) return null;
            
            // 第一行为主词，去除标题标记和其他 Markdown 格式符号
            word = lines[0].replace(/^#+\s*/, '').trim();
            
            // 去除 Markdown 格式符号（加粗、斜体、代码块等）
            word = this.removeMarkdownFormatting(word);
            
            if (!word) return null;
            
            // 处理别名和定义
            if (lines.length > 1) {
                // 循环查找斜体别名行
                let aliasLineIndex = -1;
                let definitionStartIndex = -1;
                
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    
                    // 跳过空行
                    if (line === '') continue;
                    
                    // 检查是否是斜体别名格式：*alias1, alias2, ...*
                    const aliasMatch = line.match(/^\*(.*?)\*$/);
                    if (aliasMatch) {
                        aliasLineIndex = i;
                        definitionStartIndex = i + 1;
                        
                        // 限制别名数量
                        const maxAliases = 10;
                        aliases = aliasMatch[1].split(',')
                            .map(alias => this.removeMarkdownFormatting(alias.trim()).toLowerCase())
                            .filter(alias => alias.length > 0) // 过滤空别名
                            .slice(0, maxAliases); // 限制别名数量
                        
                        // 找到别名行后跳出循环
                        break;
                    } else {
                        // 如果不是别名行，则这是定义的开始
                        definitionStartIndex = i;
                        break;
                    }
                }
                
                // 如果找到了定义的开始，则提取定义
                if (definitionStartIndex > 0 && definitionStartIndex < lines.length) {
                    // 跳过定义开始的空行
                    while (definitionStartIndex < lines.length && lines[definitionStartIndex].trim() === '') {
                        definitionStartIndex++;
                    }
                    
                    if (definitionStartIndex < lines.length) {
                        definition = lines.slice(definitionStartIndex).join('\n').trim();
                    }
                } else if (aliasLineIndex === -1) {
                    // 如果没有找到别名行，则所有后续行都是定义
                    definition = lines.slice(1).join('\n').trim();
                }
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
