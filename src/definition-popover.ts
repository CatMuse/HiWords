import { App, MarkdownRenderer, MarkdownView, Notice } from 'obsidian';
import { VocabularyManager } from './vocabulary-manager';
import { t } from './i18n';

export class DefinitionPopover {
    private app: App;
    private activeTooltip: HTMLElement | null = null;
    private vocabularyManager: VocabularyManager | null = null;
    private eventHandlers: {[key: string]: EventListener} = {};
    private tooltipHideTimeout: number | undefined;

    constructor(app: App) {
        this.app = app;

        this.eventHandlers = {
            mouseover: this.handleMouseOver.bind(this),
            mouseout: this.handleMouseOut.bind(this),
        };

        this.registerEvents();
    }

    private simpleMarkdownToHtml(markdown: string): string {
        if (!markdown) return '';

        let html = markdown
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
            .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
            .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            .replace(/^\* (.*?)$/gm, '<li>$1</li>')
            .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>')
            .replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');

        return html;
    }

    private setContentSafely(container: HTMLElement, markdownText: string): void {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        const processHeadings = (text: string) => {
            const headingMatches = text.match(/^(#{1,3}) (.+)$/gm);
            if (headingMatches) {
                headingMatches.forEach(match => {
                    const [_, hashes, content] = match.match(/^(#{1,3}) (.+)$/) || [];
                    if (hashes && content) {
                        const level = hashes.length;
                        const heading = document.createElement(`h${level}`);
                        heading.textContent = content;
                        container.appendChild(heading);
                        text = text.replace(match, '');
                    }
                });
            }
            return text;
        };
        const processText = (text: string) => {
            if (!text.trim()) return;
            text = text.replace(/\*\*(.*?)\*\*/g, (_, content) => `[STRONG]${content}[/STRONG]`);
            text = text.replace(/\*(.*?)\*/g, (_, content) => `[EM]${content}[/EM]`);
            text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (_, linkText, url) => `[LINK:${url}]${linkText}[/LINK]`);
            text = text.replace(/`(.*?)`/g, (_, content) => `[CODE]${content}[/CODE]`);
            const paragraphs = text.split('\n');
            paragraphs.forEach(para => {
                if (!para.trim()) return;
                const p = document.createElement('p');
                let paraContent = para;
                paraContent = paraContent.replace(/\[STRONG\](.*?)\[\/STRONG\]/g, (_, content) => {
                    const strong = document.createElement('strong');
                    strong.textContent = content;
                    p.appendChild(strong);
                    return '';
                });
                paraContent = paraContent.replace(/\[EM\](.*?)\[\/EM\]/g, (_, content) => {
                    const em = document.createElement('em');
                    em.textContent = content;
                    p.appendChild(em);
                    return '';
                });
                paraContent = paraContent.replace(/\[LINK:(.*?)\](.*?)\[\/LINK\]/g, (_, url, content) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.textContent = content;
                    a.target = '_blank';
                    p.appendChild(a);
                    return '';
                });
                paraContent = paraContent.replace(/\[CODE\](.*?)\[\/CODE\]/g, (_, content) => {
                    const code = document.createElement('code');
                    code.textContent = content;
                    p.appendChild(code);
                    return '';
                });
                if (paraContent.trim()) {
                    p.appendChild(document.createTextNode(paraContent));
                }
                if (p.hasChildNodes()) {
                    container.appendChild(p);
                }
            });
        };
        let remainingText = processHeadings(markdownText);
        processText(remainingText);
    }

    setVocabularyManager(manager: VocabularyManager) {
        this.vocabularyManager = manager;
    }

    private registerEvents() {
        document.addEventListener('mouseover', this.eventHandlers.mouseover);
        document.addEventListener('mouseout', this.eventHandlers.mouseout);
    }

    /**
     * 优化后的移出事件，鼠标处于高亮词或者tooltip上时不消失
     */
    private handleMouseOut(event: MouseEvent) {
        clearTimeout(this.tooltipHideTimeout);
        const from = event.target as HTMLElement;
        const to = event.relatedTarget as HTMLElement | null;

        // 1. 鼠标进入tooltip，不移除
        if (
            to &&
            this.activeTooltip &&
            (to === this.activeTooltip || this.activeTooltip.contains(to))
        ) {
            return;
        }
        // 2. 鼠标在高亮词之间移动，不移除
        if (
            from &&
            to &&
            from.classList.contains('hi-words-highlight') &&
            to.classList.contains('hi-words-highlight')
        ) {
            return;
        }
        // 3. 鼠标从tooltip移到高亮词，不移除
        if (
            from &&
            this.activeTooltip &&
            this.activeTooltip.contains(from) &&
            to &&
            to.classList.contains('hi-words-highlight')
        ) {
            return;
        }

        // 其余情况，稍延迟关闭 tooltip，防止极快移动出现闪烁
        this.tooltipHideTimeout = window.setTimeout(() => {
            this.removeTooltip();
        }, 80);
    }

    private handleMouseOver(event: MouseEvent) {
        const target = event.target as HTMLElement;

        if (target && target.classList.contains('hi-words-highlight')) {
            const word = target.getAttribute('data-word');
            const definition = target.getAttribute('data-definition');
            if (word && definition) {
                this.createTooltip(target, word, definition);
            }
        }
    }

    private createTooltip(target: HTMLElement, word: string, definition: string) {
        this.removeTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'hi-words-tooltip';

        // 标题
        const titleEl = document.createElement('div');
        titleEl.className = 'hi-words-tooltip-title';
        titleEl.textContent = word;
        tooltip.appendChild(titleEl);

        // 内容
        const contentEl = document.createElement('div');
        contentEl.className = 'hi-words-tooltip-content';

        if (!definition || definition.trim() === '') {
            contentEl.textContent = t('sidebar.no_definition');
            tooltip.appendChild(contentEl);
        } else {
            tooltip.appendChild(contentEl);
            try {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.file) {
                    MarkdownRenderer.renderMarkdown(
                        definition,
                        contentEl,
                        activeView.file.path,
                        activeView
                    );
                } else {
                    const formattedText = this.simpleMarkdownToHtml(definition);
                    this.setContentSafely(contentEl, formattedText);
                }
            } catch (error) {
                console.error('Markdown 渲染失败:', error);
                contentEl.textContent = definition;
            }
        }

        if (this.vocabularyManager) {
            const detailDef = this.vocabularyManager.getDefinition(word);
            if (detailDef && detailDef.source) {
                const sourceEl = document.createElement('div');
                sourceEl.className = 'hi-words-tooltip-source';
                const fileName = detailDef.source.split('/').pop() || '';
                const displayName = fileName.endsWith('.canvas') ? fileName.slice(0, -7) : fileName;
                sourceEl.textContent = `${t('sidebar.source_prefix')}${displayName}`;
                tooltip.appendChild(sourceEl);
            }
        }

        document.body.appendChild(tooltip);

        // 定位
        const rect = target.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        tooltip.style.left = (rect.left + scrollLeft) + 'px';
        tooltip.style.top = (rect.bottom + scrollTop + 5) + 'px';

        // 防止右边溢出
        setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            if (tooltipRect.right > viewportWidth - 10) {
                const overflow = tooltipRect.right - viewportWidth + 10;
                tooltip.style.left = (parseFloat(tooltip.style.left) - overflow) + 'px';
            }
        }, 0);

        // 只有 mouseleave 时真正关闭（不会一闪一闪了）
        tooltip.addEventListener('mouseleave', (e) => {
            this.removeTooltip();
        });

        this.activeTooltip = tooltip;
    }

    private removeTooltip() {
        clearTimeout(this.tooltipHideTimeout);
        if (this.activeTooltip && this.activeTooltip.parentNode) {
            this.activeTooltip.parentNode.removeChild(this.activeTooltip);
            this.activeTooltip = null;
        }
    }

    unload() {
        document.removeEventListener('mouseover', this.eventHandlers.mouseover);
        document.removeEventListener('mouseout', this.eventHandlers.mouseout);
        this.removeTooltip();
    }
}
