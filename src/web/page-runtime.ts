import { installWebSurface } from './page-surface';
import type { WebSurfaceEvent } from './page-surface';
import { installWebInteractions } from './page-interactions';
import type { WebWordClick } from './page-interactions';

/** Runs in the guest page. Keep this function self-contained: it is serialized into the webview. */
export interface PageText { id: number; text: string }
export interface PageMatch extends PageText { ranges: { from: number; to: number; color: number; token: number }[] }
export type PageCommand = { action: 'read' | 'reset' | 'stop'; generation?: number } | { action: 'apply'; nodes: PageMatch[]; generation?: number };

export function webHighlightRuntime(command: PageCommand, namespace = 'hiwords-web', install?: typeof installWebInteractions, surface?: typeof installWebSurface): { supported: boolean; nodes: PageText[]; pending: boolean; removed?: number[]; restarted?: boolean; click?: WebWordClick; surface?: WebSurfaceEvent } {
    type HighlightSet = Set<Range>;
    type Entry = { node: Text; text: string; ranges: { range: Range; color: number; token: number }[] };
    type State = {
        removed: Set<number>; entries: Map<number, Entry>; ids: WeakMap<Text, number>; nextId: number;
        roots: Set<Node>; walker: TreeWalker | null; root: Node | null;
        groups: Map<number, HighlightSet>; observer: MutationObserver; body: HTMLElement;
        clear: (entry: Entry) => void; stop: () => void; generation: number; click?: WebWordClick; surface?: WebSurfaceEvent;
    };
    const scope = window as unknown as { [key: string]: unknown; Highlight?: new () => HighlightSet };
    const registry = (CSS as unknown as { highlights?: Map<string, HighlightSet> }).highlights;
    const empty = { supported: !!registry && !!scope.Highlight, nodes: [] as PageText[], pending: false };
    let state = scope[namespace] as State | undefined;
    if (state && state.body !== document.body) { state.stop(); state = undefined; }
    if (command.action === 'stop' || command.action === 'reset') {
        if (state) state.stop();
        state = undefined;
        if (command.action === 'stop') return empty;
    }
    if (!empty.supported || !document.body || !/^https?:$/.test(location.protocol)) return empty;
    const excluded = 'script,style,noscript,pre,code,input,textarea,select,button,svg,math,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"]';
    const restarted = !state;
    if (!state) {
        const removedIds = new Set<number>();
        const entries = new Map<number, Entry>();
        const ids = new WeakMap<Text, number>();
        const groups = new Map<number, HighlightSet>();
        const roots = new Set<Node>([document.body]);
        const clear = (entry: Entry) => {
            for (const item of entry.ranges) {
                const group = groups.get(item.color);
                if (group) group.delete(item.range);
            }
            entry.ranges = [];
        };
        // Coalesce noisy sites into one body walk instead of an unbounded mutation queue.
        const enqueue = (node: Node) => {
            if (roots.has(document.body)) return;
            roots.add(node);
            if (roots.size > 128) { roots.clear(); roots.add(document.body); }
        };
        const observer = new MutationObserver(records => {
            let removed = false;
            for (const record of records) {
                if (record.type === 'childList') {
                    record.addedNodes.forEach(enqueue);
                    removed = removed || record.removedNodes.length > 0;
                } else {
                    if (record.type === 'characterData') {
                        const id = ids.get(record.target as Text);
                        const entry = id ? entries.get(id) : undefined;
                        if (entry) { clear(entry); entry.text = ''; }
                    }
                    enqueue(record.target);
                }
            }
            // Drop ranges and references for removed subtrees immediately.
            if (removed) for (const [id, entry] of entries) {
                if (!entry.node.isConnected) { clear(entry); entries.delete(id); removedIds.add(id); }
            }
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'contenteditable', 'class', 'style'] });
        const generation = command.generation ?? 0;
        const removeInteractions = install?.(entries, ids, generation, click => {
            if (!state) return;
            state.click = click;
            // A wake-up hint only. The host reads and validates the queued token separately.
            console.debug(`${namespace}:click`);
        });
        const removeSurface = surface?.(entries, ids, generation, event => {
            if (!state) return;
            state.surface = event;
            console.debug(`${namespace}:surface`);
        });
        state = {
            generation, removed: removedIds, entries, ids, nextId: 1, roots, walker: null, root: null, groups, observer, clear, body: document.body,
            stop: () => {
                observer.disconnect();
                removeInteractions?.();
                removeSurface?.();
                for (const color of groups.keys()) registry!.delete(`${namespace}-${color}`);
                groups.clear(); entries.clear(); roots.clear();
                delete scope[namespace];
            },
        };
        scope[namespace] = state;
    }
    if (command.action === 'apply') {
        if (command.generation !== undefined && command.generation !== state.generation) return empty;
        for (const item of command.nodes) {
            const entry = state.entries.get(item.id);
            // A site may replace text while the host is matching it. Never apply stale offsets.
            if (!entry || !entry.node.isConnected || entry.node.data !== item.text) continue;
            state.clear(entry);
            for (const match of item.ranges) {
                if (match.from < 0 || match.to > item.text.length || match.to <= match.from) continue;
                let group = state.groups.get(match.color);
                if (!group) {
                    group = new scope.Highlight!();
                    state.groups.set(match.color, group);
                    registry!.set(`${namespace}-${match.color}`, group);
                }
                const range = document.createRange();
                range.setStart(entry.node, match.from); range.setEnd(entry.node, match.to);
                group.add(range);
                entry.ranges.push({ range, color: match.color, token: match.token });
            }
        }
        return empty;
    }
    const nodes: PageText[] = [];
    let visited = 0;
    let characters = 0;
    while (visited < 256 && characters < 64000) {
        let node: Node | null = null;
        if (!state.walker) {
            const root = state.roots.values().next().value;
            if (!root) break;
            state.roots.delete(root);
            if (!root.isConnected) continue;
            state.root = root;
            if (root.nodeType === Node.TEXT_NODE) node = root;
            else state.walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        }
        if (state.walker) {
            if (!state.root!.isConnected) { state.walker = null; continue; }
            node = state.walker.nextNode();
            if (!node) { state.walker = null; continue; }
        }
        if (!node) continue;
        visited++;
        const textNode = node as Text;
        const parent = textNode.parentElement;
        let id = state.ids.get(textNode);
        const previous = id ? state.entries.get(id) : undefined;
        if (!parent || parent.closest(excluded) || !textNode.data.trim() || textNode.data.length > 200000) {
            if (previous) { state.clear(previous); previous.text = ''; state.removed.add(id!); }
            continue;
        }
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || !parent.getClientRects().length) {
            if (previous) { state.clear(previous); previous.text = ''; state.removed.add(id!); }
            continue;
        }
        if (previous && previous.text === textNode.data) continue;
        if (!id) { id = state.nextId++; state.ids.set(textNode, id); }
        if (previous) state.clear(previous);
        state.entries.set(id, { node: textNode, text: textNode.data, ranges: [] });
        nodes.push({ id, text: textNode.data });
        characters += textNode.data.length;
    }
    const removed = Array.from(state.removed).slice(0, 256);
    for (const id of removed) state.removed.delete(id);
    const click = state.click;
    const surfaceEvent = state.surface;
    state.surface = undefined;
    state.click = undefined;
    return { supported: true, nodes, removed, restarted, click, surface: surfaceEvent, pending: !!state.walker || state.roots.size > 0 || state.removed.size > 0 };
}

export function pageScript(command: PageCommand, namespace = 'hiwords-web'): string {
    return `(${webHighlightRuntime.toString()})(${JSON.stringify(command)},${JSON.stringify(namespace)},${installWebInteractions.toString()},${installWebSurface.toString()})`;
}
