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

/**
 * 从 DOM Selection 中提取句子
 * 适用于阅读模式和 PDF 视图
 * @param selection window.getSelection() 返回的选区对象
 * @returns 提取的句子
 */
export function extractSentenceFromSelection(selection: Selection | null): string {
    if (!selection || selection.rangeCount === 0) {
        return '';
    }
    
    try {
        const range = selection.getRangeAt(0);
        const selectedText = selection.toString().trim();
        
        if (!selectedText) {
            return '';
        }
        
        // 获取选区的起始节点
        let startNode = range.startContainer;
        
        // 如果是元素节点，尝试获取其中的文本节点
        if (startNode.nodeType === Node.ELEMENT_NODE) {
            const textNode = startNode.childNodes[range.startOffset];
            if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                startNode = textNode;
            }
        }
        
        // 查找合适的段落容器
        const paragraphContainer = findParagraphContainer(startNode);
        if (!paragraphContainer) {
            return '';
        }
        
        // 获取段落文本
        const paragraphText = paragraphContainer.textContent || '';
        
        // 计算选中文本在段落中的实际位置
        const actualPosition = calculateTextPosition(paragraphContainer, startNode, range.startOffset, selectedText);
        if (actualPosition === -1) {
            return '';
        }
        
        // 从选中文本的中间位置提取句子
        const middlePosition = actualPosition + Math.floor(selectedText.length / 2);
        return extractSentence(paragraphText, middlePosition);
    } catch (error) {
        console.error('Failed to extract sentence from selection:', error);
        return '';
    }
}

/**
 * 查找合适的段落容器
 * @param startNode 起始节点
 * @returns 段落容器元素
 */
function findParagraphContainer(startNode: Node): HTMLElement | null {
    let currentNode: Node | null = startNode;
    
    // 如果是文本节点，获取其父元素
    if (currentNode.nodeType === Node.TEXT_NODE) {
        currentNode = currentNode.parentNode;
    }
    
    let paragraphContainer: HTMLElement | null = null;
    
    while (currentNode && currentNode.nodeType !== Node.DOCUMENT_NODE) {
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
            const element = currentNode as HTMLElement;
            const tagName = element.tagName?.toLowerCase();
            
            // 阅读模式：查找段落级元素
            if (tagName === 'p' || tagName === 'li' || tagName === 'blockquote') {
                return element;
            }
            
            // 查找合适大小的 div 容器
            if (tagName === 'div') {
                const textLength = element.textContent?.length || 0;
                if (textLength > 0 && textLength < 5000) {
                    paragraphContainer = element;
                }
            }
            
            // PDF 模式：查找 textLayer 容器
            if (element.classList.contains('textLayer')) {
                return element;
            }
            
            // PDF 模式：从 page 容器中查找 textLayer
            if (element.classList.contains('page') && element.closest('.pdf-container')) {
                const textLayer = element.querySelector('.textLayer');
                if (textLayer) {
                    return textLayer as HTMLElement;
                }
            }
        }
        currentNode = currentNode.parentNode;
    }
    
    return paragraphContainer;
}

/**
 * 计算选中文本在段落中的实际位置
 * @param container 段落容器
 * @param startNode 起始节点
 * @param startOffset 起始偏移量
 * @param selectedText 选中的文本
 * @returns 文本位置，-1 表示未找到
 */
function calculateTextPosition(
    container: HTMLElement,
    startNode: Node,
    startOffset: number,
    selectedText: string
): number {
    // 使用 TreeWalker 遍历文本节点来计算精确位置
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    
    let currentOffset = 0;
    let node: Node | null;
    
    while ((node = walker.nextNode())) {
        if (node === startNode || node.contains(startNode)) {
            return currentOffset + startOffset;
        }
        currentOffset += node.textContent?.length || 0;
    }
    
    // 后备方案：使用 indexOf 查找
    const paragraphText = container.textContent || '';
    return paragraphText.indexOf(selectedText);
}
