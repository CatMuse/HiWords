import { App, getLanguage } from 'obsidian';
import en from './en';
import zh from './zh';
import es from './es';
import fr from './fr';
import de from './de';
import ja from './ja';

// 支持的语言
export type SupportedLocale = 'en' | 'zh' | 'es' | 'fr' | 'de' | 'ja';

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
        enable_mastered_feature: string;
        enable_mastered_feature_desc: string;
        // Mastered detection mode
        mastered_detection?: string;
        mastered_detection_desc?: string;
        mode_group?: string;
        mode_color?: string;
        blur_definitions: string;
        blur_definitions_desc: string;
        // TTS template (optional for backward compatibility)
        tts_template?: string;
        tts_template_desc?: string;
        // AI Dictionary
        ai_dictionary?: string;
        ai_api_url?: string;
        ai_api_url_desc?: string;
        ai_api_key_env_var?: string;
        ai_api_key_env_var_desc?: string;
        ai_api_key?: string;
        ai_api_key_desc?: string;
        ai_model?: string;
        ai_model_desc?: string;
        ai_prompt?: string;
        ai_prompt_desc?: string;
        // Auto layout section
        auto_layout: string;
        enable_auto_layout: string;
        enable_auto_layout_desc: string;
        card_size: string;
        card_size_desc: string;
        grid_gaps: string;
        grid_gaps_desc: string;
        left_padding: string;
        left_padding_desc: string;
        columns_auto: string;
        columns_auto_desc: string;
        columns: string;
        columns_desc: string;
        group_inner_layout: string;
        group_inner_layout_desc: string;
        // Highlight scope settings
        highlight_scope?: string;
        highlight_mode?: string;
        highlight_mode_desc?: string;
        mode_all?: string;
        mode_exclude?: string;
        mode_include?: string;
        highlight_paths?: string;
        highlight_paths_desc?: string;
        highlight_paths_placeholder?: string;
        // File node parse mode
        file_node_parse_mode?: string;
        file_node_parse_mode_desc?: string;
        mode_filename?: string;
        mode_content?: string;
        mode_filename_with_alias?: string;
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
        auto_fill_definition?: string;
        word_label: string;
        word_placeholder: string;
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
        delete_confirmation: string;
        save_button: string;
    };
    // Common action labels used in UI
    actions?: {
        expand: string;        // 展开
        collapse: string;      // 收起
        mark_mastered: string; // 已掌握
        unmark_mastered: string; // 忘记了（取消已掌握）
    };
    // AI dictionary error messages
    ai_errors?: {
        word_empty: string;
        api_key_not_configured: string;
        invalid_response: string;
        api_key_invalid: string;
        rate_limit: string;
        server_error: string;
        network_error: string;
        request_failed: string;
    };
}

// 语言包集合
const languagePacks: Record<SupportedLocale, LanguagePack> = {
    en,
    zh,
    es,
    fr,
    de,
    ja,
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
        // 使用 Obsidian 官方 API 获取语言设置 (requires minAppVersion: "1.8.0")
        const obsidianLocale = getLanguage();
        
        // 将 Obsidian 语言设置映射到我们支持的语言
        if (obsidianLocale.startsWith('zh')) {
            return 'zh';
        }
        if (obsidianLocale.startsWith('es')) {
            return 'es';
        }
        if (obsidianLocale.startsWith('fr')) {
            return 'fr';
        }
        if (obsidianLocale.startsWith('de')) {
            return 'de';
        }
        if (obsidianLocale.startsWith('ja') || obsidianLocale.startsWith('jp')) {
            return 'ja';
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
