import type { TranslationResult } from '../utils';
import { t } from '../i18n';
import { DictionaryService } from './dictionary-service';

export class TranslationService {
    private dictionaryService: DictionaryService;
    private targetLanguage: string;

    constructor(
        aiConfig: { apiUrl: string; apiKey: string; model: string; prompt: string },
        targetLanguage: string = 'chinese (Simplified)',
    ) {
        this.dictionaryService = new DictionaryService(aiConfig);
        this.targetLanguage = targetLanguage;
    }

    async translateStream(
        text: string,
        onChunk: (content: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        const cleanText = text.trim();
        
        if (!cleanText) {
            onError(new Error(t('translation.text_empty')));
            return;
        }

        if (cleanText.length > 5000) {
            onError(new Error(t('translation.text_too_long')));
            return;
        }

        const prompt = `Translate the following text to ${this.targetLanguage}. Provide ONLY the translated text, no explanations or additional formatting:

${cleanText}`;

        await this.dictionaryService.makeAIRequestStream(prompt, onChunk, onComplete, onError);
    }

    async translate(text: string): Promise<TranslationResult> {
        const cleanText = text.trim();
        
        if (!cleanText) {
            throw new Error(t('translation.text_empty'));
        }

        if (cleanText.length > 5000) {
            throw new Error(t('translation.text_too_long'));
        }

        return await this.translateWithAI(cleanText);
    }

    private async translateWithAI(text: string): Promise<TranslationResult> {
        const prompt = `Please translate the following text to ${this.targetLanguage} and return the result in the following exact JSON format. Do not include any additional text or explanations outside the JSON structure:

{
  "originalText": "${text}",
  "translatedText": "translated text here",
  "targetLanguage": "${this.targetLanguage}"
}

Requirements:
- Return ONLY valid JSON, no markdown formatting or code blocks
- Provide accurate translation
- Ensure the translation is natural and fluent in the target language`;

        try {
            const content = await this.dictionaryService.makeAIRequest(prompt, `translate:${text}`, true);
            const result = this.parseAIResponse(content);
            return result;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error(t('translation.network_error'));
        }
    }

    private parseAIResponse(content: string): TranslationResult {
        try {
            const data = JSON.parse(content);

            if (!data.originalText || !data.translatedText || !data.targetLanguage) {
                throw new Error('Invalid AI response format');
            }

            const result: TranslationResult = {
                originalText: data.originalText,
                translatedText: data.translatedText,
                targetLanguage: data.targetLanguage
            };

            if (data.detectedLanguage) {
                result.detectedLanguage = data.detectedLanguage;
            }

            return result;
        } catch (error) {
            console.error('Failed to parse AI response:', content, error);
            throw new Error(t('translation.invalid_response'));
        }
    }
}
