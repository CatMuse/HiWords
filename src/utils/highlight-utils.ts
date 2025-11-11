import type { HiWordsSettings } from './index';
import { Trie } from './trie';
import type { VocabularyManager } from '../core';

// ==================== 文件高亮判断 ====================

/**
 * 检查文件是否应该被高亮
 * @param filePath 文件路径
 * @param settings 插件设置
 * @returns 是否应该高亮该文件
 */
export function shouldHighlightFile(filePath: string, settings: HiWordsSettings): boolean {
    const mode = settings.highlightMode || 'all';
    
    // 模式1：全部高亮
    if (mode === 'all') {
        return true;
    }
    
    // 解析路径列表（逗号分隔，去除空格）
    const pathsStr = settings.highlightPaths || '';
    const paths = pathsStr
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);
    
    // 如果路径列表为空
    if (paths.length === 0) {
        // 排除模式下空列表=全部高亮，包含模式下空列表=全不高亮
        return mode === 'exclude';
    }
    
    // 标准化当前文件路径
    const normalizedFile = filePath.replace(/^\/+|\/+$/g, '');
    
    // 检查文件路径是否匹配任何规则
    const isMatched = paths.some(path => {
        const normalizedPath = path.replace(/^\/+|\/+$/g, '');
        return normalizedFile === normalizedPath || 
               normalizedFile.startsWith(normalizedPath + '/');
    });
    
    // 模式2：排除模式 - 匹配到则不高亮
    if (mode === 'exclude') {
        return !isMatched;
    }
    
    // 模式3：仅指定路径 - 匹配到才高亮
    if (mode === 'include') {
        return isMatched;
    }
    
    return true;
}

// ==================== DOM 操作和视口检测 ====================

/**
 * 检查元素是否在视口中可见
 */
export function isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    
    // 元素至少有一部分在视口内
    return (
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < windowHeight &&
        rect.left < windowWidth
    );
}

/**
 * 检查容器是否在主编辑器中（排除侧边栏、弹出框等）
 */
export function isInMainEditor(element: HTMLElement): boolean {
    return !element.closest('.workspace-leaf-content[data-type="hover-editor"]') &&
           !element.closest('.workspace-leaf-content[data-type="file-explorer"]') &&
           !element.closest('.workspace-leaf-content[data-type="outline"]') &&
           !element.closest('.workspace-leaf-content[data-type="backlink"]') &&
           !element.closest('.workspace-leaf-content[data-type="tag"]') &&
           !element.closest('.workspace-leaf-content[data-type="search"]') &&
           !element.closest('.hover-popover') &&
           !element.closest('.popover') &&
           !element.closest('.suggestion-container') &&
           !element.closest('.modal') &&
           !element.closest('.workspace-split.mod-right-split') &&
           !element.closest('.workspace-split.mod-left-split');
}

/**
 * 清除元素中的所有高亮标记
 */
export function clearHighlights(element: HTMLElement): void {
    const highlights = element.querySelectorAll('.hi-words-highlight');
    highlights.forEach(highlight => {
        // 将高亮元素替换为纯文本
        const textNode = document.createTextNode(highlight.textContent || '');
        highlight.parentNode?.replaceChild(textNode, highlight);
    });
    
    // 合并相邻的文本节点
    element.normalize();
}

// ==================== Trie 构建 ====================

/**
 * 构建包含所有单词的 Trie 树
 */
export function buildTrieFromVocabulary(vocabularyManager: VocabularyManager): Trie {
    const trie = new Trie();
    const words = vocabularyManager.getAllWordsForHighlight();
    for (const w of words) {
        const def = vocabularyManager.getDefinition(w);
        if (def) trie.addWord(w, def);
    }
    return trie;
}
