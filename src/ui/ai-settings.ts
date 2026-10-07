import { SecretComponent } from 'obsidian';
import type { SettingDefinition, SettingDefinitionControl, SettingDefinitionGroup, SettingDefinitionItem, SettingDefinitionPage } from 'obsidian';
import type HiWordsPlugin from '../../main';
import type { AIConnectionControls } from './ai-connection-controls';
import { DEFAULT_AI_DEFINITION_PROMPT, DEFAULT_TRANSLATE_PROMPT, DEFAULT_AI_EXPLANATION_PROMPT } from '../settings';
import { t } from '../i18n';

interface Options {
    plugin: HiWordsPlugin;
    controls: AIConnectionControls;
    setValue: (key: string, value: unknown) => Promise<void>;
    multiline: (item: SettingDefinition) => SettingDefinition;
}

function targetLanguageOptions(current: string): Record<string, string> {
    // Native language names remain recognizable regardless of the app locale.
    const languages: Record<string, string> = {
        'zh-CN': '简体中文 (zh-CN)', 'zh-TW': '繁體中文 (zh-TW)',
        en: 'English (en)', ja: '日本語 (ja)', ko: '한국어 (ko)',
        fr: 'Français (fr)', de: 'Deutsch (de)', es: 'Español (es)',
        it: 'Italiano (it)', pt: 'Português (pt)', ru: 'Русский (ru)',
        ar: 'العربية (ar)', hi: 'हिन्दी (hi)', th: 'ไทย (th)',
        vi: 'Tiếng Việt (vi)', id: 'Bahasa Indonesia (id)',
        tr: 'Türkçe (tr)', nl: 'Nederlands (nl)', pl: 'Polski (pl)',
        uk: 'Українська (uk)',
    };
    if (current && !Object.prototype.hasOwnProperty.call(languages, current)) languages[current] = current;
    return languages;
}

/** Native groups and sub-pages retain settings search and keyboard navigation. */
export function aiSettingsGroups(options: Options): SettingDefinitionItem[] {
    const { plugin, controls, multiline } = options;
    const custom = plugin.settings.aiService.provider === 'custom';
    const field = (key: string, label: string): SettingDefinitionControl => ({
        name: t(`settings.${label}`), desc: t(`settings.${label}_desc`), control: { type: 'text', key },
    });
    const group = (heading: string, items: SettingDefinitionGroup['items'], cls = ''): SettingDefinitionGroup => ({
        type: 'group', heading: t(`ai_connection.${heading}`), cls: `hi-words-settings-group ${cls}`, items,
    });
    const url = field('aiService.apiUrl', 'ai_api_url');
    const extra = multiline({
        name: t('settings.ai_extra_params'), desc: t('settings.ai_extra_params_desc'),
        control: { type: 'textarea', key: 'aiService.extraParams', rows: 4,
            validate: value => {
                try {
                    const parsed = JSON.parse(value || '{}');
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return t('settings.json_object_required');
                } catch { return t('settings.json_object_required'); }
            },
        },
    });
    const promptPage = (key: string, label: string, defaultPrompt: string, enabled: () => boolean): SettingDefinitionPage => ({
        type: 'page', name: t(`settings.${label}`), desc: t('ai_connection.prompt_page_desc'), visible: enabled,
        items: [group('prompt_heading', [multiline({
            ...field(key, label),
            desc: `${t(`settings.${label}_desc`)} ${t('settings.prompt_default_hint')}`,
            control: { type: 'textarea', key, rows: 8, placeholder: defaultPrompt }, visible: enabled,
        })])],
    });
    return [
        group('service_heading', [
            { name: t('settings.ai_provider'), desc: t('settings.ai_provider_desc'),
                control: { type: 'dropdown', key: 'aiService.provider', options: {
                    'openai-compatible': t('settings.ai_provider_openai_compatible'),
                    anthropic: t('settings.ai_provider_anthropic'), gemini: t('settings.ai_provider_gemini'),
                    custom: t('settings.ai_provider_custom'),
                } },
            },
            ...(custom ? [
                { name: t('ai_connection.protocol'), desc: t('ai_connection.protocol_desc'),
                    control: { type: 'dropdown' as const, key: 'aiService.apiProtocol', options: {
                        openai: 'OpenAI Chat Completions', anthropic: 'Anthropic Messages', gemini: 'Gemini GenerateContent',
                    } },
                },
                url,
            ] : []),
            { name: t('settings.ai_api_key'), desc: t('settings.ai_api_key_desc'), render: setting => {
                setting.addComponent(container => new SecretComponent(plugin.app, container)
                    .setValue(plugin.settings.aiService.apiKeySecretId)
                    .onChange(value => { void options.setValue('aiService.apiKeySecretId', value).catch(error => console.error('HiWords secret setting failed:', error)); }));
            } },
            { name: t('settings.ai_model'), desc: t('settings.ai_model_desc'), aliases: ['model', '模型'],
                render: setting => controls.renderModel(setting) },
            { name: t('ai_connection.test_model'), desc: t('ai_connection.test_model_desc'),
                render: setting => controls.renderTest(setting) },
            { type: 'page', name: t('ai_connection.advanced'),
                desc: custom ? t('ai_connection.advanced_custom_desc') : t('ai_connection.advanced_desc'),
                items: [{ ...group('advanced', [...(!custom ? [url] : []), extra], 'hi-words-ai-advanced'), heading: undefined }],
            },
        ], 'hi-words-ai-service'),
        group('features_heading', [
            { name: t('settings.enable_ai_definition'), desc: t('settings.enable_ai_definition_desc'),
                control: { type: 'toggle', key: 'aiDefinition.enabled' } },
            promptPage('aiDefinition.prompt', 'ai_prompt', DEFAULT_AI_DEFINITION_PROMPT, () => plugin.settings.aiDefinition.enabled),
            { name: t('settings.enable_selection_translate'), desc: t('settings.enable_selection_translate_desc'),
                control: { type: 'toggle', key: 'selectionTranslate.enabled' } },
            { name: t('settings.translate_target_lang'), desc: t('settings.translate_target_lang_desc'),
                control: { type: 'dropdown', key: 'selectionTranslate.targetLang',
                    options: targetLanguageOptions(plugin.settings.selectionTranslate.targetLang) },
            },
            promptPage('selectionTranslate.prompt', 'translate_prompt', DEFAULT_TRANSLATE_PROMPT, () => plugin.settings.selectionTranslate.enabled),
            promptPage('selectionTranslate.explanationPrompt', 'ai_explanation_prompt', DEFAULT_AI_EXPLANATION_PROMPT, () => true),
        ], 'hi-words-ai-features'),
    ];
}
