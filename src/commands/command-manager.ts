import { Editor, Notice } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { t } from '../i18n';
import { extractSentenceFromEditorMultiline } from '../utils/sentence-extractor';

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

    // 添加选中单词到生词本命令
    plugin.addCommand({
        id: 'add-selected-word',
        name: t('commands.add_selected_word'),
        editorCallback: (editor: Editor) => {
            const selection = editor.getSelection();
            const word = selection ? selection.trim() : '';
            // 提取句子（支持跨行）
            const sentence = extractSentenceFromEditorMultiline(editor);
            // 无论是否有选中文本，都打开模态框
            // 有选中文本时预填充，没有时让用户手动输入
            plugin.addOrEditWord(word, sentence);
        }
    });
}
