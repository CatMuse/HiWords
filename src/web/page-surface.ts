import type { InteractiveEntry } from './page-interactions';
export interface WebRect { left: number; top: number; right: number; bottom: number }
export type WebSurfaceEvent = { kind: 'hide'; generation: number; immediate?: boolean } | {
    kind: 'hover' | 'selection'; generation: number; rect: WebRect;
    token?: number; text?: string; sentence?: string;
};

/** Self-contained guest code. Sends only bounded text/geometry, never executes host actions. */
export function installWebSurface(
    entries: Map<number, InteractiveEntry>, ids: WeakMap<Text, number>, generation: number,
    notify: (event: WebSurfaceEvent) => void,
): () => void {
    let timer: number | undefined;
    let lastToken: number | undefined;
    let selectionText = '';
    const excluded = 'input,textarea,select,button,pre,code,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"]';
    const rectOf = (rect: DOMRect): WebRect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    const cancelTimer = () => { window.clearTimeout(timer); timer = undefined; };
    const hide = (immediate = false) => { cancelTimer(); lastToken = undefined; selectionText = ''; notify({ kind: 'hide', generation, immediate }); };
    const dismiss = () => hide(true);
    const move = (event: MouseEvent) => {
        if (!event.isTrusted || event.buttons || !document.getSelection()?.isCollapsed) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest(excluded)) { if (lastToken !== undefined) hide(); return; }
        const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null };
        const node = doc.caretPositionFromPoint?.(event.clientX, event.clientY)?.offsetNode;
        const id = node?.nodeType === Node.TEXT_NODE ? ids.get(node as Text) : undefined;
        const entry = doc.caretPositionFromPoint ? (id ? entries.get(id) : undefined)
            : Array.from(entries.values()).find(item => target.contains(item.node) && item.ranges.some(match =>
                Array.from(match.range.getClientRects()).some(rect => rect.width > 0
                    && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom)));
        const hit = entry?.node.isConnected && entry.node.data === entry.text ? entry.ranges.find(item =>
            Array.from(item.range.getClientRects()).some(r => event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom)) : undefined;
        if (!hit) { if (lastToken !== undefined) hide(); return; }
        if (lastToken === hit.token) return;
        cancelTimer(); lastToken = hit.token;
        const rect = rectOf(hit.range.getBoundingClientRect());
        timer = window.setTimeout(() => {
            if (entry?.node.isConnected && entry.node.data === entry.text) notify({ kind: 'hover', generation, token: hit.token, rect, sentence: (entry.node.parentElement?.closest('p,li,blockquote,td,th')?.textContent || entry.text).slice(0, 1200) });
        }, 120);
    };
    const selection = (event: Event) => {
        if (!event.isTrusted) return;
        cancelTimer(); lastToken = undefined;
        timer = window.setTimeout(() => {
            const selected = document.getSelection();
            const text = selected?.toString().trim() || '';
            if (!selected?.rangeCount || !text || text.length > 500) { hide(); return; }
            const range = selected.getRangeAt(0);
            const start = range.startContainer.parentElement;
            const end = range.endContainer.parentElement;
            if (!start || !end || start.closest(excluded) || end.closest(excluded)) { hide(); return; }
            if (selectionText === text) return;
            selectionText = text;
            const context = start.closest('p,li,blockquote,article,section')?.textContent || start.textContent || text;
            const index = context.indexOf(text);
            const sentence = index >= 0 ? context.slice(Math.max(0, index - 350), index + text.length + 350).trim() : text;
            notify({ kind: 'selection', generation, text, sentence: sentence.slice(0, 1200), rect: rectOf(range.getBoundingClientRect()) });
        }, 300);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); else if (event.shiftKey) selection(event); };
    const down = (event: PointerEvent) => { if (event.isTrusted) dismiss(); };
    const leave = () => { cancelTimer(); lastToken = undefined; }; // Allow crossing into the host popover.
    document.addEventListener('mousemove', move, true);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('mouseup', selection, true);
    document.addEventListener('keyup', key, true);
    document.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    document.addEventListener('mouseleave', leave);
    return () => {
        cancelTimer();
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('pointerdown', down, true);
        document.removeEventListener('mouseup', selection, true);
        document.removeEventListener('keyup', key, true);
        document.removeEventListener('scroll', dismiss, true);
        window.removeEventListener('resize', dismiss);
        document.removeEventListener('mouseleave', leave);
    };
}

export function validateSurfaceEvent(value: unknown, generation: number): WebSurfaceEvent | undefined {
    if (!value || typeof value !== 'object') return;
    const event = value as WebSurfaceEvent;
    if (event.generation !== generation) return;
    if (event.kind === 'hide') return { kind: 'hide', generation, immediate: event.immediate === true };
    if (event.kind !== 'hover' && event.kind !== 'selection') return;
    const r = event.rect;
    if (!r || ![r.left, r.top, r.right, r.bottom].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 100000)) return;
    if (r.right <= r.left || r.bottom <= r.top) return;
    if (event.sentence !== undefined && (typeof event.sentence !== 'string' || event.sentence.length > 1200)) return;
    if (event.kind === 'hover' && (!Number.isSafeInteger(event.token) || (event.token ?? 0) < 1)) return;
    if (event.kind === 'selection' && (typeof event.text !== 'string' || !event.text.trim() || event.text.length > 500 || typeof event.sentence !== 'string' || event.sentence.length > 1200)) return;
    return event;
}
