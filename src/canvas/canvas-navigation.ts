import { App, TFile, WorkspaceLeaf } from 'obsidian';

type CanvasRuntime = {
    nodes?: Map<string, unknown> | Record<string, unknown> | unknown[];
    select?: (...args: unknown[]) => unknown;
    deselect?: (...args: unknown[]) => unknown;
    zoomToSelection?: (...args: unknown[]) => unknown;
    zoomToFit?: (...args: unknown[]) => unknown;
    selection?: {
        select?: (...args: unknown[]) => unknown;
        setSelection?: (...args: unknown[]) => unknown;
        clear?: (...args: unknown[]) => unknown;
    } | Set<unknown>;
    selectionManager?: {
        select?: (...args: unknown[]) => unknown;
        setSelection?: (...args: unknown[]) => unknown;
    };
};

function findCanvasNode(canvas: CanvasRuntime, nodeId: string): unknown {
    const nodes = canvas.nodes;
    if (nodes instanceof Map) return nodes.get(nodeId);
    if (Array.isArray(nodes)) return nodes.find(node => isNodeWithId(node, nodeId));
    if (nodes && typeof nodes === 'object') {
        const record = nodes as Record<string, unknown>;
        return record[nodeId] || Object.values(record).find(node => isNodeWithId(node, nodeId));
    }
    return undefined;
}

function isNodeWithId(value: unknown, nodeId: string): value is { id: string } {
    return !!value && typeof value === 'object' && (value as { id?: unknown }).id === nodeId;
}

function getCanvasLeaf(app: App, file: TFile): WorkspaceLeaf | undefined {
    return app.workspace.getLeavesOfType('canvas')
        .find(leaf => (leaf.view as unknown as { file?: TFile }).file?.path === file.path);
}

async function waitForCanvasView(): Promise<void> {
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
    await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
}

function selectNode(canvas: CanvasRuntime, node: unknown): boolean {
    if (typeof canvas.select === 'function') {
        for (const args of [[node], [node, false], [[node]]]) {
            try {
                canvas.select(...args);
                return true;
            } catch {
                // Try the next signature used by different Canvas versions.
            }
        }
    }

    if (canvas.selection instanceof Set) {
        try {
            canvas.selection.clear();
            canvas.selection.add(node);
            return true;
        } catch {
            // Continue with manager-shaped selection APIs.
        }
    }

    const managers = [canvas.selection, canvas.selectionManager]
        .filter((manager): manager is { select?: (...args: unknown[]) => unknown; setSelection?: (...args: unknown[]) => unknown } =>
            !!manager && !(manager instanceof Set));
    for (const manager of managers) {
        if (typeof manager?.select === 'function') {
            try {
                manager.select(node);
                return true;
            } catch {
                // Internal Canvas signatures can differ between Obsidian versions.
                try {
                    manager.select(node, false);
                    return true;
                } catch {
                    // Try the next compatible shape.
                }
            }
        }
        if (typeof manager?.setSelection === 'function') {
            try {
                manager.setSelection(node);
                return true;
            } catch {
                try {
                    manager.setSelection(new Set([node]));
                    return true;
                } catch {
                    // Fall through to the next compatible shape.
                }
            }
        }
    }
    return false;
}

function findZoomCommand(app: App): string | undefined {
    const commandsApi = (app as App & {
        commands?: {
            listCommands: () => Record<string, { id: string; name: string }>;
        };
    }).commands;
    if (!commandsApi) return undefined;
    const commands = commandsApi.listCommands();
    const candidates = Object.values(commands).filter(command => {
        const text = `${command.id} ${command.name}`.toLowerCase();
        return text.includes('zoom') && text.includes('selection');
    });
    return candidates[0]?.id;
}

/**
 * Opens a Canvas and tries to select/zoom to one of its nodes.
 * Canvas selection is intentionally feature-detected because it is not part of
 * Obsidian's public API. Failure leaves the Canvas open and returns false.
 */
export async function zoomToCanvasNode(app: App, file: TFile, nodeId: string): Promise<boolean> {
    let leaf = getCanvasLeaf(app, file);
    if (!leaf) leaf = app.workspace.getLeaf('tab');

    await leaf.openFile(file);
    await app.workspace.revealLeaf(leaf);
    const workspace = app.workspace as typeof app.workspace & {
        setActiveLeaf?: (target: WorkspaceLeaf, options?: { focus?: boolean }) => void;
    };
    workspace.setActiveLeaf?.(leaf, { focus: true });
    await waitForCanvasView();

    const view = leaf.view as unknown as { canvas?: CanvasRuntime };
    const canvas = view.canvas;
    if (!canvas) return false;

    const node = findCanvasNode(canvas, nodeId);
    if (!node || !selectNode(canvas, node)) return false;

    if (typeof canvas.zoomToSelection === 'function') {
        try {
            canvas.zoomToSelection();
            return true;
        } catch {
            // Fall back to the public command below.
        }
    }

    const commandId = findZoomCommand(app);
    if (!commandId) return false;
    try {
        const commandsApi = (app as App & {
            commands?: { executeCommandById: (id: string) => boolean | void };
        }).commands;
        if (!commandsApi) return false;
        return commandsApi.executeCommandById(commandId) !== false;
    } catch {
        return false;
    }
}
