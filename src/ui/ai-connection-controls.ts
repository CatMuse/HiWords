import { App, FuzzySuggestModal, Setting } from 'obsidian';
import type { AIServiceSettings } from '../utils';
import { AIClient } from '../services/ai-client';
import { t } from '../i18n';

class ModelPicker extends FuzzySuggestModal<string> {
    constructor(app: App, private models: string[], private select: (id: string) => void) {
        super(app);
        this.setPlaceholder(t('ai_connection.choose_model'));
    }
    getItems(): string[] { return this.models; }
    getItemText(model: string): string { return model; }
    onChooseItem(model: string): void { this.select(model); }
}

interface Options {
    app: App;
    config: () => AIServiceSettings;
    key: () => string;
    selectModel: (id: string) => Promise<void>;
    update: () => void;
}

type State = 'idle' | 'loading' | 'success' | 'error';

/** Separate model discovery from the explicitly billed connection test. */
export class AIConnectionControls {
    private models: string[] = [];
    private modelSource = '';
    private status = '';
    private statusSource = '';
    private statusState: State = 'idle';
    private loading = false;
    private testing = false;
    private revision = 0;
    private resetVisibleStatus?: () => void;

    constructor(private options: Options) {}
    invalidate(): void {
        this.revision++;
        this.status = '';
        this.statusSource = '';
        this.statusState = 'idle';
        this.resetVisibleStatus?.();
    }
    private source(): string { return JSON.stringify([this.options.config(), this.options.key()]); }
    private modelFingerprint(): string {
        const { provider, apiProtocol, apiUrl, apiKeySecretId } = this.options.config();
        return JSON.stringify([provider, apiProtocol, apiUrl, apiKeySecretId, this.options.key()]);
    }

    renderModel(setting: Setting): () => void {
        let active = true;
        setting.settingEl.addClass('hi-words-ai-model');
        const feedback = setting.controlEl.createDiv({ cls: 'hi-words-ai-model-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
        setting.addText(input => input.setValue(this.options.config().model)
            .setPlaceholder('model-id').onChange(value => {
                void this.options.selectModel(value.trim()).catch(error => {
                    if (active) feedback.setText(this.message(error));
                });
            }));
        setting.addButton(button => button.setButtonText(t('ai_connection.choose_model')).onClick(() => {
            if (!this.models.length || this.modelSource !== this.modelFingerprint()) {
                feedback.setText(t('ai_connection.refresh_hint'));
                return;
            }
            const source = this.modelFingerprint();
            const revision = this.revision;
            new ModelPicker(this.options.app, this.models, id => {
                if (!active || revision !== this.revision || source !== this.modelFingerprint()) return;
                void this.options.selectModel(id).then(() => this.options.update()).catch(error => {
                    if (active) feedback.setText(this.message(error));
                });
            }).open();
        }));
        setting.addButton(button => button.setButtonText(t('ai_connection.refresh_models')).setIcon('refresh-cw').setTooltip(t('ai_connection.refresh_models'))
            .setDisabled(this.loading).onClick(async () => {
                if (this.loading) return;
                const source = this.modelFingerprint();
                const revision = this.revision;
                const client = new AIClient(this.options.config(), this.options.key());
                this.loading = true;
                button.setDisabled(true);
                feedback.setText(t('ai_connection.loading'));
                try {
                    const models = await client.listModels();
                    if (!active || revision !== this.revision || source !== this.modelFingerprint()) return;
                    this.models = models;
                    this.modelSource = source;
                    feedback.setText(`${t('ai_connection.models_found')}: ${models.length}`);
                } catch (error) {
                    if (active && revision === this.revision && source === this.modelFingerprint()) {
                        feedback.setText(`${this.message(error)} ${t('ai_connection.manual_hint')}`);
                    }
                } finally {
                    this.loading = false;
                    button.setDisabled(false);
                    if (!active) this.options.update();
                }
            }));
        // Status sits underneath the input and actions, rather than between controls.
        setting.controlEl.appendChild(feedback);
        if (this.models.length && this.modelSource === this.modelFingerprint()) {
            feedback.setText(`${t('ai_connection.models_found')}: ${this.models.length}`);
        }
        return () => { active = false; };
    }

    renderTest(setting: Setting): () => void {
        let active = true;
        setting.settingEl.addClass('hi-words-ai-test');
        const statusEl = setting.descEl.createDiv({ cls: 'hi-words-ai-status', attr: { role: 'status', 'aria-live': 'polite' } });
        const show = (text: string, state: State) => {
            statusEl.setText(text);
            statusEl.setAttribute('data-state', state);
        };
        const refreshStatus = () => {
            const valid = this.statusSource === this.source() && this.status;
            show(valid ? this.status : t('ai_connection.not_tested'), valid ? this.statusState : 'idle');
        };
        refreshStatus();
        this.resetVisibleStatus = refreshStatus;
        setting.addButton(button => button.setButtonText(t('ai_connection.test_model')).setCta().setDisabled(this.testing)
            .onClick(async () => {
                if (this.testing) return;
                const source = this.source();
                const revision = this.revision;
                const config = { ...this.options.config() };
                const start = Date.now();
                this.testing = true;
                button.setDisabled(true);
                show(t('ai_connection.testing'), 'loading');
                try {
                    await new AIClient(config, this.options.key()).generate('Reply only OK.', 32);
                    if (!active || revision !== this.revision || source !== this.source()) return;
                    this.status = `${t('ai_connection.connected')}: ${config.model} · ${Date.now() - start} ms`;
                    this.statusSource = source;
                    this.statusState = 'success';
                    refreshStatus();
                } catch (error) {
                    if (active && revision === this.revision && source === this.source()) {
                        this.status = this.message(error);
                        this.statusSource = source;
                        this.statusState = 'error';
                        refreshStatus();
                    }
                } finally {
                    this.testing = false;
                    button.setDisabled(false);
                    if (!active) this.options.update();
                }
            }));
        return () => { active = false; if (this.resetVisibleStatus === refreshStatus) this.resetVisibleStatus = undefined; };
    }

    private message(error: unknown): string {
        const message = error instanceof Error ? error.message : t('ai_errors.request_failed');
        const key = this.options.key();
        return (key ? message.split(key).join('[redacted]') : message).slice(0, 240);
    }
}
