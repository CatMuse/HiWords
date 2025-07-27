// 中文语言包

export default {
    // 通用
    plugin_name: "生词本",
    
    // 设置
    settings: {
        title: "生词本设置",
        vocabulary_books: "生词本",
        add_vocabulary_book: "添加生词本",
        remove_vocabulary_book: "移除",
        show_definition_on_hover: "悬停显示释义",
        show_definition_on_hover_desc: "鼠标悬停在高亮词汇上时显示定义",
        enable_auto_highlight: "启用自动高亮",
        enable_auto_highlight_desc: "在阅读时自动高亮生词本中的词汇",
        save_settings: "保存设置",
        no_vocabulary_books: "暂无生词本，请添加 Canvas 文件作为生词本",
        path: "路径",
        reload_book: "重新解析该生词本",
        statistics: "统计信息",
        total_books: "总生词本数量: {0}",
        enabled_books: "已启用生词本: {0}",
        total_words: "总词汇数量: {0}",
    },
    
    // 侧边栏
    sidebar: {
        title: "生词本",
        empty_state: "未找到单词。添加单词到您的生词本以在此处查看。",
        source_prefix: "来自: ",
        found: "发现",
        words: "个生词",
        no_definition: "暂无定义",
    },
    
    // 命令
    commands: {
        refresh_vocabulary: "刷新生词本",
        add_word: "添加单词到生词本",
        show_sidebar: "显示生词本侧边栏",
    },
    
    // 通知
    notices: {
        vocabulary_refreshed: "生词本已刷新",
        word_added: "单词已添加到生词本",
        word_exists: "单词已存在于生词本中",
        error_adding_word: "添加单词到生词本时出错",
        select_book_required: "请选择生词本",
        adding_word: "正在添加词汇到生词本...",
        word_added_success: "词汇 \"{0}\" 已成功添加到生词本",
        add_word_failed: "添加词汇失败，请检查生词本文件",
        no_canvas_files: "未找到 Canvas 文件",
        book_already_exists: "该生词本已存在",
        invalid_canvas_file: "无效的 Canvas 文件",
        book_added: "已添加生词本: {0}",
        book_reloaded: "已重新加载: {0}",
        book_removed: "已删除生词本: {0}",
    },
    
    // 模态框
    modals: {
        add_word_title: "添加词汇到生词本",
        word_label: "词汇",
        definition_label: "释义",
        book_label: "生词本",
        select_book: "选择生词本",
        color_label: "卡片颜色",
        color_gray: "灰色",
        color_red: "红色",
        color_orange: "橙色",
        color_yellow: "黄色",
        color_green: "绿色",
        color_blue: "蓝色",
        color_purple: "紫色",
        aliases_label: "别名（可选，用逗号分隔）",
        aliases_placeholder: "例如：doing, done, did",
        definition_placeholder: "输入词汇释义...",
        add_button: "添加",
        cancel_button: "取消",
        select_canvas_file: "选择 Canvas 文件",
    },
}
