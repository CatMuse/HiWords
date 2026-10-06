export interface WebWordClick { token: number; generation: number }
export interface InteractiveEntry { node: Text; text: string; ranges: { range: Range; token: number }[] }

/** Serialized with the page runtime. No imports or host APIs may be used inside this function. */
export function installWebInteractions(
    entries: Map<number, InteractiveEntry>, ids: WeakMap<Text, number>,
    generation: number, notify: (click: WebWordClick) => void,
): () => void {
    let down: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
        down = event.isTrusted && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const onClick = (event: MouseEvent) => {
        const start = down;
        down = null;
        if (!event.isTrusted || !start || event.button !== 0 || event.detail !== 1) return;
        if (event.ctrlKey || event.metaKey || event.shiftKey || Math.hypot(start.x - event.clientX, start.y - event.clientY) > 5) return;
        if (!document.getSelection()?.isCollapsed) return;
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('button,input,textarea,select,summary,[hidden],[aria-hidden="true"],[role="button"],[role="link"],[contenteditable]:not([contenteditable="false"])')) return;
        const link = target.closest('a[href]');
        if (link && !event.altKey) return;
        if (!link && event.altKey) return;
        const pointDocument = document as Document & {
            caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
        };
        const node = pointDocument.caretPositionFromPoint?.(event.clientX, event.clientY)?.offsetNode;
        const id = node?.nodeType === Node.TEXT_NODE ? ids.get(node as Text) : undefined;
        // Older guest browsers can still hit-test our existing highlights without a legacy caret API.
        const entry = pointDocument.caretPositionFromPoint ? (id ? entries.get(id) : undefined)
            : Array.from(entries.values()).find(item => target.contains(item.node) && item.ranges.some(match =>
                Array.from(match.range.getClientRects()).some(rect => rect.width > 0
                    && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom)));
        if (!entry || !entry.node.isConnected || entry.node.data !== entry.text) return;
        const hit = entry.ranges.find(item => Array.from(item.range.getClientRects()).some(rect =>
            rect.width > 0 && event.clientX >= rect.left && event.clientX <= rect.right
            && event.clientY >= rect.top && event.clientY <= rect.bottom));
        if (!hit) return;
        if (link) { event.preventDefault(); event.stopImmediatePropagation(); }
        notify({ token: hit.token, generation });
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick, true);
    return () => {
        document.removeEventListener('pointerdown', onDown, true);
        document.removeEventListener('click', onClick, true);
    };
}
