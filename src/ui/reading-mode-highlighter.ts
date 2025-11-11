import type { HiWordsSettings } from '../utils';
import { Trie, mapCanvasColorToCSSVar } from '../utils';
import type { VocabularyManager } from '../core';
import { isElementVisible, buildTrieFromVocabulary, clearHighlights, isInMainEditor } from '../utils/highlight-utils';

/**
 * 在阅读模式注册 Markdown 后处理器，高亮匹配的词汇。
 * 通过从 VocabularyManager 构建 Trie，遍历渲染后的 DOM 文本节点并包裹 span.hi-words-highlight。
 */
export function registerReadingModeHighlighter(plugin: {
  settings: HiWordsSettings;
  vocabularyManager: VocabularyManager;
  shouldHighlightFile: (filePath: string) => boolean;
  registerMarkdownPostProcessor: (
    processor: (el: HTMLElement, ctx: unknown) => void
  ) => void;
}): void {
  // 存储处理函数的引用，供外部调用
  let processorFn: ((el: HTMLElement, trie: Trie) => void) | null = null;

  const EXCLUDE_SELECTOR = [
    'pre',
    'code',
    'a',
    'button',
    'input',
    'textarea',
    'select',
    '.math',
    '.cm-inline-code',
    '.internal-embed',
    '.file-embed',
    '.hi-words-tooltip', // 排除 tooltip 内容
  ].join(',');

  const processElement = (root: HTMLElement, trie: Trie) => {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node: Node) => {
          // 仅处理可见文本节点，跳过排除元素与已高亮区域
          const maybeParent = (node as any).parentElement as HTMLElement | null | undefined;
          const parent = maybeParent ?? null;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest(EXCLUDE_SELECTOR)) return NodeFilter.FILTER_REJECT;
          if (parent.closest('.hi-words-highlight')) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      } as any
    );

    const highlightStyle = plugin.settings.highlightStyle || 'underline';

    const textNodes: Text[] = [];
    let current: Node | null = walker.nextNode();
    while (current) {
      textNodes.push(current as Text);
      current = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue || '';
      if (!text) continue;

      const matches = trie.findAllMatches(text) as Array<{
        from: number;
        to: number;
        word: string;
        payload: any;
      }>;
      if (!matches || matches.length === 0) continue;

      // 左到右、优先更长的非重叠匹配
      matches.sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
      const filtered: typeof matches = [];
      let end = 0;
      for (const m of matches) {
        if (m.from >= end) {
          filtered.push(m);
          end = m.to;
        }
      }
      if (filtered.length === 0) continue;

      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of filtered) {
        if (m.from > last) frag.appendChild(document.createTextNode(text.slice(last, m.from)));
        const def = m.payload;
        const color = mapCanvasColorToCSSVar(def?.color, 'var(--color-base-60)');
        const span = document.createElement('span');
        span.className = 'hi-words-highlight';
        span.setAttribute('data-word', m.word);
        if (def?.definition) span.setAttribute('data-definition', def.definition);
        if (color) span.setAttribute('data-color', color);
        span.setAttribute('data-style', highlightStyle);
        if (color) span.setAttribute('style', `--word-highlight-color: ${color}`);
        span.textContent = text.slice(m.from, m.to);
        frag.appendChild(span);
        last = m.to;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    }
  };

  plugin.registerMarkdownPostProcessor((el, ctx) => {
    try {
      if (!plugin.settings.enableAutoHighlight) return;
      
      // 检查当前文件是否应该被高亮
      const filePath = (ctx as any)?.sourcePath;
      if (filePath && !plugin.shouldHighlightFile(filePath)) {
        return;
      }
      
      // 检查是否在主编辑器的阅读模式中（排除侧边栏、悬停预览等其他容器）
      if (!isInMainEditor(el)) return;
      
      const trie = buildTrieFromVocabulary(plugin.vocabularyManager);
      // 保存处理函数引用
      processorFn = processElement;
      processElement(el, trie);
    } catch (e) {
      console.error('阅读模式高亮处理失败:', e);
    }
  });

  // 导出刷新函数到插件实例
  (plugin as any)._refreshReadingModeHighlighter = () => {
    refreshVisibleReadingMode(plugin, processorFn);
  };
}

/**
 * 刷新可见区域的阅读模式高亮
 */
function refreshVisibleReadingMode(
  plugin: {
    settings: HiWordsSettings;
    vocabularyManager: VocabularyManager;
    shouldHighlightFile: (filePath: string) => boolean;
  },
  processElement: ((el: HTMLElement, trie: Trie) => void) | null
): void {
  if (!plugin.settings.enableAutoHighlight || !processElement) return;
  
  try {
    // 重新构建 Trie
    const trie = buildTrieFromVocabulary(plugin.vocabularyManager);
    
    // 查找所有阅读模式的容器
    const readingContainers = document.querySelectorAll('.markdown-preview-view .markdown-preview-sizer');
    
    readingContainers.forEach(container => {
      const htmlContainer = container as HTMLElement;
      
      // 检查容器是否在主编辑器中（排除侧边栏等）
      if (!isInMainEditor(htmlContainer)) return;
      
      // 只处理可见的容器
      if (!isElementVisible(htmlContainer)) return;
      
      // 清除现有高亮
      clearHighlights(htmlContainer);
      
      // 重新高亮
      processElement(htmlContainer, trie);
    });
  } catch (error) {
    console.error('刷新阅读模式高亮失败:', error);
  }
}
