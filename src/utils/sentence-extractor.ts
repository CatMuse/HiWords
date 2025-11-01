/**
 * 句子提取工具
 */

/**
 * 从文本中提取包含指定位置的句子
 * @param text 完整文本
 * @param position 光标位置（相对于文本开头的字符索引）
 * @returns 提取的句子
 */
export function extractSentence(text: string, position: number): string {
    if (!text || position < 0 || position > text.length) {
        return '';
    }

    // 句子结束标记
    const sentenceEnders = /[.!?。！？\n]/;
    
    // 向前查找句子开始位置
    let start = position;
    while (start > 0) {
        const char = text[start - 1];
        if (sentenceEnders.test(char)) {
            break;
        }
        start--;
    }
    
    // 向后查找句子结束位置
    let end = position;
    while (end < text.length) {
        const char = text[end];
        if (sentenceEnders.test(char)) {
            // 包含结束标点
            end++;
            break;
        }
        end++;
    }
    
    // 提取句子并清理空白
    const sentence = text.substring(start, end).trim();
    
    return sentence;
}

/**
 * 从编辑器中提取选中文本所在的句子
 * @param editor Obsidian 编辑器实例
 * @returns 提取的句子
 */
export function extractSentenceFromEditor(editor: any): string {
    try {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);
        const ch = cursor.ch;
        
        // 使用 extractSentence 从当前行提取句子
        return extractSentence(line, ch);
    } catch (error) {
        console.error('Failed to extract sentence from editor:', error);
        return '';
    }
}

/**
 * 从多行文本中提取句子
 * @param editor Obsidian 编辑器实例
 * @returns 提取的句子（可能跨行）
 */
export function extractSentenceFromEditorMultiline(editor: any): string {
    try {
        const cursor = editor.getCursor();
        const doc = editor.getValue();
        
        // 计算光标在整个文档中的位置
        let position = 0;
        for (let i = 0; i < cursor.line; i++) {
            position += editor.getLine(i).length + 1; // +1 for newline
        }
        position += cursor.ch;
        
        // 从整个文档中提取句子
        return extractSentence(doc, position);
    } catch (error) {
        console.error('Failed to extract sentence from editor (multiline):', error);
        return '';
    }
}
