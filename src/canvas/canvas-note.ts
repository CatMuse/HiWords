import { App, TFile } from 'obsidian';
import type { HiWordsSentence } from '../schema/hiwords';
import type { CanvasData, CanvasNode } from '../utils';

const SECTION_SEPARATOR = /\n\s*---\s*\n/;
const NOTE_TITLE = /^(note|notes|备注|我的备注)$/i;
const SENTENCES_TITLE = /^(sentence|sentences|例句)$/i;

export function isCanvasNoteTitle(title: string): boolean {
    return NOTE_TITLE.test(title.trim());
}

export function getCanvasNoteFromSections(
    sections?: Array<{ title: string; content: string }>
): string {
    return sections?.find(section => isCanvasNoteTitle(section.title))?.content.trim() || '';
}

export function setCanvasNodeNote(text: string, note: string): string {
    return setManagedSection(text, isCanvasNoteTitle, 'Note', note.trim());
}

export function getCanvasSentencesFromSections(
    sections?: Array<{ title: string; content: string }>
): HiWordsSentence[] {
    const content = sections?.find(section => SENTENCES_TITLE.test(section.title.trim()))?.content.trim();
    if (!content) return [];

    return content.split(/\n\s*\n/)
        .map(block => block.split('\n')
            .map(line => line.replace(/^>\s?/, '').trim())
            .filter(Boolean))
        .map((lines, index) => {
            const text = lines[0] || '';
            const sourceLine = lines.find(line => /^source:\s*/i.test(line));
            const translation = lines.slice(1)
                .filter(line => !/^source:\s*/i.test(line))
                .join(' ')
                .trim();
            return {
                id: `canvas-sentence-${index}`,
                text,
                translation: translation || undefined,
                source: sourceLine?.replace(/^source:\s*/i, '').trim() || undefined,
            };
        })
        .filter(sentence => !!sentence.text);
}

export function setCanvasNodeSentences(text: string, sentences: HiWordsSentence[]): string {
    const content = sentences.map(sentence => [
        `> ${singleLine(sentence.text)}`,
        sentence.translation ? `> ${singleLine(sentence.translation)}` : '',
        sentence.source ? `> Source: ${singleLine(sentence.source)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');
    return setManagedSection(text, title => SENTENCES_TITLE.test(title.trim()), 'Sentences', content);
}

export async function updateCanvasTextNodeNote(
    app: App,
    source: string,
    nodeId: string,
    note: string
): Promise<'updated' | 'not-text' | 'missing' | 'invalid'> {
    return updateCanvasTextNode(app, source, nodeId, text => setCanvasNodeNote(text, note));
}

export async function updateCanvasTextNodeSentences(
    app: App,
    source: string,
    nodeId: string,
    sentences: HiWordsSentence[] | ((current: HiWordsSentence[]) => HiWordsSentence[])
): Promise<'updated' | 'not-text' | 'missing' | 'invalid'> {
    return updateCanvasTextNode(app, source, nodeId, text => {
        const sections = text.split(SECTION_SEPARATOR).map(part => {
            const [heading, ...body] = part.trim().split('\n');
            const match = heading.match(/^\*\*(.+?)\*\*$/);
            return { title: match?.[1] || '', content: body.join('\n') };
        });
        const next = typeof sentences === 'function'
            ? sentences(getCanvasSentencesFromSections(sections))
            : sentences;
        return setCanvasNodeSentences(text, next);
    });
}

export async function updateCanvasTextNodeContent(
    app: App,
    source: string,
    nodeId: string,
    text: string
): Promise<boolean> {
    return await updateCanvasTextNode(app, source, nodeId, () => text) === 'updated';
}

export async function deleteCanvasNodeWithoutLayout(
    app: App,
    source: string,
    nodeId: string
): Promise<boolean> {
    const file = getCanvasFile(app, source);
    if (!file) return false;

    let removed = false;
    await app.vault.process(file, current => {
        const canvas = parseCanvas(current);
        const nextNodes = canvas.nodes.filter(node => node.id !== nodeId);
        if (nextNodes.length === canvas.nodes.length) return current;
        canvas.nodes = nextNodes;
        canvas.edges = canvas.edges.filter(edge => edge.fromNode !== nodeId && edge.toNode !== nodeId);
        removed = true;
        return serializeCanvas(canvas);
    });
    return removed;
}

export async function addCanvasNoteNodeWithoutLayout(
    app: App,
    source: string,
    sourceNodeId: string,
    word: string,
    note: string,
    aliases?: string[]
): Promise<string | null> {
    const file = getCanvasFile(app, source);
    if (!file) return null;

    let createdId: string | null = null;
    await app.vault.process(file, current => {
        const canvas = parseCanvas(current);
        const sourceNode = canvas.nodes.find(node => node.id === sourceNodeId);
        if (!sourceNode) return current;

        const id = createCanvasId();
        const bottom = canvas.nodes.reduce(
            (value, node) => Math.max(value, node.y + node.height),
            sourceNode.y + sourceNode.height
        );
        const aliasLine = aliases?.map(alias => alias.trim()).filter(Boolean).join(', ');
        const text = [word.trim(), aliasLine ? `*${aliasLine}*` : '', `**Note**\n${note.trim()}`]
            .filter(Boolean)
            .join('\n\n');
        const node: CanvasNode = {
            id,
            type: 'text',
            x: sourceNode.x,
            y: bottom + 20,
            width: Math.max(260, sourceNode.width),
            height: 140,
            text,
        };
        canvas.nodes.push(node);
        createdId = id;
        return serializeCanvas(canvas);
    });
    return createdId;
}

async function updateCanvasTextNode(
    app: App,
    source: string,
    nodeId: string,
    update: (text: string) => string
): Promise<'updated' | 'not-text' | 'missing' | 'invalid'> {
    const file = getCanvasFile(app, source);
    if (!file) return 'invalid';

    let result: 'updated' | 'not-text' | 'missing' = 'missing';
    await app.vault.process(file, current => {
        const canvas = parseCanvas(current);
        const node = canvas.nodes?.find(item => item.id === nodeId);
        if (!node) return current;
        if (node.type !== 'text') {
            result = 'not-text';
            return current;
        }
        node.text = update(node.text || '');
        result = 'updated';
        return serializeCanvas(canvas);
    });
    return result;
}

function getCanvasFile(app: App, source: string): TFile | null {
    const file = app.vault.getAbstractFileByPath(source);
    return file instanceof TFile && file.extension === 'canvas' ? file : null;
}

function parseCanvas(value: string): CanvasData {
    return JSON.parse(value || '{"nodes":[],"edges":[]}') as CanvasData;
}

function serializeCanvas(canvas: CanvasData): string {
    return `${JSON.stringify(canvas, null, 2)}\n`;
}

function createCanvasId(): string {
    const bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function setManagedSection(
    text: string,
    matchesTitle: (title: string) => boolean,
    title: string,
    content: string
): string {
    const parts = text.split(SECTION_SEPARATOR)
        .map(part => part.trim())
        .filter(Boolean)
        .filter(part => !sectionHasTitle(part, matchesTitle));
    if (content) parts.push(`**${title}**\n${content}`);
    return parts.join('\n\n---\n\n');
}

function sectionHasTitle(section: string, matchesTitle: (title: string) => boolean): boolean {
    const firstLine = section.split('\n', 1)[0]?.trim() || '';
    const match = firstLine.match(/^\*\*(.+?)\*\*$/);
    return !!match && matchesTitle(match[1]);
}

function singleLine(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}
