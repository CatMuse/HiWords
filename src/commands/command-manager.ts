import { Editor, Notice, MarkdownView } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { t } from '../i18n';
import { extractSentenceFromEditorMultiline, extractSentenceFromSelection } from '../utils/sentence-extractor';

/**
 * 注册所有插件命令
 * @param plugin HiWords 插件实例
 */
export function registerCommands(plugin: HiWordsPlugin) {
    // 刷新生词本命令
    plugin.addCommand({
        id: 'refresh-vocabulary',
        name: t('commands.refresh_vocabulary'),
        callback: async () => {
            await plugin.vocabularyManager.loadAllVocabularyBooks();
            plugin.refreshHighlighter();
            new Notice(t('notices.vocabulary_refreshed'));
        }
    });

    // 打开生词列表侧边栏命令
    plugin.addCommand({
        id: 'open-vocabulary-sidebar',
        name: t('commands.show_sidebar'),
        callback: () => {
            plugin.activateSidebarView();
        }
    });

    // 添加选中单词到生词本命令（智能适配所有视图模式）
    plugin.addCommand({
        id: 'add-selected-word',
        name: t('commands.add_selected_word'),
        callback: () => {
            let word = '';
            let sentence = '';
            
            // 尝试获取当前活动的编辑器
            const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
            const editor = activeView?.editor;
            const viewMode = activeView?.getMode();
            
            // 检查是否在编辑模式（Live Preview 或 Source Mode）
            // Live Preview 和 Source Mode 都返回 'source'，阅读模式返回 'preview'
            const isEditMode = editor && viewMode === 'source';
            
            if (isEditMode) {
                // 编辑模式：使用 Editor API，句子提取更准确（支持跨行）
                word = editor.getSelection().trim();
                sentence = extractSentenceFromEditorMultiline(editor);
            } else {
                // 阅读模式/PDF 视图：使用 window.getSelection()
                const selection = window.getSelection();
                word = selection?.toString().trim() || '';
                
                // 备用方案：如果 selection.toString() 为空，尝试从 range 获取
                if (!word && selection && selection.rangeCount > 0) {
                    word = selection.getRangeAt(0).toString().trim();
                }
                
                sentence = extractSentenceFromSelection(selection);
            }
            
            // 打开模态框（有选中文本时预填充，无选中时可手动输入）
            plugin.addOrEditWord(word, sentence);
        }
    });
}
