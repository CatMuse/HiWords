# Native settings

HiWords now requires Obsidian 1.13.0 or newer. `manifest.json` and the current `versions.json` entry declare that requirement.

The settings tab uses five native `SettingDefinitionGroup` sections:

1. Word books: collection operations, statistics and Canvas file-node parsing.
2. Highlighting and display: highlights, popovers, sidebar presentation and scope.
3. Learning and pronunciation: mastery, recall blur, TTS and accent.
4. AI and translation: provider, secret selection, request parameters, definitions and translation.
5. Canvas layout: auto layout and card dimensions.

Twenty-four ordinary settings use declarative controls with individual searchable names and descriptions. Book operations, statistics, SecretStorage selection and action buttons use individual native render rows. No whole-section renderer, legacy `display()` fallback or runtime API-version guard remains.

Existing setting keys and stored data are retained. Nested AI/translation keys resolve through `getControlValue` and `setControlValue`. Provider changes preserve custom endpoints. Mastery retains the sidebar linkage and workspace event. Card dimensions require positive integers; extra API parameters require a JSON object. Hidden AI/translation fields follow their enable toggles.

Validation: 13 automated tests and the production build pass. The targeted official ESLint rules pass. The local Obsidian 1.14.1 accessibility state shows the five new groups, native controls and existing values after hot reload. Computer-use screenshots remained stale and scroll actions intermittently failed, so complete visual verification and real settings-search interactions remain unconfirmed.

This supersedes the 1.11.5 compatibility notes in the earlier review records. No release tag is created by this change.
