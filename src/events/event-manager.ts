import { Editor, Notice, TFile } from 'obsidian';
import type HiWordsPlugin from '../../main';
import { t } from '../i18n';
import { extractSentenceFromEditorMultiline } from '../utils/sentence-extractor';

/**
 * 注册所有插件事件监听器
 * @param plugin HiWords 插件实例
 */
export function registerEvents(plugin: HiWordsPlugin) {
    // 记录当前正在编辑的Canvas文件
    const modifiedCanvasFiles = new Set<string>();
    // 记录当前活动的 Canvas 文件
    let activeCanvasFile: string | null = null;
    
    // 监听文件变化
    plugin.registerEvent(
        plugin.app.vault.on('modify', (file) => {
            if (file instanceof TFile && file.extension === 'canvas') {
                // 检查是否是生词本文件
                const isVocabBook = plugin.settings.vocabularyBooks.some(book => book.path === file.path);
                if (isVocabBook) {
                    // 只记录文件路径，不立即解析
                    modifiedCanvasFiles.add(file.path);
                }
            }
        })
    );

    // 监听活动文件变化
    plugin.registerEvent(
        plugin.app.workspace.on('active-leaf-change', async (leaf) => {
            // 获取当前活动文件
            const activeFile = plugin.app.workspace.getActiveFile();
            
            // 如果之前有活动的Canvas文件，且已经变化，并且现在切换到了其他文件
            // 说明用户已经编辑完成并切换了焦点，此时解析该文件
            if (activeCanvasFile && 
                modifiedCanvasFiles.has(activeCanvasFile) && 
                (!activeFile || activeFile.path !== activeCanvasFile)) {
                
                await plugin.vocabularyManager.reloadVocabularyBook(activeCanvasFile);
                plugin.refreshHighlighter();
                
                // 从待解析列表中移除
                modifiedCanvasFiles.delete(activeCanvasFile);
            }
            
            // 更新当前活动的Canvas文件
            if (activeFile && activeFile.extension === 'canvas') {
                activeCanvasFile = activeFile.path;
            } else {
                activeCanvasFile = null;
                
                // 如果切换到非Canvas文件，处理所有待解析的文件
                if (modifiedCanvasFiles.size > 0) {
                    // 创建一个副本并清空原集合
                    const filesToProcess = Array.from(modifiedCanvasFiles);
                    modifiedCanvasFiles.clear();
                    
                    // 处理所有待解析的文件
                    for (const filePath of filesToProcess) {
                        await plugin.vocabularyManager.reloadVocabularyBook(filePath);
                    }
                    
                    // 刷新高亮
                    plugin.refreshHighlighter();
                } else {
                    // 当切换文件时，可能需要更新高亮
                    setTimeout(() => plugin.refreshHighlighter(), 100);
                }
            }
        })
    );
    
    // 监听文件重命名/移动
    plugin.registerEvent(
        plugin.app.vault.on('rename', async (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'canvas') {
                // 检查旧路径是否在单词本列表中
                const bookIndex = plugin.settings.vocabularyBooks.findIndex(book => book.path === oldPath);
                if (bookIndex !== -1) {
                    // 更新为新路径
                    plugin.settings.vocabularyBooks[bookIndex].path = file.path;
                    // 更新名称（使用新的文件名）
                    plugin.settings.vocabularyBooks[bookIndex].name = file.basename;
                    await plugin.saveSettings();
                    
                    // 重新加载该单词本
                    await plugin.vocabularyManager.reloadVocabularyBook(file.path);
                    plugin.refreshHighlighter();
                    
                    new Notice(t('notices.book_path_updated').replace('{0}', file.basename));
                }
            }
        })
    );
    
    // 注册编辑器右键菜单
    plugin.registerEvent(
        plugin.app.workspace.on('editor-menu', (menu, editor: Editor) => {
            const selection = editor.getSelection();
            if (selection && selection.trim()) {
                const word = selection.trim();
                // 检查单词是否已存在
                const exists = plugin.vocabularyManager.hasWord(word);
                
                menu.addItem((item) => {
                    // 根据单词是否存在显示不同的菜单项文本
                    const titleKey = exists ? 'commands.edit_word' : 'commands.add_word';
                    
                    item
                        .setTitle(t(titleKey))
                        .onClick(() => {
                            // 提取句子（支持跨行）
                            const sentence = extractSentenceFromEditorMultiline(editor);
                            plugin.addOrEditWord(word, sentence);
                        });
                });
            }
        })
    );
}
