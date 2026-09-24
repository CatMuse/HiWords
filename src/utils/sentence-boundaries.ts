export interface SentenceRange {
    start: number;
    end: number;
}

// These abbreviations introduce a name or an example, even when it is capitalized.
const PREFIX_ABBREVIATIONS = new Set([
    'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'rev',
    'e.g', 'i.e', 'viz',
]);
const REFERENCE_ABBREVIATIONS = new Set(['equ', 'eq', 'eqs', 'fig', 'figs', 'no', 'nos', 'vol', 'pp', 'p', 'ch', 'sec']);
const CONTEXTUAL_ABBREVIATIONS = new Set(['etc', 'vs', 'approx', 'dept', 'inc', 'ltd', 'co', 'al']);
const CLOSING_MARKS = /["'”’»）)\]}]/;

/** Find a sentence without changing source offsets. Newlines can remain soft in Markdown paragraphs. */
export function getSentenceRange(text: string, position: number, breakOnNewline = true): SentenceRange {
    if (!text || !Number.isInteger(position) || position < 0 || position > text.length) {
        return { start: 0, end: 0 };
    }

    let start = position;
    while (start > 0 && !isSentenceEnd(text, start - 1, breakOnNewline)) start--;
    let end = position;
    while (end < text.length) {
        if (isSentenceEnd(text, end, breakOnNewline)) {
            end++;
            // Keep punctuation clusters and closing quotes with the sentence.
            while (end < text.length && /[.!?。！？]/.test(text[end])) end++;
            while (end < text.length && CLOSING_MARKS.test(text[end])) end++;
            break;
        }
        end++;
    }
    // A preceding sentence may have ended with a quote or repeated punctuation.
    while (start < position && CLOSING_MARKS.test(text[start])) start++;
    return { start, end };
}

function isSentenceEnd(text: string, index: number, breakOnNewline: boolean): boolean {
    const character = text[index];
    if (character === '\n' || character === '\r') return breakOnNewline;
    if (/[!?。！？]/.test(character)) return true;
    if (character !== '.') return false;

    if (/\d/.test(text[index - 1] || '') && /\d/.test(text[index + 1] || '')) return false;

    let tokenStart = index;
    while (tokenStart > 0 && /[a-z.]/i.test(text[tokenStart - 1])) tokenStart--;
    const token = text.slice(tokenStart, index);
    // Internal dots in e.g., i.e., U.S., Ph.D., etc.
    if (/^(?:[a-z](?:\.[a-z])*|ph)$/i.test(token) && /^[a-z]\./i.test(text.slice(index + 1, index + 3))) return false;

    const following = text.slice(index + 1).match(/^(\s*)(\S)/);
    if (!following) return true;
    const [, gap, next] = following;
    if (breakOnNewline && /[\r\n]/.test(gap)) return true;
    if (CLOSING_MARKS.test(next)) return true;

    const abbreviation = token.toLowerCase();
    if (PREFIX_ABBREVIATIONS.has(abbreviation)) return false;
    if (REFERENCE_ABBREVIATIONS.has(abbreviation)) return !/[\d(a-z]/.test(next);
    if (/^[A-Z]$/.test(token) && /[A-Z]/.test(next)) return false;

    // Sentence-final abbreviations still end a sentence before an uppercase word.
    // Ambiguous cases (e.g. "U.S. Army") cannot be resolved perfectly without language parsing.
    if (CONTEXTUAL_ABBREVIATIONS.has(abbreviation) || /^[a-z]+(?:\.[a-z]+)+$/i.test(token)) {
        return !/[a-z\d,;:]/.test(next);
    }
    return true;
}
