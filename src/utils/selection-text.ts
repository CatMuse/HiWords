const letters = new RegExp('\\p{L}', 'u');
const word = new RegExp("^[\\p{L}\\p{M}\\p{N}]+(?:['’‘\\-‐‑][\\p{L}\\p{M}\\p{N}]+)*$", 'u');
const abbreviation = new RegExp('^(?:\\p{L}\\.)+\\p{L}?$', 'u');
const unspacedLanguage = new RegExp('[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Thai}]', 'u');
const prose = new RegExp("^[\\p{L}\\p{M}\\p{N}\\p{Sc}\\s.,!?;:'’‘\"“”()\\[\\]{}，。！？；：、（）【】《》「」『』«»%％…—–\\-‐‑]+$", 'u');
const wrappers = [['**', '**'], ['__', '__'], ['~~', '~~'], ['*', '*'], ['_', '_'], ['`', '`'],
    ['(', ')'], ['[', ']'], ['{', '}'], ['（', '）'], ['【', '】'], ['「', '」'], ['『', '』'],
    ['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’'], ['«', '»']];
const adjacentSymbols = new RegExp('^[\\p{P}\\p{S}]+|[\\p{P}\\p{S}]+$', 'gu');

/** Filter accidental selections before opening a popup or sending an AI request. */
export function prepareSelectionText(text: string): string | null {
    if (text.length > 500) return null;
    let clean = text.trim();
    // Strip extra symbols from word edges; keep interior punctuation for validation.
    let previous: string;
    do {
        previous = clean;
        if (!/\s/.test(clean) && !unspacedLanguage.test(clean)) {
            clean = clean.replace(adjacentSymbols, '');
        }
        for (const [open, close] of wrappers) {
            if (clean.length >= open.length + close.length && clean.startsWith(open) && clean.endsWith(close)) {
                clean = clean.slice(open.length, -close.length).trim();
                break;
            }
        }
    } while (clean !== previous);
    if (!letters.test(clean)) return null;
    if (unspacedLanguage.test(clean)) return prose.test(clean) ? clean : null;
    if (!/\s/.test(clean)) {
        return word.test(clean) || abbreviation.test(clean) ? clean : null;
    }
    return prose.test(clean) ? clean : null;
}
