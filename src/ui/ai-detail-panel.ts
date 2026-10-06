import type { LexicalEntry } from '../lexical/types';
import { Component, setIcon } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { TranslationService } from '../services/translation-service';
import { translationDefinition } from '../services/translation-result';
import { parseDetailedTranslationResult } from '../services/detailed-translation-result';
import { dictText } from '../dictionary/text';
import { renderAiTranslationResult } from './ai-translation-result';
import { aiDetailPosition } from './ai-detail-position';
import { registerAiDetailInteractions } from './ai-detail-interactions';

export interface AiDetailContext {
    document: Document; owner?: object; sentence: string; baseDefinition?: string; isCurrent: () => boolean;
    hostRect?: () => { left: number; top: number; right: number; bottom: number };
}

/** A persistent floating reading panel. Only explicit open/retry initiates a request. */
export class AiDetailPanel extends Component {
    private root?: HTMLElement;
    private listeners?: Component;
    private revision = 0;
    private context?: AiDetailContext;
    private key = '';
    private service: TranslationService;
    constructor(private plugin: HiWordsPlugin) {
        super(); this.service = new TranslationService(plugin.settings, () => plugin.getAIAPIKey());
    }
    onload(): void {
        this.registerEvent(this.plugin.app.workspace.on('active-leaf-change', () => this.close()));
        this.registerEvent(this.plugin.app.workspace.on('file-open', () => this.close()));
    }
    contains(target: Node): boolean { return !!this.root?.contains(target); }
    closeForOwner(owner: object): void {
        if (this.context?.owner === owner && !this.context.isCurrent()) this.close();
    }
    open(text: string, context: AiDetailContext): void {
        const key = JSON.stringify([text, context.sentence]);
        if (this.root && this.key === key && this.context?.document === context.document && context.isCurrent()) return;
        this.close(); this.service.updateSettings(this.plugin.settings); this.key = key; this.context = context;
        const doc = context.document, win = doc.defaultView;
        if (!win || !context.isCurrent()) return;
        const root = doc.createDocumentFragment().createDiv({ cls: 'hi-words-ai-detail-panel' }); this.root = root;
        root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'false'); root.setAttribute('aria-label', dictText('aiDetail'));
        const header = root.createDiv({ cls: 'hi-words-ai-detail-header' });
        const heading = header.createDiv({ cls: 'hi-words-ai-detail-heading' });
        heading.createDiv({ cls: 'hi-words-ai-detail-title', text: dictText('aiDetail') });
        const actions = header.createDiv({ cls: 'hi-words-word-popover-actions' });
        const add = actions.createEl('button', { cls: 'hi-words-card-action', attr: { 'aria-label': dictText('add') } });
        add.disabled = true; setIcon(add, 'book-plus');
        const pin = actions.createEl('button', { cls: 'hi-words-card-action hi-words-ai-detail-pin' });
        root.createDiv({ cls: 'hi-words-ai-detail-source', text });
        const summary = context.baseDefinition ? root.createDiv({ cls: 'hi-words-ai-detail-summary', text: context.baseDefinition }) : undefined;
        const body = root.createDiv({ cls: 'hi-words-ai-detail-body' });
        let definition = '', busy = false;
        let lexical: LexicalEntry | undefined;
        add.addEventListener('click', () => {
            if (definition && context.isCurrent()) this.plugin.addOrEditWord(text, context.sentence, definition, lexical);
        });
        root.addEventListener('mousedown', event => event.stopPropagation());
        doc.body.appendChild(root);
        const listeners = new Component(); this.addChild(listeners); this.listeners = listeners;
        const place = registerAiDetailInteractions(listeners, doc, root, header, pin, () => this.close());
        pin.focus();
        const position = () => {
            const host = context.hostRect?.() || { left: 0, top: 70, right: win.innerWidth, bottom: win.innerHeight - 24 };
            const rect = aiDetailPosition(host, { width: win.innerWidth, height: win.innerHeight });
            place(rect);
        };
        position();
        listeners.registerDomEvent(win, 'resize', position);
        listeners.registerDomEvent(doc, 'keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); this.close(); } });
        const load = async () => {
            if (busy || !context.isCurrent() || this.root !== root) return;
            busy = true; definition = ''; lexical = undefined; add.disabled = true; body.empty();
            body.createDiv({ cls: 'hi-words-ai-detail-loading', text: dictText('aiGenerating') });
            const revision = ++this.revision;
            const current = () => this.revision === revision && this.root === root && context.isCurrent();
            try {
                const raw = await this.service.translateDetailed(text, context.sentence);
                if (!current()) return;
                const result = parseDetailedTranslationResult(raw, text, { ...this.plugin.settings.aiService, translationLanguage: this.plugin.settings.selectionTranslate.targetLang });
                if (!result) { this.service.clearCache(); throw new Error(dictText('aiInvalidDetails')); }
                if (summary) summary.hidden = result.kind !== 'text';
                renderAiTranslationResult(body, result);
                lexical = result.kind === 'word' ? result : undefined;
                definition = translationDefinition(result) || context.baseDefinition || ''; add.disabled = !definition;
            } catch (error) {
                if (!current()) return;
                body.empty(); body.createDiv({ cls: 'hi-words-ai-detail-error', text: error instanceof Error ? error.message : dictText('aiFailed') });
                const retry = body.createEl('button', { text: dictText('retry') });
                retry.addEventListener('click', () => { void load(); });
            } finally { busy = false; }
        };
        void load();
    }
    close(): void {
        this.revision++; this.service.abort(); this.root?.remove(); this.root = undefined; this.context = undefined;
        if (this.listeners) { this.removeChild(this.listeners); this.listeners = undefined; }
    }
    onunload(): void { this.close(); }
}
