import {LOCAL_TRANSCRIBE_ALIASES, LOCAL_TRANSCRIBE_MODEL_DETAILS} from '@shared/constants';

export const normalizeLocalWhisperModel = (value?: string | null): string => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return '';
    }
    const alias = LOCAL_TRANSCRIBE_ALIASES[trimmed as keyof typeof LOCAL_TRANSCRIBE_ALIASES];
    return (alias ?? trimmed).toLowerCase();
};

export const getLocalWhisperMetadata = (
    model: string,
): { id: string; label: string; size: string } | null => {
    const normalized = normalizeLocalWhisperModel(model);
    if (!normalized) {
        return null;
    }
    const details = LOCAL_TRANSCRIBE_MODEL_DETAILS[normalized as keyof typeof LOCAL_TRANSCRIBE_MODEL_DETAILS];
    if (!details) {
        return null;
    }
    return {id: normalized, label: details.label, size: details.size};
};
