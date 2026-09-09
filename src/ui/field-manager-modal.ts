import { Modal, Notice, setIcon } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { createStableId } from '../editor/hiwords-document';
import type { HiWordsFieldDefinition, HiWordsFieldType } from '../schema/hiwords';

const FIELD_TYPES: Array<{ value: HiWordsFieldType; label: string }> = [
    { value: 'text', label: 'Single-line text' },
    { value: 'longText', label: 'Long text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'boolean', label: 'Checkbox' },
    { value: 'list', label: 'Text list' },
    { value: 'url', label: 'URL' },
    { value: 'image', label: 'Image' },
];

export class FieldManagerModal extends Modal {
    private fields: HiWordsFieldDefinition[];

    constructor(
        private readonly plugin: HiWordsPlugin,
        fields: HiWordsFieldDefinition[],
        private readonly onSave: (fields: HiWordsFieldDefinition[]) => void,
        private readonly reservedLabels: string[] = [],
        private readonly populatedFieldIds: ReadonlySet<string> = new Set(),
    ) {
        super(plugin.app);
        this.fields = JSON.parse(JSON.stringify(fields)) as HiWordsFieldDefinition[];
    }

    onOpen(): void {
        this.modalEl.addClass('hi-words-field-manager-shell');
        this.setTitle('Manage fields');
        this.render();
    }

    private render(): void {
        this.contentEl.empty();
        this.contentEl.addClass('hi-words-field-manager-content');

        const intro = this.contentEl.createDiv({ cls: 'hi-words-field-manager-intro' });
        const copy = intro.createDiv({ cls: 'hi-words-field-manager-copy' });
        copy.createDiv({
            cls: 'setting-item-description',
            text: 'Fields define the form shared by every card in this file. Removing a field hides it while preserving existing card values.',
        });
        const add = intro.createEl('button', { text: 'Add field', cls: 'mod-cta hi-words-field-manager-add' });
        add.onclick = () => this.addField();

        const list = this.contentEl.createDiv({ cls: 'hi-words-field-manager-list' });
        if (!this.fields.length) {
            const empty = list.createDiv({ cls: 'hi-words-field-manager-empty' });
            const emptyIcon = empty.createDiv({ cls: 'hi-words-field-manager-empty-icon' });
            setIcon(emptyIcon, 'list-plus');
            empty.createEl('h3', { text: 'Create your first field' });
            empty.createEl('p', { text: 'Add text, dates, numbers, images, checkboxes, lists, and other fields to build this card type.' });
            const emptyAdd = empty.createEl('button', { text: 'Add field', cls: 'mod-cta' });
            emptyAdd.onclick = () => this.addField();
        }
        this.fields.forEach((field, index) => this.renderField(list, field, index));

        const footer = this.contentEl.createDiv({ cls: 'hi-words-field-manager-footer' });
        footer.createSpan({
            cls: 'hi-words-field-manager-count',
            text: `${this.fields.length} ${this.fields.length === 1 ? 'field' : 'fields'}`,
        });
        const actions = footer.createDiv({ cls: 'hi-words-field-manager-footer-actions' });
        const cancel = actions.createEl('button', { text: 'Cancel' });
        cancel.onclick = () => this.close();
        const save = actions.createEl('button', { text: 'Save fields', cls: 'mod-cta' });
        save.onclick = () => {
            const normalized = this.fields.map(field => ({
                ...field,
                label: field.label.trim(),
                description: field.description?.trim() || undefined,
                placeholder: field.type === 'image' ? undefined : field.placeholder?.trim() || undefined,
                image: field.type === 'image' ? {
                    multiple: field.image?.multiple || undefined,
                    displayMode: field.image?.displayMode || 'cover',
                    aspectRatio: field.image?.aspectRatio || '16:9',
                    fit: field.image?.fit || 'cover',
                } : undefined,
            }));
            if (normalized.some(field => !field.label)) {
                this.contentEl.querySelector<HTMLInputElement>('.hi-words-field-manager-label[value=""]')?.focus();
                return;
            }
            const reserved = new Set(this.reservedLabels.map(label => normalizeLabel(label)));
            const seen = new Set<string>();
            const duplicate = normalized.find(field => {
                const label = normalizeLabel(field.label);
                if (reserved.has(label) || seen.has(label)) return true;
                seen.add(label);
                return false;
            });
            if (duplicate) {
                new Notice(`“${duplicate.label}” conflicts with another card section. Use a unique field label.`);
                return;
            }
            this.onSave(normalized);
            this.close();
        };
    }

    private addField(): void {
        this.fields.push({
            id: createStableId('field'),
            label: 'New field',
            type: 'text',
            searchable: true,
        });
        this.render();
        this.contentEl
            .querySelectorAll<HTMLInputElement>('.hi-words-field-manager-label')
            .item(this.fields.length - 1)
            ?.select();
    }

    private renderField(container: HTMLElement, field: HiWordsFieldDefinition, index: number): void {
        const row = container.createDiv({ cls: 'hi-words-field-manager-row' });
        const heading = row.createDiv({ cls: 'hi-words-field-manager-row-heading' });
        heading.createEl('strong', { text: field.label || 'Untitled field' });
        const controls = heading.createDiv({ cls: 'hi-words-field-manager-row-actions' });
        const up = iconButton(controls, 'arrow-up', 'Move field up');
        up.disabled = index === 0;
        up.onclick = () => this.move(index, -1);
        const down = iconButton(controls, 'arrow-down', 'Move field down');
        down.disabled = index === this.fields.length - 1;
        down.onclick = () => this.move(index, 1);
        const remove = iconButton(controls, 'trash-2', 'Remove field');
        remove.onclick = () => { this.fields.splice(index, 1); this.render(); };

        const grid = row.createDiv({ cls: 'hi-words-field-manager-grid' });
        const label = inputField(grid, 'Label', field.label);
        label.addClass('hi-words-field-manager-label');
        label.oninput = () => { field.label = label.value; heading.querySelector('strong')?.setText(label.value.trim() || 'Untitled field'); };

        const typeField = grid.createEl('label', { cls: 'hi-words-file-field' });
        typeField.createSpan({ text: 'Field type' });
        const type = typeField.createEl('select');
        type.disabled = this.populatedFieldIds.has(field.id);
        if (type.disabled) {
            typeField.createSpan({
                cls: 'setting-item-description',
                text: 'Clear this field on all cards before changing its type.',
            });
        }
        FIELD_TYPES.forEach(optionDefinition => {
            const option = type.createEl('option', { value: optionDefinition.value, text: optionDefinition.label });
            option.selected = optionDefinition.value === field.type;
        });
        type.onchange = () => {
            field.type = type.value as HiWordsFieldType;
            if (field.type === 'image') {
                field.searchable = false;
                field.previewByDefault = true;
                field.image ||= { multiple: false, displayMode: 'cover', aspectRatio: '16:9', fit: 'cover' };
            }
            this.render();
        };

        const description = inputField(grid, 'Description', field.description || '');
        description.oninput = () => { field.description = description.value; };
        if (field.type !== 'image') {
            const placeholder = inputField(grid, 'Placeholder', field.placeholder || '');
            placeholder.oninput = () => { field.placeholder = placeholder.value; };
        } else {
            this.renderImageOptions(grid, field);
        }

        const flags = row.createDiv({ cls: 'hi-words-field-manager-flags' });
        checkbox(flags, 'Required', Boolean(field.required), value => { field.required = value || undefined; });
        checkbox(flags, 'Searchable', field.searchable !== false, value => { field.searchable = value; });
        checkbox(flags, 'Show in preview by default', Boolean(field.previewByDefault), value => { field.previewByDefault = value || undefined; });
    }

    private renderImageOptions(container: HTMLElement, field: HiWordsFieldDefinition): void {
        const options = field.image ||= { multiple: false, displayMode: 'cover', aspectRatio: '16:9', fit: 'cover' };
        selectField(container, 'Display', options.displayMode || 'cover', [
            ['cover', 'Cover'],
            ['gallery', 'Gallery'],
        ], value => { options.displayMode = value as 'cover' | 'gallery'; });
        selectField(container, 'Aspect ratio', options.aspectRatio || '16:9', [
            ['original', 'Original'],
            ['16:9', '16:9'],
            ['1:1', '1:1'],
            ['3:4', '3:4'],
        ], value => { options.aspectRatio = value as 'original' | '16:9' | '1:1' | '3:4'; });
        selectField(container, 'Image fit', options.fit || 'cover', [
            ['cover', 'Crop to fill'],
            ['contain', 'Show full image'],
        ], value => { options.fit = value as 'cover' | 'contain'; });
        const multiple = container.createEl('label', { cls: 'hi-words-file-field hi-words-field-manager-image-toggle' });
        multiple.createSpan({ text: 'Images per card' });
        const multipleControl = multiple.createEl('label', { cls: 'hi-words-field-manager-checkbox' });
        const checkbox = multipleControl.createEl('input', { type: 'checkbox' });
        checkbox.checked = Boolean(options.multiple);
        multipleControl.createSpan({ text: 'Allow multiple images' });
        checkbox.onchange = () => { options.multiple = checkbox.checked || undefined; };
    }

    private move(index: number, offset: -1 | 1): void {
        const target = index + offset;
        if (target < 0 || target >= this.fields.length) return;
        const [field] = this.fields.splice(index, 1);
        this.fields.splice(target, 0, field);
        this.render();
    }
}

function inputField(container: HTMLElement, label: string, value: string): HTMLInputElement {
    const field = container.createEl('label', { cls: 'hi-words-file-field' });
    field.createSpan({ text: label });
    return field.createEl('input', { type: 'text', value });
}

function selectField(
    container: HTMLElement,
    label: string,
    value: string,
    options: Array<[string, string]>,
    onChange: (value: string) => void
): void {
    const field = container.createEl('label', { cls: 'hi-words-file-field' });
    field.createSpan({ text: label });
    const select = field.createEl('select');
    for (const [optionValue, optionLabel] of options) {
        const option = select.createEl('option', { value: optionValue, text: optionLabel });
        option.selected = optionValue === value;
    }
    select.onchange = () => onChange(select.value);
}

function checkbox(container: HTMLElement, label: string, checked: boolean, onChange: (value: boolean) => void): void {
    const field = container.createEl('label', { cls: 'hi-words-field-manager-checkbox' });
    const input = field.createEl('input', { type: 'checkbox' });
    input.checked = checked;
    field.createSpan({ text: label });
    input.onchange = () => onChange(input.checked);
}

function iconButton(container: HTMLElement, icon: string, label: string): HTMLButtonElement {
    const button = container.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': label, title: label } });
    setIcon(button, icon);
    return button;
}

function normalizeLabel(value: string): string {
    return value.trim().toLocaleLowerCase();
}
