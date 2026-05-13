import { App, PluginSettingTab, Setting, TFile, Notice, FuzzySuggestModal, Modal, setIcon, TextComponent } from 'obsidian';
import HiWordsPlugin from '../../main';
import { VocabularyBook, HighlightStyle, AIProvider, mapCanvasColorToCSSVar, getColorWithOpacity } from '../utils';
import { CanvasParser } from '../canvas';
import { HiWordsParser } from '../card';
import { t } from '../i18n';
import { DictionaryService } from '../services/dictionary-service';
import { DEFAULT_AI_DEFINITION_PROMPT, DEFAULT_TRANSLATE_PROMPT } from '../settings';
import { renderWordCard } from './word-card-renderer';

export class HiWordsSettingTab extends PluginSettingTab {
    plugin: HiWordsPlugin;
    private isTestingAIConnection = false;

    constructor(app: App, plugin: HiWordsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private runAsync(action: () => Promise<void>, context: string): void {
        void action().catch(error => {
            console.error(context, error);
        });
    }

    /**
     * 添加高亮范围设置（作为高亮设置的子部分）
     */
    private addHighlightScopeSettings() {
        const { containerEl } = this;

        // 高亮模式选择
        new Setting(containerEl)
            .setName(t('settings.highlight_mode'))
            .setDesc(t('settings.highlight_mode_desc'))
            .addDropdown(dropdown => dropdown
                .addOption('all', t('settings.mode_all'))
                .addOption('exclude', t('settings.mode_exclude'))
                .addOption('include', t('settings.mode_include'))
                .setValue(this.plugin.settings.highlightMode || 'all')
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.highlightMode = value as 'all' | 'exclude' | 'include';
                        await this.plugin.saveSettings();
                        this.plugin.refreshHighlighter();
                    }, 'HiWords 保存高亮模式失败:');
                }));

        // 文件路径输入框（上下结构）
        const pathsSetting = new Setting(containerEl)
            .setName(t('settings.highlight_paths'))
            .setDesc(t('settings.highlight_paths_desc'));

        pathsSetting.settingEl.addClass('hi-words-setting-textarea');
        pathsSetting.controlEl.empty();

        // 在当前设置项内创建全宽文本域
        const textAreaContainer = pathsSetting.controlEl.createDiv({ cls: 'hi-words-textarea-container' });
        const textArea = textAreaContainer.createEl('textarea');
        textArea.placeholder = t('settings.highlight_paths_placeholder') || 'e.g.: Archive, Templates, Private/Diary';
        textArea.value = this.plugin.settings.highlightPaths || '';
        textArea.rows = 3;

        // 使用 change 事件而不是 input 事件，避免频繁保存
        textArea.addEventListener('blur', () => {
            void (async () => {
                this.plugin.settings.highlightPaths = textArea.value;
                await this.plugin.saveSettings();
                this.plugin.refreshHighlighter();
            })().catch(error => {
                console.error('HiWords 保存高亮路径失败:', error);
            });
        });
    }

    /**
     * 添加文件节点解析模式设置
     */
    private addFileNodeParseModeSettings() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.file_node_parse_mode'))
            .setDesc(t('settings.file_node_parse_mode_desc'))
            .addDropdown(dropdown => dropdown
                .addOption('filename-with-alias', t('settings.mode_filename_with_alias'))
                .addOption('filename', t('settings.mode_filename'))
                .addOption('content', t('settings.mode_content'))
                .setValue(this.plugin.settings.fileNodeParseMode || 'filename-with-alias')
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.fileNodeParseMode = value as 'filename' | 'content' | 'filename-with-alias';
                        await this.plugin.saveSettings();
                        // 提示用户重新加载插件以应用新的解析模式
                        new Notice('请重新加载插件以应用新的文件节点解析模式');
                    }, 'HiWords 保存文件节点解析模式失败:');
                }));
    }

    /**
     * 添加自动布局设置
     */
    private addAutoLayoutSettings() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.auto_layout'))
            .setHeading();

        // 启用自动布局
        new Setting(containerEl)
            .setName(t('settings.enable_auto_layout'))
            .setDesc(t('settings.enable_auto_layout_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoLayoutEnabled ?? true)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.autoLayoutEnabled = value;
                        await this.plugin.saveSettings();
                    }, 'HiWords 保存自动布局设置失败:');
                }));

        // 卡片尺寸设置（宽度和高度在同一行）
        new Setting(containerEl)
            .setName(t('settings.card_size') || 'Card size')
            .setDesc(t('settings.card_size_desc') || 'Default width and height for canvas cards')
            .addText(text => text
                .setPlaceholder('260')
                .setValue(String(this.plugin.settings.cardWidth ?? 260))
                .onChange((value) => {
                    this.runAsync(async () => {
                        const width = parseInt(value);
                        if (!isNaN(width) && width > 0) {
                            this.plugin.settings.cardWidth = width;
                            await this.plugin.saveSettings();
                        }
                    }, 'HiWords 保存卡片宽度失败:');
                }))
            .addText(text => text
                .setPlaceholder('120')
                .setValue(String(this.plugin.settings.cardHeight ?? 120))
                .onChange((value) => {
                    this.runAsync(async () => {
                        const height = parseInt(value);
                        if (!isNaN(height) && height > 0) {
                            this.plugin.settings.cardHeight = height;
                            await this.plugin.saveSettings();
                        }
                    }, 'HiWords 保存卡片高度失败:');
                }));
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // 1. 生词本管理
        this.addVocabularyBooksSection();
        this.addFileNodeParseModeSettings();

        // 2. 高亮设置
        this.addHighlightingSection();

        // 3. 学习功能
        this.addLearningFeaturesSection();

        // 4. AI 设置
        this.addAISettingsSection();

        // 5. Canvas 设置
        this.addAutoLayoutSettings();
    }

    /**
     * 2. 添加高亮设置
     */
    private addHighlightingSection() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.enable_auto_highlight') || 'Highlighting')
            .setHeading();

        // 启用自动高亮
        new Setting(containerEl)
            .setName(t('settings.enable_auto_highlight'))
            .setDesc(t('settings.enable_auto_highlight_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAutoHighlight)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.enableAutoHighlight = value;
                        await this.plugin.saveSettings();
                        // 刷新高亮器,立即应用设置
                        this.plugin.refreshHighlighter();
                    }, 'HiWords 保存自动高亮设置失败:');
                }));

        // 浮动显示定义
        new Setting(containerEl)
            .setName(t('settings.show_definition_on_hover'))
            .setDesc(t('settings.show_definition_on_hover_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showDefinitionOnHover)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.showDefinitionOnHover = value;
                        await this.plugin.saveSettings();
                    }, 'HiWords 保存悬停预览设置失败:');
                }));

        new Setting(containerEl)
            .setName(t('settings.enable_section_tabs'))
            .setDesc(t('settings.enable_section_tabs_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableSectionTabs ?? true)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.enableSectionTabs = value;
                        await this.plugin.saveSettings();
                        this.plugin.app.workspace.trigger('hi-words:settings-changed');
                    }, 'HiWords 保存分区标签设置失败:');
                }));

        new Setting(containerEl)
            .setName(t('settings.sidebar_default_display_mode') || 'Sidebar default display')
            .setDesc(t('settings.sidebar_default_display_mode_desc') || 'Choose whether sidebar cards open with full details or only the word title')
            .addDropdown(dropdown => dropdown
                .addOption('detail', t('settings.sidebar_display_detail') || 'Show full details')
                .addOption('word', t('settings.sidebar_display_word') || 'Show words only')
                .setValue(this.plugin.settings.sidebarDefaultDisplayMode || 'detail')
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.sidebarDefaultDisplayMode = value as 'detail' | 'word';
                        await this.plugin.saveSettings();
                        this.plugin.app.workspace.trigger('hi-words:settings-changed');
                    }, 'HiWords 保存侧边栏默认显示设置失败:');
                }));

        // 高亮样式选择
        new Setting(containerEl)
            .setName(t('settings.highlight_style'))
            .setDesc(t('settings.highlight_style_desc'))
            .addDropdown(dropdown => dropdown
                .addOption('underline', t('settings.style_underline'))
                .addOption('background', t('settings.style_background'))
                .addOption('bold', t('settings.style_bold'))
                .addOption('dotted', t('settings.style_dotted'))
                .addOption('wavy', t('settings.style_wavy'))
                .setValue(this.plugin.settings.highlightStyle)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.highlightStyle = value as HighlightStyle;
                        await this.plugin.saveSettings();
                        this.plugin.refreshHighlighter();
                    }, 'HiWords 保存高亮样式失败:');
                }));

        // 高亮范围设置
        this.addHighlightScopeSettings();
    }

    /**
     * 测试 AI 服务连接
     */
    private async testAIConnection() {
        if (this.isTestingAIConnection) return;

        this.isTestingAIConnection = true;

        const loadingNotice = new Notice(
            t('notices.testing_ai_connection') || 'Testing AI connection...',
            0
        );

        try {
            const service = new DictionaryService({
                service: this.plugin.settings.aiService,
                prompt: 'Reply with "OK" for the word "{{word}}".'
            });
            const result = await service.fetchDefinition(
                'test',
                'This is a test sentence for checking the AI connection.'
            );

            loadingNotice.hide();

            if (!result.trim()) {
                throw new Error(t('ai_errors.invalid_response'));
            }

            new Notice(
                t('notices.ai_connection_success') || 'AI connection successful',
                5000
            );
        } catch (error) {
            loadingNotice.hide();
            console.error('AI connection test failed:', error);
            const errorMessage = error instanceof Error
                ? error.message
                : (t('notices.ai_connection_failed') || 'AI connection test failed');
            new Notice(errorMessage, 6000);
        } finally {
            this.isTestingAIConnection = false;
        }
    }

    private getProviderDefaults(provider: AIProvider): { apiUrl: string; model: string } {
        switch (provider) {
            case 'anthropic':
                return { apiUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-20241022' };
            case 'gemini':
                return { apiUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' };
            case 'openai-compatible':
                return { apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
            case 'custom':
            default:
                return { apiUrl: '', model: '' };
        }
    }

    private addPromptTextArea(
        name: string,
        desc: string,
        value: string,
        placeholder: string,
        rows: number,
        onBlur: (value: string) => Promise<void>,
        onReset?: () => Promise<void>
    ) {
        const { containerEl } = this;
        const promptSetting = new Setting(containerEl)
            .setName(name)
            .setDesc(desc);

        promptSetting.settingEl.addClass('hi-words-setting-textarea');
        promptSetting.controlEl.empty();

        const textAreaContainer = promptSetting.controlEl.createDiv({ cls: 'hi-words-textarea-container' });
        const textArea = textAreaContainer.createEl('textarea');
        textArea.rows = rows;
        textArea.value = value;
        textArea.placeholder = placeholder;

        textArea.addEventListener('blur', () => {
            void onBlur(textArea.value).catch(error => {
                console.error('HiWords 保存文本设置失败:', error);
            });
        });

        if (onReset) {
            const resetButton = textAreaContainer.createEl('button', {
                text: t('settings.restore_default_prompt') || 'Restore default'
            });
            resetButton.addClass('hi-words-reset-prompt-button');
            resetButton.addEventListener('click', () => {
                void (async () => {
                    await onReset();
                    this.display();
                })().catch(error => {
                    console.error('HiWords 重置文本设置失败:', error);
                });
            });
        }
    }

    private addAISettingsSection() {
        this.addAIServiceSection();
        this.addAIDefinitionSection();
        this.addSelectionTranslateSection();
    }

    private addAIServiceSection() {
        const { containerEl } = this;
        let apiUrlText: TextComponent | undefined;
        let modelText: TextComponent | undefined;
        const currentDefaults = this.getProviderDefaults(this.plugin.settings.aiService.provider);

        if (!this.plugin.settings.aiService.apiUrl && currentDefaults.apiUrl) {
            this.plugin.settings.aiService.apiUrl = currentDefaults.apiUrl;
            void this.plugin.saveSettings();
        }

        if (!this.plugin.settings.aiService.model && currentDefaults.model) {
            this.plugin.settings.aiService.model = currentDefaults.model;
            void this.plugin.saveSettings();
        }

        new Setting(containerEl)
            .setName(t('settings.ai_service') || 'AI service')
            .setHeading();

        new Setting(containerEl)
            .setName(t('settings.ai_provider') || 'Provider')
            .setDesc(t('settings.ai_provider_desc') || 'Choose a provider preset. Custom keeps URL-based auto detection.')
            .addDropdown(dropdown => dropdown
                .addOption('openai-compatible', t('settings.ai_provider_openai_compatible') || 'OpenAI compatible')
                .addOption('anthropic', t('settings.ai_provider_anthropic') || 'Anthropic Claude')
                .addOption('gemini', t('settings.ai_provider_gemini') || 'Google Gemini')
                .addOption('custom', t('settings.ai_provider_custom') || 'Custom')
                .setValue(this.plugin.settings.aiService.provider)
                .onChange((value) => {
                    this.runAsync(async () => {
                        const provider = value as AIProvider;
                        this.plugin.settings.aiService.provider = provider;
                        const defaults = this.getProviderDefaults(provider);
                        if (defaults.apiUrl) this.plugin.settings.aiService.apiUrl = defaults.apiUrl;
                        if (defaults.model) this.plugin.settings.aiService.model = defaults.model;
                        await this.plugin.saveSettings();
                        apiUrlText?.setPlaceholder(defaults.apiUrl || 'https://...');
                        modelText?.setPlaceholder(defaults.model || 'model-id');
                        if (defaults.apiUrl) apiUrlText?.setValue(defaults.apiUrl);
                        if (defaults.model) modelText?.setValue(defaults.model);
                    }, 'HiWords 保存 AI 服务商失败:');
                }));

        new Setting(containerEl)
            .setName(t('settings.ai_api_url') || 'API URL')
            .setDesc(t('settings.ai_api_url_desc') || 'Full API endpoint')
            .addText(text => {
                apiUrlText = text;
                text.setPlaceholder(this.getProviderDefaults(this.plugin.settings.aiService.provider).apiUrl || 'https://...')
                    .setValue(this.plugin.settings.aiService.apiUrl)
                    .onChange((val) => {
                        this.runAsync(async () => {
                            this.plugin.settings.aiService.apiUrl = val.trim();
                            await this.plugin.saveSettings();
                        }, 'HiWords 保存 AI API URL 失败:');
                    });
            });

        new Setting(containerEl)
            .setName(t('settings.ai_api_key') || 'API Key')
            .setDesc(t('settings.ai_api_key_desc') || 'Your AI API key')
            .addText(text => {
                text.inputEl.type = 'password';
                text.setPlaceholder('sk-...')
                    .setValue(this.plugin.settings.aiService.apiKey)
                    .onChange((val) => {
                        this.runAsync(async () => {
                            this.plugin.settings.aiService.apiKey = val.trim();
                            await this.plugin.saveSettings();
                        }, 'HiWords 保存 AI API Key 失败:');
                    });
            });

        new Setting(containerEl)
            .setName(t('settings.ai_model') || 'Model ID')
            .setDesc(t('settings.ai_model_desc') || 'AI model identifier')
            .addText(text => {
                modelText = text;
                text.setPlaceholder(this.getProviderDefaults(this.plugin.settings.aiService.provider).model || 'model-id')
                    .setValue(this.plugin.settings.aiService.model)
                    .onChange((val) => {
                        this.runAsync(async () => {
                            this.plugin.settings.aiService.model = val.trim();
                            await this.plugin.saveSettings();
                        }, 'HiWords 保存 AI 模型失败:');
                    });
            });

        new Setting(containerEl)
            .setName(t('settings.ai_test_connection') || 'Test AI connection')
            .setDesc(t('settings.ai_test_connection_desc') || 'Send a small test request to verify your API URL, key, and model')
            .addButton(button => button
                .setButtonText(t('settings.ai_test_connection') || 'Test AI connection')
                .setCta()
                .onClick(() => {
                    this.runAsync(async () => {
                        await this.testAIConnection();
                    }, 'HiWords 测试 AI 连接失败:');
                }));

        this.addAIExtraParamsSetting();
    }

    private addAIDefinitionSection() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.ai_definition') || 'AI definition')
            .setHeading();

        new Setting(containerEl)
            .setName(t('settings.enable_ai_definition') || 'Enable AI definition')
            .setDesc(t('settings.enable_ai_definition_desc') || 'Show the auto-fill button when adding or editing words')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.aiDefinition.enabled)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.aiDefinition.enabled = value;
                        await this.plugin.saveSettings();
                        this.display();
                    }, 'HiWords 保存 AI 释义设置失败:');
                }));

        if (!this.plugin.settings.aiDefinition.enabled) return;

        this.addPromptTextArea(
            t('settings.ai_prompt') || 'Definition prompt',
            t('settings.ai_prompt_desc') || 'Use {{word}} and {{sentence}} as placeholders.',
            this.plugin.settings.aiDefinition.prompt,
            DEFAULT_AI_DEFINITION_PROMPT,
            6,
            async (value) => {
                this.plugin.settings.aiDefinition.prompt = value;
                await this.plugin.saveSettings();
            },
            async () => {
                this.plugin.settings.aiDefinition.prompt = DEFAULT_AI_DEFINITION_PROMPT;
                await this.plugin.saveSettings();
            }
        );
    }

    private addSelectionTranslateSection() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.selection_translate'))
            .setHeading();

        new Setting(containerEl)
            .setName(t('settings.enable_selection_translate'))
            .setDesc(t('settings.enable_selection_translate_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.selectionTranslate.enabled)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.selectionTranslate.enabled = value;
                        await this.plugin.saveSettings();
                        this.display();
                    }, 'HiWords 保存划词翻译设置失败:');
                }));

        if (!this.plugin.settings.selectionTranslate.enabled) return;

        new Setting(containerEl)
            .setName(t('settings.translate_target_lang'))
            .setDesc(t('settings.translate_target_lang_desc'))
            .addText(text => text
                .setPlaceholder('zh-CN')
                .setValue(this.plugin.settings.selectionTranslate.targetLang)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.selectionTranslate.targetLang = value.trim();
                        await this.plugin.saveSettings();
                    }, 'HiWords 保存翻译目标语言失败:');
                }));

        this.addPromptTextArea(
            t('settings.translate_prompt'),
            t('settings.translate_prompt_desc'),
            this.plugin.settings.selectionTranslate.prompt,
            DEFAULT_TRANSLATE_PROMPT,
            3,
            async (value) => {
                this.plugin.settings.selectionTranslate.prompt = value;
                await this.plugin.saveSettings();
            },
            async () => {
                this.plugin.settings.selectionTranslate.prompt = DEFAULT_TRANSLATE_PROMPT;
                await this.plugin.saveSettings();
            }
        );
    }

    private addAIExtraParamsSetting() {
        const { containerEl } = this;

        const extraParamsSetting = new Setting(containerEl)
            .setName(t('settings.ai_extra_params') || 'Extra request parameters')
            .setDesc(t('settings.ai_extra_params_desc') || 'Advanced JSON parameters merged into AI definition requests');

        extraParamsSetting.settingEl.addClass('hi-words-setting-textarea');
        extraParamsSetting.controlEl.empty();

        const jsonContainer = extraParamsSetting.controlEl.createDiv({ cls: 'hi-words-textarea-container' });
        const jsonTextArea = jsonContainer.createEl('textarea', { cls: 'hi-words-json-editor' });

        jsonTextArea.placeholder = t('settings.ai_extra_params_placeholder') || '{\n  "temperature": 0.7,\n  "top_p": 0.9\n}';
        jsonTextArea.value = this.plugin.settings.aiService.extraParams || '{}';
        jsonTextArea.rows = 5;

        jsonTextArea.addEventListener('blur', () => {
            void (async () => {
                const jsonValue = jsonTextArea.value.trim();
                try {
                    if (jsonValue && jsonValue !== '{}') {
                        JSON.parse(jsonValue);
                    }
                    this.plugin.settings.aiService.extraParams = jsonValue || '{}';
                    await this.plugin.saveSettings();
                    jsonTextArea.removeClass('hi-words-json-error');
                } catch {
                    jsonTextArea.addClass('hi-words-json-error');
                    new Notice(t('ai_errors.invalid_json_format') || 'Invalid JSON format, please check syntax');
                }
            })();
        });
    }

    /**
     * 3. 添加学习功能设置
     */
    private addLearningFeaturesSection() {
        const { containerEl } = this;

        new Setting(containerEl)
            .setName(t('settings.enable_mastered_feature') || 'Learning Features')
            .setHeading();

        // 启用已掌握功能
        new Setting(containerEl)
            .setName(t('settings.enable_mastered_feature'))
            .setDesc(t('settings.enable_mastered_feature_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableMasteredFeature)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.enableMasteredFeature = value;
                        // 当启用已掌握功能时，自动启用侧边栏分组显示
                        this.plugin.settings.showMasteredInSidebar = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshHighlighter();
                        // 触发侧边栏更新
                        this.plugin.app.workspace.trigger('hi-words:mastered-changed');
                        this.display();
                    }, 'HiWords 保存已掌握功能设置失败:');
                }));

        // 已掌握判定模式（分组/颜色）
        const masteredMode = new Setting(containerEl)
            .setName(t('settings.mastered_detection') || 'Mastered detection mode')
            .setDesc(t('settings.mastered_detection_desc') || 'Choose how to detect "mastered": by group or by color (green = 4)');
        masteredMode.addDropdown(dropdown => dropdown
            .addOption('group', t('settings.mode_group') || 'Group mode')
            .addOption('color', t('settings.mode_color') || 'Color mode (green = 4)')
            .setValue(this.plugin.settings.masteredDetection ?? 'group')
            .onChange((value) => {
                this.runAsync(async () => {
                    // 保存并同步到各子模块
                    this.plugin.settings.masteredDetection = value as 'group' | 'color';
                    await this.plugin.saveSettings();
                    // 同步给 VocabularyManager/Parser/Editor
                    if (this.plugin.vocabularyManager?.updateSettings) {
                        this.plugin.vocabularyManager.updateSettings(this.plugin.settings);
                    }
                    // updateSettings 已经处理了缓存失效，不需要手动重新加载
                    // 只有当 masteredDetection 变化时才需要重新解析数据
                    await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    this.plugin.refreshHighlighter();
                    // 通知工作区应用
                    this.plugin.app.workspace.trigger('hi-words:settings-changed');
                }, 'HiWords 保存已掌握判定模式失败:');
            }));
        // 当功能未启用时禁用选择
        if (!this.plugin.settings.enableMasteredFeature) {
            masteredMode.setDisabled(true);
        }

        // 模糊定义内容
        new Setting(containerEl)
            .setName(t('settings.blur_definitions'))
            .setDesc(t('settings.blur_definitions_desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.blurDefinitions)
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.blurDefinitions = value;
                        await this.plugin.saveSettings();
                        // 触发侧边栏更新以应用模糊效果
                        this.plugin.app.workspace.trigger('hi-words:settings-changed');
                    }, 'HiWords 保存模糊释义设置失败:');
                }));

        // 发音地址模板（点击主词发音）
        new Setting(containerEl)
            .setName(t('settings.tts_template') || 'TTS template')
            .setDesc(t('settings.tts_template_desc') || 'Use {{word}}, {{type}}, and {{accent}} as placeholders.')
            .addText(text => text
                .setPlaceholder('https://...{{word}}...')
                .setValue(this.plugin.settings.ttsTemplate || 'https://dict.youdao.com/dictvoice?audio={{word}}&type=2')
                .onChange((val) => {
                    this.runAsync(async () => {
                        this.plugin.settings.ttsTemplate = val.trim();
                        await this.plugin.saveSettings();
                    }, 'HiWords 保存发音模板失败:');
                }));

        new Setting(containerEl)
            .setName(t('settings.pronunciation_variant') || 'Pronunciation')
            .setDesc(t('settings.pronunciation_variant_desc') || 'Choose which accent to display and play for structured word cards')
            .addDropdown(dropdown => dropdown
                .addOption('us', t('settings.pronunciation_us') || 'US')
                .addOption('uk', t('settings.pronunciation_uk') || 'UK')
                .setValue(this.plugin.settings.pronunciationVariant || 'us')
                .onChange((value) => {
                    this.runAsync(async () => {
                        this.plugin.settings.pronunciationVariant = value as 'us' | 'uk';
                        await this.plugin.saveSettings();
                        this.plugin.app.workspace.trigger('hi-words:settings-changed');
                        this.plugin.refreshHighlighter();
                        this.display();
                    }, 'HiWords 保存发音偏好失败:');
                }));

    }

    /**
     * 添加生词本管理部分
     */
    private addVocabularyBooksSection() {
        const { containerEl } = this;

        // 添加生词本图标按钮
        const addBookContainer = containerEl.createDiv({ cls: 'hi-words-add-book-container' });
        addBookContainer.addEventListener('click', () => {
            void this.showVocabularyBookFilePicker().catch(error => {
                console.error('HiWords 打开词库选择器失败:', error);
            });
        });

        addBookContainer.createSpan({
            text: t('settings.add_vocabulary_book'),
            cls: 'hi-words-add-book-label'
        });

        const addBookIcon = addBookContainer.createDiv({ cls: 'clickable-icon hi-words-add-book-icon' });
        setIcon(addBookIcon, 'plus-circle');
        addBookIcon.setAttribute('aria-label', t('settings.add_vocabulary_book'));

        // 显示现有生词本
        this.displayVocabularyBooks();

        // 统计信息
        this.displayStats();
    }

    /**
     * 显示词库文件选择器
     */
    private async showVocabularyBookFilePicker() {
        const vocabularyFiles = this.app.vault.getFiles()
            .filter(file => file.extension === 'canvas' || file.extension === 'hiwords');

        if (vocabularyFiles.length === 0) {
            new Notice(t('notices.no_vocabulary_book_files'));
            return;
        }

        // 创建选择模态框
        const modal = new VocabularyBookPickerModal(this.app, vocabularyFiles, (file) => {
            void this.addVocabularyBook(file).catch(error => {
                console.error('HiWords 添加词库失败:', error);
            });
        });
        modal.open();
    }

    /**
     * 添加生词本
     */
    private async addVocabularyBook(file: TFile) {
        // 检查是否已存在
        const exists = this.plugin.settings.vocabularyBooks.some(book => book.path === file.path);
        if (exists) {
            new Notice(t('notices.book_already_exists'));
            return;
        }

        // 验证词库文件
        const hiWordsParser = file.extension === 'hiwords' ? new HiWordsParser(this.app) : null;
        const metadata = hiWordsParser ? await hiWordsParser.readMetadata(file) : null;
        const isValid = hiWordsParser
            ? metadata !== null && await hiWordsParser.validateFile(file)
            : await new CanvasParser(this.app, this.plugin.settings).validateCanvasFile(file);
        if (!isValid) {
            new Notice(t('notices.invalid_vocabulary_book_file'));
            return;
        }

        // 添加到设置
        const newBook: VocabularyBook = {
            path: file.path,
            name: file.basename,
            enabled: true,
        };

        this.plugin.settings.vocabularyBooks.push(newBook);
        await this.plugin.saveSettings();
        await this.plugin.vocabularyManager.loadVocabularyBook(newBook);
        this.plugin.refreshHighlighter();

        new Notice(t('notices.book_added').replace('{0}', newBook.name));
        this.display(); // 刷新设置页面
    }

    /**
     * 显示现有生词本
     */
    private displayVocabularyBooks() {
        const { containerEl } = this;

        if (this.plugin.settings.vocabularyBooks.length === 0) {
            containerEl.createEl('p', {
                text: t('settings.no_vocabulary_books'),
                cls: 'setting-item-description'
            });
            return;
        }

        this.plugin.settings.vocabularyBooks.forEach((book, index) => {
            const setting = new Setting(containerEl)
                .setName(book.name)
                .setDesc(`${t('settings.path')}: ${book.path}`);

            // 创建图标容器
            const iconsContainer = setting.controlEl.createDiv({ cls: 'hi-words-book-icons' });

            if (book.path.endsWith('.hiwords')) {
                this.addHiWordsBookColorSelector(iconsContainer, book);

                const previewIcon = iconsContainer.createDiv({ cls: 'clickable-icon' });
                setIcon(previewIcon, 'panel-top-open');
                previewIcon.setAttribute('aria-label', t('settings.preview_book'));
                previewIcon.addEventListener('click', () => {
                    new HiWordsPackPreviewModal(this.app, book, this.plugin.settings.pronunciationVariant || 'us').open();
                });
            }

            // 重新加载图标
            const reloadIcon = iconsContainer.createDiv({ cls: 'clickable-icon' });
            setIcon(reloadIcon, 'refresh-cw');
            reloadIcon.setAttribute('aria-label', t('settings.reload_book'));
            reloadIcon.addEventListener('click', () => {
                void (async () => {
                    await this.plugin.vocabularyManager.reloadVocabularyBook(book.path);
                    this.plugin.refreshHighlighter();
                    new Notice(t('notices.book_reloaded').replace('{0}', book.name));
                })().catch(error => {
                    console.error('HiWords 重新加载词库失败:', error);
                });
            });

            // 删除图标
            const deleteIcon = iconsContainer.createDiv({ cls: 'clickable-icon mod-warning' });
            setIcon(deleteIcon, 'trash');
            deleteIcon.setAttribute('aria-label', t('settings.remove_vocabulary_book'));
            deleteIcon.addEventListener('click', () => {
                void (async () => {
                    this.plugin.settings.vocabularyBooks.splice(index, 1);
                    await this.plugin.saveSettings();
                    await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                    this.plugin.refreshHighlighter();
                    new Notice(t('notices.book_removed').replace('{0}', book.name));
                    this.display(); // 刷新设置页面
                })().catch(error => {
                    console.error('HiWords 删除词库失败:', error);
                });
            });

            // 启用/禁用开关
            setting.addToggle(toggle => toggle
                .setValue(book.enabled)
                .onChange((value) => {
                    this.runAsync(async () => {
                        book.enabled = value;
                        await this.plugin.saveSettings();
                        if (value) {
                            await this.plugin.vocabularyManager.loadVocabularyBook(book);
                        } else {
                            await this.plugin.vocabularyManager.loadAllVocabularyBooks();
                        }
                        this.plugin.refreshHighlighter();
                    }, 'HiWords 保存词库启用状态失败:');
                }));
        });
    }

    private addHiWordsBookColorSelector(container: HTMLElement, book: VocabularyBook) {
        const options = [
            { value: '', label: t('settings.book_color_default'), css: 'var(--text-muted)' },
            { value: '1', label: t('modals.color_red'), css: 'var(--color-red)' },
            { value: '2', label: t('modals.color_orange'), css: 'var(--color-orange)' },
            { value: '3', label: t('modals.color_yellow'), css: 'var(--color-yellow)' },
            { value: '4', label: t('modals.color_green'), css: 'var(--color-green)' },
            { value: '5', label: t('modals.color_blue'), css: 'var(--color-cyan)' },
            { value: '6', label: t('modals.color_purple'), css: 'var(--color-purple)' },
        ];

        const colorControl = container.createDiv({ cls: 'hi-words-book-color-control clickable-icon' });
        colorControl.setAttribute('aria-label', t('settings.book_color'));
        colorControl.setAttribute('role', 'button');
        colorControl.setAttribute('tabindex', '0');
        const swatch = colorControl.createSpan({ cls: 'hi-words-book-color-swatch' });

        const updateSwatch = () => {
            const selected = options.find(option => option.value === (book.color || '')) || options[0];
            swatch.style.setProperty('--hi-words-book-color', selected.css);
            colorControl.setAttribute('aria-label', `${t('settings.book_color')}: ${selected.label}`);
        };

        const applyColor = async (value: string) => {
            book.color = value || undefined;
            updateSwatch();
            await this.plugin.saveSettings();
            if (book.enabled) {
                await this.plugin.vocabularyManager.loadVocabularyBook(book);
            }
            this.plugin.refreshHighlighter();
        };

        const openPalette = (event: MouseEvent | KeyboardEvent) => {
            activeDocument.querySelectorAll('.hi-words-book-color-palette').forEach(el => el.remove());

            const palette = activeDocument.body.createDiv({ cls: 'hi-words-book-color-palette' });

            const closePalette = () => {
                palette.remove();
                activeDocument.removeEventListener('click', handleOutsideClick, true);
                activeDocument.removeEventListener('keydown', handleEscape, true);
            };
            const handleOutsideClick = (outsideEvent: MouseEvent) => {
                const target = outsideEvent.target as Node | null;
                if (target && (palette.contains(target) || colorControl.contains(target))) {
                    return;
                }
                closePalette();
            };
            const handleEscape = (keyboardEvent: KeyboardEvent) => {
                if (keyboardEvent.key === 'Escape') {
                    closePalette();
                }
            };

            for (const option of options) {
                const item = palette.createEl('button', {
                    cls: 'hi-words-book-color-palette-item',
                    attr: {
                        type: 'button',
                        'aria-label': option.label,
                        title: option.label,
                    },
                });
                item.style.setProperty('--hi-words-book-color', option.css);
                item.style.setProperty('background-color', option.css, 'important');
                if ((book.color || '') === option.value) {
                    item.addClass('is-selected');
                    setIcon(item, 'check');
                }
                item.addEventListener('click', () => {
                    void applyColor(option.value);
                    closePalette();
                });
            }

            const rect = colorControl.getBoundingClientRect();
            palette.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
            palette.style.top = `${rect.bottom + 6}px`;

            activeDocument.addEventListener('click', handleOutsideClick, true);
            activeDocument.addEventListener('keydown', handleEscape, true);
        };

        colorControl.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openPalette(event);
        });
        colorControl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPalette(event);
            }
        });

        updateSwatch();
    }

    /**
     * 显示统计信息
     */
    private displayStats() {
        const { containerEl } = this;
        const stats = this.plugin.vocabularyManager.getStats();

        const statsEl = containerEl.createEl('div', { cls: 'hi-words-stats' });

        // 总单词本数量
        const totalBooksItem = statsEl.createEl('div', { cls: 'stat-item' });
        totalBooksItem.createEl('div', { cls: 'stat-value', text: stats.totalBooks.toString() });
        totalBooksItem.createEl('div', { cls: 'stat-label', text: t('settings.total_books').split(':')[0] });

        // 已启用单词本
        const enabledBooksItem = statsEl.createEl('div', { cls: 'stat-item' });
        enabledBooksItem.createEl('div', { cls: 'stat-value', text: stats.enabledBooks.toString() });
        enabledBooksItem.createEl('div', { cls: 'stat-label', text: t('settings.enabled_books').split(':')[0] });

        // 总单词数
        const totalWordsItem = statsEl.createEl('div', { cls: 'stat-item' });
        totalWordsItem.createEl('div', { cls: 'stat-value', text: stats.totalWords.toString() });
        totalWordsItem.createEl('div', { cls: 'stat-label', text: t('settings.total_words').split(':')[0] });
    }
}

class HiWordsPackPreviewModal extends Modal {
    private book: VocabularyBook;
    private pronunciationVariant: 'uk' | 'us';

    constructor(app: App, book: VocabularyBook, pronunciationVariant: 'uk' | 'us') {
        super(app);
        this.book = book;
        this.pronunciationVariant = pronunciationVariant;
    }

    onOpen() {
        this.contentEl.empty();
        this.modalEl.addClass('hi-words-pack-preview-modal-container');
        this.contentEl.addClass('hi-words-pack-preview-modal');
        void this.render();
    }

    private async render() {
        const file = this.app.vault.getAbstractFileByPath(this.book.path);
        if (!(file instanceof TFile)) {
            this.contentEl.createEl('p', { text: t('notices.invalid_vocabulary_book_file') });
            return;
        }

        const parser = new HiWordsParser(this.app);
        const metadata = await parser.readMetadata(file);
        const definitions = await parser.parseFile(file);
        if (this.book.color) {
            for (const definition of definitions) {
                if (!definition.color) {
                    definition.color = this.book.color;
                }
            }
        }

        this.titleEl.setText(metadata?.title || this.book.name);

        const summary = this.contentEl.createDiv({ cls: 'hi-words-pack-preview-summary' });

        const metaGrid = summary.createDiv({ cls: 'hi-words-pack-preview-meta-grid' });
        this.addMetaItem(metaGrid, t('modals.pack_words'), String(metadata?.cardCount ?? definitions.length));
        this.addMetaItem(metaGrid, t('modals.pack_language'), metadata?.language || '-');
        this.addMetaItem(metaGrid, t('modals.pack_version'), String(metadata?.version ?? 1));

        const sampleTitle = this.contentEl.createDiv({
            cls: 'hi-words-pack-preview-section-title',
            text: t('modals.pack_samples'),
        });
        sampleTitle.toggleClass('is-empty', definitions.length === 0);

        const sampleList = this.contentEl.createDiv({ cls: 'hi-words-pack-preview-samples' });
        for (const definition of definitions.slice(0, 3)) {
            const sample = sampleList.createDiv({ cls: 'hi-words-pack-preview-sample' });
            if (definition.color) {
                const accentColor = mapCanvasColorToCSSVar(definition.color, 'var(--color-base-60)');
                sample.style.setProperty('--word-card-accent-color', accentColor);
                sample.style.setProperty('--word-card-bg-color', getColorWithOpacity(accentColor, 0.08));
            }
            sample.createDiv({ cls: 'hi-words-pack-preview-word', text: definition.word });
            const body = sample.createDiv({ cls: 'hi-words-pack-preview-card-body' });
            renderWordCard(body, definition, {
                mode: 'sidebar',
                app: this.app,
                pronunciationVariant: this.pronunciationVariant,
            });
        }

        if (definitions.length === 0) {
            sampleList.createDiv({ cls: 'setting-item-description', text: t('sidebar.empty_state') });
        }
    }

    private addMetaItem(container: HTMLElement, label: string, value: string) {
        const item = container.createDiv({ cls: 'hi-words-pack-preview-meta-item' });
        item.createDiv({ cls: 'hi-words-pack-preview-meta-label', text: label });
        item.createDiv({ cls: 'hi-words-pack-preview-meta-value', text: value });
    }
}

// 词库文件选择模态框（使用 FuzzySuggestModal 支持模糊搜索）
class VocabularyBookPickerModal extends FuzzySuggestModal<TFile> {
    private files: TFile[];
    private onSelect: (file: TFile) => void;

    constructor(app: App, files: TFile[], onSelect: (file: TFile) => void) {
        super(app);
        this.files = files;
        this.onSelect = onSelect;
        this.setPlaceholder(t('modals.select_vocabulary_book_file'));
    }

    // 返回所有可选项
    getItems(): TFile[] {
        return this.files;
    }

    // 返回每个项的显示文本（用于搜索匹配）
    getItemText(file: TFile): string {
        return file.path;
    }

    // 当用户选择某项时调用
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.onSelect(file);
    }
}
