/**
 * 已掌握分组管理器
 * 负责管理 Canvas 中的 Mastered 分组，包括创建、节点移动等操作
 */

import { App, TFile } from 'obsidian';
import { CanvasData, CanvasNode } from '../utils';
import { CanvasParser } from './canvas-parser';

export class MasteredGroupManager {
    private app: App;
    private canvasParser: CanvasParser;
    private readonly MASTERED_GROUP_LABEL = 'Mastered';
    private readonly MASTERED_GROUP_COLOR = '4'; // 绿色

    constructor(app: App) {
        this.app = app;
        this.canvasParser = new CanvasParser(app);
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
                canvasData.nodes.unshift(masteredGroup); // 添加到数组开头
                await this.saveCanvas(bookPath, canvasData);
            }

            return masteredGroup.id;
        } catch (error) {
            console.error('确保 Mastered 分组失败:', error);
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

            // 找到目标节点
            const targetNode = canvasData.nodes.find(node => node.id === nodeId);
            if (!targetNode) {
                console.error(`未找到节点: ${nodeId}`);
                return false;
            }

            // 注意：不再修改节点的group属性，改为通过坐标位置来判断分组关系
            // 调整节点位置到分组内部
            await this.adjustNodePositionInGroup(targetNode, masteredGroupId, canvasData);

            await this.saveCanvas(bookPath, canvasData);
            return true;
        } catch (error) {
            console.error('移动到 Mastered 分组失败:', error);
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

            await this.saveCanvas(bookPath, canvasData);
            return true;
        } catch (error) {
            console.error('从 Mastered 分组移除失败:', error);
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
            console.error('检查节点分组失败:', error);
            return false;
        }
    }

    /**
     * 创建 Mastered 分组节点
     * @param canvasData Canvas 数据
     * @returns 新创建的分组节点
     */
    private createMasteredGroup(canvasData: CanvasData): CanvasNode {
        const groupId = `group-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
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
     * 调整节点位置到分组内部
     * @param node 要调整的节点
     * @param groupId 分组 ID
     * @param canvasData Canvas 数据
     */
    private async adjustNodePositionInGroup(
        node: CanvasNode, 
        groupId: string, 
        canvasData: CanvasData
    ): Promise<void> {
        const group = canvasData.nodes.find(n => n.id === groupId);
        if (!group) {
            console.error(`找不到分组: ${groupId}`);
            return;
        }

        // 计算分组内的现有成员
        const groupMembers = canvasData.nodes.filter(
            n => n.type === 'text' && n.id !== node.id && this.canvasParser.isNodeInGroup(n, group)
        );

        const padding = 30;
        const nodeWidth = node.width || 200;
        const nodeHeight = node.height || 60;
        
        // 确保节点尺寸合理
        if (!node.width) node.width = 200;
        if (!node.height) node.height = 60;
        
        if (groupMembers.length === 0) {
            // 第一个成员，放在分组内部的合适位置
            node.x = group.x + padding;
            node.y = group.y + padding;
        } else {
            // 找到一个不重叠的位置
            const position = this.findNonOverlappingPosition(node, group, groupMembers, padding);
            node.x = position.x;
            node.y = position.y;
        }
        
        // 调整分组尺寸以适应所有内容
        this.adjustGroupSizeToFitContent(group, canvasData);
        

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
        
        const padding = 50;
        const nodeWidth = node.width || 200;
        const nodeHeight = node.height || 60;
        
        if (freeTextNodes.length === 0) {
            // 如果没有其他自由节点，放在默认位置
            node.x = padding;
            node.y = padding;
            return;
        }

        // 计算自由区域的边界
        const minX = Math.min(...freeTextNodes.map(n => n.x));
        const maxX = Math.max(...freeTextNodes.map(n => n.x + (n.width || 200)));
        const minY = Math.min(...freeTextNodes.map(n => n.y));
        const maxY = Math.max(...freeTextNodes.map(n => n.y + (n.height || 60)));
        
        // 尝试在自由区域的下方放置
        node.x = minX;
        node.y = maxY + padding;
        
        // 确保不与分组重叠
        if (masteredGroup) {
            const groupBottom = masteredGroup.y + masteredGroup.height;
            if (node.y < groupBottom + padding) {
                node.y = groupBottom + padding;
            }
        }
        

    }

    /**
     * 调整分组尺寸以适应所有内容
     * @param group 分组节点
     * @param canvasData Canvas数据
     */
    private adjustGroupSizeToFitContent(group: CanvasNode, canvasData: CanvasData): void {
        // 找到分组内的所有节点
        const groupMembers = canvasData.nodes.filter(
            n => n.type === 'text' && this.canvasParser.isNodeInGroup(n, group)
        );

        if (groupMembers.length === 0) {
            // 如果没有成员，保持最小尺寸
            group.width = Math.max(group.width, 300);
            group.height = Math.max(group.height, 150);
            return;
        }

        const padding = 30;
        
        // 计算所有成员的边界
        const memberBounds = groupMembers.map(member => ({
            left: member.x,
            right: member.x + (member.width || 200),
            top: member.y,
            bottom: member.y + (member.height || 60)
        }));

        const minX = Math.min(...memberBounds.map(b => b.left));
        const maxX = Math.max(...memberBounds.map(b => b.right));
        const minY = Math.min(...memberBounds.map(b => b.top));
        const maxY = Math.max(...memberBounds.map(b => b.bottom));

        // 计算需要的分组尺寸
        const requiredWidth = maxX - minX + 2 * padding;
        const requiredHeight = maxY - minY + 2 * padding;

        // 调整分组位置和尺寸
        const newGroupX = minX - padding;
        const newGroupY = minY - padding;
        
        // 更新分组尺寸和位置
        group.x = newGroupX;
        group.y = newGroupY;
        group.width = Math.max(requiredWidth, 300); // 最小宽度300
        group.height = Math.max(requiredHeight, 150); // 最小高度150
        

    }

    /**
     * 找到一个不重叠的位置放置节点
     * @param node 要放置的节点
     * @param group 分组节点
     * @param existingMembers 现有成员节点
     * @param padding 间距
     * @returns 位置坐标
     */
    private findNonOverlappingPosition(
        node: CanvasNode, 
        group: CanvasNode, 
        existingMembers: CanvasNode[], 
        padding: number
    ): { x: number, y: number } {
        const nodeWidth = node.width || 200;
        const nodeHeight = node.height || 60;
        
        // 尝试网格布局
        const gridSpacing = 20;
        const startX = group.x + padding;
        const startY = group.y + padding;
        
        // 计算网格大小
        const maxCols = Math.floor((group.width - 2 * padding) / (nodeWidth + gridSpacing));
        
        for (let row = 0; row < 10; row++) { // 最多尝试10行
            for (let col = 0; col < Math.max(1, maxCols); col++) {
                const x = startX + col * (nodeWidth + gridSpacing);
                const y = startY + row * (nodeHeight + gridSpacing);
                
                // 检查是否与现有节点重叠
                const overlaps = existingMembers.some(member => {
                    const memberRight = member.x + (member.width || 200);
                    const memberBottom = member.y + (member.height || 60);
                    const nodeRight = x + nodeWidth;
                    const nodeBottom = y + nodeHeight;
                    
                    return !(x >= memberRight || nodeRight <= member.x || 
                            y >= memberBottom || nodeBottom <= member.y);
                });
                
                if (!overlaps) {
                    return { x, y };
                }
            }
        }
        
        // 如果找不到不重叠的位置，放在最下方
        const maxY = Math.max(...existingMembers.map(m => m.y + (m.height || 60)));
        return {
            x: startX,
            y: maxY + gridSpacing
        };
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
                console.error(`Canvas 文件不存在: ${bookPath}`);
                return null;
            }

            const content = await this.app.vault.read(file);
            return JSON.parse(content) as CanvasData;
        } catch (error) {
            console.error(`加载 Canvas 文件失败: ${bookPath}`, error);
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
                console.error(`Canvas 文件不存在: ${bookPath}`);
                return false;
            }

            await this.app.vault.modify(file, JSON.stringify(canvasData));
            return true;
        } catch (error) {
            console.error(`保存 Canvas 文件失败: ${bookPath}`, error);
            return false;
        }
    }


}
