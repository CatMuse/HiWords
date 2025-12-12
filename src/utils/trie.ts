/**
 * 前缀树(Trie)数据结构实现
 * 用于高效地匹配多个单词
 */
export class Trie {
    private root: TrieNode;

    constructor() {
        this.root = new TrieNode();
    }

    /**
     * 向前缀树中添加单词
     * @param word 要添加的单词
     * @param payload 与单词关联的数据
     */
    addWord(word: string, payload: any): void {
        let node = this.root;
        const lowerWord = word.toLowerCase();
        
        for (const char of lowerWord) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char)!;
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
    findAllMatches(text: string): TrieMatch[] {
        const matches: TrieMatch[] = [];
        const lowerText = text.toLowerCase();
        
        // 对文本中的每个位置尝试匹配
        for (let i = 0; i < lowerText.length; i++) {
            let node = this.root;
            let j = i;
            
            // 尝试从当前位置匹配单词
            while (j < lowerText.length && node.children.has(lowerText[j])) {
                node = node.children.get(lowerText[j])!;
                j++;
                
                // 如果到达单词结尾，添加匹配
                if (node.isEndOfWord) {
                    // 检查单词边界
                    const isWordBoundaryStart = i === 0 || !isAlphaNumeric(lowerText[i - 1]);
                    const isWordBoundaryEnd = j === lowerText.length || !isAlphaNumeric(lowerText[j]);
                    
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
        this.root = new TrieNode();
    }
}

/**
 * 前缀树节点
 */
class TrieNode {
    children: Map<string, TrieNode>;
    isEndOfWord: boolean;
    payload: any;
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
export interface TrieMatch {
    word: string;
    from: number;
    to: number;
    payload: any;
}

/**
 * 检查字符是否为字母或数字
 * 支持英文、中文、日语、韩语等字符
 */
function isAlphaNumeric(char: string): boolean {
    return /[a-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/iu.test(char);
}
