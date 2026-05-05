// 简单的 TTS 工具：根据模板生成 URL 并播放
import { normalizePath } from 'obsidian';
import type HiWordsPlugin from '../../main';
import type { WordDefinition } from './types';

let __hiw_shared_audio__: HTMLAudioElement | null = null;

type PronunciationVariant = 'uk' | 'us';

export function buildTtsUrl(tpl: string | undefined, word: string, variant: PronunciationVariant = 'us'): string | null {
  if (!tpl || !word) return null;
  const enc = encodeURIComponent(word.trim());
  const type = variant === 'uk' ? '1' : '2';
  const accent = variant;
  let url = tpl
    .split('{{word}}').join(enc)
    .split('{{type}}').join(type)
    .split('{{accent}}').join(accent);

  if (!tpl.includes('{{type}}') && /dict\.youdao\.com\/dictvoice/.test(url)) {
    url = url.includes('type=')
      ? url.replace(/([?&]type=)[^&]*/, `$1${type}`)
      : `${url}${url.includes('?') ? '&' : '?'}type=${type}`;
  }

  return url;
}

export async function playWordTTS(plugin: HiWordsPlugin, word: string, wordDef?: WordDefinition, pronunciationVariant?: PronunciationVariant) {
  const variant = pronunciationVariant || plugin.settings.pronunciationVariant || 'us';
  const preferredAudio = wordDef?.card?.audio?.[variant] || wordDef?.card?.audio?.default;
  const url = preferredAudio
    ? resolveAudioSrc(plugin, preferredAudio)
    : buildTtsUrl(plugin.settings.ttsTemplate, word, variant);
  if (!url) return;

  try {
    if (!__hiw_shared_audio__) __hiw_shared_audio__ = new Audio();
    const audio = __hiw_shared_audio__;
    audio.src = url;
    await audio.play();
  } catch (e) {
    console.warn('HiWords TTS play failed:', e);
  }
}

function resolveAudioSrc(plugin: HiWordsPlugin, src: string): string {
  if (/^(https?:|data:|app:)/i.test(src)) {
    return src;
  }

  return plugin.app.vault.adapter.getResourcePath(normalizePath(src));
}
