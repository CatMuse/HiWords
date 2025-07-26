import { 
    RangeSetBuilder, 
    Extension,
    StateField,
    StateEffect
} from '@codemirror/state';
import {
    Decoration,
    DecorationSet,
    EditorView,
    PluginSpec,
    PluginValue,
    ViewPlugin,
    ViewUpdate,
    WidgetType
} from '@codemirror/view';
import { WordMatch, WordDefinition } from './types';
import { VocabularyManager } from './vocabulary-manager';

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

    constructor(view: EditorView, vocabularyManager: VocabularyManager) {
        this.editorView = view;
        this.vocabularyManager = vocabularyManager;
        this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.focusChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    /**
     * 强制更新高亮
     */
    forceUpdate() {
        this.decorations = this.buildDecorations(this.editorView);
        this.editorView.dispatch({
            effects: forceUpdateEffect.of(true)
        });
    }

    /**
     * 构建装饰器
     */
    private buildDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const matches: WordMatch[] = [];

        // 扫描可见范围内的文本
        for (let { from, to } of view.visibleRanges) {
            const text = view.state.sliceDoc(from, to);
            matches.push(...this.findWordMatches(text, from));
        }

        // 按位置排序并去重
        matches.sort((a, b) => a.from - b.from);
        const filteredMatches = this.removeOverlaps(matches);

        // 添加装饰器
        filteredMatches.forEach(match => {
            builder.add(
                match.from, 
                match.to, 
                Decoration.mark({
                    class: 'hello-word-highlight',
                    attributes: {
                        'data-word': match.word,
                        'data-definition': match.definition.definition,
                        'style': `border-bottom: 2px dashed ${match.color}; cursor: pointer;`
                    }
                })
            );
        });

        return builder.finish();
    }

    /**
     * 在文本中查找词汇匹配
     */
    private findWordMatches(text: string, offset: number): WordMatch[] {
        const matches: WordMatch[] = [];
        const words = this.vocabularyManager.getAllWords();
        
        // 按词汇长度降序排序，优先匹配长词汇
        words.sort((a, b) => b.length - a.length);

        for (const word of words) {
            const regex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'gi');
            let match;
            
            while ((match = regex.exec(text)) !== null) {
                const definition = this.vocabularyManager.getDefinition(word);
                if (definition) {
                    matches.push({
                        word: match[0],
                        definition,
                        from: offset + match.index,
                        to: offset + match.index + match[0].length,
                        color: definition.color || '#007acc'
                    });
                }
            }
        }

        return matches;
    }

    /**
     * 移除重叠的匹配项，优先保留长词汇
     */
    private removeOverlaps(matches: WordMatch[]): WordMatch[] {
        if (matches.length === 0) return matches;

        const result: WordMatch[] = [];
        let lastEnd = 0;

        for (const match of matches) {
            if (match.from >= lastEnd) {
                result.push(match);
                lastEnd = match.to;
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

    destroy() {}
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
