import { translations, type Language, type TranslationKey } from './translations';

export type { Language, TranslationKey };

let current: Language = 'de';
const listeners = new Set<() => void>();
const warnedKeys = new Set<string>();

export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  listeners.forEach((listener) => listener());
}

export function getLanguage(): Language {
  return current;
}

/** BCP-47 locale matching the active UI language (for dates/numbers). */
export function getLocale(): string {
  return current === 'de' ? 'de-DE' : 'en-US';
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let value: string | undefined = translations[current][key];
  if (value === undefined) {
    value = translations.de[key];
  }
  if (value === undefined) {
    if (!warnedKeys.has(key)) {
      warnedKeys.add(key);
      console.warn(`[i18n] missing translation key: ${key}`);
    }
    value = key;
  }
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
    }
  }
  return value;
}
