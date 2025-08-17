import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode, WordDefinition, HiWordsSettings } from '../utils';

export class CanvasParser {
    private app: App;
    private settings?: HiWordsSettings;

    constructor(app: App, settings?: HiWordsSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: HiWordsSettings) {
        this.settings = settings;
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
     * 去除 Markdown 文本开头的 Frontmatter（YAML）
     * 仅在文本以 --- 开头时尝试移除首个 frontmatter 块
     */
    private removeFrontmatter(text: string): string {
        if (!text) return text;
        // 去除 BOM
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        // 仅当以 --- 开头时尝试剥离到下一处 --- 为止
        if (text.startsWith('---')) {
            const fmEnd = text.indexOf('\n---');
            if (fmEnd !== -1) {
                const after = text.slice(fmEnd + 4); // 跳过 "\n---"
                // 去掉可能紧随其后的一个换行
                return after.replace(/^\r?\n/, '');
            }
        }
        return text;
    }

    /**
     * 解析 Canvas 文件，提取词汇定义
     */
    async parseCanvasFile(file: TFile): Promise<WordDefinition[]> {
        try {
            const content = await this.app.vault.read(file);
            const canvasData: CanvasData = JSON.parse(content);
            
            const detectionMode = this.settings?.masteredDetection ?? 'group';
            // 查找 "Mastered" 分组（当使用分组模式时）
            const masteredGroup = detectionMode === 'group'
                ? canvasData.nodes.find(node => 
                    node.type === 'group' && 
                    (node.label === 'Mastered' || node.label === '已掌握')
                )
                : undefined;
            
            const definitions: WordDefinition[] = [];
            
            for (const node of canvasData.nodes) {
                // 文本节点
                if (node.type === 'text' && node.text) {
                    const wordDef = this.parseTextNode(node, file.path);
                    if (wordDef) {
                        if (detectionMode === 'group') {
                            if (masteredGroup && this.isNodeInGroup(node, masteredGroup)) {
                                wordDef.mastered = true;
                            }
                        } else if (detectionMode === 'color') {
                            if (node.color === '4') {
                                wordDef.mastered = true;
                            }
                        }
                        definitions.push(wordDef);
                    }
                }
                // 文件节点（Markdown）
                else if (node.type === 'file' && (node as any).file) {
                    const wordDef = await this.parseFileNode(node, file.path);
                    if (wordDef) {
                        if (detectionMode === 'group') {
                            if (masteredGroup && this.isNodeInGroup(node, masteredGroup)) {
                                wordDef.mastered = true;
                            }
                        } else if (detectionMode === 'color') {
                            if (node.color === '4') {
                                wordDef.mastered = true;
                            }
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
     * 从任意文本内容解析单词、别名和定义
     */
    private parseFromText(text: string, node: CanvasNode, sourcePath: string): WordDefinition | null {
        if (!text) return null;

        // 先移除 Frontmatter，再整体修剪
        text = this.removeFrontmatter(text).trim();
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
     * 解析文本节点，提取单词、别名和定义（包装通用文本解析）
     * 优化版本：支持主名字换行后的斜体格式作为别名格式
     */
    private parseTextNode(node: CanvasNode, sourcePath: string): WordDefinition | null {
        if (!node.text) return null;
        return this.parseFromText(node.text, node, sourcePath);
    }

    /**
     * 解析文件节点（Markdown），通过路径读取文件并复用文本解析规则
     */
    private async parseFileNode(node: CanvasNode, sourcePath: string): Promise<WordDefinition | null> {
        try {
            const filePath = (node as any).file as string | undefined;
            if (!filePath) return null;

            const abs = this.app.vault.getAbstractFileByPath(filePath);
            if (!(abs instanceof TFile)) return null;
            if (abs.extension !== 'md') return null;

            const md = await this.app.vault.read(abs);
            // 对于文件节点，source 统一记录为 Canvas 文件路径（生词本路径）
            return this.parseFromText(md, node, sourcePath);
        } catch (error) {
            console.error('解析文件节点失败:', error);
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
            const trimmed = content?.trim() ?? '';
            // 新建但尚未写入内容的空 Canvas 也视为有效
            if (trimmed === '') return true;

            const data = JSON.parse(trimmed);
            // 若字段缺失，视为默认空数组也有效
            const nodesOk = !('nodes' in data) || Array.isArray(data.nodes);
            const edgesOk = !('edges' in data) || Array.isArray(data.edges);
            return nodesOk && edgesOk;
        } catch {
            // 解析失败，但既然是 .canvas 文件，允许添加，后续解析将返回空结果
            return true;
        }
    }

    /**
     * 检查节点是否在指定分组内
     * @param node 要检查的节点
     * @param group 分组节点
     * @returns 是否在分组内
     */
    public isNodeInGroup(node: CanvasNode, group: CanvasNode): boolean {
        // 仅使用几何判定，避免与 node.group 字段产生二义性
        const nodeX = typeof node.x === 'number' ? node.x : 0;
        const nodeY = typeof node.y === 'number' ? node.y : 0;
        const nodeW = typeof node.width === 'number' ? node.width : 200; // 文本默认宽
        const nodeH = typeof node.height === 'number' ? node.height : 60; // 文本默认高

        const groupX = typeof group.x === 'number' ? group.x : 0;
        const groupY = typeof group.y === 'number' ? group.y : 0;
        const groupW = typeof group.width === 'number' ? group.width : 300; // 分组默认宽
        const groupH = typeof group.height === 'number' ? group.height : 150; // 分组默认高

        const nodeLeft = nodeX;
        const nodeRight = nodeX + nodeW;
        const nodeTop = nodeY;
        const nodeBottom = nodeY + nodeH;

        const groupLeft = groupX;
        const groupRight = groupX + groupW;
        const groupTop = groupY;
        const groupBottom = groupY + groupH;

        const isInside =
            nodeLeft >= groupLeft &&
            nodeRight <= groupRight &&
            nodeTop >= groupTop &&
            nodeBottom <= groupBottom;

        if (!isInside) {
            const hasOverlap =
                nodeLeft < groupRight &&
                nodeRight > groupLeft &&
                nodeTop < groupBottom &&
                nodeBottom > groupTop;

            if (hasOverlap) {
                const overlapLeft = Math.max(nodeLeft, groupLeft);
                const overlapRight = Math.min(nodeRight, groupRight);
                const overlapTop = Math.max(nodeTop, groupTop);
                const overlapBottom = Math.min(nodeBottom, groupBottom);
                const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
                const nodeArea = nodeW * nodeH;
                return overlapArea >= nodeArea * 0.5;
            }
            return false;
        }

        return true;
    }
}
