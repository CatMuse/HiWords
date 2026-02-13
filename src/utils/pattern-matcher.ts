/**
 * 模式短语匹配工具
 * 支持使用 ... 占位符的跨单词短语匹配
 */

/**
 * 解析短语，检测是否包含占位符
 */
export function parsePhrase(phrase: string): {
    isPattern: boolean;
    parts: string[];
    original: string;
} {
    const trimmed = phrase.trim();
    
    if (trimmed.includes('...')) {
        // 拆分短语，过滤空字符串
        const parts = trimmed.split('...').map(p => p.trim()).filter(p => p.length > 0);
        return {
            isPattern: true,
            parts: parts,
            original: trimmed
        };
    }
    
    return {
        isPattern: false,
        parts: [trimmed],
        original: trimmed
    };
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构建模式短语的匹配正则表达式
 * @param parts 短语的各个固定部分
 * @returns 正则表达式
 */
export function buildPatternRegex(parts: string[]): RegExp {
    if (parts.length === 0) return /(?!)/; // 永远不匹配
    if (parts.length === 1) {
        // 单个部分，使用边界匹配
        const escaped = escapeRegExp(parts[0]);
        return new RegExp(`\\b${escaped}\\b`, 'gi');
    }
    
    // 多个部分，使用占位符连接
    // 句子边界：不包含 . , ! ? ; : \n 等标点符号
    const sentenceBoundary = '[^.,!?;:\\n]*?';
    const escapedParts = parts.map(p => escapeRegExp(p));
    
    // 构建模式：part1 [不跨句] part2 [不跨句] part3 ...
    const pattern = escapedParts.join(sentenceBoundary);
    
    return new RegExp(pattern, 'gi');
}

/**
 * 在文本中查找模式短语的所有匹配
 * @param text 要搜索的文本
 * @param parts 短语的各个固定部分
 * @param offset 文本在文档中的偏移量
 * @returns 匹配结果数组，包含匹配位置和各段位置
 */
export function findPatternMatches(
    text: string,
    parts: string[],
    offset: number = 0
): Array<{
    from: number;
    to: number;
    matchedText: string;
    segments: Array<{from: number, to: number}>;
}> {
    const matches: Array<{
        from: number;
        to: number;
        matchedText: string;
        segments: Array<{from: number, to: number}>;
    }> = [];
    
    if (parts.length === 0) return matches;
    
    // 如果只有一个部分，直接匹配
    if (parts.length === 1) {
        const regex = new RegExp(`\\b${escapeRegExp(parts[0])}\\b`, 'gi');
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                from: offset + match.index,
                to: offset + match.index + match[0].length,
                matchedText: match[0],
                segments: [{
                    from: offset + match.index,
                    to: offset + match.index + match[0].length
                }]
            });
        }
        return matches;
    }
    
    // 多部分匹配：手动查找各部分
    const lowerText = text.toLowerCase();
    const lowerParts = parts.map(p => p.toLowerCase());
    
    // 从文本开始位置查找第一部分
    let searchStart = 0;
    while (searchStart < text.length) {
        const firstPartIndex = lowerText.indexOf(lowerParts[0], searchStart);
        if (firstPartIndex === -1) break;
        
        // 检查第一部分的单词边界
        if (!isWordBoundary(text, firstPartIndex, firstPartIndex + parts[0].length)) {
            searchStart = firstPartIndex + 1;
            continue;
        }
        
        // 尝试匹配后续部分
        const segments: Array<{from: number, to: number}> = [];
        segments.push({
            from: offset + firstPartIndex,
            to: offset + firstPartIndex + parts[0].length
        });
        
        let currentPos = firstPartIndex + parts[0].length;
        let allPartsMatched = true;
        
        for (let i = 1; i < parts.length; i++) {
            // 在当前位置到下一个句子边界之间查找下一部分
            const nextBoundary = findNextSentenceBoundary(text, currentPos);
            const searchText = text.substring(currentPos, nextBoundary);
            const lowerSearchText = searchText.toLowerCase();
            
            const partIndex = lowerSearchText.indexOf(lowerParts[i]);
            if (partIndex === -1) {
                allPartsMatched = false;
                break;
            }
            
            const absolutePartIndex = currentPos + partIndex;
            
            // 检查单词边界
            if (!isWordBoundary(text, absolutePartIndex, absolutePartIndex + parts[i].length)) {
                allPartsMatched = false;
                break;
            }
            
            segments.push({
                from: offset + absolutePartIndex,
                to: offset + absolutePartIndex + parts[i].length
            });
            
            currentPos = absolutePartIndex + parts[i].length;
        }
        
        if (allPartsMatched) {
            const matchStart = firstPartIndex;
            const matchEnd = currentPos;
            matches.push({
                from: offset + matchStart,
                to: offset + matchEnd,
                matchedText: text.substring(matchStart, matchEnd),
                segments: segments
            });
        }
        
        searchStart = firstPartIndex + 1;
    }
    
    return matches;
}

/**
 * 查找下一个句子边界的位置
 */
function findNextSentenceBoundary(text: string, startPos: number): number {
    const boundaries = ['.', ',', '!', '?', ';', ':', '\n'];
    let minPos = text.length;
    
    for (const boundary of boundaries) {
        const pos = text.indexOf(boundary, startPos);
        if (pos !== -1 && pos < minPos) {
            minPos = pos;
        }
    }
    
    return minPos;
}

/**
 * 检查单词边界
 * 支持英文、中文、日语、韩语等字符
 */
function isWordBoundary(text: string, start: number, end: number): boolean {
    const before = start > 0 ? text[start - 1] : ' ';
    const after = end < text.length ? text[end] : ' ';
    
    // 检查前后字符是否为单词字符
    const isWordChar = (char: string) => {
        return /[a-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/iu.test(char);
    };
    
    // CJK 字符不需要边界检查（中文、日语、韩语没有空格分词）
    const isCJK = (char: string) => {
        return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char);
    };
    
    const startChar = text[start];
    const endChar = text[end - 1];
    const boundaryStart = isCJK(startChar) || !isWordChar(before);
    const boundaryEnd = isCJK(endChar) || !isWordChar(after);
    
    return boundaryStart && boundaryEnd;
}
