import { App, MarkdownView, TFile } from 'obsidian';
import { extractMarkdownContexts, SearchableMarkdownBlockType } from './markdown-context-extractor';

export interface VaultWordContext {
    file: TFile;
    sentence: string;
    line: number;
    offset: number;
    heading?: string;
    blockType: SearchableMarkdownBlockType;
    score: number;
}

export interface VaultContextPageOptions {
    pageSize?: number;
    searchWholeVault?: boolean;
    reset?: boolean;
    sourcePath?: string;
    isCancelled?: () => boolean;
}

export interface VaultContextPage {
    results: VaultWordContext[];
    hasMore: boolean;
    canSearchWholeVault: boolean;
    scope: 'quick' | 'vault';
}

interface SearchSession {
    key: string;
    word: string;
    currentPath: string;
    relationships: Set<string>;
    quickFiles: TFile[];
    vaultFiles: TFile[];
    quickCursor: number;
    vaultCursor: number;
    quickBuffer: VaultWordContext[];
    vaultBuffer: VaultWordContext[];
    fileCounts: Map<string, number>;
    seenSentences: Set<string>;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_CONTEXTS_PER_FILE = 5;
const RECENT_FILE_LIMIT = 200;
const RELATED_FILE_LIMIT = 160;
const SAME_FOLDER_FILE_LIMIT = 160;
const QUICK_SCOPE_FILE_LIMIT = 400;
const READ_BATCH_SIZE = 8;
const MAX_SEARCHABLE_FILE_SIZE = 2 * 1024 * 1024;
const EXCLUDED_PATH_SEGMENTS = new Set(['.git', '.obsidian', 'node_modules']);

export class VaultContextService {
    private session: SearchSession | null = null;

    constructor(private readonly app: App) {}

    async findPage(word: string, options: VaultContextPageOptions = {}): Promise<VaultContextPage> {
        const normalizedWord = word.trim().toLocaleLowerCase();
        const scope = options.searchWholeVault ? 'vault' : 'quick';
        if (!normalizedWord) return { results: [], hasMore: false, canSearchWholeVault: false, scope };

        const sourceFile = options.sourcePath
            ? this.app.vault.getAbstractFileByPath(options.sourcePath)
            : null;
        const activeFile = this.app.workspace.getActiveFile();
        const currentPath = sourceFile instanceof TFile && sourceFile.extension === 'md'
            ? sourceFile.path
            : activeFile?.extension === 'md' ? activeFile.path : '';
        const key = `${normalizedWord}\u0000${currentPath}`;
        if (options.reset || !this.session || this.session.key !== key) {
            this.session = this.createSession(key, normalizedWord, currentPath);
        }

        const session = this.session;
        const pageSize = Math.max(1, options.pageSize || DEFAULT_PAGE_SIZE);
        const files = scope === 'quick' ? session.quickFiles : session.vaultFiles;
        const cursorKey = scope === 'quick' ? 'quickCursor' : 'vaultCursor';
        const buffer = scope === 'quick' ? session.quickBuffer : session.vaultBuffer;

        while (buffer.length <= pageSize && session[cursorKey] < files.length) {
            if (options.isCancelled?.()) {
                return { results: [], hasMore: false, canSearchWholeVault: false, scope };
            }

            const start = session[cursorKey];
            const batch = files.slice(start, start + READ_BATCH_SIZE);
            session[cursorKey] += batch.length;
            const batchResults = await Promise.all(batch.map(file => (
                this.findInFile(file, normalizedWord, currentPath, session.relationships)
            )));
            this.addCandidates(session, buffer, batchResults.flat());
            await this.yieldToMainThread();
        }

        if (options.isCancelled?.()) {
            return { results: [], hasMore: false, canSearchWholeVault: false, scope };
        }

        const results = buffer.splice(0, pageSize);
        const hasMore = buffer.length > 0 || session[cursorKey] < files.length;
        return {
            results,
            hasMore,
            canSearchWholeVault: scope === 'quick' && !hasMore && session.vaultFiles.length > 0,
            scope,
        };
    }

    async open(context: VaultWordContext): Promise<void> {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(context.file);

        window.setTimeout(() => {
            const view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || view.file?.path !== context.file.path) return;

            const position = view.editor.offsetToPos(context.offset);
            view.editor.setCursor(position);
            view.editor.scrollIntoView({ from: position, to: position }, true);
            view.editor.focus();
        }, 80);
    }

    destroy(): void {
        this.session = null;
    }

    private async findInFile(
        file: TFile,
        word: string,
        currentPath: string,
        relationships: Set<string>
    ): Promise<VaultWordContext[]> {
        try {
            const liveText = file.path === currentPath ? this.getOpenEditorText(file.path) : null;
            const text = liveText ?? await this.app.vault.cachedRead(file);
            if (!text.toLocaleLowerCase().includes(word.toLocaleLowerCase())) return [];

            // Metadata offsets can lag behind unsaved editor changes. The
            // extractor's safe fallback scanner is more reliable for live text.
            const cache = liveText === null ? this.app.metadataCache.getFileCache(file) : null;
            const contexts = extractMarkdownContexts(text, word, cache, 8);
            return contexts.map(context => ({
                file,
                sentence: context.sentence,
                line: context.line,
                offset: context.offset,
                heading: context.heading,
                blockType: context.blockType,
                score: context.quality + this.getFileScore(file, currentPath, relationships),
            }));
        } catch (error) {
            console.error(`HiWords failed to search context in ${file.path}:`, error);
            return [];
        }
    }

    private addCandidates(session: SearchSession, buffer: VaultWordContext[], candidates: VaultWordContext[]): void {
        candidates.sort((left, right) => right.score - left.score || right.file.stat.mtime - left.file.stat.mtime);

        for (const candidate of candidates) {
            const sentenceKey = candidate.sentence.toLocaleLowerCase().replace(/\s+/g, ' ');
            if (session.seenSentences.has(sentenceKey)) continue;

            const path = candidate.file.path;
            const count = session.fileCounts.get(path) || 0;
            if (count >= MAX_CONTEXTS_PER_FILE) continue;

            session.seenSentences.add(sentenceKey);
            session.fileCounts.set(path, count + 1);
            buffer.push(candidate);
        }
    }

    private createSession(key: string, word: string, currentPath: string): SearchSession {
        const files = this.app.vault.getMarkdownFiles().filter(file => this.shouldSearchFile(file));
        const byPath = new Map(files.map(file => [file.path, file]));
        const relationships = this.getRelatedNotePaths(currentPath);
        const currentFolder = this.getFolder(currentPath);
        const seen = new Set<string>();
        const quickFiles: TFile[] = [];
        const addFiles = (items: TFile[], limit = items.length) => {
            for (const file of items.slice(0, limit)) {
                if (seen.has(file.path) || quickFiles.length >= QUICK_SCOPE_FILE_LIMIT) continue;
                seen.add(file.path);
                quickFiles.push(file);
            }
        };

        const byRelevance = (left: TFile, right: TFile) => (
            this.getFileScore(right, currentPath, relationships) - this.getFileScore(left, currentPath, relationships)
        );
        const byRecent = (left: TFile, right: TFile) => right.stat.mtime - left.stat.mtime;

        const activeFile = byPath.get(currentPath);
        if (activeFile) addFiles([activeFile]);
        addFiles([...relationships].map(path => byPath.get(path)).filter((file): file is TFile => !!file).sort(byRelevance), RELATED_FILE_LIMIT);
        addFiles(files.filter(file => this.getFolder(file.path) === currentFolder).sort(byRelevance), SAME_FOLDER_FILE_LIMIT);
        addFiles([...files].sort(byRecent), RECENT_FILE_LIMIT);

        const vaultFiles = files.filter(file => !seen.has(file.path)).sort(byRecent);
        return {
            key,
            word,
            currentPath,
            relationships,
            quickFiles,
            vaultFiles,
            quickCursor: 0,
            vaultCursor: 0,
            quickBuffer: [],
            vaultBuffer: [],
            fileCounts: new Map(),
            seenSentences: new Set(),
        };
    }

    private getFolder(path: string): string {
        return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    }

    private async yieldToMainThread(): Promise<void> {
        await new Promise<void>(resolve => window.setTimeout(resolve, 0));
    }

    private getOpenEditorText(path: string): string | null {
        for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.path === path) {
                return view.editor.getValue();
            }
        }
        return null;
    }

    private getFileScore(file: TFile, currentPath: string, relationships: Set<string>): number {
        let score = 0;
        if (file.path === currentPath) score += 1000;
        else if (relationships.has(file.path)) score += 320;

        const currentFolder = currentPath.includes('/') ? currentPath.slice(0, currentPath.lastIndexOf('/')) : '';
        const fileFolder = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
        if (fileFolder === currentFolder) score += 90;

        const ageInDays = Math.max(0, (Date.now() - file.stat.mtime) / 86_400_000);
        score += Math.max(0, 35 - Math.min(35, ageInDays / 7));
        return score;
    }

    private getRelatedNotePaths(currentPath: string): Set<string> {
        const related = new Set<string>();
        if (!currentPath) return related;

        for (const path of Object.keys(this.app.metadataCache.resolvedLinks[currentPath] || {})) related.add(path);
        for (const [sourcePath, destinations] of Object.entries(this.app.metadataCache.resolvedLinks)) {
            if (currentPath in destinations) related.add(sourcePath);
        }
        return related;
    }

    private shouldSearchFile(file: TFile): boolean {
        if (file.extension.toLocaleLowerCase() !== 'md') return false;
        if (file.stat.size > MAX_SEARCHABLE_FILE_SIZE) return false;
        return !file.path.split('/').some(segment => EXCLUDED_PATH_SEGMENTS.has(segment) || segment.startsWith('.'));
    }

}
