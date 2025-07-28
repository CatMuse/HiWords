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
import { VocabularyManager } from './vocabulary-manager';
import { WordMatch, WordDefinition } from './types';
import { mapCanvasColorToCSSVar } from './color-utils';
import { Trie, TrieMatch } from './trie';

// 防抖延迟时间（毫秒）
const DEBOUNCE_DELAY = 300;

// 性能监控阈值（毫秒）
const PERFORMANCE_THRESHOLD = 100;

// 状态效果：强制更新高亮
const forceUpdateEffect = StateEffect.define<boolean>();

// 状态字段：存储当前高亮的词汇
const highlightState = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);
        
        for (let effect of tr.effects) {
            if (effect.is(forceUpdateEffect)) {
                // 强制重新构建装饰器
                return Decoration.none;
            }
        }
        
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

    constructor(view: EditorView, vocabularyManager: VocabularyManager) {
        this.editorView = view;
        this.vocabularyManager = vocabularyManager;
        this.wordTrie = new Trie();
        this.buildWordTrie();
        this.decorations = this.buildDecorations(view);
    }

    /**
     * 构建单词前缀树
     */
    private buildWordTrie() {
        const startTime = performance.now();
        this.wordTrie.clear();
        
        // 获取所有单词
        const words = this.vocabularyManager.getAllWords();
        
        // 将单词添加到前缀树
        for (const word of words) {
            const definition = this.vocabularyManager.getDefinition(word);
            if (definition) {
                this.wordTrie.addWord(word, definition);
            }
        }
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        if (duration > PERFORMANCE_THRESHOLD) {
            console.log(`构建前缀树耗时: ${duration.toFixed(2)}ms，单词数量: ${words.length}`);
        }
    }

    update(update: ViewUpdate) {
        // 如果词汇管理器中的词汇发生变化，重建前缀树
        if (update.docChanged || update.viewportChanged || update.focusChanged) {
            // 使用防抖处理，避免频繁更新
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
        const startTime = performance.now();
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
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        if (duration > PERFORMANCE_THRESHOLD) {
            console.log(`构建装饰器耗时: ${duration.toFixed(2)}ms，匹配数量: ${matches.length}，过滤后: ${filteredMatches.length}`);
        }
        
        return builder.finish();
    }
    
    /**
     * 应用装饰到构建器
     */
    private applyDecorations(builder: RangeSetBuilder<Decoration>, matches: WordMatch[]) {
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
        const startTime = performance.now();
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
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            if (duration > PERFORMANCE_THRESHOLD) {
                console.log(`单词匹配耗时: ${duration.toFixed(2)}ms，文本长度: ${text.length}，匹配数量: ${matches.length}`);
            }
        } catch (e) {
            console.error('在 findWordMatches 中发生错误:', e);
        }
        
        return matches;
    }

    /**
     * 移除重叠的匹配项，使用游标算法高效处理
     */
    private removeOverlaps(matches: WordMatch[]): WordMatch[] {
        // 如果用户设置允许重叠，则直接返回所有匹配
        // 这里可以根据实际需求修改
        const allowOverlaps = true;
        if (allowOverlaps || matches.length === 0) {
            return matches;
        }
        
        // 使用游标算法高效处理重叠
        const result: WordMatch[] = [];
        let cursor = 0;
        
        for (const match of matches) {
            if (match.from >= cursor) {
                result.push(match);
                cursor = match.to;
            }
        }
        
        return result;
    }

    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    destroy() {
        // 清理资源
        if (this.debounceTimer) {
            window.clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        
        this.cachedMatches.clear();
        this.wordTrie.clear();
    }
}

// 创建编辑器扩展
export function createWordHighlighterExtension(vocabularyManager: VocabularyManager): Extension {
    const pluginSpec: PluginSpec<WordHighlighter> = {
        decorations: (value: WordHighlighter) => value.decorations,
    };

    // 创建一个工厂函数来传递 vocabularyManager
    class WordHighlighterWithManager extends WordHighlighter {
        constructor(view: EditorView) {
            super(view, vocabularyManager);
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
