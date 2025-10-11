import type { HiWordsSettings } from '../utils';
import { Trie, mapCanvasColorToCSSVar } from '../utils';
import type { VocabularyManager } from '../core';

/**
 * 在阅读模式注册 Markdown 后处理器，高亮匹配的词汇。
 * 通过从 VocabularyManager 构建 Trie，遍历渲染后的 DOM 文本节点并包裹 span.hi-words-highlight。
 */
export function registerReadingModeHighlighter(plugin: {
  settings: HiWordsSettings;
  vocabularyManager: VocabularyManager;
  registerMarkdownPostProcessor: (
    processor: (el: HTMLElement, ctx: unknown) => void
  ) => void;
}): void {
  const buildTrie = () => {
    const trie = new Trie();
    const words = plugin.vocabularyManager.getAllWordsForHighlight();
    for (const w of words) {
      const def = plugin.vocabularyManager.getDefinition(w);
      if (def) trie.addWord(w, def);
    }
    return trie;
  };

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

  plugin.registerMarkdownPostProcessor((el) => {
    try {
      if (!plugin.settings.enableAutoHighlight) return;
      
      // 检查是否在主编辑器的阅读模式中
      // 排除侧边栏、悬停预览等其他容器
      const isInMainEditor = !el.closest('.workspace-leaf-content[data-type="hover-editor"]') && // 排除悬停预览
                            !el.closest('.workspace-leaf-content[data-type="file-explorer"]') && // 排除文件浏览器
                            !el.closest('.workspace-leaf-content[data-type="outline"]') && // 排除大纲
                            !el.closest('.workspace-leaf-content[data-type="backlink"]') && // 排除反向链接
                            !el.closest('.workspace-leaf-content[data-type="tag"]') && // 排除标签面板
                            !el.closest('.workspace-leaf-content[data-type="search"]') && // 排除搜索结果
                            !el.closest('.hover-popover') && // 排除悬停弹出框
                            !el.closest('.popover') && // 排除其他弹出框
                            !el.closest('.suggestion-container') && // 排除建议容器
                            !el.closest('.modal') && // 排除模态框
                            !el.closest('.workspace-split.mod-right-split') && // 排除右侧边栏
                            !el.closest('.workspace-split.mod-left-split'); // 排除左侧边栏
      
      if (!isInMainEditor) return;
      
      const trie = buildTrie();
      processElement(el, trie);
    } catch (e) {
      console.error('阅读模式高亮处理失败:', e);
    }
  });
}
