import type { WordDefinition } from '../utils/types';
import { WebWordIndex } from './web-word-index';
import { validateSurfaceEvent } from './page-surface';
import { Platform, WorkspaceLeaf } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { pageScript } from './page-runtime';
import { buildWebVocabulary, matchWebTexts, webHighlightCSS, resolveWebClick } from './web-vocabulary';

interface Webview extends HTMLElement {
    getURL(): string;
    getZoomFactor(): number;
    executeJavaScript(code: string): Promise<unknown>;
    insertCSS(css: string): Promise<string>;
    removeInsertedCSS(key: string): Promise<void>;
}
interface Session {
    words: WordDefinition[]; index: WebWordIndex; summaryRevision: number; signature: string; view: Webview; leaf: WorkspaceLeaf; clickTicket: number; urgent: boolean; issued: Set<number>; navigation: number; revision: number; reset: boolean; ready: boolean; disposed: boolean;
    cssKey?: string; timer?: number; task?: Promise<void>; unbind: () => void;
}

/** The only module that depends on the desktop core Web viewer's internal DOM. */
export class WebHighlighter {
    private sessions = new Map<Webview, Session>();
    private vocabulary = buildWebVocabulary([], color => color);
    private css = '';
    private stopped = false;
    private clickSequence = 0;
    private readingLeaf: WorkspaceLeaf | null = null;
    private namespace = `hiwords-web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    private retiring = new Set<Webview>();

    constructor(private plugin: HiWordsPlugin) {
        if (!Platform.isDesktopApp) return;
        plugin.register(() => this.destroy());
        this.readingLeaf = plugin.app.workspace.activeLeaf;
        plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', leaf => {
            this.closePopovers();
            if (leaf?.view.getViewType() === 'hi-words-sidebar') return;
            this.readingLeaf = leaf;
            this.clickSequence++;
            this.notifySidebar();
        }));
        plugin.registerEvent(plugin.app.workspace.on('layout-change', () => this.discover()));
        plugin.registerInterval(window.setInterval(() => this.discover(), 1000));
        plugin.app.workspace.onLayoutReady(() => this.refresh());
    }

    refresh(): void {
        if (!Platform.isDesktopApp || this.stopped) return;
        this.closePopovers();
        if (!this.enabled()) { this.discover(); return; }
        const style = getComputedStyle(document.body);
        this.vocabulary = buildWebVocabulary(this.plugin.vocabularyManager.getStudyDefinitions(), color => {
            const variable = /^var\((--[\w-]+)\)$/.exec(color);
            const resolved = variable ? style.getPropertyValue(variable[1]).trim() : color;
            // Only a color value can enter the injected stylesheet, never arbitrary CSS.
            return resolved && !/[;{}<>]/.test(resolved) && CSS.supports('color', resolved) ? resolved : '#8b8b8b';
        });
        this.css = webHighlightCSS(this.vocabulary.colors, this.plugin.settings.highlightStyle, this.namespace);
        for (const session of this.sessions.values()) { session.revision++; session.reset = true; }
        this.discover();
        for (const session of this.sessions.values()) this.schedule(session, 0);
    }

    private enabled(): boolean {
        return !this.stopped && this.plugin.settings.enableWebHighlight && (this.plugin.settings.enableAutoHighlight || this.plugin.app.workspace.getLeavesOfType('hi-words-sidebar').length > 0);
    }

    private discover(): void {
        if (this.stopped) return;
        const found = new Set<Webview>();
        if (this.enabled()) {
            for (const leaf of this.plugin.app.workspace.getLeavesOfType('webviewer')) {
                // Works for split panes and pop-out windows; deliberately excludes Canvas/third-party browsers.
                leaf.view.containerEl.querySelectorAll('webview').forEach(element => {
                    const view = element as Webview;
                    if (typeof view.executeJavaScript !== 'function' || typeof view.insertCSS !== 'function' || typeof view.getURL !== 'function') return;
                    found.add(view);
                    if (!this.sessions.has(view) && !this.retiring.has(view)) this.attach(view, leaf);
                });
            }
        }
        for (const [view, session] of this.sessions) {
            if (!found.has(view)) { this.sessions.delete(view); this.dispose(session); }
        }
    }

    private attach(view: Webview, leaf: WorkspaceLeaf): void {
        const session: Session = { words: [], index: new WebWordIndex(), summaryRevision: 0, signature: '', view, leaf, clickTicket: 0, urgent: false, issued: new Set(), navigation: 0, revision: 0, reset: true, ready: true, disposed: false, unbind: () => {} };
        const navigate = (event: Event) => {
            const navigation = event as Event & { isMainFrame?: boolean; isInPlace?: boolean };
            if (navigation.isMainFrame === false) return;
            session.navigation++;
            session.index.clear(); session.words = []; session.signature = ''; session.summaryRevision++;
            this.notifySidebar();
            this.closePopovers();
            this.plugin.clearWebWordInSidebar(leaf);
            if (navigation.isInPlace) {
                session.revision++; session.reset = true;
                this.schedule(session, 0);
                return;
            }
            session.revision++; session.reset = true; session.ready = false;
        };
        const ready = () => {
            session.revision++; session.reset = true; session.ready = true;
            this.schedule(session, 0);
        };
        const signal = (event: Event) => {
            const message = (event as Event & { message?: string }).message;
            if (message !== `${this.namespace}:click` && message !== `${this.namespace}:surface`) return;
            if (this.readingLeaf && this.readingLeaf !== session.leaf) return;
            if (message === `${this.namespace}:click`) session.clickTicket = ++this.clickSequence;
            session.urgent = true;
            this.schedule(session, 0);
        };
        view.addEventListener('console-message', signal);
        view.addEventListener('did-start-navigation', navigate);
        view.addEventListener('dom-ready', ready);
        session.unbind = () => {
            view.removeEventListener('console-message', signal);
            view.removeEventListener('did-start-navigation', navigate);
            view.removeEventListener('dom-ready', ready);
        };
        this.sessions.set(view, session);
        this.schedule(session, 0);
    }

    private schedule(session: Session, delay: number): void {
        if (session.disposed || session.task) return;
        if (session.timer !== undefined) window.clearTimeout(session.timer);
        session.timer = window.setTimeout(() => {
            session.timer = undefined;
            session.urgent = false;
            let nextDelay = this.readingLeaf === session.leaf ? 150 : 1000;
            session.task = this.update(session).then(pending => { if (pending) nextDelay = 30; }).catch(() => {
                // Navigation, destroyed renderers, and unsupported Obsidian versions may reject Electron calls.
                session.reset = true;
            }).finally(() => {
                session.task = undefined;
                this.schedule(session, session.urgent ? 0 : nextDelay);
            });
        }, delay);
    }

    private async update(session: Session): Promise<boolean> {
        if (!this.enabled() || !session.ready || !session.view.isConnected) return false;
        if (!/^https?:\/\//i.test(session.view.getURL())) return false;
        const revision = session.revision;
        const current = () => !session.disposed && session.revision === revision && this.enabled();
        const vocabulary = this.vocabulary;
        const reset = session.reset;
        if (reset) {
            session.issued.clear();
            session.index.clear();
            if (session.cssKey) await session.view.removeInsertedCSS(session.cssKey).catch(() => {});
            session.cssKey = await session.view.insertCSS(this.css);
            if (!current()) return true;
        }
        const result = await session.view.executeJavaScript(pageScript({ action: reset ? 'reset' : 'read', generation: revision }, this.namespace));
        if (!current()) return true;
        session.reset = false;
        if (!result || typeof result !== 'object') return false;
        const snapshot = result as { supported?: boolean; nodes?: unknown; pending?: boolean; click?: unknown; surface?: unknown; removed?: unknown; restarted?: boolean };
        if (!snapshot.supported) return false;
        const definition = resolveWebClick(snapshot.click, revision, vocabulary.tokens, session.issued);
        if (definition) { this.closePopovers(); this.openDetails(session, definition); }
        this.showSurface(session, snapshot.surface);
        const nodes = matchWebTexts(snapshot.nodes, vocabulary.trie);
        if (snapshot.restarted) session.index.clear();
        session.index.update(nodes, snapshot.removed);
        if (reset || snapshot.restarted || nodes.length || (Array.isArray(snapshot.removed) && snapshot.removed.length)) {
            const words = session.index.words(vocabulary.tokens);
            const signature = JSON.stringify(words.map(word => [word.studyKey, word.source, word.nodeId, word.word, word.mastered, word.definition, word.color]));
            session.words = words;
            if (signature !== session.signature || reset) {
                session.signature = signature; session.summaryRevision++;
                this.notifySidebar();
            }
        }
        const painted = nodes.map(node => ({ ...node, ranges: node.ranges.filter(range => {
            const word = vocabulary.tokens.get(range.token);
            return this.plugin.settings.enableAutoHighlight && (!this.plugin.settings.enableMasteredFeature || !word?.mastered);
        }) }));
        for (const node of painted) for (const range of node.ranges) session.issued.add(range.token);
        if (painted.length) await session.view.executeJavaScript(pageScript({ action: 'apply', nodes: painted, generation: revision }, this.namespace));
        return snapshot.pending === true;
    }

    getPageWords(leaf?: WorkspaceLeaf) {
        const selected = leaf || this.readingLeaf;
        if (selected?.view.getViewType() !== 'webviewer') return null;
        const session = [...this.sessions.values()].find(item => item.leaf === selected && !item.disposed);
        return { leaf: selected, url: session?.view.getURL() || '', revision: session?.summaryRevision ?? -1,
            words: session?.words || [] };
    }

    private notifySidebar(): void {
        this.plugin.refreshWebSidebar();
    }

    private showSurface(session: Session, value: unknown): void {
        if (this.readingLeaf !== session.leaf) return;
        const event = validateSurfaceEvent(value, session.revision);
        if (!event) return;
        if (event.kind === 'hide') {
            this.plugin.definitionPopover.closeForOwner(this, !event.immediate);
            this.plugin.selectionTranslatePopover.closeForOwner(this);
            return;
        }
        const revision = session.revision;
        const url = session.view.getURL();
        const current = () => this.enabled() && !session.disposed && revision === session.revision
            && this.readingLeaf === session.leaf && url === session.view.getURL();
        const host = session.view.getBoundingClientRect();
        const zoom = session.view.getZoomFactor();
        const rect = { left: host.left + event.rect.left * zoom, right: host.left + event.rect.right * zoom,
            top: host.top + event.rect.top * zoom, bottom: host.top + event.rect.bottom * zoom };
        if (rect.bottom < host.top || rect.top > host.bottom || rect.right < host.left || rect.left > host.right) return;
        const context = { owner: this, document: session.view.ownerDocument, rect, sentence: event.sentence || '', sourcePath: url, isCurrent: current, hostRect: () => session.view.getBoundingClientRect() };
        if (event.kind === 'hover') {
            if (!this.plugin.settings.showDefinitionOnHover) return;
            const definition = resolveWebClick(event, revision, this.vocabulary.tokens, session.issued);
            if (definition) {
                this.plugin.selectionTranslatePopover.closeForOwner(this);
                this.plugin.definitionPopover.showDefinition(definition, { ...context, onOpenDetail: () => this.openDetails(session, definition) });
            }
        } else {
            this.plugin.definitionPopover.closeForOwner(this);
            this.plugin.selectionTranslatePopover.showSelection(event.text!, context);
        }
    }

    private closePopovers(): void {
        this.plugin.definitionPopover.closeForOwner(this);
        this.plugin.selectionTranslatePopover.closeForOwner(this);
    }

    private openDetails(session: Session, definition: import('../utils/types').WordDefinition): void {
        if (this.readingLeaf && this.readingLeaf !== session.leaf) return;
        const sequence = session.clickTicket || ++this.clickSequence;
        session.clickTicket = 0;
        if (sequence !== this.clickSequence) return;
        const navigation = session.navigation;
        const url = session.view.getURL();
        const current = () => {
            const active = this.plugin.app.workspace.activeLeaf;
            return this.enabled() && !session.disposed && sequence === this.clickSequence
                && navigation === session.navigation && session.view.getURL() === url
                && (!active || active === session.leaf || active.view.getViewType() === 'hi-words-sidebar');
        };
        void this.plugin.showWordInSidebar(definition, { type: 'web', leaf: session.leaf, url }, current).catch(error => {
            console.error('HiWords failed to open web word details:', error);
        });
    }

    private dispose(session: Session): void {
        session.disposed = true;
        this.closePopovers();
        this.plugin.clearWebWordInSidebar(session.leaf);
        this.retiring.add(session.view);
        session.unbind();
        if (session.timer !== undefined) window.clearTimeout(session.timer);
        // Queue cleanup after in-flight injection so disabling cannot leave late highlights behind.
        void (session.task || Promise.resolve()).then(async () => {
            await session.view.executeJavaScript(pageScript({ action: 'stop' }, this.namespace)).catch(() => {});
            if (session.cssKey) await session.view.removeInsertedCSS(session.cssKey).catch(() => {});
        }).catch(() => {}).finally(() => {
            this.retiring.delete(session.view);
            this.discover();
        });
    }

    private destroy(): void {
        this.stopped = true;
        for (const session of this.sessions.values()) this.dispose(session);
        this.sessions.clear();
    }
}
