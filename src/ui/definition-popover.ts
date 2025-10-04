import { App, MarkdownRenderer, MarkdownView, Notice, setIcon, TFile, Component } from 'obsidian';
import { VocabularyManager, MasteredService } from '../core';
import { playWordTTS } from '../utils';
import { t } from '../i18n';
import HiWordsPlugin from '../../main';

export class DefinitionPopover extends Component {
    private app: App;
    private plugin: HiWordsPlugin;
    private activeTooltip: HTMLElement | null = null;
    private vocabularyManager: VocabularyManager | null = null;
    private masteredService: MasteredService | null = null;
    private eventHandlers: {[key: string]: EventListener} = {};
    private tooltipHideTimeout: number | undefined;
    private currentTargetEl: HTMLElement | null = null; // 当前已显示 tooltip 的高亮元素，避免重复创建
    private hoverIntentTimer: number | null = null; // 悬停意图定时器，避免频繁抖动
    private lastShowTs = 0; // 上一次显示时间戳，做最小间隔限制
    private static readonly SHOW_DELAY_MS = 120; // 悬停到显示的延迟
    private static readonly MIN_INTERVAL_MS = 150; // 两次显示的最小间隔

    constructor(plugin: HiWordsPlugin) {
        super();
        this.app = plugin.app;
        this.plugin = plugin;

        this.eventHandlers = {
            mouseover: this.handleMouseOver.bind(this),
            mouseout: this.handleMouseOut.bind(this),
            scroll: (() => this.removeTooltip()).bind(this),
            resize: (() => this.removeTooltip()).bind(this),
        };

        this.registerEvents();
    }

    /**
     * 绑定内部链接与标签的交互：
     * - internal-link: 悬停触发原生预览，点击打开链接
     * - tag: 点击打开/复用搜索视图
     */
    private bindInternalLinksAndTags(root: HTMLElement, sourcePath: string, hoverParent: HTMLElement) {
        // 内部链接
        root.querySelectorAll('a.internal-link').forEach((a) => {
            const linkEl = a as HTMLAnchorElement;
            const linktext = (linkEl.getAttribute('href') || (linkEl as any).dataset?.href || '').trim();
            if (!linktext) return;

            linkEl.addEventListener('mouseover', (evt) => {
                // 触发原生悬停预览
                (this.app.workspace as any).trigger('hover-link', {
                    event: evt,
                    source: 'hi-words',
                    hoverParent,
                    target: linkEl,
                    linktext,
                    sourcePath
                });
            });

            linkEl.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.app.workspace.openLinkText(linktext, sourcePath);
                // 关闭 tooltip（若存在）
                this.removeTooltip();
            });
        });

        // 标签
        root.querySelectorAll('a.tag').forEach((a) => {
            const tagEl = a as HTMLAnchorElement;
            const query = (tagEl.getAttribute('href') || tagEl.textContent || '').trim();
            if (!query) return;
            tagEl.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.openOrUpdateSearch(query.startsWith('#') ? query : `#${query}`);
                this.removeTooltip();
            });
        });
    }

    /** 打开或复用全局搜索视图并设置查询 */
    private openOrUpdateSearch(query: string) {
        try {
            const leaves = this.app.workspace.getLeavesOfType('search');
            if (leaves.length > 0) {
                const view: any = leaves[0].view;
                view.setQuery?.(query);
                this.app.workspace.revealLeaf(leaves[0]);
                return;
            }

            // 如果搜索视图不存在，提示用户启用搜索插件
            new Notice(t('notices.enable_search_plugin') || '请先启用核心搜索插件');
        } catch (e) {
            console.error('打开搜索失败:', e);
        }
    }

    setVocabularyManager(manager: VocabularyManager) {
        this.vocabularyManager = manager;
    }

    setMasteredService(service: MasteredService) {
        this.masteredService = service;
    }

    private registerEvents() {
        // 使用 registerDomEvent 注册事件，确保在组件卸载时自动清理
        this.registerDomEvent(document, 'mouseover', this.eventHandlers.mouseover);
        this.registerDomEvent(document, 'mouseout', this.eventHandlers.mouseout);
        // 滚动或窗口尺寸变化时，直接关闭 tooltip，避免频繁重定位
        this.registerDomEvent(window, 'scroll', this.eventHandlers.scroll as EventListener, { passive: true });
        this.registerDomEvent(window, 'resize', this.eventHandlers.resize as EventListener);
    }

    /**
     * 优化后的移出事件，鼠标处于高亮词或者tooltip上时不消失
     */
    private handleMouseOut(event: MouseEvent) {
        clearTimeout(this.tooltipHideTimeout);
        if (this.hoverIntentTimer !== null) {
            clearTimeout(this.hoverIntentTimer);
            this.hoverIntentTimer = null;
        }
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
        const raw = event.target as HTMLElement;
        const target = raw?.closest?.('.hi-words-highlight') as HTMLElement | null;

        if (target) {
            // 如果当前已有 tooltip 且目标相同则忽略
            if (this.currentTargetEl === target && this.activeTooltip) return;
            // 先取消上一个 hoverIntent
            if (this.hoverIntentTimer !== null) {
                clearTimeout(this.hoverIntentTimer);
                this.hoverIntentTimer = null;
            }
            this.currentTargetEl = target;
            const word = target.getAttribute('data-word');
            const definition = target.getAttribute('data-definition');
            if (!word || !definition) return;

            // 悬停意图：延迟展示，避免快速划过时频繁创建
            this.hoverIntentTimer = window.setTimeout(() => {
                this.hoverIntentTimer = null;
                const now = Date.now();
                if (now - this.lastShowTs < DefinitionPopover.MIN_INTERVAL_MS) {
                    return; // 限流：距离上次显示太近
                }
                this.lastShowTs = now;
                // 使用 void 处理 async 函数
                void this.createTooltip(target, word, definition);
            }, DefinitionPopover.SHOW_DELAY_MS);
        }
    }

    private async createTooltip(target: HTMLElement, word: string, definition: string) {
        this.removeTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'hi-words-tooltip';

        // 标题容器
        const titleContainer = document.createElement('div');
        titleContainer.className = 'hi-words-tooltip-title-container';
        
        // 标题文本
        const titleEl = document.createElement('div');
        titleEl.className = 'hi-words-tooltip-title';
        titleEl.textContent = word;
        titleContainer.appendChild(titleEl);
        // 点击标题发音
        titleEl.title = '点击发音';
        titleEl.addEventListener('click', async (e) => {
            e.stopPropagation();
            await playWordTTS(this.plugin, word);
        });
        
        // 先添加标题容器
        tooltip.appendChild(titleContainer);

        // 内容
        const contentEl = document.createElement('div');
        contentEl.className = 'hi-words-tooltip-content';
        
        // 如果启用了模糊效果，为内容添加模糊样式
        if (this.plugin.settings.blurDefinitions) {
            contentEl.classList.add('hi-words-definition', 'blur-enabled');
        } else {
            contentEl.classList.add('hi-words-definition');
        }

        if (!definition || definition.trim() === '') {
            contentEl.textContent = t('sidebar.no_definition');
        } else {
            try {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                const sourcePath = (activeView && activeView.file?.path) || this.app.workspace.getActiveFile()?.path || '';
                
                // 创建一个短生命周期的 Component
                const tempComponent = new Component();
                tempComponent.load();
                
                // 使用新的 render API
                await MarkdownRenderer.render(
                    this.app,
                    definition,
                    contentEl,
                    sourcePath,
                    tempComponent
                );
                
                // 渲染完成后绑定交互（下一帧，确保节点已生成）
                requestAnimationFrame(() => this.bindInternalLinksAndTags(contentEl, sourcePath, tooltip));
                
                // 在 tooltip 被移除时卸载 component
                tooltip.addEventListener('remove', () => tempComponent.unload(), { once: true });
            } catch (error) {
                console.error('Markdown 渲染失败:', error);
                // 降级为纯文本显示
                contentEl.textContent = definition;
            }
        }
        tooltip.appendChild(contentEl);

        // 添加已掌握按钮和源信息
        if (this.vocabularyManager) {
            const detailDef = this.vocabularyManager.getDefinition(word);
            if (detailDef && detailDef.source) {
                // 已掌握按钮（添加到标题容器中）
                if (this.masteredService && this.masteredService.isEnabled) {
                    const buttonContainer = document.createElement('div');
                    buttonContainer.className = 'hi-words-tooltip-title-mastered-button';
                    // 移除 aria-label 以避免与弹出框重叠
                    
                    // 设置图标（未掌握显示smile供用户点击标记为已掌握，已掌握显示frown供用户点击取消）
                    setIcon(buttonContainer, detailDef.mastered ? 'frown' : 'smile');
                    
                    // 添加点击事件
                    buttonContainer.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        
                        try {
                            // 切换已掌握状态
                            if (detailDef.mastered) {
                                await this.masteredService!.unmarkWordAsMastered(detailDef.source, detailDef.nodeId, detailDef.word);
                            } else {
                                await this.masteredService!.markWordAsMastered(detailDef.source, detailDef.nodeId, detailDef.word);
                            }
                            
                            // 点击已掌握按钮后清理预览框
                            this.removeTooltip();
                        } catch (error) {
                            console.error('切换已掌握状态失败:', error);
                        }
                    });
                    
                    // 添加到标题容器
                    titleContainer.appendChild(buttonContainer);
                }
                
                // 源信息
                const sourceEl = document.createElement('div');
                sourceEl.className = 'hi-words-tooltip-source';
                const fileName = detailDef.source.split('/').pop() || '';
                const displayName = fileName.endsWith('.canvas') ? fileName.slice(0, -7) : fileName;
                sourceEl.textContent = `${t('sidebar.source_prefix')}${displayName}`;
                
                // 添加点击事件到来源信息：导航到源文件
                sourceEl.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止事件冒泡
                    this.navigateToSource(detailDef);
                    // 点击跳转后清理预览框
                    this.removeTooltip();
                });
                
                tooltip.appendChild(sourceEl);
            }
        }

        document.body.appendChild(tooltip);

        // 使用 rAF 统一完成定位与溢出修正，减少多次布局抖动
        requestAnimationFrame(() => {
            // 读：目标位置与视口
            const rect = target.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            const viewportWidth = window.innerWidth;

            // 写：初始定位
            const left = rect.left + scrollLeft;
            const top = rect.bottom + scrollTop + 5;
            tooltip.style.left = left + 'px';
            tooltip.style.top = top + 'px';

            // 读：tooltip 自身尺寸
            const tooltipRect = tooltip.getBoundingClientRect();

            // 写：右侧溢出修正
            if (tooltipRect.right > viewportWidth - 10) {
                const overflow = tooltipRect.right - viewportWidth + 10;
                tooltip.style.left = (left - overflow) + 'px';
            }
        });

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
        this.currentTargetEl = null;
    }

    /**
     * 导航到单词源文件
     */
    private async navigateToSource(wordDef: any) {
        try {
            const file = this.app.vault.getAbstractFileByPath(wordDef.source);
            if (file instanceof TFile) {
                // 如果是 Canvas 文件，直接打开
                if (file.extension === 'canvas') {
                    await this.app.workspace.openLinkText(file.path, '');
                } else {
                    // 如果是 Markdown 文件，打开并尝试定位到单词
                    await this.app.workspace.openLinkText(file.path, '');
                    // 等待一个短暂时间让文件加载
                    setTimeout(() => {
                        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                        if (activeView && activeView.file?.path === file.path) {
                            // 尝试在文件中查找单词
                            const editor = activeView.editor;
                            const content = editor.getValue();
                            const wordIndex = content.toLowerCase().indexOf(wordDef.word.toLowerCase());
                            if (wordIndex !== -1) {
                                const pos = editor.offsetToPos(wordIndex);
                                editor.setCursor(pos);
                                editor.scrollIntoView({ from: pos, to: pos }, true);
                            }
                        }
                    }, 100);
                }
            }
        } catch (error) {
            console.error('导航到源文件失败:', error);
        }
    }

    onunload() {
        // registerDomEvent 注册的事件会自动清理，这里只需清理 tooltip
        this.removeTooltip();
    }
}
