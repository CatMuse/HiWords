import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode, WordDefinition } from '../utils';

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
            
            // 查找 "Mastered" 分组
            const masteredGroup = canvasData.nodes.find(node => 
                node.type === 'group' && 
                (node.label === 'Mastered' || node.label === '已掌握')
            );
            
            const definitions: WordDefinition[] = [];
            
            for (const node of canvasData.nodes) {
                if (node.type === 'text' && node.text) {
                    const wordDef = this.parseTextNode(node, file.path);
                    if (wordDef) {
                        // 检查节点是否在 "Mastered" 分组内
                        if (masteredGroup && this.isNodeInGroup(node, masteredGroup)) {
                            wordDef.mastered = true;
                            

                        }
                        
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
            
            // 获取第一行作为主词
            word = lines[0].replace(/^#+\s*/, '').trim();
            
            // 去除 Markdown 格式符号（加粗、斜体、代码块等）
            word = this.removeMarkdownFormatting(word);
            
            if (!word) return null;
            
            // 处理别名和定义
            if (lines.length > 1) {
                // 循环查找斜体别名行
                let aliasLineIndex = -1;
                let definitionStartIndex = -1;
                // 解析别名（第二行开始）
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    
                    // 检查斜体格式别名 *alias1, alias2, alias3*
                    if (line.startsWith('*') && line.endsWith('*') && line.length > 2) {
                        const aliasText = line.slice(1, -1); // 去掉首尾的 *
                        const aliasArray = aliasText.split(',').map(a => a.trim()).filter(a => a);
                        aliases.push(...aliasArray);
                        aliasLineIndex = i;
                    }
                    // 如果不是别名行且不是空行，则这是定义的开始
                    else if (line !== '') {
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

            const result = {
                word: word.toLowerCase(), // 统一转为小写进行匹配
                aliases: aliases.length > 0 ? aliases : undefined,
                definition,
                source: sourcePath,
                nodeId: node.id,
                color: node.color
            };
            

            
            return result;
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

    /**
     * 检查节点是否在指定分组内
     * @param node 要检查的节点
     * @param group 分组节点
     * @returns 是否在分组内
     */
    public isNodeInGroup(node: CanvasNode, group: CanvasNode): boolean {
        // 检查节点是否有必要的坐标信息
        if (typeof node.x !== 'number' || typeof node.y !== 'number' ||
            typeof node.width !== 'number' || typeof node.height !== 'number' ||
            typeof group.x !== 'number' || typeof group.y !== 'number' ||
            typeof group.width !== 'number' || typeof group.height !== 'number') {
            return false;
        }

        // 计算节点的边界
        const nodeLeft = node.x;
        const nodeRight = node.x + node.width;
        const nodeTop = node.y;
        const nodeBottom = node.y + node.height;

        // 计算分组的边界
        const groupLeft = group.x;
        const groupRight = group.x + group.width;
        const groupTop = group.y;
        const groupBottom = group.y + group.height;

        // 检查节点是否完全在分组内（或者至少有重叠）
        const isInside = nodeLeft >= groupLeft && 
                        nodeRight <= groupRight && 
                        nodeTop >= groupTop && 
                        nodeBottom <= groupBottom;

        // 如果不完全在内，检查是否有重叠（更宽松的判断）
        if (!isInside) {
            const hasOverlap = nodeLeft < groupRight && 
                              nodeRight > groupLeft && 
                              nodeTop < groupBottom && 
                              nodeBottom > groupTop;
            
            // 只有当重叠面积超过节点面积的 50% 时才认为在分组内
            if (hasOverlap) {
                const overlapLeft = Math.max(nodeLeft, groupLeft);
                const overlapRight = Math.min(nodeRight, groupRight);
                const overlapTop = Math.max(nodeTop, groupTop);
                const overlapBottom = Math.min(nodeBottom, groupBottom);
                
                const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
                const nodeArea = node.width * node.height;
                
                return overlapArea >= nodeArea * 0.5;
            }
            
            return false;
        }

        return true;
    }
}
