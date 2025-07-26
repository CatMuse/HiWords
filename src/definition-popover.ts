import { App, MarkdownRenderer, MarkdownView, Notice } from 'obsidian';
import { VocabularyManager } from './vocabulary-manager';

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
        if (target && target.classList.contains('hello-word-highlight')) {
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
        tooltip.className = 'hello-word-tooltip';
        
        // 创建标题
        const titleEl = document.createElement('div');
        titleEl.className = 'hello-word-tooltip-title';
        titleEl.textContent = word;
        tooltip.appendChild(titleEl);
        
        // 创建内容
        const contentEl = document.createElement('div');
        contentEl.className = 'hello-word-tooltip-content';
        
        // 如果定义为空，显示提示信息
        if (!definition || definition.trim() === '') {
            contentEl.textContent = '暂无定义';
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
                    // 使用基本的 HTML 标记来模拟 Markdown 效果
                    const formattedText = this.simpleMarkdownToHtml(definition);
                    contentEl.innerHTML = formattedText;
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
                sourceEl.className = 'hello-word-tooltip-source';
                sourceEl.textContent = `来源: ${detailDef.source.split('/').pop()}`;
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
