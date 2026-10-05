/** Shared shell for learning cards, dictionary lookup and selection translation. */
export type WordPopoverMode = 'learning' | 'dictionary' | 'translation';
export function positionWordPopover(root: HTMLElement, rect: { left: number; top: number; bottom: number }, doc: Document): void {
    const win = doc.defaultView;
    if (!win) return;
    win.requestAnimationFrame(() => {
        if (!root.isConnected) return;
        const x = win.scrollX || doc.documentElement.scrollLeft || 0;
        const y = win.scrollY || doc.documentElement.scrollTop || 0;
        const size = root.getBoundingClientRect();
        root.style.left = Math.max(x + 10, Math.min(rect.left + x, x + win.innerWidth - size.width - 10)) + 'px';
        const below = rect.bottom + y + 6;
        root.style.top = (rect.bottom + size.height + 10 > win.innerHeight
            ? Math.max(y + 10, rect.top + y - size.height - 6) : below) + 'px';
    });
}
export function createWordPopoverShell(doc: Document, word: string, mode: WordPopoverMode) {
    const root = doc.createElement('div');
    root.className = 'hi-words-tooltip hi-words-word-popover';
    const header = root.createDiv({ cls: 'hi-words-tooltip-title-container' });
    const heading = header.createDiv({ cls: 'hi-words-tooltip-heading' });
    const title = heading.createDiv({ cls: 'hi-words-tooltip-title' });
    title.textContent = word;
    const actions = header.createDiv({ cls: 'hi-words-word-popover-actions' });
    // Kept detached so learning section tabs can precede the content.
    const content = doc.createElement('div');
    content.className = 'hi-words-tooltip-content';
    let pronounce: (() => void) | undefined;
    let pronunciationLabel = word;
    const pronunciationTargets = new Set<HTMLElement>();
    const updatePronunciationTarget = (target: HTMLElement) => {
        target.setAttribute('role', pronounce ? 'button' : target === title ? 'heading' : 'generic');
        target.setAttribute('tabindex', pronounce ? '0' : '-1');
        target.setAttribute('aria-label', pronunciationLabel);
    };
    const bindPronunciation = (target: HTMLElement) => {
        if (pronunciationTargets.has(target)) return;
        pronunciationTargets.add(target);
        updatePronunciationTarget(target);
        target.addEventListener('click', event => { if (pronounce) { event.stopPropagation(); pronounce(); } });
        target.addEventListener('keydown', event => {
            if (pronounce && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault(); event.stopPropagation(); pronounce();
            }
        });
    };
    const setPronunciation = (callback?: () => void, label?: string) => {
        pronounce = callback;
        pronunciationLabel = label || title.textContent || word;
        pronunciationTargets.forEach(updatePronunciationTarget);
    };
    bindPronunciation(title);
    const setMode = (value: WordPopoverMode) => root.setAttribute('data-mode', value);
    setMode(mode); setPronunciation();
    return { root, header, heading, title, actions, content, setMode, setPronunciation, bindPronunciation };
}
