import { Trie } from '../utils/trie';
import { mapCanvasColorToCSSVar } from '../utils/color-utils';
import type { HighlightStyle, WordDefinition } from '../utils/types';
import type { PageMatch, PageText } from './page-runtime';

export function buildWebVocabulary(definitions: WordDefinition[], resolveColor: (color: string) => string) {
    const trie = new Trie<{ color: number; token: number }>();
    const tokens = new Map<number, WordDefinition>();
    const colors: string[] = [];
    for (const definition of definitions) {
        const color = resolveColor(mapCanvasColorToCSSVar(definition.color, '#8b8b8b'));
        let index = colors.indexOf(color);
        if (index < 0) { index = colors.length; colors.push(color); }
        const token = tokens.size + 1;
        tokens.set(token, definition);
        const payload = { color: index, token };
        trie.addWord(definition.word, payload);
        for (const alias of definition.aliases || []) if (alias) trie.addWord(alias, payload);
    }
    return { trie, colors, tokens };
}

/** Validate all data crossing the guest-page boundary before matching it locally. */
export function matchWebTexts(value: unknown, trie: Trie<{ color: number; token: number }>): PageMatch[] {
    if (!Array.isArray(value) || value.length > 256) return [];
    const results: PageMatch[] = [];
    let characters = 0;
    for (const node of value as PageText[]) {
        if (!node || !Number.isSafeInteger(node.id) || node.id < 1 || typeof node.text !== 'string' || node.text.length > 200000) continue;
        characters += node.text.length;
        if (characters > 264000) break;
        const matches = trie.findAllMatches(node.text).sort((a, b) => a.from - b.from || b.to - a.to);
        const ranges: PageMatch['ranges'] = [];
        let end = 0;
        for (const match of matches) {
            if (match.from < end) continue;
            ranges.push({ from: match.from, to: match.to, color: match.payload?.color ?? 0, token: match.payload?.token ?? 0 });
            end = match.to;
        }
        results.push({ id: node.id, text: node.text, ranges });
    }
    return results;
}

export function webHighlightCSS(colors: string[], style: HighlightStyle, namespace = 'hiwords-web'): string {
    return colors.map((color, index) => {
        // Custom highlights cannot change font weight. Bold uses a background on web pages.
        const rule = style === 'background' || style === 'bold'
            ? `background-color:color-mix(in srgb,${color} 30%,transparent)`
            : `text-decoration-line:underline;text-decoration-style:${style === 'wavy' ? 'wavy' : style === 'dotted' ? 'dotted' : 'solid'};text-decoration-color:${color};text-decoration-thickness:2px`;
        return `::highlight(${namespace}-${index}){${rule}}`;
    }).join('\n');
}

/** Only locally issued tokens from this page generation may open a read-only detail view. */
export function resolveWebClick(value: unknown, generation: number, tokens: Map<number, WordDefinition>, issued: Set<number>): WordDefinition | undefined {
    if (!value || typeof value !== 'object') return;
    const click = value as { generation?: unknown; token?: unknown };
    if (click.generation !== generation || typeof click.token !== 'number' || !Number.isSafeInteger(click.token) || !issued.has(click.token)) return;
    return tokens.get(click.token);
}
