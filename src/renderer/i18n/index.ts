import {ru} from './ru';
import {en} from './en';

export type Lang = 'ru' | 'en';

const STORAGE_KEY = 'knowghost-lang';
const dicts: Record<Lang, Record<string, string>> = {ru, en};

function readInitial(): Lang {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === 'en' || v === 'ru') return v;
    } catch {
        // ignore
    }
    return 'ru';
}

let current: Lang = readInitial();

export function getLang(): Lang {
    return current;
}

// Перевод по ключу. Фолбэк: текущий язык → русский → сам ключ.
// Подстановка параметров: t('x', {n: 5}) заменит {n} на 5.
export function t(key: string, params?: Record<string, string | number>): string {
    let s = dicts[current][key] ?? dicts.ru[key] ?? key;
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            s = s.split(`{${k}}`).join(String(v));
        }
    }
    return s;
}

// Смена языка: сохраняем и перезагружаем окно для полного ре-рендера.
export function setLanguage(lang: Lang): void {
    if (lang === current) return;
    try {
        localStorage.setItem(STORAGE_KEY, lang);
    } catch {
        // ignore
    }
    window.location.reload();
}
