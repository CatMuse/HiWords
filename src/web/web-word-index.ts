import type { WordDefinition } from '../utils/types';
import type { PageMatch } from './page-runtime';

/** Per-page matches; keep no page text after matching. Repeated occurrences share one card. */
export class WebWordIndex {
    private nodes = new Map<number, number[]>();
    clear(): void { this.nodes.clear(); }
    update(matches: PageMatch[], removed: unknown): void {
        if (Array.isArray(removed)) for (const id of removed.slice(0, 256)) {
            if (Number.isSafeInteger(id)) this.nodes.delete(id);
        }
        for (const match of matches) {
            if (match.ranges.length) this.nodes.set(match.id, match.ranges.map(range => range.token));
            else this.nodes.delete(match.id);
        }
    }
    words(tokens: Map<number, WordDefinition>): WordDefinition[] {
        const seen = new Set<string>();
        const words: WordDefinition[] = [];
        // IDs are assigned in document scan order, independent of edits to existing nodes.
        for (const [, values] of [...this.nodes].sort(([a], [b]) => a - b)) for (const token of values) {
            const word = tokens.get(token);
            if (!word) continue;
            const key = word.studyKey || `${word.source}::${word.nodeId}::${word.word}`;
            if (!seen.has(key)) { seen.add(key); words.push(word); }
        }
        return words;
    }
}
