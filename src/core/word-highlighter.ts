import { 
    RangeSetBuilder, 
    Extension,
    StateField,
    StateEffect
} from '@codemirror/state';
import { 
    EditorView, 
    Decoration, 
    DecorationSet, 
    ViewUpdate,
    ViewPlugin,
    PluginSpec,
    PluginValue,
    WidgetType
} from '@codemirror/view';
import { editorViewField } from 'obsidian';
import { VocabularyManager } from './vocabulary-manager';
import { WordMatch, WordDefinition, mapCanvasColorToCSSVar, Trie, TrieMatch } from '../utils';

// 防抖延迟时间（毫秒）
const DEBOUNCE_DELAY = 300;

// 状态效果：强制更新高亮
const forceUpdateEffect = StateEffect.define<boolean>();

// 全局高亮器管理器
class HighlighterManager {
    private static instance: HighlighterManager;
    private highlighters: Set<WordHighlighter> = new Set();
    
    static getInstance(): HighlighterManager {
        if (!HighlighterManager.instance) {
            HighlighterManager.instance = new HighlighterManager();
        }
        return HighlighterManager.instance;
    }
    
    register(highlighter: WordHighlighter): void {
        this.highlighters.add(highlighter);
    }
    
    unregister(highlighter: WordHighlighter): void {
        this.highlighters.delete(highlighter);
    }
    
    refreshAll(): void {

        this.highlighters.forEach(highlighter => {
            try {
                highlighter.forceUpdate();
            } catch (error) {
                console.error('刷新高亮器失败:', error);
            }
        });
    }
    
    clear(): void {
        this.highlighters.clear();
    }
}

// 导出全局实例
export const highlighterManager = HighlighterManager.getInstance();

// 状态字段：存储当前高亮的词汇
const highlightState = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        // 不使用 map 来自动调整位置，因为这会导致高亮位置错误
        // 而是依赖 ViewPlugin 重新扫描文档来更新高亮
        // map 的问题：它只是机械地调整位置，不会重新匹配单词
        
        for (let effect of tr.effects) {
            if (effect.is(forceUpdateEffect)) {
                // 强制重新构建装饰器
                return Decoration.none;
            }
        }
        
        // 保持当前装饰器不变，等待 ViewPlugin 更新
        return decorations;
    },
    provide: f => EditorView.decorations.from(f)
});

// 词汇高亮插件
export class WordHighlighter implements PluginValue {
    decorations: DecorationSet;
    private vocabularyManager: VocabularyManager;
    private editorView: EditorView;
    private wordTrie: Trie;
    private debounceTimer: number | null = null;
    private lastRanges: {from: number, to: number}[] = [];
    private cachedMatches: Map<string, WordMatch[]> = new Map();
    protected shouldHighlightFile?: (filePath: string) => boolean;

    constructor(view: EditorView, vocabularyManager: VocabularyManager, shouldHighlightFile?: (filePath: string) => boolean) {
        this.editorView = view;
        this.vocabularyManager = vocabularyManager;
        this.shouldHighlightFile = shouldHighlightFile;
        this.wordTrie = new Trie();
        this.buildWordTrie();
        this.decorations = this.buildDecorations(view);
        
        // 注册到全局管理器
        highlighterManager.register(this);
    }

    /**
     * 构建单词前缀树
     */
    private buildWordTrie() {
        this.wordTrie.clear();
        
        // 获取未掌握的单词（已掌握的单词不会被高亮）
        const words = this.vocabularyManager.getAllWordsForHighlight();
        
        // 将单词添加到前缀树
        for (const word of words) {
            const definition = this.vocabularyManager.getDefinition(word);
            if (definition) {
                this.wordTrie.addWord(word, definition);
            }
        }
    }

    update(update: ViewUpdate) {
        // 如果文档内容发生变化，立即更新高亮（不使用防抖）
        if (update.docChanged) {
            // 清除缓存，确保重新匹配
            this.cachedMatches.clear();
            // 立即重建装饰器
            this.decorations = this.buildDecorations(update.view);
        }
        // 如果只是视口或焦点变化，使用防抖处理
        else if (update.viewportChanged || update.focusChanged) {
            this.debouncedUpdate(update.view);
        }
    }

    /**
     * 强制更新高亮
     */
    forceUpdate() {
        // 重建前缀树
        this.buildWordTrie();
        
        // 清除缓存
        this.cachedMatches.clear();
        
        // 重建装饰器
        this.decorations = this.buildDecorations(this.editorView);
        this.editorView.dispatch({
            effects: forceUpdateEffect.of(true)
        });
    }
    
    /**
     * 防抖更新处理
     */
    private debouncedUpdate(view: EditorView) {
        if (this.debounceTimer) {
            window.clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = window.setTimeout(() => {
            this.decorations = this.buildDecorations(view);
            this.debounceTimer = null;
        }, DEBOUNCE_DELAY);
    }

    /**
     * 构建装饰器
     */
    private buildDecorations(view: EditorView): DecorationSet {
        // 检查是否启用了自动高亮功能
        const settings = this.vocabularyManager.getSettings();
        if (!settings.enableAutoHighlight) {
            // 如果禁用了高亮，返回空装饰器
            return Decoration.none;
        }
        
        // 检查当前文件是否应该被高亮
        if (this.shouldHighlightFile) {
            const file = view.state.field(editorViewField);
            if (file?.file?.path && !this.shouldHighlightFile(file.file.path)) {
                // 如果文件不应该被高亮，返回空装饰器
                return Decoration.none;
            }
        }
        
        const builder = new RangeSetBuilder<Decoration>();
        const matches: WordMatch[] = [];
        
        // 检查可见范围是否发生变化
        const currentRanges = view.visibleRanges;
        const rangesChanged = this.haveRangesChanged(currentRanges);
        
        // 如果可见范围没有变化且有缓存，直接使用缓存的匹配结果
        const cacheKey = currentRanges.map(r => `${r.from}-${r.to}`).join(',');
        if (!rangesChanged && this.cachedMatches.has(cacheKey)) {
            const cachedMatches = this.cachedMatches.get(cacheKey)!;
            this.applyDecorations(builder, cachedMatches);
            return builder.finish();
        }
        
        // 更新最后处理的范围
        this.lastRanges = currentRanges.map(range => ({from: range.from, to: range.to}));
        
        // 扫描可见范围内的文本
        for (let { from, to } of view.visibleRanges) {
            const text = view.state.sliceDoc(from, to);
            matches.push(...this.findWordMatches(text, from));
        }

        // 按位置排序
        matches.sort((a, b) => a.from - b.from);
        
        // 处理重叠匹配
        const filteredMatches = this.removeOverlaps(matches);
        
        // 缓存处理结果
        this.cachedMatches.set(cacheKey, filteredMatches);
        
        // 应用装饰
        this.applyDecorations(builder, filteredMatches);
        
        return builder.finish();
    }
    
    /**
     * 应用装饰到构建器
     */
    private applyDecorations(builder: RangeSetBuilder<Decoration>, matches: WordMatch[]) {
        // 获取当前高亮样式设置
        const highlightStyle = this.vocabularyManager.getSettings().highlightStyle || 'underline';
        
        matches.forEach(match => {
            // 使用与侧边栏视图一致的默认灰色
            const highlightColor = mapCanvasColorToCSSVar(match.definition.color, 'var(--color-base-60)');
            
            builder.add(
                match.from, 
                match.to, 
                Decoration.mark({
                    class: `hi-words-highlight`,
                    attributes: {
                        'data-word': match.word,
                        'data-definition': match.definition.definition,
                        'data-color': highlightColor,
                        'data-style': highlightStyle,
                        'style': `--word-highlight-color: ${highlightColor};`
                    }
                })
            );
        });
    }
    
    /**
     * 检查可见范围是否发生变化
     */
    private haveRangesChanged(currentRanges: readonly {from: number, to: number}[]): boolean {
        if (this.lastRanges.length !== currentRanges.length) {
            return true;
        }
        
        for (let i = 0; i < currentRanges.length; i++) {
            if (currentRanges[i].from !== this.lastRanges[i].from || 
                currentRanges[i].to !== this.lastRanges[i].to) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * 在文本中查找词汇匹配
     * 使用前缀树进行高效匹配
     */
    private findWordMatches(text: string, offset: number): WordMatch[] {
        const matches: WordMatch[] = [];
        
        try {
            // 使用前缀树查找所有匹配
            const trieMatches = this.wordTrie.findAllMatches(text);
            
            // 转换为 WordMatch 对象
            for (const match of trieMatches) {
                const definition = match.payload as WordDefinition;
                if (definition) {
                    matches.push({
                        word: match.word,
                        definition,
                        from: offset + match.from,
                        to: offset + match.to,
                        color: mapCanvasColorToCSSVar(definition.color, 'var(--color-accent)')
                    });
                }
            }
        } catch (e) {
            console.error('在 findWordMatches 中发生错误:', e);
        }
        
        return matches;
    }

    /**
     * 移除重叠的匹配项，使用游标算法高效处理
     * 注意：当前实现允许重叠高亮，因为这对于包含关系的单词（如 "art" 和 "start"）更合理
     */
    private removeOverlaps(matches: WordMatch[]): WordMatch[] {
        // 直接返回所有匹配，允许重叠高亮
        // 这样可以正确处理包含关系的单词，如 "art" 出现在 "start" 中
        return matches;
    }

    destroy() {
        // 清理资源
        if (this.debounceTimer) {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        this.cachedMatches.clear();
        this.wordTrie.clear();
        
        // 从全局管理器中注销
        highlighterManager.unregister(this);
    }
}

// 创建编辑器扩展
export function createWordHighlighterExtension(
    vocabularyManager: VocabularyManager,
    shouldHighlightFile?: (filePath: string) => boolean
): Extension {
    const pluginSpec: PluginSpec<WordHighlighter> = {
        decorations: (value: WordHighlighter) => value.decorations,
    };

    // 创建一个工厂函数来传递 vocabularyManager 和文件检查函数
    class WordHighlighterWithManager extends WordHighlighter {
        constructor(view: EditorView) {
            super(view, vocabularyManager, shouldHighlightFile);
        }
    }

    return [
        highlightState,
        ViewPlugin.fromClass(WordHighlighterWithManager, pluginSpec)
    ];
}

// 获取光标下的词汇
export function getWordUnderCursor(view: EditorView): string | null {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const lineText = line.text;
    const relativePos = cursor - line.from;
    
    // 查找词汇边界
    let start = relativePos;
    let end = relativePos;
    
    const wordRegex = /[a-zA-Z]/;
    
    // 向前查找词汇开始
    while (start > 0 && wordRegex.test(lineText[start - 1])) {
        start--;
    }
    
    // 向后查找词汇结束
    while (end < lineText.length && wordRegex.test(lineText[end])) {
        end++;
    }
    
    if (start === end) return null;
    
    return lineText.slice(start, end);
}
