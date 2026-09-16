import type { WorkspaceLeaf } from 'obsidian';

export interface WebWordSource {
    type: 'web';
    leaf: WorkspaceLeaf;
    url: string;
}
export type SidebarWordOrigin = 'document' | 'library' | WebWordSource;
