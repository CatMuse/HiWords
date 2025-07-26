import { App, Component, MarkdownRenderer } from 'obsidian';
import { WordDefinition } from './types';

export class DefinitionPopover extends Component {
    private app: App;
    private popoverEl: HTMLElement | null = null;
    private isVisible = false;

    constructor(app: App) {
        super();
        this.app = app;
        this.setupEventListeners();
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners() {
        // 监听鼠标悬停事件
        document.addEventListener('mouseover', this.handleMouseOver.bind(this));
        document.addEventListener('mouseout', this.handleMouseOut.bind(this));
        
        // 监听点击事件隐藏弹窗
        document.addEventListener('click', this.handleClick.bind(this));
    }

    /**
     * 处理鼠标悬停
     */
    private async handleMouseOver(event: MouseEvent) {
        const target = event.target as HTMLElement;
        
        if (target.classList.contains('hello-word-highlight')) {
            const word = target.getAttribute('data-word');
            const definition = target.getAttribute('data-definition');
            
            if (word && definition) {
                await this.showPopover(target, word, definition);
            }
        }
    }

    /**
     * 处理鼠标离开
     */
    private handleMouseOut(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const relatedTarget = event.relatedTarget as HTMLElement;
        
        // 如果鼠标移动到弹窗上，不隐藏
        if (this.popoverEl && (
            relatedTarget === this.popoverEl || 
            this.popoverEl.contains(relatedTarget)
        )) {
            return;
        }
        
        // 如果鼠标离开高亮词汇，延迟隐藏弹窗
        if (target.classList.contains('hello-word-highlight')) {
            setTimeout(() => {
                if (!this.isHoveringPopover()) {
                    this.hidePopover();
                }
            }, 100);
        }
    }

    /**
     * 处理点击事件
     */
    private handleClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        
        // 如果点击的不是弹窗或高亮词汇，隐藏弹窗
        if (this.popoverEl && 
            !this.popoverEl.contains(target) && 
            !target.classList.contains('hello-word-highlight')) {
            this.hidePopover();
        }
    }

    /**
     * 显示定义弹窗
     */
    private async showPopover(target: HTMLElement, word: string, definition: string) {
        if (this.isVisible) {
            this.hidePopover();
        }

        this.popoverEl = document.createElement('div');
        this.popoverEl.className = 'hello-word-popover';
        
        // 创建弹窗内容
        const contentEl = document.createElement('div');
        contentEl.className = 'hello-word-popover-content';
        
        // 词汇标题
        const titleEl = document.createElement('div');
        titleEl.className = 'hello-word-popover-title';
        titleEl.textContent = word;
        
        // 定义内容
        const definitionEl = document.createElement('div');
        definitionEl.className = 'hello-word-popover-definition';
        
        // 渲染 Markdown 内容
        if (definition.trim()) {
            await MarkdownRenderer.renderMarkdown(
                definition, 
                definitionEl, 
                '', 
                this
            );
        } else {
            definitionEl.textContent = '暂无定义';
        }
        
        contentEl.appendChild(titleEl);
        contentEl.appendChild(definitionEl);
        this.popoverEl.appendChild(contentEl);
        
        // 添加到 DOM
        document.body.appendChild(this.popoverEl);
        
        // 定位弹窗
        this.positionPopover(target);
        
        // 添加悬停事件到弹窗
        this.popoverEl.addEventListener('mouseenter', () => {
            this.isVisible = true;
        });
        
        this.popoverEl.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (!this.isHoveringTarget(target)) {
                    this.hidePopover();
                }
            }, 100);
        });
        
        this.isVisible = true;
    }

    /**
     * 定位弹窗
     */
    private positionPopover(target: HTMLElement) {
        if (!this.popoverEl) return;

        const targetRect = target.getBoundingClientRect();
        const popoverRect = this.popoverEl.getBoundingClientRect();
        
        let left = targetRect.left + targetRect.width / 2 - popoverRect.width / 2;
        let top = targetRect.bottom + 8;
        
        // 确保弹窗不超出视窗边界
        const margin = 10;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // 水平位置调整
        if (left < margin) {
            left = margin;
        } else if (left + popoverRect.width > viewportWidth - margin) {
            left = viewportWidth - popoverRect.width - margin;
        }
        
        // 垂直位置调整
        if (top + popoverRect.height > viewportHeight - margin) {
            top = targetRect.top - popoverRect.height - 8;
        }
        
        this.popoverEl.style.left = `${left}px`;
        this.popoverEl.style.top = `${top}px`;
    }

    /**
     * 隐藏弹窗
     */
    private hidePopover() {
        if (this.popoverEl) {
            this.popoverEl.remove();
            this.popoverEl = null;
        }
        this.isVisible = false;
    }

    /**
     * 检查是否正在悬停弹窗
     */
    private isHoveringPopover(): boolean {
        if (!this.popoverEl) return false;
        
        const rect = this.popoverEl.getBoundingClientRect();
        const mouseX = event instanceof MouseEvent ? event.clientX : 0;
        const mouseY = event instanceof MouseEvent ? event.clientY : 0;
        
        return mouseX >= rect.left && 
               mouseX <= rect.right && 
               mouseY >= rect.top && 
               mouseY <= rect.bottom;
    }

    /**
     * 检查是否正在悬停目标元素
     */
    private isHoveringTarget(target: HTMLElement): boolean {
        const rect = target.getBoundingClientRect();
        const mouseX = event instanceof MouseEvent ? event.clientX : 0;
        const mouseY = event instanceof MouseEvent ? event.clientY : 0;
        
        return mouseX >= rect.left && 
               mouseX <= rect.right && 
               mouseY >= rect.top && 
               mouseY <= rect.bottom;
    }

    /**
     * 清理资源
     */
    onunload() {
        this.hidePopover();
        document.removeEventListener('mouseover', this.handleMouseOver.bind(this));
        document.removeEventListener('mouseout', this.handleMouseOut.bind(this));
        document.removeEventListener('click', this.handleClick.bind(this));
    }
}
