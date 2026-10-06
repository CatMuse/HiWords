/** Optional host context for content originating outside the Markdown document. */
export interface PopoverContext {
    owner: object;
    document: Document;
    rect: { left: number; top: number; right: number; bottom: number };
    hostRect?: () => { left: number; top: number; right: number; bottom: number };
    sentence: string;
    sourcePath: string;
    isCurrent: () => boolean;
    onOpenDetail?: () => void;
}
