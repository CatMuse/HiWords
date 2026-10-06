interface Rect { left: number; top: number; right: number; bottom: number }
/** Right edge of the reading pane, clamped to its window (including small screens). */
export function aiDetailPosition(host: Rect, viewport: { width: number; height: number }) {
    const left = Math.max(8, host.left), right = Math.min(viewport.width - 8, host.right);
    const top = Math.max(12, host.top + 12), bottom = Math.min(viewport.height - 12, host.bottom - 12);
    const available = Math.max(1, right - left - 24);
    const width = Math.min(420, available, Math.max(320, (right - left) * .28));
    return { left: Math.max(8, right - width - 12), top: Math.min(top, Math.max(12, viewport.height - 100)),
        width, height: Math.max(80, bottom - top) };
}
