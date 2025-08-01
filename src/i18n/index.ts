import { App } from 'obsidian';
import en from './en';
import zh from './zh';

// 支持的语言
export type SupportedLocale = 'en' | 'zh';

// 语言包接口
export interface LanguagePack {
    plugin_name: string;
    settings: {
        vocabulary_books: string;
        add_vocabulary_book: string;
        remove_vocabulary_book: string;
        show_definition_on_hover: string;
        show_definition_on_hover_desc: string;
        enable_auto_highlight: string;
        enable_auto_highlight_desc: string;
        highlight_style: string;
        highlight_style_desc: string;
        style_underline: string;
        style_background: string;
        style_bold: string;
        style_dotted: string;
        style_wavy: string;
        save_settings: string;
        no_vocabulary_books: string;
        path: string;
        reload_book: string;
        statistics: string;
        total_books: string;
        enabled_books: string;
        total_words: string;
    };
    sidebar: {
        title: string;
        empty_state: string;
        source_prefix: string;
        found: string;
        words: string;
    };
    commands: {
        add_word: string;
        refresh_vocabulary: string;
        show_sidebar: string;
    };
    notices: {
        vocabulary_refreshed: string;
        word_added: string;
        word_exists: string;
        error_adding_word: string;
        select_book_required: string;
        adding_word: string;
        word_added_success: string;
        add_word_failed: string;
        no_canvas_files: string;
        book_already_exists: string;
        invalid_canvas_file: string;
        book_added: string;
        book_reloaded: string;
        book_removed: string;
    };
    modals: {
        add_word_title: string;
        word_label: string;
        definition_label: string;
        book_label: string;
        select_book: string;
        color_label: string;
        color_gray: string;
        aliases_label: string;
        aliases_placeholder: string;
        definition_placeholder: string;
        add_button: string;
        cancel_button: string;
        select_canvas_file: string;
    };
}

// 语言包集合
const languagePacks: Record<SupportedLocale, LanguagePack> = {
    en,
    zh
};

/**
 * 国际化管理类
 */
export class I18n {
    private static instance: I18n;
    private app: App | null = null;
    
    /**
     * 获取单例实例
     */
    public static getInstance(): I18n {
        if (!I18n.instance) {
            I18n.instance = new I18n();
        }
        return I18n.instance;
    }
    
    /**
     * 设置 Obsidian App 实例
     */
    public setApp(app: App): void {
        this.app = app;
    }
    
    /**
     * 获取当前语言
     */
    private getCurrentLocale(): SupportedLocale {
        // 使用 Obsidian 的语言设置
        const obsidianLocale = window.localStorage.getItem('language') || 'en';
        
        // 将 Obsidian 语言设置映射到我们支持的语言
        if (obsidianLocale.startsWith('zh')) {
            return 'zh';
        }
        
        // 默认返回英文
        return 'en';
    }
    
    /**
     * 获取翻译文本
     * @param key 翻译键，支持点号分隔的路径，如 'sidebar.title'
     * @returns 翻译后的文本
     */
    public t(key: string): string {
        const locale = this.getCurrentLocale();
        const pack = languagePacks[locale];
        const keys = key.split('.');
        let result: any = pack;
        
        for (const k of keys) {
            if (result && result[k] !== undefined) {
                result = result[k];
            } else {
                console.warn(`翻译键 ${key} 不存在于 ${locale} 语言包中`);
                return key;
            }
        }
        
        return result;
    }
}

// 导出单例实例
export const i18n = I18n.getInstance();

// 导出翻译函数，方便使用
export const t = (key: string): string => i18n.t(key);
