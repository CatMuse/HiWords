// English language pack

export default {
    // General
    plugin_name: "HiWords",
    
    // Settings
    settings: {
        title: "Vocabulary Settings",
        vocabulary_books: "Vocabulary Books",
        add_vocabulary_book: "Add Vocabulary Book",
        remove_vocabulary_book: "Remove",
        show_definition_on_hover: "Show Definition on Hover",
        show_definition_on_hover_desc: "Show word definition when hovering over highlighted words",
        enable_auto_highlight: "Enable Auto Highlight",
        enable_auto_highlight_desc: "Automatically highlight words from vocabulary books while reading",
        save_settings: "Save Settings",
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
        refresh_vocabulary: "Refresh Vocabulary",
        add_word: "Add Word to Vocabulary",
        show_sidebar: "Show HiWords Sidebar",
    },
    
    // Notices
    notices: {
        vocabulary_refreshed: "Vocabulary books refreshed",
        word_added: "Word added to vocabulary book",
        word_exists: "Word already exists in vocabulary book",
        error_adding_word: "Error adding word to vocabulary book",
        select_book_required: "Please select a vocabulary book",
        adding_word: "Adding word to vocabulary book...",
        word_added_success: "Word \"{0}\" successfully added to vocabulary book",
        add_word_failed: "Failed to add word, please check the vocabulary book file",
        no_canvas_files: "No Canvas files found",
        book_already_exists: "This vocabulary book already exists",
        invalid_canvas_file: "Invalid Canvas file",
        book_added: "Added vocabulary book: {0}",
        book_reloaded: "Reloaded vocabulary book: {0}",
        book_removed: "Removed vocabulary book: {0}",
    },
    
    // Modals
    modals: {
        add_word_title: "Add Word to Vocabulary",
        word_label: "Word",
        definition_label: "Definition",
        book_label: "Vocabulary Book",
        select_book: "Select a vocabulary book",
        color_label: "Card Color",
        color_gray: "Gray",
        aliases_label: "Aliases (optional, comma separated)",
        aliases_placeholder: "e.g.: doing, done, did",
        definition_placeholder: "Enter word definition...",
        add_button: "Add",
        cancel_button: "Cancel",
        select_canvas_file: "Select Canvas File",
    },
}
