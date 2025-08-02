/**
 * 已掌握单词服务
 * 负责处理单词的已掌握状态管理，包括标记、取消标记、状态同步等
 */

import { Notice } from 'obsidian';
import { VocabularyManager } from './vocabulary-manager';
import { MasteredGroupManager } from './mastered-group-manager';
import HiWordsPlugin from '../main';

export class MasteredService {
    private plugin: HiWordsPlugin;
    private vocabularyManager: VocabularyManager;
    private masteredGroupManager: MasteredGroupManager;

    constructor(plugin: HiWordsPlugin, vocabularyManager: VocabularyManager) {
        this.plugin = plugin;
        this.vocabularyManager = vocabularyManager;
        this.masteredGroupManager = new MasteredGroupManager(plugin.app);
    }

    /**
     * 检查已掌握功能是否启用
     */
    get isEnabled(): boolean {
        return this.plugin.settings.enableMasteredFeature;
    }

    /**
     * 标记单词为已掌握
     * @param bookPath 生词本路径
     * @param nodeId 节点 ID
     * @param word 单词文本
     * @returns 操作是否成功
     */
    async markWordAsMastered(bookPath: string, nodeId: string, word: string): Promise<boolean> {
        if (!this.isEnabled) {
            new Notice('已掌握功能未启用');
            return false;
        }

        try {
            // 1. 更新内存缓存中的已掌握状态
            const success = await this.updateWordMasteredStatus(bookPath, nodeId, true);
            if (!success) {
                new Notice('更新单词状态失败');
                return false;
            }

            // 2. 移动到 Canvas 分组
            const moveSuccess = await this.masteredGroupManager.moveToMasteredGroup(bookPath, nodeId);
            if (!moveSuccess) {
                // 如果移动失败，回滚内存状态
                await this.updateWordMasteredStatus(bookPath, nodeId, false);
                new Notice('移动到已掌握分组失败');
                return false;
            }

            // 3. 刷新高亮显示（排除已掌握单词）
            this.plugin.refreshHighlighter();

            // 4. 触发侧边栏更新事件
            this.plugin.app.workspace.trigger('hi-words:mastered-changed');

            // 5. 显示成功提示
            new Notice(`"${word}" 已标记为已掌握`);

            return true;
        } catch (error) {
            console.error('标记已掌握失败:', error);
            new Notice('标记失败，请重试');
            return false;
        }
    }

    /**
     * 取消单词的已掌握标记
     * @param bookPath 生词本路径
     * @param nodeId 节点 ID
     * @param word 单词文本
     * @returns 操作是否成功
     */
    async unmarkWordAsMastered(bookPath: string, nodeId: string, word: string): Promise<boolean> {
        if (!this.isEnabled) {
            new Notice('已掌握功能未启用');
            return false;
        }

        try {
            // 1. 更新内存缓存中的已掌握状态
            const success = await this.updateWordMasteredStatus(bookPath, nodeId, false);
            if (!success) {
                new Notice('更新单词状态失败');
                return false;
            }

            // 2. 从 Canvas 分组中移除
            const removeSuccess = await this.masteredGroupManager.removeFromMasteredGroup(bookPath, nodeId);
            if (!removeSuccess) {
                // 如果移除失败，回滚内存状态
                await this.updateWordMasteredStatus(bookPath, nodeId, true);
                new Notice('从已掌握分组移除失败');
                return false;
            }

            // 3. 刷新高亮显示
            this.plugin.refreshHighlighter();

            // 4. 触发侧边栏更新事件
            this.plugin.app.workspace.trigger('hi-words:mastered-changed');

            // 5. 显示成功提示
            new Notice(`"${word}" 已取消已掌握标记`);

            return true;
        } catch (error) {
            console.error('取消已掌握标记失败:', error);
            new Notice('取消标记失败，请重试');
            return false;
        }
    }

    /**
     * 检查单词是否已掌握
     * @param bookPath 生词本路径
     * @param nodeId 节点 ID
     * @returns 是否已掌握
     */
    async isWordMastered(bookPath: string, nodeId: string): Promise<boolean> {
        if (!this.isEnabled) return false;

        try {
            const wordDef = await this.vocabularyManager.getWordDefinitionByNodeId(bookPath, nodeId);
            return wordDef?.mastered === true;
        } catch (error) {
            console.error('检查单词掌握状态失败:', error);
            return false;
        }
    }

    /**
     * 获取已掌握的单词列表
     * @param bookPath 生词本路径（可选，如果不提供则返回所有生词本的已掌握单词）
     * @returns 已掌握的单词定义数组
     */
    async getMasteredWords(bookPath?: string) {
        if (!this.isEnabled) return [];

        try {
            const allWords = await this.vocabularyManager.getAllWordDefinitions();
            
            return allWords.filter(wordDef => {
                // 过滤已掌握的单词
                if (!wordDef.mastered) return false;
                
                // 如果指定了生词本路径，只返回该生词本的单词
                if (bookPath && wordDef.source !== bookPath) return false;
                
                return true;
            });
        } catch (error) {
            console.error('获取已掌握单词列表失败:', error);
            return [];
        }
    }

    /**
     * 获取已掌握单词的统计信息
     * @returns 统计信息对象
     */
    async getMasteredStats() {
        if (!this.isEnabled) {
            return {
                totalMastered: 0,
                totalWords: 0,
                masteredPercentage: 0,
                byBook: {}
            };
        }

        try {
            const allWords = await this.vocabularyManager.getAllWordDefinitions();
            const masteredWords = allWords.filter(w => w.mastered);
            
            // 按生词本分组统计
            const byBook: { [bookPath: string]: { mastered: number, total: number } } = {};
            
            allWords.forEach(word => {
                if (!byBook[word.source]) {
                    byBook[word.source] = { mastered: 0, total: 0 };
                }
                byBook[word.source].total++;
                if (word.mastered) {
                    byBook[word.source].mastered++;
                }
            });

            return {
                totalMastered: masteredWords.length,
                totalWords: allWords.length,
                masteredPercentage: allWords.length > 0 ? (masteredWords.length / allWords.length) * 100 : 0,
                byBook
            };
        } catch (error) {
            console.error('获取已掌握统计信息失败:', error);
            return {
                totalMastered: 0,
                totalWords: 0,
                masteredPercentage: 0,
                byBook: {}
            };
        }
    }

    /**
     * 批量标记多个单词为已掌握
     * @param operations 操作数组，每个操作包含 bookPath, nodeId, word
     * @returns 成功操作的数量
     */
    async batchMarkAsMastered(operations: Array<{ bookPath: string, nodeId: string, word: string }>): Promise<number> {
        if (!this.isEnabled) return 0;

        let successCount = 0;
        
        for (const op of operations) {
            const success = await this.markWordAsMastered(op.bookPath, op.nodeId, op.word);
            if (success) successCount++;
        }

        if (successCount > 0) {
            new Notice(`成功标记 ${successCount} 个单词为已掌握`);
        }

        return successCount;
    }

    /**
     * 更新单词的已掌握状态（内存缓存）
     * @param bookPath 生词本路径
     * @param nodeId 节点 ID
     * @param mastered 是否已掌握
     * @returns 操作是否成功
     */
    private async updateWordMasteredStatus(bookPath: string, nodeId: string, mastered: boolean): Promise<boolean> {
        try {
            const wordDef = await this.vocabularyManager.getWordDefinitionByNodeId(bookPath, nodeId);
            if (!wordDef) {
                console.error(`未找到单词定义: ${nodeId}`);
                return false;
            }

            // 更新已掌握状态
            wordDef.mastered = mastered;

            // 通知词汇管理器更新缓存
            await this.vocabularyManager.updateWordDefinition(bookPath, nodeId, wordDef);

            return true;
        } catch (error) {
            console.error('更新单词掌握状态失败:', error);
            return false;
        }
    }

    /**
     * 同步 Canvas 分组状态与内存状态
     * 用于修复可能的不一致状态
     * @param bookPath 生词本路径
     */
    async syncMasteredStatus(bookPath: string): Promise<void> {
        if (!this.isEnabled) return;

        try {
            const allWords = await this.vocabularyManager.getWordDefinitionsByBook(bookPath);
            
            for (const wordDef of allWords) {
                const inMasteredGroup = await this.masteredGroupManager.isNodeInMasteredGroup(bookPath, wordDef.nodeId);
                
                // 如果状态不一致，以内存状态为准
                if (wordDef.mastered && !inMasteredGroup) {
                    // 内存中已掌握，但不在分组中 -> 移动到分组
                    await this.masteredGroupManager.moveToMasteredGroup(bookPath, wordDef.nodeId);
                } else if (!wordDef.mastered && inMasteredGroup) {
                    // 内存中未掌握，但在分组中 -> 从分组移除
                    await this.masteredGroupManager.removeFromMasteredGroup(bookPath, wordDef.nodeId);
                }
            }
        } catch (error) {
            console.error('同步已掌握状态失败:', error);
        }
    }
}
