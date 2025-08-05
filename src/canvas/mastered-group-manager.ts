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
            // 第一阶段：计算和准备
            const preparation = this.prepareNodePlacement(node, group, canvasData);
            if (!preparation.success) {
                return false;
            }

            // 第二阶段：执行定位和验证
            return this.executeNodePlacement(node, group, canvasData, preparation);
        } catch (error) {
            return false;
        }
    }

    /**
     * 第一阶段：准备节点放置
     */
    private prepareNodePlacement(node: CanvasNode, group: CanvasNode, canvasData: CanvasData) {
        // 获取分组内现有节点
        const existingMembers = this.getGroupMembers(group, canvasData, node.id);
        
        // 计算节点的安全位置
        const safePosition = this.calculateSafePosition(node, group, existingMembers);
        
        // 预计算新的分组边界
        const newGroupBounds = this.calculateNewGroupBounds(group, existingMembers, {
            ...node,
            x: safePosition.x,
            y: safePosition.y
        });

        return {
            success: true,
            existingMembers,
            safePosition,
            newGroupBounds,
            error: null
        };
    }

    /**
     * 第二阶段：执行节点放置和验证
     */
    private executeNodePlacement(
        node: CanvasNode, 
        group: CanvasNode, 
        canvasData: CanvasData, 
        preparation: any
    ): boolean {
        try {
            // 1. 先调整分组尺寸
            this.updateGroupBounds(group, preparation.newGroupBounds);
            
            // 2. 放置节点到安全位置
            node.x = preparation.safePosition.x;
            node.y = preparation.safePosition.y;
            
            // 3. 验证节点是否正确在分组内
            const isInGroup = this.canvasParser.isNodeInGroup(node, group);
            if (!isInGroup) {
                // 尝试修正位置
                const correctedPosition = this.correctNodePosition(node, group);
                node.x = correctedPosition.x;
                node.y = correctedPosition.y;
                
                // 再次验证
                const isNodeInGroupAfterCorrection = this.canvasParser.isNodeInGroup(node, group);
                if (!isNodeInGroupAfterCorrection) {
                    return false;
                }
            }
            
            // 4. 最终调整分组尺寸确保包含所有节点
            this.adjustGroupSizeToFitContent(group, canvasData);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 调整节点位置到分组内部（保留原方法作为备用）
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
            return;
        }

        // 使用优化的方法
        await this.moveNodeToGroupOptimized(node, group, canvasData);
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
     * 计算节点的安全位置（确保在分组内部有足够边距）
     */
    private calculateSafePosition(
        node: CanvasNode, 
        group: CanvasNode, 
        existingMembers: CanvasNode[]
    ): { x: number, y: number } {
        const nodeWidth = node.width || 250;
        const nodeHeight = node.height || 150;
        const safePadding = 30; // 增加安全边距
        const gridSpacing = 20;
        
        // 计算分组内的安全区域
        const safeAreaX = group.x + safePadding;
        const safeAreaY = group.y + safePadding;
        const safeAreaWidth = group.width - 2 * safePadding;
        const safeAreaHeight = group.height - 2 * safePadding;
        
        // 如果安全区域太小，先扩大分组
        const minRequiredWidth = nodeWidth + 2 * safePadding;
        const minRequiredHeight = nodeHeight + 2 * safePadding;
        
        if (safeAreaWidth < nodeWidth || safeAreaHeight < nodeHeight) {
            return this.calculatePositionWithGroupExpansion(node, group, existingMembers);
        }
        
        // 在安全区域内寻找位置
        const maxCols = Math.floor(safeAreaWidth / (nodeWidth + gridSpacing));
        
        for (let row = 0; row < 20; row++) {
            for (let col = 0; col < Math.max(1, maxCols); col++) {
                const x = safeAreaX + col * (nodeWidth + gridSpacing);
                const y = safeAreaY + row * (nodeHeight + gridSpacing);
                
                // 确保节点完全在安全区域内
                if (x + nodeWidth > group.x + group.width - safePadding ||
                    y + nodeHeight > group.y + group.height - safePadding) {
                    continue;
                }
                
                // 检查是否与现有节点重叠
                const overlaps = existingMembers.some(member => this.nodesOverlap(
                    { x, y, width: nodeWidth, height: nodeHeight },
                    member
                ));
                
                if (!overlaps) {
                    return { x, y };
                }
            }
        }
        
        // 如果在当前分组尺寸内找不到位置，返回需要扩展的位置
        return this.calculatePositionWithGroupExpansion(node, group, existingMembers);
    }

    /**
     * 计算需要扩展分组的位置
     */
    private calculatePositionWithGroupExpansion(
        node: CanvasNode, 
        group: CanvasNode, 
        existingMembers: CanvasNode[]
    ): { x: number, y: number } {
        const nodeWidth = node.width || 250;
        const nodeHeight = node.height || 150;
        const safePadding = 30;
        const gridSpacing = 20;
        
        if (existingMembers.length === 0) {
            // 如果分组为空，放在左上角
            return {
                x: group.x + safePadding,
                y: group.y + safePadding
            };
        }
        
        // 找到现有节点的最大边界
        const maxX = Math.max(...existingMembers.map(m => m.x + (m.width || 250)));
        const maxY = Math.max(...existingMembers.map(m => m.y + (m.height || 150)));
        
        // 尝试在右侧放置
        const rightX = maxX + gridSpacing;
        if (rightX + nodeWidth <= group.x + group.width - safePadding) {
            const minY = Math.min(...existingMembers.map(m => m.y));
            return { x: rightX, y: minY };
        }
        
        // 尝试在下方放置
        return {
            x: group.x + safePadding,
            y: maxY + gridSpacing
        };
    }

    /**
     * 检查两个节点是否重叠
     */
    private nodesOverlap(node1: any, node2: CanvasNode): boolean {
        const node1Right = node1.x + node1.width;
        const node1Bottom = node1.y + node1.height;
        const node2Right = node2.x + (node2.width || 250);
        const node2Bottom = node2.y + (node2.height || 150);
        
        return !(node1.x >= node2Right || node1Right <= node2.x || 
                node1.y >= node2Bottom || node1Bottom <= node2.y);
    }

    /**
     * 计算包含新节点后的分组边界
     */
    private calculateNewGroupBounds(
        group: CanvasNode, 
        existingMembers: CanvasNode[], 
        newNode: CanvasNode
    ): { x: number, y: number, width: number, height: number } {
        const allNodes = [...existingMembers, newNode];
        const padding = 30;
        
        if (allNodes.length === 0) {
            return {
                x: group.x,
                y: group.y,
                width: Math.max(group.width, 300),
                height: Math.max(group.height, 200)
            };
        }
        
        const minX = Math.min(...allNodes.map(n => n.x));
        const minY = Math.min(...allNodes.map(n => n.y));
        const maxX = Math.max(...allNodes.map(n => n.x + (n.width || 250)));
        const maxY = Math.max(...allNodes.map(n => n.y + (n.height || 150)));
        
        return {
            x: minX - padding,
            y: minY - padding,
            width: maxX - minX + 2 * padding,
            height: maxY - minY + 2 * padding
        };
    }

    /**
     * 更新分组边界
     */
    private updateGroupBounds(
        group: CanvasNode, 
        bounds: { x: number, y: number, width: number, height: number }
    ): void {
        group.x = bounds.x;
        group.y = bounds.y;
        group.width = Math.max(bounds.width, 300); // 最小宽度
        group.height = Math.max(bounds.height, 200); // 最小高度
    }

    /**
     * 修正节点位置确保在分组内
     */
    private correctNodePosition(node: CanvasNode, group: CanvasNode): { x: number, y: number } {
        const nodeWidth = node.width || 250;
        const nodeHeight = node.height || 150;
        const padding = 30;
        
        // 确保节点在分组边界内
        const correctedX = Math.max(
            group.x + padding,
            Math.min(node.x, group.x + group.width - nodeWidth - padding)
        );
        
        const correctedY = Math.max(
            group.y + padding,
            Math.min(node.y, group.y + group.height - nodeHeight - padding)
        );
        
        return { x: correctedX, y: correctedY };
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

            await this.app.vault.modify(file, JSON.stringify(canvasData));
            return true;
        } catch (error) {
            return false;
        }
    }


}
