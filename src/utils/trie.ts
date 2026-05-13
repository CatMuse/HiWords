/**
 * 前缀树(Trie)数据结构实现
 * 用于高效地匹配多个单词
 */
export class Trie<TPayload = unknown> {
    private root: TrieNode<TPayload>;

    constructor() {
        this.root = new TrieNode<TPayload>();
    }

    /**
     * 向前缀树中添加单词
     * @param word 要添加的单词
     * @param payload 与单词关联的数据
     */
    addWord(word: string, payload: TPayload): void {
        let node = this.root;
        const lowerWord = word.toLowerCase();
        
        for (const char of lowerWord) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode<TPayload>());
            }
            const child = node.children.get(char);
            if (!child) return;
            node = child;
        }
        
        node.isEndOfWord = true;
        node.payload = payload;
        node.word = word; // 保存原始单词形式
    }

    /**
     * 在文本中查找所有匹配的单词
     * @param text 要搜索的文本
     * @returns 匹配结果数组，每个结果包含单词、位置和关联数据
     */
    findAllMatches(text: string): Array<TrieMatch<TPayload>> {
        const matches: Array<TrieMatch<TPayload>> = [];
        const lowerText = text.toLowerCase();
        
        // 对文本中的每个位置尝试匹配
        for (let i = 0; i < lowerText.length; i++) {
            let node = this.root;
            let j = i;
            
            // 尝试从当前位置匹配单词
            while (j < lowerText.length && node.children.has(lowerText[j])) {
                const child = node.children.get(lowerText[j]);
                if (!child) break;
                node = child;
                j++;
                
                // 如果到达单词结尾，添加匹配
                if (node.isEndOfWord) {
                    // 检查单词边界
                    // CJK 字符不需要边界检查（中文、日语、韩语没有空格分词）
                    const matchedStart = lowerText[i];
                    const matchedEnd = lowerText[j - 1];
                    const isWordBoundaryStart = isCJKChar(matchedStart) || i === 0 || !isAlphaNumeric(lowerText[i - 1]);
                    const isWordBoundaryEnd = isCJKChar(matchedEnd) || j === lowerText.length || !isAlphaNumeric(lowerText[j]);
                    
                    if (isWordBoundaryStart && isWordBoundaryEnd) {
                        matches.push({
                            word: node.word || lowerText.substring(i, j),
                            from: i,
                            to: j,
                            payload: node.payload
                        });
                    }
                }
            }
        }
        
        return matches;
    }

    /**
     * 清空前缀树
     */
    clear(): void {
        this.root = new TrieNode<TPayload>();
    }
}

/**
 * 前缀树节点
 */
class TrieNode<TPayload = unknown> {
    children: Map<string, TrieNode<TPayload>>;
    isEndOfWord: boolean;
    payload: TPayload | null;
    word: string | null;
    
    constructor() {
        this.children = new Map();
        this.isEndOfWord = false;
        this.payload = null;
        this.word = null;
    }
}

/**
 * 前缀树匹配结果
 */
export interface TrieMatch<TPayload = unknown> {
    word: string;
    from: number;
    to: number;
    payload: TPayload | null;
}

/**
 * 检查字符是否为字母或数字
 * 支持英文、中文、日语、韩语等字符
 */
function isAlphaNumeric(char: string): boolean {
    return /[a-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/iu.test(char);
}

/**
 * 检查字符是否为 CJK 字符（中文、日语、韩语）
 * CJK 文本没有空格分词，不需要单词边界检查
 */
function isCJKChar(char: string): boolean {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char);
}
