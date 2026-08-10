import type { CachedMetadata } from 'obsidian';

export type SearchableMarkdownBlockType = 'paragraph' | 'blockquote' | 'callout' | 'list' | 'text';

export interface ExtractedMarkdownContext {
    sentence: string;
    offset: number;
    line: number;
    heading?: string;
    blockType: SearchableMarkdownBlockType;
    quality: number;
}

interface TextRange {
    start: number;
    end: number;
}

interface SearchableSection {
    type: SearchableMarkdownBlockType;
    position: {
        start: { offset: number };
        end: { offset: number };
    };
}

interface SegmentLike {
    segment: string;
    index: number;
}

type SegmenterConstructor = new (
    locales?: string | string[],
    options?: { granularity: 'sentence' }
) => { segment(input: string): Iterable<SegmentLike> };

const SEARCHABLE_BLOCK_TYPES = new Set<SearchableMarkdownBlockType>([
    'paragraph',
    'blockquote',
    'callout',
    'list',
    'text',
]);

const BLOCK_QUALITY: Record<SearchableMarkdownBlockType, number> = {
    paragraph: 100,
    text: 90,
    blockquote: 75,
    callout: 60,
    list: 50,
};

const MAX_SENTENCE_LENGTH = 320;

export function extractMarkdownContexts(
    text: string,
    word: string,
    cache: CachedMetadata | null,
    limit = 8
): ExtractedMarkdownContext[] {
    const normalizedWord = word.toLocaleLowerCase();
    const sections = getSearchableSections(text, cache);
    const results: ExtractedMarkdownContext[] = [];
    const seen = new Set<string>();

    for (const section of sections) {
        if (results.length >= limit) break;

        const sectionStart = section.position.start.offset;
        const sectionEnd = Math.min(section.position.end.offset, text.length);
        const source = text.slice(sectionStart, sectionEnd);
        const normalizedSource = source.toLocaleLowerCase();
        const hiddenRanges = getHiddenRanges(source);
        let fromIndex = 0;

        while (fromIndex < source.length && results.length < limit) {
            const relativeOffset = normalizedSource.indexOf(normalizedWord, fromIndex);
            if (relativeOffset === -1) break;
            fromIndex = relativeOffset + normalizedWord.length;

            if (!hasWordBoundaries(normalizedSource, relativeOffset, normalizedWord.length)) continue;
            if (hiddenRanges.some(range => relativeOffset >= range.start && relativeOffset < range.end)) continue;

            const sentenceRange = getSentenceRange(source, relativeOffset, section.type === 'list');
            const rawSentence = source.slice(sentenceRange.start, sentenceRange.end);
            const sentence = cleanMarkdown(rawSentence);
            if (!isUsefulSentence(sentence, word)) continue;

            const dedupeKey = sentence.toLocaleLowerCase().replace(/\s+/g, ' ');
            if (seen.has(dedupeKey)) continue;

            const absoluteOffset = sectionStart + relativeOffset;
            const heading = getHeadingAtOffset(cache, absoluteOffset);
            if (heading && looksLikeMachineGeneratedLog(heading)) continue;
            seen.add(dedupeKey);

            const blockType = section.type as SearchableMarkdownBlockType;
            results.push({
                sentence,
                offset: absoluteOffset,
                line: text.slice(0, absoluteOffset).split('\n').length,
                heading,
                blockType,
                quality: getContextQuality(sentence, blockType),
            });
        }
    }

    return results;
}

function getSearchableSections(text: string, cache: CachedMetadata | null): SearchableSection[] {
    const sections = cache?.sections?.filter(section => SEARCHABLE_BLOCK_TYPES.has(section.type as SearchableMarkdownBlockType));
    if (sections?.length) {
        return sections.map(section => ({
            type: section.type as SearchableMarkdownBlockType,
            position: {
                start: { offset: section.position.start.offset },
                end: { offset: section.position.end.offset },
            },
        }));
    }

    // Obsidian's metadata cache can temporarily be missing while a note is
    // opening, being edited, or re-indexed. Fall back to a conservative prose
    // scanner instead of reporting that a visibly present word was not found.
    return getFallbackSections(text);
}

function getFallbackSections(text: string): SearchableSection[] {
    const sections: SearchableSection[] = [];
    const lines = text.split('\n');
    let offset = 0;
    let paragraphStart: number | null = null;
    let paragraphEnd = 0;
    let paragraphType: SearchableMarkdownBlockType = 'paragraph';
    let inFrontmatter = lines[0]?.trim() === '---';
    let inFence = false;
    let fenceCharacter = '';

    const flushParagraph = () => {
        if (paragraphStart === null || paragraphEnd <= paragraphStart) return;
        sections.push({
            type: paragraphType,
            position: {
                start: { offset: paragraphStart },
                end: { offset: paragraphEnd },
            },
        });
        paragraphStart = null;
        paragraphEnd = 0;
        paragraphType = 'paragraph';
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        const lineStart = offset;
        const lineEnd = lineStart + line.length;
        offset = lineEnd + (index < lines.length - 1 ? 1 : 0);

        if (inFrontmatter) {
            if (index > 0 && (trimmed === '---' || trimmed === '...')) inFrontmatter = false;
            continue;
        }

        const fence = trimmed.match(/^(`{3,}|~{3,})/);
        if (fence) {
            flushParagraph();
            const character = fence[1][0];
            if (!inFence) {
                inFence = true;
                fenceCharacter = character;
            } else if (character === fenceCharacter) {
                inFence = false;
                fenceCharacter = '';
            }
            continue;
        }
        if (inFence) continue;

        if (!trimmed || isFallbackExcludedLine(lines, index)) {
            flushParagraph();
            continue;
        }

        const type = getFallbackBlockType(trimmed);
        if (paragraphStart !== null && type !== paragraphType) flushParagraph();
        if (paragraphStart === null) {
            paragraphStart = lineStart;
            paragraphType = type;
        }
        paragraphEnd = lineEnd;

        // Treat list items and quoted blocks as self-contained contexts. This
        // prevents adjacent bullets or callouts from being merged together.
        if (type !== 'paragraph') flushParagraph();
    }

    flushParagraph();
    return sections;
}

function isFallbackExcludedLine(lines: string[], index: number): boolean {
    const trimmed = lines[index].trim();
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(trimmed)) return true;
    if (/^<\/?(?:script|style|pre|code|table|iframe|canvas|svg)\b/i.test(trimmed)) return true;

    const looksLikeTableRow = trimmed.includes('|');
    const previous = index > 0 ? lines[index - 1].trim() : '';
    const next = index + 1 < lines.length ? lines[index + 1].trim() : '';
    const isDivider = (value: string) => /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(value);
    return looksLikeTableRow && (isDivider(trimmed) || isDivider(previous) || isDivider(next));
}

function getFallbackBlockType(trimmed: string): SearchableMarkdownBlockType {
    if (/^>\s*\[![^\]]+\]/i.test(trimmed)) return 'callout';
    if (/^>/.test(trimmed)) return 'blockquote';
    if (/^(?:[-*+]\s+|\d+[.)]\s+)/.test(trimmed)) return 'list';
    return 'paragraph';
}

function getHiddenRanges(source: string): TextRange[] {
    const ranges: TextRange[] = [];
    addRegexRanges(ranges, source, /<!--[\s\S]*?-->/g);
    addRegexRanges(ranges, source, /%%[\s\S]*?%%/g);
    addRegexRanges(ranges, source, /(`+)[\s\S]*?\1/g);
    addRegexRanges(ranges, source, /!\[\[[^\]]+\]\]/g);
    addRegexRanges(ranges, source, /<https?:\/\/[^>]+>/gi);
    addRegexRanges(ranges, source, /https?:\/\/[^\s)>]+/gi);

    for (const match of source.matchAll(/\]\((?:\\.|[^)])*\)/g)) {
        if (match.index === undefined) continue;
        ranges.push({ start: match.index + 1, end: match.index + match[0].length });
    }

    for (const match of source.matchAll(/\[\[([^\]]+)\]\]/g)) {
        if (match.index === undefined || match.index > 0 && source[match.index - 1] === '!') continue;
        const pipeIndex = match[1].indexOf('|');
        if (pipeIndex === -1) continue;
        ranges.push({ start: match.index + 2, end: match.index + 2 + pipeIndex });
    }

    return ranges;
}

function addRegexRanges(ranges: TextRange[], source: string, pattern: RegExp): void {
    for (const match of source.matchAll(pattern)) {
        if (match.index === undefined) continue;
        ranges.push({ start: match.index, end: match.index + match[0].length });
    }
}

function getSentenceRange(source: string, matchOffset: number, listBlock: boolean): TextRange {
    let searchableStart = 0;
    let searchableEnd = source.length;

    if (listBlock) {
        searchableStart = source.lastIndexOf('\n', matchOffset - 1) + 1;
        const nextLine = source.indexOf('\n', matchOffset);
        searchableEnd = nextLine === -1 ? source.length : nextLine;
    }

    const searchable = source.slice(searchableStart, searchableEnd);
    const relativeMatch = matchOffset - searchableStart;
    const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;

    if (Segmenter) {
        const segments = new Segmenter(undefined, { granularity: 'sentence' }).segment(searchable);
        for (const item of segments) {
            const end = item.index + item.segment.length;
            if (relativeMatch >= item.index && relativeMatch < end) {
                return constrainRange(source, searchableStart + item.index, searchableStart + end, matchOffset);
            }
        }
    }

    const before = searchable.slice(0, relativeMatch);
    const after = searchable.slice(relativeMatch);
    const boundaryBefore = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'), before.lastIndexOf('。'), before.lastIndexOf('！'), before.lastIndexOf('？'));
    const boundaryAfter = after.search(/[.!?。！？]/);
    const start = searchableStart + (boundaryBefore === -1 ? 0 : boundaryBefore + 1);
    const end = searchableStart + (boundaryAfter === -1 ? searchable.length : relativeMatch + boundaryAfter + 1);
    return constrainRange(source, start, end, matchOffset);
}

function constrainRange(source: string, start: number, end: number, matchOffset: number): TextRange {
    if (end - start <= MAX_SENTENCE_LENGTH) return { start, end };

    const halfWindow = Math.floor(MAX_SENTENCE_LENGTH / 2);
    let constrainedStart = Math.max(start, matchOffset - halfWindow);
    let constrainedEnd = Math.min(end, constrainedStart + MAX_SENTENCE_LENGTH);
    constrainedStart = Math.max(start, constrainedEnd - MAX_SENTENCE_LENGTH);

    const leadingSpace = source.indexOf(' ', constrainedStart);
    if (leadingSpace !== -1 && leadingSpace < matchOffset) constrainedStart = leadingSpace + 1;
    const trailingSpace = source.lastIndexOf(' ', constrainedEnd);
    if (trailingSpace > matchOffset) constrainedEnd = trailingSpace;
    return { start: constrainedStart, end: constrainedEnd };
}

function cleanMarkdown(source: string): string {
    return source
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/%%[\s\S]*?%%/g, ' ')
        .replace(/(`+)[\s\S]*?\1/g, ' ')
        .replace(/!\[\[[^\]]+\]\]/g, ' ')
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/\[([^\]]+)\]\((?:\\.|[^)])*\)/g, '$1')
        .replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|>\s*)+/gm, '')
        .replace(/^\s*\[![^\]]+\][+-]?\s*/gim, '')
        .replace(/^\s*#{1,6}\s+/gm, '')
        .replace(/[*_~]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isUsefulSentence(sentence: string, word: string): boolean {
    if (!sentence || sentence.length < word.length + 3) return false;
    if (looksLikeMachineGeneratedLog(sentence)) return false;
    if (/^\s*(?:\{|\[)/.test(sentence) || /^\s*["'][^"']+["']\s*:/.test(sentence)) return false;
    if ((sentence.match(/["'][^"']+["']\s*:/g) || []).length >= 1) return false;
    const letters = sentence.match(/[\p{L}\p{N}]/gu)?.length || 0;
    const markdownNoise = sentence.match(/[{}\[\]<>:=|`]/g)?.length || 0;
    return letters >= Math.max(6, word.length + 2) && markdownNoise / sentence.length < 0.12;
}

function looksLikeMachineGeneratedLog(sentence: string): boolean {
    const value = sentence.trim();
    if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\b/i.test(value)) return true;
    if (/^\[(?:debug|info|warn|warning|error|success|trace)\]\s*/i.test(value)) return true;
    if (/^(?:work done|work completed|progress|status|result|output|build|task|step|timestamp|started|finished|completed|updated|created|words|remaining template residue)\s*:/i.test(value)) return true;

    const separators = value.match(/[\\/|]/g)?.length || 0;
    const words = value.match(/[\p{L}\p{N}]+/gu)?.length || 0;
    return separators >= 3 && words < 18;
}

function getContextQuality(sentence: string, blockType: SearchableMarkdownBlockType): number {
    const naturalLanguageBonus = /[.!?。！？]$/.test(sentence) ? 18 : 0;
    const lengthBonus = sentence.length >= 30 && sentence.length <= 220 ? 12 : 0;
    return BLOCK_QUALITY[blockType] + naturalLanguageBonus + lengthBonus;
}

function getHeadingAtOffset(cache: CachedMetadata | null, offset: number): string | undefined {
    let heading: string | undefined;
    for (const item of cache?.headings || []) {
        if (item.position.start.offset > offset) break;
        heading = item.heading;
    }
    return heading;
}

function hasWordBoundaries(text: string, offset: number, length: number): boolean {
    const before = offset > 0 ? text[offset - 1] : '';
    const after = offset + length < text.length ? text[offset + length] : '';
    return !isWordCharacter(before) && !isWordCharacter(after);
}

function isWordCharacter(character: string): boolean {
    return character !== '' && /[\p{L}\p{N}_]/u.test(character);
}
