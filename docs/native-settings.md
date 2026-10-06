# Native settings

HiWords requires Obsidian 1.13.0 or newer. Settings use six native `SettingDefinitionGroup` sections:

1. Word books: collection operations, statistics, parsing and offline dictionary.
2. Highlighting and display: highlights, popovers, sidebar presentation and scope.
3. Learning and pronunciation: mastery, recall blur, TTS and accent.
4. AI service: provider, secret selection, model selection, connection test and advanced options.
5. AI features: definition and selection-translation switches, target language and prompt pages.
6. Canvas layout: auto layout and card dimensions.

AI model input, model picker and refresh belong to one searchable native render row. Connection testing has a separate primary button and an accessible status badge; loading, success and errors use text as well as color. Controls wrap when the settings column is narrow.

Advanced options use a native declarative sub-page for the API base URL and JSON request parameters. Custom services show the protocol and URL directly on the main screen; their advanced page contains only request parameters. Definition and translation prompts use their own native sub-pages, visible when the respective feature is enabled. Multiline fields span the page width and retain validation and default placeholders.

Existing keys and stored data are retained. Nested keys resolve through `getControlValue` and `setControlValue`. Each AI provider retains an independent configuration. Card dimensions require positive integers and extra parameters require a JSON object. No legacy `display()` or whole-section imperative renderer is used.

Validation: automated settings, AI transport and stale-response tests plus the production build. The current UI was hot reloaded in the HiWordsDev vault and inspected using live DOM and screenshots, including the advanced sub-page. No real AI requests were made during verification.
