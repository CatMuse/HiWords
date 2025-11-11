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
  
  // 使用公共的 Trie 构建函数

  // 已处理的文本层集合，避免重复处理
  const processedTextLayers = new WeakSet<HTMLElement>();
  
  // 防抖定时器
  let debounceTimer: number | null = null;

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
      highlightPDFTextSpans(textLayer, trie, plugin.settings.highlightStyle || 'underline');
    } catch (error) {
      console.error('PDF 文本层高亮处理失败:', error);
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
      
      mutations.forEach((mutation) => {
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
      
      if (shouldProcess) {
        debouncedProcessPDF();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
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
        debouncedProcessPDF();
      }, 500);
    })
  );

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
    observer.disconnect();
    // WeakSet 没有 clear 方法，重新创建一个新的 WeakSet
    // processedTextLayers 会在函数作用域结束时自动清理
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
  const textSpans = textLayer.querySelectorAll('span[role="presentation"]');
  
  textSpans.forEach(span => {
    // 查找高亮元素
    const highlights = span.querySelectorAll('.hi-words-highlight');
    if (highlights.length === 0) return;
    
    // 提取纯文本内容
    let textContent = '';
    span.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        textContent += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        textContent += (node as HTMLElement).textContent;
      }
    });
    
    // 清空并重置为纯文本
    span.innerHTML = '';
    span.textContent = textContent;
  });
}

/**
 * 高亮 PDF 文本层中的所有文本 span
 */
function highlightPDFTextSpans(textLayer: HTMLElement, trie: Trie, highlightStyle: string): void {
  const textSpans = textLayer.querySelectorAll('span[role="presentation"]');
  
  textSpans.forEach(span => {
    // 跳过已经高亮的元素和 tooltip 内容
    if (span.closest('.hi-words-highlight') || span.closest('.hi-words-tooltip')) {
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

    // 创建高亮元素
    const frag = document.createDocumentFragment();
    let last = 0;
    
    for (const match of filtered) {
      // 添加匹配前的文本
      if (match.from > last) {
        frag.appendChild(document.createTextNode(text.slice(last, match.from)));
      }

      // 创建高亮元素
      const def = match.payload;
      const color = mapCanvasColorToCSSVar(def?.color, 'var(--color-base-60)');
      const highlightSpan = document.createElement('span');
      
      highlightSpan.className = 'hi-words-highlight hi-words-pdf-highlight';
      highlightSpan.setAttribute('data-word', match.word);
      if (def?.definition) highlightSpan.setAttribute('data-definition', def.definition);
      if (color) highlightSpan.setAttribute('data-color', color);
      highlightSpan.setAttribute('data-style', highlightStyle);
      if (color) highlightSpan.setAttribute('style', `--word-highlight-color: ${color}`);
      highlightSpan.textContent = text.slice(match.from, match.to);
      
      frag.appendChild(highlightSpan);
      last = match.to;
    }

    // 添加剩余文本
    if (last < text.length) {
      frag.appendChild(document.createTextNode(text.slice(last)));
    }

    // 替换原始内容
    span.innerHTML = '';
    span.appendChild(frag);
  });
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
  if (!plugin.settings.enableAutoHighlight) return;
  
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
      
      // 清除现有高亮
      clearPDFHighlights(htmlTextLayer);
      
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
