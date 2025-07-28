// English language pack

export default {
    // General
    plugin_name: "HiWords",
    
    // Settings
    settings: {
        title: "Vocabulary settings",
        vocabulary_books: "Vocabulary books",
        add_vocabulary_book: "Add vocabulary book",
        remove_vocabulary_book: "Remove",
        show_definition_on_hover: "Show definition on hover",
        show_definition_on_hover_desc: "Show word definition when hovering over highlighted words",
        enable_auto_highlight: "Enable auto highlight",
        enable_auto_highlight_desc: "Automatically highlight words from vocabulary books while reading",
        highlight_style: "Highlight style",
        highlight_style_desc: "Choose how words are highlighted in text",
        style_underline: "Underline",
        style_background: "Background",
        style_bold: "Bold",
        style_dotted: "Dotted underline",
        style_wavy: "Wavy underline",
        save_settings: "Save settings",
        no_vocabulary_books: "No vocabulary books yet. Please add a Canvas file as a vocabulary book.",
        path: "Path",
        reload_book: "Reload this vocabulary book",
        statistics: "Statistics",
        total_books: "Total vocabulary books: {0}",
        enabled_books: "Enabled vocabulary books: {0}",
        total_words: "Total words: {0}",
    },
    
    // Sidebar
    sidebar: {
        title: "Vocabulary",
        empty_state: "No words found. Add words to your vocabulary books to see them here.",
        source_prefix: "From: ",
        found: "Found",
        words: "words",
        no_definition: "No definition available.",
    },
    
    // Commands
    commands: {
        refresh_vocabulary: "Refresh vocabulary",
        add_word: "Add word to vocabulary",
        edit_word: "Edit word",
        show_sidebar: "Show HiWords sidebar",
    },
    
    // Notices
    notices: {
        vocabulary_refreshed: "Vocabulary books refreshed",
        word_added: "Word added to vocabulary book",
        word_exists: "Word already exists in vocabulary book",
        error_adding_word: "Error adding word to vocabulary book",
        select_book_required: "Please select a vocabulary book",
        adding_word: "Adding word to vocabulary book...",
        updating_word: "Updating word...",
        word_added_success: "Word \"{0}\" successfully added to vocabulary book",
        word_updated_success: "Word \"{0}\" successfully updated",
        add_word_failed: "Failed to add word, please check the vocabulary book file",
        update_word_failed: "Failed to update word, please check the vocabulary book file",
        error_processing_word: "Error processing word",
        no_canvas_files: "No Canvas files found",
        book_already_exists: "This vocabulary book already exists",
        invalid_canvas_file: "Invalid Canvas file",
        book_added: "Added vocabulary book: {0}",
        book_reloaded: "Reloaded vocabulary book: {0}",
        book_removed: "Removed vocabulary book: {0}",
    },
    
    // Modals
    modals: {
        add_word_title: "Add ",
        edit_word_title: "Edit ",
        word_label: "Word",
        definition_label: "Definition",
        book_label: "Vocabulary book",
        select_book: "Select a vocabulary book",
        color_label: "Card color",
        color_gray: "Gray",
        color_red: "Red",
        color_orange: "Orange",
        color_yellow: "Yellow",
        color_green: "Green",
        color_blue: "Blue",
        color_purple: "Purple",
        aliases_label: "Aliases (optional, comma separated)",
        aliases_placeholder: "e.g.: doing, done, did",
        definition_placeholder: "Enter word definition...",
        add_button: "Add",
        save_button: "Save",
        cancel_button: "Cancel",
        select_canvas_file: "Select vocabulary book file",
    },
}
