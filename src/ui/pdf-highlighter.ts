import type { HiWordsSettings } from '../utils';
import { Trie, mapCanvasColorToCSSVar } from '../utils';
import type { VocabularyManager } from '../core';
import { isElementVisible, buildTrieFromVocabulary } from '../utils/highlight-utils';

/**
 * 在 PDF 视图中注册单词高亮功能
 * 通过监听 PDF 文本层的渲染，实现对 PDF 内容的单词高亮
 */
export function registerPDFHighlighter(plugin: {
  settings: HiWordsSettings;
  vocabularyManager: VocabularyManager;
  shouldHighlightFile: (filePath: string) => boolean;
  app: any;
  registerEvent: (eventRef: any) => void;
}): void {
  const processedTextLayers = new WeakSet<HTMLElement>();
  let debounceTimer: number | null = null;
  let refreshTimer: number | null = null;
  let refreshBurstTimers: number[] = [];
  const observedTextLayers = new WeakSet<HTMLElement>();

  const clearRefreshBurstTimers = () => {
    refreshBurstTimers.forEach(timer => window.clearTimeout(timer));
    refreshBurstTimers = [];
  };

  const debouncedRefreshPDF = (delay = 150) => {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }

    refreshTimer = window.setTimeout(() => {
      refreshVisiblePDFPages(plugin, processedTextLayers);
      refreshTimer = null;
    }, delay);
  };

  const refreshPDFSoon = () => {
    clearRefreshBurstTimers();
    [0, 80, 200, 500, 1000].forEach((delay) => {
      const timer = window.setTimeout(() => {
        refreshVisiblePDFPages(plugin, processedTextLayers);
        refreshBurstTimers = refreshBurstTimers.filter(activeTimer => activeTimer !== timer);
      }, delay);
      refreshBurstTimers.push(timer);
    });
  };

  const handleWindowResize = () => refreshPDFSoon();
  const handleWindowScroll = () => debouncedRefreshPDF(120);

  const resizeObserver = new ResizeObserver((entries) => {
    let shouldRefresh = false;

    entries.forEach((entry) => {
      const target = entry.target as HTMLElement;
      if (target.closest('.pdf-container, .mod-pdf')) {
        shouldRefresh = true;
      }
    });

    if (shouldRefresh) {
      refreshPDFSoon();
    }
  });

  /**
   * 处理 PDF 文本层高亮
   */
  const processPDFTextLayer = (textLayer: HTMLElement, trie: Trie) => {
    // 避免重复处理同一个文本层
    if (processedTextLayers.has(textLayer)) {
      return;
    }
    processedTextLayers.add(textLayer);

    try {
      observePDFTextLayer(textLayer);
      highlightPDFTextSpans(textLayer, trie, plugin.settings.highlightStyle || 'underline');
    } catch (error) {
      console.error('PDF 文本层高亮处理失败:', error);
    }
  };

  const observePDFTextLayer = (textLayer: HTMLElement) => {
    if (observedTextLayers.has(textLayer)) return;
    observedTextLayers.add(textLayer);
    resizeObserver.observe(textLayer);

    const page = textLayer.closest('.page');
    if (page instanceof HTMLElement) {
      resizeObserver.observe(page);
    }
  };

  /**
   * 防抖处理 PDF 高亮更新
   */
  const debouncedProcessPDF = () => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    
    debounceTimer = window.setTimeout(() => {
      if (!plugin.settings.enableAutoHighlight) return;
      
      // 获取当前活动文件
      const activeFile = plugin.app.workspace.getActiveFile();
      if (activeFile && !plugin.shouldHighlightFile(activeFile.path)) {
        return;
      }
      
      const trie = buildTrieFromVocabulary(plugin.vocabularyManager);
      
      // 查找所有 PDF 文本层
      const textLayers = document.querySelectorAll('.textLayer');
      textLayers.forEach((textLayer) => {
        // 检查是否在 PDF 视图中
        const pdfContainer = textLayer.closest('.pdf-container, .mod-pdf');
        if (pdfContainer) {
          processPDFTextLayer(textLayer as HTMLElement, trie);
        }
      });
      
      debounceTimer = null;
    }, 300);
  };

  /**
   * 监听 PDF 视图变化
   */
  const setupPDFObserver = () => {
    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      let shouldRefresh = false;
      
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.target instanceof HTMLElement &&
          (mutation.target.classList.contains('textLayer') || mutation.target.classList.contains('page')) &&
          mutation.target.closest('.pdf-container, .mod-pdf')
        ) {
          shouldRefresh = true;
        }

        // 检查新增的节点
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            
            // 检测 PDF 文本层
            if (element.classList.contains('textLayer') || 
                element.querySelector('.textLayer')) {
              shouldProcess = true;
            }
            
            // 检测 PDF 页面容器
            if (element.classList.contains('page') && 
                element.closest('.pdf-container, .mod-pdf')) {
              shouldProcess = true;
            }
          }
        });
      });
      
      if (shouldRefresh) {
        refreshPDFSoon();
      }

      if (shouldProcess) {
        debouncedProcessPDF();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-main-rotation'],
      characterData: false
    });

    return observer;
  };

  /**
   * 监听工作区布局变化
   */
  plugin.registerEvent(
    plugin.app.workspace.on('layout-change', () => {
      // 延迟处理，确保 PDF 视图完全加载
      setTimeout(() => {
        refreshPDFSoon();
      }, 500);
    })
  );

  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('scroll', handleWindowScroll, true);

  /**
   * 监听活动叶子变化
   */
  plugin.registerEvent(
    plugin.app.workspace.on('active-leaf-change', (leaf: any) => {
      if (leaf?.view?.getViewType() === 'pdf') {
        // 当切换到 PDF 视图时，延迟处理高亮
        setTimeout(() => {
          debouncedProcessPDF();
        }, 1000);
      }
    })
  );

  /**
   * 监听文件打开事件
   */
  plugin.registerEvent(
    plugin.app.workspace.on('file-open', (file: any) => {
      if (file?.extension === 'pdf') {
        setTimeout(() => {
          debouncedProcessPDF();
        }, 1500);
      }
    })
  );

  // 设置 DOM 观察者
  const observer = setupPDFObserver();

  // 初始处理已存在的 PDF 视图
  setTimeout(() => {
    debouncedProcessPDF();
  }, 1000);

  // 清理函数（如果需要的话）
  const cleanup = () => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }
    clearRefreshBurstTimers();
    observer.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('scroll', handleWindowScroll, true);
    clearAllPDFHighlights();
  };

  // 将清理函数存储到插件实例上（可选）
  (plugin as any)._pdfHighlighterCleanup = cleanup;
  
  // 导出刷新函数到插件实例
  (plugin as any)._refreshPDFHighlighter = () => {
    refreshVisiblePDFPages(plugin, processedTextLayers);
  };
}

/**
 * 清除 PDF 文本层中的所有高亮标记
 */
function clearPDFHighlights(textLayer: HTMLElement): void {
  textLayer.querySelectorAll('.hi-words-pdf-highlight').forEach(highlight => highlight.remove());
}

function clearAllPDFHighlights(): void {
  document.querySelectorAll('.pdf-container .hi-words-pdf-highlight, .mod-pdf .hi-words-pdf-highlight')
    .forEach(highlight => highlight.remove());
}

/**
 * 高亮 PDF 文本层中的所有文本 span
 */
function highlightPDFTextSpans(textLayer: HTMLElement, trie: Trie, highlightStyle: string): void {
  bindPDFOverlayHover(textLayer);

  const overlayFragment = document.createDocumentFragment();
  let hasHighlights = false;
  const textSpans = textLayer.querySelectorAll('span[role="presentation"]');
  
  textSpans.forEach(span => {
    if (span.closest('.hi-words-tooltip')) {
      return;
    }

    const text = span.textContent || '';
    if (!text.trim()) return;

    const matches = trie.findAllMatches(text) as Array<{
      from: number;
      to: number;
      word: string;
      payload: any;
    }>;

    if (!matches || matches.length === 0) return;

    // 处理匹配结果，避免重叠
    matches.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
    const filtered: typeof matches = [];
    let end = 0;
    for (const m of matches) {
      if (m.from >= end) {
        filtered.push(m);
        end = m.to;
      }
    }

    if (filtered.length === 0) return;

    for (const match of filtered) {
      const def = match.payload;
      const color = mapCanvasColorToCSSVar(def?.color, 'var(--color-base-60)');
      const created = createPDFHighlightOverlay(textLayer, span as HTMLElement, match.from, match.to, {
        word: match.word,
        definition: def?.definition,
        color,
        style: highlightStyle
      }, overlayFragment);
      hasHighlights = hasHighlights || created;
    }
  });

  clearPDFHighlights(textLayer);
  if (hasHighlights) {
    textLayer.appendChild(overlayFragment);
  }
}

function createPDFHighlightOverlay(
  textLayer: HTMLElement,
  textSpan: HTMLElement,
  from: number,
  to: number,
  data: { word: string; definition?: string; color?: string; style: string },
  target: DocumentFragment
): boolean {
  const textNode = Array.from(textSpan.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
  if (!textNode) return false;

  const range = document.createRange();
  const textLength = textNode.textContent?.length || 0;
  range.setStart(textNode, Math.min(from, textLength));
  range.setEnd(textNode, Math.min(to, textLength));

  const layerRect = textLayer.getBoundingClientRect();
  const scaleX = layerRect.width && textLayer.offsetWidth ? layerRect.width / textLayer.offsetWidth : 1;
  const scaleY = layerRect.height && textLayer.offsetHeight ? layerRect.height / textLayer.offsetHeight : 1;
  const rects = Array.from(range.getClientRects());
  range.detach();

  let created = false;
  rects.forEach(rect => {
    if (rect.width <= 0 || rect.height <= 0) return;

    const overlay = document.createElement('span');
    overlay.className = 'hi-words-highlight hi-words-pdf-highlight';
    overlay.setAttribute('data-word', data.word);
    if (data.definition) overlay.setAttribute('data-definition', data.definition);
    if (data.color) overlay.setAttribute('data-color', data.color);
    overlay.setAttribute('data-style', data.style);
    overlay.style.setProperty('--word-highlight-color', data.color || 'var(--color-base-60)');
    overlay.style.left = `${(rect.left - layerRect.left) / scaleX + textLayer.scrollLeft}px`;
    overlay.style.top = `${(rect.top - layerRect.top) / scaleY + textLayer.scrollTop}px`;
    overlay.style.width = `${rect.width / scaleX}px`;
    overlay.style.height = `${rect.height / scaleY}px`;

    target.appendChild(overlay);
    created = true;
  });

  return created;
}

function bindPDFOverlayHover(textLayer: HTMLElement): void {
  if (textLayer.dataset.hiWordsPdfHoverBound === 'true') return;
  textLayer.dataset.hiWordsPdfHoverBound = 'true';

  let activeOverlay: HTMLElement | null = null;

  const clearActive = () => {
    if (!activeOverlay) return;
    activeOverlay.removeClass('is-hovered');
    activeOverlay.dispatchEvent(new MouseEvent('mouseout', {
      bubbles: true,
      relatedTarget: textLayer
    }));
    activeOverlay = null;
  };

  textLayer.addEventListener('mousemove', (event) => {
    if (event.buttons !== 0) {
      clearActive();
      return;
    }

    const overlays = Array.from(textLayer.querySelectorAll<HTMLElement>('.hi-words-pdf-highlight'));
    const nextOverlay = overlays.find(overlay => {
      const rect = overlay.getBoundingClientRect();
      return event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
    }) || null;

    if (nextOverlay === activeOverlay) return;

    clearActive();
    activeOverlay = nextOverlay;
    if (activeOverlay) {
      activeOverlay.addClass('is-hovered');
      activeOverlay.dispatchEvent(new MouseEvent('mouseover', {
        bubbles: true,
        relatedTarget: textLayer
      }));
    }
  });

  textLayer.addEventListener('mouseleave', clearActive);
  textLayer.addEventListener('mousedown', clearActive);
}

/**
 * 刷新可见区域的 PDF 高亮
 */
function refreshVisiblePDFPages(
  plugin: {
    settings: HiWordsSettings;
    vocabularyManager: VocabularyManager;
    shouldHighlightFile: (filePath: string) => boolean;
    app: any;
  },
  processedTextLayers: WeakSet<HTMLElement>
): void {
  if (!plugin.settings.enableAutoHighlight) {
    clearAllPDFHighlights();
    return;
  }
  
  try {
    // 重新构建 Trie
    const trie = buildTrieFromVocabulary(plugin.vocabularyManager);
    
    // 查找所有 PDF 文本层
    const textLayers = document.querySelectorAll('.textLayer');
    
    textLayers.forEach(textLayer => {
      const htmlTextLayer = textLayer as HTMLElement;
      
      // 检查是否在 PDF 视图中
      const pdfContainer = htmlTextLayer.closest('.pdf-container, .mod-pdf');
      if (!pdfContainer) return;
      
      // 只处理可见的文本层
      if (!isElementVisible(htmlTextLayer)) return;
      
      // 清除该文本层的已处理标记
      processedTextLayers.delete(htmlTextLayer);
      
      // 重新高亮
      highlightPDFTextSpans(htmlTextLayer, trie, plugin.settings.highlightStyle || 'underline');
      
      // 标记为已处理
      processedTextLayers.add(htmlTextLayer);
    });
  } catch (error) {
    console.error('刷新 PDF 高亮失败:', error);
  }
}

/**
 * 清理 PDF 高亮器资源
 */
export function cleanupPDFHighlighter(plugin: any): void {
  if (plugin._pdfHighlighterCleanup) {
    plugin._pdfHighlighterCleanup();
    delete plugin._pdfHighlighterCleanup;
  }
}
