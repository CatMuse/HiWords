import type { HiWordsSettings } from './index';

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
