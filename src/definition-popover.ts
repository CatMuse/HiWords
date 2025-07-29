import { App, MarkdownRenderer, MarkdownView, Notice } from 'obsidian';
import { VocabularyManager } from './vocabulary-manager';
import { t } from './i18n';

export class DefinitionPopover {
    private app: App;
    private activeTooltip: HTMLElement | null = null;
    private vocabularyManager: VocabularyManager | null = null;
    private eventHandlers: {[key: string]: EventListener} = {};

    constructor(app: App) {
        this.app = app;
        
        // 初始化事件处理函数
        this.eventHandlers = {
            mouseover: this.handleMouseOver.bind(this),
            mouseout: this.handleMouseOut.bind(this)
        };
        
        // 添加全局事件监听器
        this.registerEvents();
    }

    /**
     * 简单的 Markdown 转 HTML 处理
     * 处理基本的 Markdown 语法，如粗体、斜体、链接等
     */
    private simpleMarkdownToHtml(markdown: string): string {
        if (!markdown) return '';
        
        let html = markdown
            // 转义 HTML 特殊字符
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            
            // 标题
            .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
            .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
            .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
            
            // 粗体和斜体
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/__(.*?)__/g, '<strong>$1</strong>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            
            // 链接
            .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            
            // 列表
            .replace(/^\* (.*?)$/gm, '<li>$1</li>')
            .replace(/^\d+\. (.*?)$/gm, '<li>$1</li>')
            
            // 引用
            .replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>')
            
            // 代码
            .replace(/`(.*?)`/g, '<code>$1</code>')
            
            // 换行
            .replace(/\n/g, '<br>');
            
        return html;
    }
    
    /**
     * 安全地设置内容，使用 DOM API 而不是 innerHTML
     * @param container 要设置内容的容器元素
     * @param markdownText 包含简单 Markdown 标记的字符串
     */
    private setContentSafely(container: HTMLElement, markdownText: string): void {
        // 清空容器
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        
        // 处理标题
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
        
        // 处理剩余文本
        const processText = (text: string) => {
            if (!text.trim()) return;
            
            // 处理粗体和斜体
            text = text.replace(/\*\*(.*?)\*\*/g, (_, content) => {
                const strong = document.createElement('strong');
                strong.textContent = content;
                return `[STRONG]${content}[/STRONG]`;
            });
            
            text = text.replace(/\*(.*?)\*/g, (_, content) => {
                const em = document.createElement('em');
                em.textContent = content;
                return `[EM]${content}[/EM]`;
            });
            
            // 处理链接
            text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (_, linkText, url) => {
                const a = document.createElement('a');
                a.href = url;
                a.textContent = linkText;
                a.target = '_blank';
                return `[LINK:${url}]${linkText}[/LINK]`;
            });
            
            // 处理代码
            text = text.replace(/`(.*?)`/g, (_, content) => {
                const code = document.createElement('code');
                code.textContent = content;
                return `[CODE]${content}[/CODE]`;
            });
            
            // 处理换行
            const paragraphs = text.split('\n');
            paragraphs.forEach(para => {
                if (!para.trim()) return;
                
                const p = document.createElement('p');
                
                // 替换标记为真正的 DOM 元素
                let paraContent = para;
                
                // 处理粗体
                paraContent = paraContent.replace(/\[STRONG\](.*?)\[\/STRONG\]/g, (_, content) => {
                    const strong = document.createElement('strong');
                    strong.textContent = content;
                    p.appendChild(strong);
                    return '';
                });
                
                // 处理斜体
                paraContent = paraContent.replace(/\[EM\](.*?)\[\/EM\]/g, (_, content) => {
                    const em = document.createElement('em');
                    em.textContent = content;
                    p.appendChild(em);
                    return '';
                });
                
                // 处理链接
                paraContent = paraContent.replace(/\[LINK:(.*?)\](.*?)\[\/LINK\]/g, (_, url, content) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.textContent = content;
                    a.target = '_blank';
                    p.appendChild(a);
                    return '';
                });
                
                // 处理代码
                paraContent = paraContent.replace(/\[CODE\](.*?)\[\/CODE\]/g, (_, content) => {
                    const code = document.createElement('code');
                    code.textContent = content;
                    p.appendChild(code);
                    return '';
                });
                
                // 处理剩余文本
                if (paraContent.trim()) {
                    p.appendChild(document.createTextNode(paraContent));
                }
                
                if (p.hasChildNodes()) {
                    container.appendChild(p);
                }
            });
        };
        
        // 先处理标题，然后处理其他文本
        let remainingText = processHeadings(markdownText);
        processText(remainingText);
    }

    /**
     * 设置词汇管理器
     */
    setVocabularyManager(manager: VocabularyManager) {
        this.vocabularyManager = manager;
    }

    /**
     * 注册事件监听器
     */
    private registerEvents() {
        // 监听鼠标悬停事件
        document.addEventListener('mouseover', this.eventHandlers.mouseover);
        document.addEventListener('mouseout', this.eventHandlers.mouseout);
    }

    /**
     * 处理鼠标悬停事件
     */
    private handleMouseOver(event: MouseEvent) {
        const target = event.target as HTMLElement;
        
        // 检查是否悬停在高亮词汇上
        if (target && target.classList.contains('hi-words-highlight')) {
            // 获取词汇和定义
            const word = target.getAttribute('data-word');
            const definition = target.getAttribute('data-definition');
            
            if (word && definition) {
                // 创建并显示工具提示
                this.createTooltip(target, word, definition);
            }
        }
    }

    /**
     * 处理鼠标移出事件
     */
    private handleMouseOut(event: MouseEvent) {
        // 移除工具提示
        this.removeTooltip();
    }
    


    /**
     * 创建工具提示
     */
    private createTooltip(target: HTMLElement, word: string, definition: string) {
        // 如果已经有工具提示，先移除它
        this.removeTooltip();
        
        // 创建工具提示元素
        const tooltip = document.createElement('div');
        tooltip.className = 'hi-words-tooltip';
        
        // 创建标题
        const titleEl = document.createElement('div');
        titleEl.className = 'hi-words-tooltip-title';
        titleEl.textContent = word;
        tooltip.appendChild(titleEl);
        
        // 创建内容
        const contentEl = document.createElement('div');
        contentEl.className = 'hi-words-tooltip-content';
        
        // 如果定义为空，显示提示信息
        if (!definition || definition.trim() === '') {
            contentEl.textContent = t('sidebar.no_definition');
            tooltip.appendChild(contentEl);
        } else {
            tooltip.appendChild(contentEl);
            
            // 使用 Obsidian 的 MarkdownRenderer 渲染 Markdown 内容
            try {
                // 使用更安全的方式渲染 Markdown
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.file) {
                    // 安全地使用 MarkdownRenderer
                    MarkdownRenderer.renderMarkdown(
                        definition,
                        contentEl,
                        activeView.file.path,
                        activeView
                    );
                } else {
                    // 如果没有活动的 MarkdownView 或文件为空，尝试使用更简单的方法
                    // 使用 DOM API 安全地创建元素
                    const formattedText = this.simpleMarkdownToHtml(definition);
                    this.setContentSafely(contentEl, formattedText);
                }
            } catch (error) {
                // 如果渲染失败，回退到纯文本显示
                console.error('Markdown 渲染失败:', error);
                contentEl.textContent = definition;
            }
        }
        
        // 获取更多详细信息（如果有词汇管理器）
        if (this.vocabularyManager) {
            const detailDef = this.vocabularyManager.getDefinition(word);
            if (detailDef && detailDef.source) {
                // 添加来源信息
                const sourceEl = document.createElement('div');
                sourceEl.className = 'hi-words-tooltip-source';
                // 获取文件名并移除.canvas后缀
                const fileName = detailDef.source.split('/').pop() || '';
                const displayName = fileName.endsWith('.canvas') ? fileName.slice(0, -7) : fileName;
                sourceEl.textContent = `${t('sidebar.source_prefix')}${displayName}`;
                tooltip.appendChild(sourceEl);
            }
        }
        
        // 将工具提示添加到文档中
        document.body.appendChild(tooltip);
        
        // 计算位置
        const rect = target.getBoundingClientRect();
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top = (rect.bottom + 5) + 'px';
        
        // 考虑滚动位置
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        tooltip.style.left = (rect.left + scrollLeft) + 'px';
        tooltip.style.top = (rect.bottom + scrollTop + 5) + 'px';
        
        // 确保工具提示不会超出屏幕边缘
        setTimeout(() => {
            const tooltipRect = tooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            
            if (tooltipRect.right > viewportWidth - 10) {
                const overflow = tooltipRect.right - viewportWidth + 10;
                tooltip.style.left = (parseFloat(tooltip.style.left) - overflow) + 'px';
            }
        }, 0);
        
        // 保存引用
        this.activeTooltip = tooltip;
    }

    /**
     * 移除工具提示
     */
    private removeTooltip() {
        if (this.activeTooltip && this.activeTooltip.parentNode) {
            this.activeTooltip.parentNode.removeChild(this.activeTooltip);
            this.activeTooltip = null;
        }
    }

    /**
     * 卸载
     */
    unload() {
        // 移除事件监听器
        document.removeEventListener('mouseover', this.eventHandlers.mouseover);
        document.removeEventListener('mouseout', this.eventHandlers.mouseout);
        
        // 移除工具提示
        this.removeTooltip();
    }
}
