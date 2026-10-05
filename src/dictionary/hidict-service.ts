import { App, Component, TFile } from 'obsidian';
import { HidictIndex, parseHidict } from './hidict';
import { dictText } from './text';
import { decodeHidictBytes } from './hidict-bytes';

/** Vault-only, lazy loading. No dictionary entries enter the learning vocabulary. */
export class HidictService extends Component {
    private revision = 0;
    private cached?: { path: string; stamp: string; index: HidictIndex };
    private pending?: { path: string; stamp: string; revision: number; promise: Promise<HidictIndex> };
    constructor(private app: App, private getPath: () => string) { super(); }
    onload(): void {
        this.registerEvent(this.app.vault.on('modify', file => { if (file.path === this.getPath()) this.invalidate(); }));
        this.registerEvent(this.app.vault.on('delete', file => {
            if (this.getPath() === file.path || this.getPath().startsWith(file.path + '/')) this.invalidate();
        }));
        this.registerEvent(this.app.vault.on('rename', (_file, oldPath) => {
            if (this.getPath() === oldPath || this.getPath().startsWith(oldPath + '/')) this.invalidate();
        }));
    }
    invalidate(): void { this.revision++; this.cached = undefined; this.pending = undefined; }
    onunload(): void { this.invalidate(); }
    async load(path = this.getPath()): Promise<HidictIndex> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'hidict') throw new Error(dictText('missing'));
        const stamp = `${file.stat.mtime}:${file.stat.size}`;
        if (this.cached?.path === path && this.cached.stamp === stamp) return this.cached.index;
        if (this.pending?.path === path && this.pending.stamp === stamp) return this.pending.promise;
        const revision = this.revision;
        const promise = this.app.vault.readBinary(file).then(buffer => {
            let index: HidictIndex;
            try { index = new HidictIndex(parseHidict(decodeHidictBytes(buffer))); }
            catch { throw new Error(dictText('invalid')); }
            if (this.revision !== revision) throw new Error(dictText('changed'));
            if (this.getPath() === path) this.cached = { path, stamp, index };
            return index;
        });
        const pending = { path, stamp, revision, promise };
        this.pending = pending;
        try { return await promise; }
        finally { if (this.pending === pending) this.pending = undefined; }
    }
    async lookup(word: string) { return (await this.load()).lookup(word); }
}
