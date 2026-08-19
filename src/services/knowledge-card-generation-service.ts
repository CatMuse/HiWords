import type HiWordsPlugin from '../../main';
import { createStableId } from '../editor/hiwords-document';
import { HiWordsCard, HiWordsCardKind, HiWordsConceptCard, HiWordsPersonCard, isPersonCard, isWordCard } from '../schema/hiwords';
import { DictionaryService } from './dictionary-service';
import { HiWordsGenerationService, mergeGeneratedContent } from './hiwords-generation-service';

const PERSON_PROMPT = `Create a concise factual person knowledge card for "{{word}}".
Return ONLY valid JSON, without Markdown fences. Do not invent sources or uncertain facts.
{
  "aliases": ["other names"],
  "summary": "short biography",
  "birthDate": "date or empty",
  "deathDate": "date or empty",
  "nationalities": ["nationality"],
  "occupations": ["occupation"],
  "timeline": [{"date":"date","title":"event","description":"brief detail"}],
  "achievements": [{"title":"achievement","description":"brief detail"}],
  "works": [{"title":"work","date":"date","description":"brief detail"}],
  "relations": [{"type":"relationship","target":"person","note":"brief note"}]
}
Use at most 6 timeline events, 5 achievements, 5 works and 6 relations.`;

const CONCEPT_PROMPT = `Create a concise educational concept knowledge card for "{{word}}".
Return ONLY valid JSON, without Markdown fences. Do not invent citations.
{
  "aliases": ["alternative names"],
  "domain": "field or discipline",
  "definition": "one concise definition",
  "explanation": "clear learner-friendly explanation",
  "principles": ["core principle"],
  "examples": [{"title":"example title","content":"example explanation"}],
  "misconceptions": ["common misconception"],
  "prerequisites": [{"target":"concept","note":"why it helps"}],
  "relatedConcepts": [{"target":"concept","note":"relationship"}]
}
Use at most 6 principles, 5 examples, 5 misconceptions and 6 concept relations.`;

export async function generateKnowledgeCardDraft(plugin: HiWordsPlugin, card: HiWordsCard, kind: HiWordsCardKind): Promise<HiWordsCard> {
    if (isWordCard(card, kind)) {
        const generated = await new HiWordsGenerationService(plugin).generate(card.title);
        return mergeGeneratedContent(card, generated);
    }
    const dictionary = new DictionaryService({
        service: plugin.settings.aiService,
        apiKey: plugin.getAIAPIKey(),
        prompt: isPersonCard(card, kind) ? PERSON_PROMPT : CONCEPT_PROMPT,
        maxTokens: 5000,
    });
    const value = parseJson(await dictionary.fetchDefinition(card.title));
    if (!isRecord(value)) throw new Error('AI returned an invalid knowledge card.');
    return isPersonCard(card, kind) ? mergePerson(card, value) : mergeConcept(card as HiWordsConceptCard, value);
}

function mergePerson(card: HiWordsPersonCard, value: Record<string, unknown>): HiWordsPersonCard {
    const result = clone(card);
    fillAliases(result, value.aliases);
    result.data.summary ||= text(value.summary);
    result.data.birthDate ||= optionalText(value.birthDate);
    result.data.deathDate ||= optionalText(value.deathDate);
    result.data.nationalities = keepOrStrings(result.data.nationalities, value.nationalities, 6);
    result.data.occupations = keepOrStrings(result.data.occupations, value.occupations, 8);
    if (!result.data.timeline?.length) result.data.timeline = records(value.timeline, 6).map(item => ({
        id: createStableId('event'), date: text(item.date), title: text(item.title), description: optionalText(item.description),
    })).filter(item => item.title);
    if (!result.data.achievements?.length) result.data.achievements = records(value.achievements, 5).map(item => ({
        id: createStableId('achievement'), title: text(item.title), description: optionalText(item.description),
    })).filter(item => item.title);
    if (!result.data.works?.length) result.data.works = records(value.works, 5).map(item => ({
        id: createStableId('work'), title: text(item.title), date: optionalText(item.date), description: optionalText(item.description),
    })).filter(item => item.title);
    if (!result.data.relations?.length) result.data.relations = records(value.relations, 6).map(item => ({
        id: createStableId('relation'), type: text(item.type) || 'related', target: text(item.target), note: optionalText(item.note),
    })).filter(item => item.target);
    return result;
}

function mergeConcept(card: HiWordsConceptCard, value: Record<string, unknown>): HiWordsConceptCard {
    const result = clone(card);
    fillAliases(result, value.aliases);
    result.data.domain ||= optionalText(value.domain);
    result.data.definition ||= text(value.definition);
    result.data.explanation ||= optionalText(value.explanation);
    result.data.principles = keepOrStrings(result.data.principles, value.principles, 6);
    result.data.misconceptions = keepOrStrings(result.data.misconceptions, value.misconceptions, 5);
    if (!result.data.examples?.length) result.data.examples = records(value.examples, 5).map(item => ({
        id: createStableId('example'), title: optionalText(item.title), content: text(item.content),
    })).filter(item => item.content);
    if (!result.data.prerequisites?.length) result.data.prerequisites = references(value.prerequisites);
    if (!result.data.relatedConcepts?.length) result.data.relatedConcepts = references(value.relatedConcepts);
    return result;
}

function references(value: unknown): HiWordsConceptCard['data']['prerequisites'] {
    return records(value, 6).map(item => ({ id: createStableId('reference'), target: text(item.target), note: optionalText(item.note) })).filter(item => item.target);
}

function fillAliases(card: HiWordsCard, value: unknown): void { if (!card.aliases?.length) card.aliases = strings(value, 8); }
function keepOrStrings(current: string[] | undefined, value: unknown, limit: number): string[] | undefined { return current?.length ? current : strings(value, limit); }
function records(value: unknown, limit: number): Array<Record<string, unknown>> { return Array.isArray(value) ? value.filter(isRecord).slice(0, limit) : []; }
function strings(value: unknown, limit: number): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const result = value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, limit);
    return result.length ? result : undefined;
}
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function optionalText(value: unknown): string | undefined { return text(value) || undefined; }
function clone<T extends HiWordsCard>(card: T): T { return JSON.parse(JSON.stringify(card)) as T; }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function parseJson(response: string): unknown {
    const clean = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(clean) as unknown; } catch {
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        if (start < 0 || end <= start) throw new Error('AI did not return a JSON knowledge card.');
        return JSON.parse(clean.slice(start, end + 1)) as unknown;
    }
}
