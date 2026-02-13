import { Component, MarkdownView, setIcon } from 'obsidian';
import HiWordsPlugin from '../../main';
import { TranslationService } from '../services/translation-service';
import { t } from '../i18n';
import { extractSentenceFromEditorMultiline, extractSentenceFromSelection } from '../utils/sentence-extractor';

/**
 * 划词翻译浮窗组件
 * 监听用户选中文本，弹出翻译浮窗，支持翻译结果展示和添加到生词本
 */
export class SelectionTranslatePopover extends Component {
    private plugin: HiWordsPlugin;
    private translationService: TranslationService;
    private activePopover: HTMLElement | null = null;
    private debounceTimer: number | null = null;
    private currentTranslateText: string = '';
    private isTranslating: boolean = false;

    // 防抖与交互参数
    private static readonly DEBOUNCE_MS = 300;

    constructor(plugin: HiWordsPlugin) {
        super();
        this.plugin = plugin;
        this.translationService = new TranslationService(plugin.settings);
    }

    onload() {
        this.registerDomEvent(document, 'mouseup', (event: MouseEvent) => {
            this.handleMouseUp(event);
        });

        // 点击空白区域关闭浮窗
        this.registerDomEvent(document, 'mousedown', (event: MouseEvent) => {
            if (this.activePopover && !this.activePopover.contains(event.target as Node)) {
                this.removePopover();
            }
        });

        // 滚动和窗口变化时关闭浮窗
        this.registerDomEvent(window, 'scroll', () => this.removePopover(), { passive: true } as any);
        this.registerDomEvent(window, 'resize', () => this.removePopover());

        // 按 Escape 关闭浮窗
        this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
            if (event.key === 'Escape' && this.activePopover) {
                this.removePopover();
            }
        });
    }

    /**
     * 更新设置（当用户修改设置后调用）
     */
    updateSettings() {
        this.translationService.updateSettings(this.plugin.settings);
    }

    /**
     * 处理鼠标抬起事件
     */
    private handleMouseUp(event: MouseEvent) {
        // 检查是否启用划词翻译
        if (!this.plugin.settings.enableSelectionTranslate) {
            return;
        }

        // 如果点击在浮窗内部，不处理
        if (this.activePopover && this.activePopover.contains(event.target as Node)) {
            return;
        }

        // 防抖处理
        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = window.setTimeout(() => {
            this.debounceTimer = null;
            this.tryShowPopover(event);
        }, SelectionTranslatePopover.DEBOUNCE_MS);
    }

    /**
     * 尝试显示翻译浮窗
     */
    private tryShowPopover(event: MouseEvent) {
        const selectedText = this.getSelectedText();
        if (!selectedText || selectedText.length === 0 || selectedText.length > 500) {
            return;
        }

        // 如果选中的文本是已高亮的生词，不显示翻译浮窗（由 DefinitionPopover 处理）
        const target = event.target as HTMLElement;
        if (target?.closest?.('.hi-words-highlight')) {
            return;
        }

        // 避免重复翻译相同文本
        if (this.currentTranslateText === selectedText && this.activePopover) {
            return;
        }

        this.currentTranslateText = selectedText;

        // 获取选区位置
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // 选区太小（可能是误触）
        if (rect.width < 2 && rect.height < 2) return;

        // 创建并显示浮窗
        this.showPopover(selectedText, rect, event);
    }

    /**
     * 获取当前选中的文本
     */
    private getSelectedText(): string {
        // 优先从编辑器获取
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = activeView?.editor;
        const viewMode = activeView?.getMode();

        if (editor && viewMode === 'source') {
            return editor.getSelection().trim();
        }

        // 阅读模式 / PDF 视图
        const selection = window.getSelection();
        return selection?.toString().trim() || '';
    }

    /**
     * 获取选中文本所在的句子
     */
    private getSentence(): string {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = activeView?.editor;
        const viewMode = activeView?.getMode();

        if (editor && viewMode === 'source') {
            return extractSentenceFromEditorMultiline(editor);
        }

        return extractSentenceFromSelection(window.getSelection());
    }

    /**
     * 显示翻译浮窗
     */
    private showPopover(text: string, rect: DOMRect, event: MouseEvent) {
        this.removePopover();

        const popover = document.createElement('div');
        popover.className = 'hi-words-translate-popover';

        // 标题栏：选中文本 + 操作按钮
        const header = popover.createDiv({ cls: 'hi-words-translate-header' });
        const titleEl = header.createDiv({ cls: 'hi-words-translate-title' });
        titleEl.textContent = text;

        // 操作按钮（右上角图标）
        const actionsEl = header.createDiv({ cls: 'hi-words-translate-actions' });

        // 添加到生词本按钮
        const addBtn = actionsEl.createDiv({ cls: 'hi-words-translate-btn hi-words-translate-btn-add' });
        setIcon(addBtn, 'book-plus');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sentence = this.getSentence();
            const translationResult = contentEl.querySelector('.hi-words-translate-result')?.textContent || '';
            this.removePopover();
            this.plugin.addOrEditWord(text, sentence, translationResult);
        });

        // 复制翻译结果按钮
        const copyBtn = actionsEl.createDiv({ cls: 'hi-words-translate-btn hi-words-translate-btn-copy' });
        setIcon(copyBtn, 'copy');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const result = contentEl.querySelector('.hi-words-translate-result')?.textContent || '';
            if (result) {
                navigator.clipboard.writeText(result);
                setIcon(copyBtn, 'check');
                setTimeout(() => setIcon(copyBtn, 'copy'), 1500);
            }
        });

        // 翻译结果区域
        const contentEl = popover.createDiv({ cls: 'hi-words-translate-content' });
        const loadingEl = contentEl.createDiv({ cls: 'hi-words-translate-loading' });
        const spinnerEl = loadingEl.createDiv({ cls: 'hi-words-translate-spinner' });
        setIcon(spinnerEl, 'loader');
        loadingEl.createSpan({ text: t('translate.translating') });

        // 阻止浮窗内的 mousedown 冒泡（防止关闭）
        popover.addEventListener('mousedown', (e) => e.stopPropagation());

        document.body.appendChild(popover);

        // 定位浮窗
        requestAnimationFrame(() => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let left = rect.left + scrollLeft;
            let top = rect.bottom + scrollTop + 6;

            // 获取浮窗尺寸
            const popoverRect = popover.getBoundingClientRect();

            // 右侧溢出修正
            if (left + popoverRect.width > viewportWidth + scrollLeft - 10) {
                left = viewportWidth + scrollLeft - popoverRect.width - 10;
            }
            // 左侧溢出修正
            if (left < scrollLeft + 10) {
                left = scrollLeft + 10;
            }

            // 底部溢出修正：如果下方空间不够，显示在选区上方
            if (rect.bottom + popoverRect.height + 10 > viewportHeight) {
                top = rect.top + scrollTop - popoverRect.height - 6;
            }

            popover.style.left = left + 'px';
            popover.style.top = top + 'px';
        });

        this.activePopover = popover;

        // 发起翻译请求
        this.doTranslate(text, contentEl);
    }

    /**
     * 执行翻译
     */
    private async doTranslate(text: string, contentEl: HTMLElement) {
        if (this.isTranslating) {
            this.translationService.abort();
        }

        this.isTranslating = true;

        try {
            const result = await this.translationService.translate(text);

            // 直接更新 contentEl（即使浮窗已被移除也无副作用）
            contentEl.empty();
            contentEl.createDiv({ cls: 'hi-words-translate-result', text: result });
        } catch (error) {
            contentEl.empty();
            const errorEl = contentEl.createDiv({ cls: 'hi-words-translate-error' });
            const errorIconEl = errorEl.createDiv({ cls: 'hi-words-translate-error-icon' });
            setIcon(errorIconEl, 'alert-circle');
            errorEl.createSpan({ text: error instanceof Error ? error.message : t('translate.failed') });
        } finally {
            this.isTranslating = false;
        }
    }

    /**
     * 移除浮窗
     */
    private removePopover() {
        if (this.activePopover && this.activePopover.parentNode) {
            this.activePopover.parentNode.removeChild(this.activePopover);
        }
        this.activePopover = null;
        this.currentTranslateText = '';
    }

    onunload() {
        this.removePopover();
        this.translationService.abort();
        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
        }
    }
}
