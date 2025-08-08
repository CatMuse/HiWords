/**
 * 已掌握分组管理器
 * 负责管理 Canvas 中的 Mastered 分组，包括创建、节点移动等操作
 */

import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode, HiWordsSettings } from '../utils';
import { CanvasParser } from './canvas-parser';
import { normalizeLayout, layoutGroupInner } from './layout';

export class MasteredGroupManager {
    private app: App;
    private canvasParser: CanvasParser;
    private settings: HiWordsSettings | undefined;
    private readonly MASTERED_GROUP_LABEL = 'Mastered';
    private readonly MASTERED_GROUP_COLOR = '4'; // 绿色

    constructor(app: App, settings?: HiWordsSettings) {
        this.app = app;
        this.canvasParser = new CanvasParser(app);
        this.settings = settings;
    }

    updateSettings(settings: HiWordsSettings) {
        this.settings = settings;
    }

    /**
     * 生成 16 位十六进制小写 ID（贴近标准 Canvas ID 风格）
     */
    private genHex16(): string {
        const bytes = new Uint8Array(8);
        (window.crypto || (window as any).msCrypto).getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * 确保 Canvas 中存在 Mastered 分组，如果不存在则创建
     * @param bookPath Canvas 文件路径
     * @returns Mastered 分组的 ID
     */
    async ensureMasteredGroup(bookPath: string): Promise<string | null> {
        try {
            const canvasData = await this.loadCanvas(bookPath);
            if (!canvasData) return null;

            // 查找现有的 Mastered 分组
            let masteredGroup = canvasData.nodes.find(
                node => node.type === 'group' && node.label === this.MASTERED_GROUP_LABEL
            );

            if (!masteredGroup) {
                // 创建新的 Mastered 分组
                masteredGroup = this.createMasteredGroup(canvasData);
                // 使用 append，保持节点顺序稳定
                canvasData.nodes.push(masteredGroup);
                await this.saveCanvas(bookPath, canvasData);
            }

            return masteredGroup.id;
        } catch (error) {
            return null;
        }
    }

    /**
     * 将单词节点移动到 Mastered 分组
     * @param bookPath Canvas 文件路径
     * @param nodeId 要移动的节点 ID
     * @returns 操作是否成功
     */
    async moveToMasteredGroup(bookPath: string, nodeId: string): Promise<boolean> {
        try {
            const masteredGroupId = await this.ensureMasteredGroup(bookPath);
            if (!masteredGroupId) return false;

            const canvasData = await this.loadCanvas(bookPath);
            if (!canvasData) return false;

            // 找到目标节点和分组
            const targetNode = canvasData.nodes.find(node => node.id === nodeId);
            const masteredGroup = canvasData.nodes.find(node => node.id === masteredGroupId);
            
            if (!targetNode) {
                return false;
            }
            if (!masteredGroup) {
                return false;
            }

            // 使用优化的两阶段定位方案
            const success = await this.moveNodeToGroupOptimized(targetNode, masteredGroup, canvasData);
            if (!success) {
                return false;
            }

            // 分组内布局与整体规范化
            try {
                if (this.settings) {
                    layoutGroupInner(canvasData, masteredGroup, this.settings, this.canvasParser);
                    normalizeLayout(canvasData, this.settings, this.canvasParser);
                }
            } catch {}

            await this.saveCanvas(bookPath, canvasData);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 从 Mastered 分组中移除单词节点
     * @param bookPath Canvas 文件路径
     * @param nodeId 要移除的节点 ID
     * @returns 操作是否成功
     */
    async removeFromMasteredGroup(bookPath: string, nodeId: string): Promise<boolean> {
        try {
            const canvasData = await this.loadCanvas(bookPath);
            if (!canvasData) return false;

            // 找到目标节点
            const targetNode = canvasData.nodes.find(node => node.id === nodeId);
            if (!targetNode) return false;

            // 找到 Mastered 分组
            const masteredGroup = canvasData.nodes.find(
                node => node.type === 'group' && node.label === this.MASTERED_GROUP_LABEL
            );
            if (!masteredGroup) return false;

            // 注意：不再修改节点的group属性，改为通过坐标位置来判断分组关系

            // 将节点移动到分组外的合适位置
            await this.moveNodeOutOfGroup(targetNode, canvasData);

            // 整体规范化（不移动分组内的节点）
            try {
                if (this.settings) {
                    normalizeLayout(canvasData, this.settings, this.canvasParser);
                }
            } catch {}

            await this.saveCanvas(bookPath, canvasData);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 检查节点是否在 Mastered 分组中
     * @param bookPath Canvas 文件路径
     * @param nodeId 节点 ID
     * @returns 是否在分组中
     */
    async isNodeInMasteredGroup(bookPath: string, nodeId: string): Promise<boolean> {
        try {
            const canvasData = await this.loadCanvas(bookPath);
            if (!canvasData) return false;

            // 找到目标节点
            const targetNode = canvasData.nodes.find(node => node.id === nodeId);
            if (!targetNode) return false;

            // 找到 Mastered 分组
            const masteredGroup = canvasData.nodes.find(
                node => node.type === 'group' && node.label === this.MASTERED_GROUP_LABEL
            );
            if (!masteredGroup) return false;

            // 使用坐标位置判断节点是否在分组内
            return this.canvasParser.isNodeInGroup(targetNode, masteredGroup);
        } catch (error) {
            return false;
        }
    }

    /**
     * 创建 Mastered 分组节点
     * @param canvasData Canvas 数据
     * @returns 新创建的分组节点
     */
    private createMasteredGroup(canvasData: CanvasData): CanvasNode {
        // 使用 16-hex 小写 ID，避免与生态不一致
        const groupId = this.genHex16();
        
        // 计算分组位置
        const { x, y } = this.calculateMasteredGroupPosition(canvasData);
        
        // 初始尺寸，后续会根据内容动态调整
        const initialWidth = 400;
        const initialHeight = 200;
        
        return {
            id: groupId,
            type: 'group',
            x: x,
            y: y,
            width: initialWidth,
            height: initialHeight,
            color: this.MASTERED_GROUP_COLOR,
            label: this.MASTERED_GROUP_LABEL
        };
    }

    /**
     * 计算 Mastered 分组的位置
     * @param canvasData Canvas 数据
     * @returns 分组位置坐标
     */
    private calculateMasteredGroupPosition(canvasData: CanvasData): { x: number, y: number } {
        // 找到所有节点（包括分组和文本节点）
        const allNodes = canvasData.nodes.filter(node => node.type === 'text' || node.type === 'group');
        
        if (allNodes.length === 0) {
            return { x: 50, y: 50 }; // 默认位置
        }

        // 计算现有内容的边界
        const minX = Math.min(...allNodes.map(node => node.x));
        const maxX = Math.max(...allNodes.map(node => node.x + (node.width || 200)));
        const minY = Math.min(...allNodes.map(node => node.y));
        const maxY = Math.max(...allNodes.map(node => node.y + (node.height || 100)));

        // 尝试在右侧放置分组，如果空间不够则放在下方
        const groupWidth = 800;
        const groupHeight = 600;
        const padding = 50;
        
        // 先尝试右侧放置
        let x = maxX + padding;
        let y = minY;
        
        // 如果右侧空间不够，则放在下方
        if (x + groupWidth > 3000) { // 假设画布最大宽度为3000
            x = minX;
            y = maxY + padding;
        }
        
        return { x, y };
    }

    /**
     * 优化的节点移动方案：两阶段定位 + 动态扩展
     * @param node 要移动的节点
     * @param group 目标分组
     * @param canvasData Canvas 数据
     * @returns 操作是否成功
     */
    private async moveNodeToGroupOptimized(
        node: CanvasNode, 
        group: CanvasNode, 
        canvasData: CanvasData
    ): Promise<boolean> {
        try {
            // 直接将节点粗放置到分组内部，最终布局交给 layoutGroupInner
            const padding = this.settings?.groupInnerPadding ?? 24;
            const cardW = this.settings?.cardWidth ?? 260;
            const cardH = this.settings?.cardHeight ?? 120;
            node.width = node.width || cardW;
            node.height = node.height || cardH;
            node.x = Math.max(group.x + padding, group.x);
            node.y = Math.max(group.y + padding, group.y);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 将节点移动到分组外的合适位置
     * @param node 要移动的节点
     * @param canvasData Canvas 数据
     */
    private async moveNodeOutOfGroup(node: CanvasNode, canvasData: CanvasData): Promise<void> {
        // 找到所有非分组节点（不在Mastered分组内的）
        const masteredGroup = canvasData.nodes.find(
            n => n.type === 'group' && n.label === this.MASTERED_GROUP_LABEL
        );
        
        const freeTextNodes = canvasData.nodes.filter(n => {
            if (n.type !== 'text' || n.id === node.id) return false;
            if (!masteredGroup) return true;
            return !this.canvasParser.isNodeInGroup(n, masteredGroup);
        });
        
        const paddingX = this.settings?.leftPadding ?? 24;
        const paddingY = this.settings?.verticalGap ?? 16;
        const nodeWidth = node.width || (this.settings?.cardWidth ?? 260);
        const nodeHeight = node.height || (this.settings?.cardHeight ?? 120);
        
        if (freeTextNodes.length === 0) {
            // 如果没有其他自由节点，放在默认位置
            node.x = paddingX;
            node.y = paddingY;
            return;
        }

        // 简化：放到当前自由节点的下方一行，由 normalizeLayout 统一整理
        const minX = Math.min(...freeTextNodes.map(n => n.x), paddingX);
        const maxY = Math.max(...freeTextNodes.map(n => n.y + (n.height || nodeHeight)), 0);
        node.x = minX;
        node.y = maxY + paddingY;
        
        // 确保不与分组重叠
        if (masteredGroup) {
            const groupBottom = masteredGroup.y + masteredGroup.height;
            if (node.y < groupBottom + paddingY) {
                node.y = groupBottom + paddingY;
            }
        }
        

    }

    

    /**
     * 获取分组内的成员节点
     */
    private getGroupMembers(group: CanvasNode, canvasData: CanvasData, excludeNodeId?: string): CanvasNode[] {
        return canvasData.nodes.filter(n => 
            n.id !== group.id && 
            n.id !== excludeNodeId &&
            n.type !== 'group' &&
            this.canvasParser.isNodeInGroup(n, group)
        );
    }

    

    

    

    

    

    

    /**
     * 加载 Canvas 文件数据
     * @param bookPath Canvas 文件路径
     * @returns Canvas 数据或 null
     */
    private async loadCanvas(bookPath: string): Promise<CanvasData | null> {
        try {
            const file = this.app.vault.getAbstractFileByPath(bookPath);
            if (!(file instanceof TFile)) {
                return null;
            }

            const content = await this.app.vault.read(file);
            return JSON.parse(content) as CanvasData;
        } catch (error) {
            return null;
        }
    }

    /**
     * 保存 Canvas 文件数据
     * @param bookPath Canvas 文件路径
     * @param canvasData Canvas 数据
     * @returns 操作是否成功
     */
    private async saveCanvas(bookPath: string, canvasData: CanvasData): Promise<boolean> {
        try {
            const file = this.app.vault.getAbstractFileByPath(bookPath);
            if (!(file instanceof TFile)) {
                return false;
            }

            // 使用原子更新，避免并发覆盖（此处以提供的数据为准进行写入）
            await this.app.vault.process(file, () => {
                return JSON.stringify(canvasData);
            });
            return true;
        } catch (error) {
            return false;
        }
    }


}
