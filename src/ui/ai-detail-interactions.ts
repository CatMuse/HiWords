import { Component, setIcon } from 'obsidian';
import { dictText } from '../dictionary/text';

interface PanelRect { left: number; top: number; width: number; height: number }

/** Keep the entire dragged panel reachable when its window changes size. */
export function clampAiDetailRect(rect: PanelRect, viewport: { width: number; height: number }): PanelRect {
    const width = Math.min(rect.width, Math.max(1, viewport.width - 16));
    const height = Math.min(rect.height, Math.max(1, viewport.height - 16));
    return { width, height, left: Math.max(8, Math.min(rect.left, viewport.width - width - 8)),
        top: Math.max(8, Math.min(rect.top, viewport.height - height - 8)) };
}

/** Listeners belong to this opening of the panel, including document-level drag listeners. */
export function registerAiDetailInteractions(component: Component, doc: Document, root: HTMLElement,
    header: HTMLElement, pin: HTMLButtonElement, close: () => void): (rect: PanelRect) => void {
    const win = doc.defaultView!;
    let pinned = true, moved = false;
    let rect: PanelRect = { left: 8, top: 8, width: 320, height: 400 };
    let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
    const apply = (next: PanelRect) => {
        rect = clampAiDetailRect(next, { width: win.innerWidth, height: win.innerHeight });
        for (const key of ['left', 'top', 'width', 'height'] as const) root.style[key] = `${rect[key]}px`;
    };
    const updatePin = () => {
        root.setAttribute('data-pinned', String(pinned));
        pin.setAttribute('aria-pressed', String(pinned));
        pin.setAttribute('aria-label', dictText(pinned ? 'unpinPanel' : 'pinPanel'));
        setIcon(pin, pinned ? 'pin' : 'pin-off');
    };
    updatePin();
    component.registerDomEvent(pin, 'click', () => { pinned = !pinned; updatePin(); });
    component.registerDomEvent(doc, 'pointerdown', event => {
        if (!pinned && !root.contains(event.target as Node)) close();
    }, true);
    const stop = () => { drag = undefined; root.classList.remove('is-dragging'); };
    component.registerDomEvent(header, 'pointerdown', event => {
        if (event.button !== 0 || event.isPrimary === false || (event.target as Element).closest('button')) return;
        event.preventDefault();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
        root.classList.add('is-dragging');
    });
    component.registerDomEvent(doc, 'pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        event.preventDefault(); moved = true;
        apply({ ...rect, left: drag.left + event.clientX - drag.x, top: drag.top + event.clientY - drag.y });
    });
    for (const name of ['pointerup', 'pointercancel'] as const) {
        component.registerDomEvent(doc, name, event => { if (drag?.id === event.pointerId) stop(); });
    }
    component.registerDomEvent(win, 'blur', stop);
    component.register(stop);
    return next => apply(moved ? { ...next, left: rect.left, top: rect.top } : next);
}
