export type ThemeMode = 'dark' | 'light';

export const THEME_CHANGED_EVENT = 'knowghost:theme-changed';

export const normalizeThemeMode = (value?: string | null): ThemeMode =>
    value === 'light' ? 'light' : 'dark';

export const applyThemeAttribute = (mode: ThemeMode): void => {
    document.documentElement.dataset.theme = mode;
};

// Применяет тему и уведомляет слушателей (App переключает MUI-тему).
export const emitThemeChange = (mode: ThemeMode): void => {
    applyThemeAttribute(mode);
    window.dispatchEvent(new CustomEvent<ThemeMode>(THEME_CHANGED_EVENT, {detail: mode}));
};
