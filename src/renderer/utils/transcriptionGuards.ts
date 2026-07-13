import {settingsStore} from '../state/settingsStore';
import {setStatus} from '../ui/status';
import {TRANSCRIBE_API_MODELS} from '@shared/constants';
import {checkOllamaModelDownloaded, isOllamaModelDownloading, isOllamaModelWarming} from '../services/ollama';

const DEFAULT_API_MODEL = TRANSCRIBE_API_MODELS[0] ?? 'gpt-4o-mini-transcribe';

const hasText = (value?: string | null): boolean => Boolean((value ?? '').trim().length);

export const ensureTranscriptionReady = async (): Promise<boolean> => {
    let settings: any;
    try {
        settings = settingsStore.get();
    } catch {
        settings = await settingsStore.load();
    }
    const mode = settings.transcriptionMode || 'api';
    const apiModel = settings.transcriptionModel || DEFAULT_API_MODEL;

    if (mode === 'api') {
        const needsOpenAi = apiModel.startsWith('gpt');
        const needsGoogle = apiModel.startsWith('gemini');
        if (needsOpenAi && !hasText(settings.openaiApiKey)) {
            setStatus('Сначала добавьте ключ OpenAI API', 'error');
            return false;
        }
        if (needsGoogle && !hasText(settings.googleApiKey)) {
            setStatus('Сначала добавьте ключ Google AI API', 'error');
            return false;
        }
        return true;
    }

    // Локальная транскрипция бьёт в whisper-сервер на 127.0.0.1:8868/v1/audio/transcriptions
    // (бандловый Fast-Whisper или свой whisper.cpp с --inference-path). Управление/установку
    // бандлового сервера не требуем — сервер поднимается пользователем отдельно.

    if (settings.llmHost === 'local') {
        const llmModel = settings.localLlmModel || settings.llmModel || 'gpt-oss:20b';
        try {
            const downloaded = await checkOllamaModelDownloaded(llmModel, {force: true});
            if (!downloaded) {
                setStatus('Загрузите выбранную локальную модель LLM', 'error');
                return false;
            }
            if (isOllamaModelDownloading(llmModel)) {
                setStatus('Локальная модель LLM загружается, подождите', 'error');
                return false;
            }
            if (isOllamaModelWarming(llmModel)) {
                setStatus('Локальная модель LLM прогревается, подождите', 'error');
                return false;
            }
        } catch {
            setStatus('Не удалось проверить локальную модель LLM', 'error');
            return false;
        }
    }
    return true;
};
