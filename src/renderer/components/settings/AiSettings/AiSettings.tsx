// noinspection XmlDeprecatedElement

import {
    useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
    Autocomplete,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    FormControlLabel,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    MenuItem,
    TextField,
    Typography,
} from '@mui/material';
import {
    listen, type UnlistenFn} from '@tauri-apps/api/event';
import {
    invoke} from '@tauri-apps/api/core';
import {
    API_LLM_MODELS,
    GEMINI_LLM_MODELS,
    GOOGLE_TRANSCRIBE_MODELS,
    LOCAL_LLM_MODELS,
    LOCAL_TRANSCRIBE_MODELS,
    OPENAI_LLM_MODELS,
    PROVIDER_LLM_MODELS,
    OPENAI_TRANSCRIBE_MODELS,
    TRANSCRIBE_API_MODELS,
} from '@shared/constants';
import type {SavedApiKey} from '@shared/ipc';
import type {LlmHost, ScreenProcessingProvider, TranscriptionMode} from '@renderer/types';
import {
    useSettingsContext} from '../SettingsView/SettingsView';
import {
    logger} from '@renderer/utils/logger';
import {
    toast} from 'react-toastify';
import {
    checkOllamaInstalled,
    downloadOllamaModel,
    listInstalledOllamaModels,
    normalizeOllamaModelName,
    subscribeToOllamaDownloads,
    subscribeToOllamaWarmup,
    warmupOllamaModel,
} from '../../../services/ollama';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
    formatLlmLabel, formatTranscribeLabel} from './formatters';
import {t} from '@renderer/i18n';
import './AiSettings.scss';

type WithLabel = { value: string; label: string };

const DEFAULT_API_TRANSCRIBE_MODEL = TRANSCRIBE_API_MODELS[0] ?? 'gpt-4o-mini-transcribe';
const DEFAULT_LOCAL_TRANSCRIBE_MODEL = 'base';
const DEFAULT_API_LLM_MODEL = API_LLM_MODELS[0] ?? 'gpt-5.5';
const DEFAULT_LOCAL_LLM_MODEL =
    LOCAL_LLM_MODELS.find((value) => value === 'gpt-oss:20b') ?? LOCAL_LLM_MODELS[0] ?? 'gpt-oss:20b';

const OPENAI_TRANSCRIBE_SET = new Set<string>(OPENAI_TRANSCRIBE_MODELS as readonly string[]);
const GOOGLE_TRANSCRIBE_SET = new Set<string>(GOOGLE_TRANSCRIBE_MODELS as readonly string[]);
const OPENAI_LLM_SET = new Set<string>(OPENAI_LLM_MODELS as readonly string[]);
const GEMINI_LLM_SET = new Set<string>(GEMINI_LLM_MODELS as readonly string[]);

const TRANSCRIPTION_MODE_OPTIONS: WithLabel[] = [
    {value: 'api', label: 'API'},
    {value: 'local', label: t('ai.local')},
];

const LLM_HOST_OPTIONS: WithLabel[] = [
    {value: 'api', label: 'API'},
    {value: 'local', label: t('ai.local')},
];

const SCREEN_MODEL_OPTIONS: WithLabel[] = [
    {value: 'openai', label: 'OpenAI'},
    {value: 'google', label: 'Google Gemini'},
];

// Модели whisper.cpp (ggml) с HuggingFace для встроенного установщика.
const MANAGED_WHISPER_MODELS: WithLabel[] = [
    {value: 'ggml-tiny.bin', label: t('ai.whisper.tiny')},
    {value: 'ggml-base.bin', label: t('ai.whisper.base')},
    {value: 'ggml-small.bin', label: t('ai.whisper.small')},
    {value: 'ggml-medium.bin', label: t('ai.whisper.medium')},
    {value: 'ggml-large-v3-turbo.bin', label: t('ai.whisper.largeTurbo')},
    {value: 'ggml-large-v3.bin', label: t('ai.whisper.large')},
];
const DEFAULT_MANAGED_MODEL = 'ggml-small.bin';

// Варианты сборки whisper.cpp для установщика.
const MANAGED_VARIANTS: WithLabel[] = [
    {value: 'cpu', label: t('ai.variant.cpu')},
    {value: 'cublas', label: t('ai.variant.cublas')},
];
const DEFAULT_MANAGED_VARIANT = 'cpu';

type ManagedStatus = {
    dir: string;
    models: string[];
    variants: { name: string; exePath: string }[];
};

const KEY_PROVIDER_OPTIONS = [
    {value: 'openai', label: 'OpenAI', baseUrl: ''},
    {value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com'},
    {value: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api'},
    {value: 'google', label: 'Google AI', baseUrl: ''},
    {value: 'custom', label: t('ai.provider.customCompat'), baseUrl: ''},
];

const API_PROVIDER_PRESETS: { value: string; label: string; url: string; note: string }[] = [
    {value: '', label: t('ai.provider.openaiDefault'), url: 'https://api.openai.com', note: t('ai.provider.openaiNote')},
    {value: 'https://api.deepseek.com', label: 'DeepSeek', url: 'https://api.deepseek.com', note: 'DeepSeek Chat / Coder'},
    {value: 'https://openrouter.ai/api', label: 'OpenRouter', url: 'https://openrouter.ai/api', note: t('ai.provider.openrouterNote')},
    {value: 'custom', label: t('ai.provider.customUrl'), url: '', note: t('ai.provider.customUrlNote')},
];

export const AiSettings = () => {
    const {settings, patchLocal} = useSettingsContext();

    const [openaiKey, setOpenaiKey] = useState(settings.openaiApiKey ?? '');
    const [googleKey, setGoogleKey] = useState(settings.googleApiKey ?? '');
    const [apiSttTimeout, setApiSttTimeout] = useState(settings.apiSttTimeoutMs ?? 30000);
    const [apiLlmTimeout, setApiLlmTimeout] = useState(settings.apiLlmTimeoutMs ?? 30000);
    const [screenTimeout, setScreenTimeout] = useState(settings.screenProcessingTimeoutMs ?? 50000);
    const [transcriptionPrompt, setTranscriptionPrompt] = useState(settings.transcriptionPrompt ?? '');
    const [useDefaultTranscriptionPrompt, setUseDefaultTranscriptionPrompt] = useState(settings.useDefaultTranscriptionPrompt ?? true);
    const [llmPrompt, setLlmPrompt] = useState(settings.llmPrompt ?? '');
    const [useDefaultLlmPrompt, setUseDefaultLlmPrompt] = useState(settings.useDefaultLlmPrompt ?? true);
    const timeoutSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const promptSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openAiSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const googleSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [whisperServerRunning, setWhisperServerRunning] = useState(false);
    const [whisperServerBusy, setWhisperServerBusy] = useState(false);
    const [managedStatus, setManagedStatus] = useState<ManagedStatus | null>(null);
    const [managedModel, setManagedModel] = useState<string>(DEFAULT_MANAGED_MODEL);
    const [managedVariant, setManagedVariant] = useState<string>(DEFAULT_MANAGED_VARIANT);
    const [installBusy, setInstallBusy] = useState(false);
    const [installProgress, setInstallProgress] = useState<{
        phase: string;
        file: string;
        downloaded: number;
        total: number;
    } | null>(null);

    const sttSource: 'managed' | 'external' =
        settings.sttSource ?? (settings.whisperServerExe ? 'external' : 'managed');

    // API Key manager
    const [savedKeys, setSavedKeys] = useState<SavedApiKey[]>(settings.savedApiKeys ?? []);
    const [addKeyDialogOpen, setAddKeyDialogOpen] = useState(false);
    const [newKeyProvider, setNewKeyProvider] = useState('openai');
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyValue, setNewKeyValue] = useState('');
    const [newKeyBaseUrl, setNewKeyBaseUrl] = useState('');

    // Определяем текущий пресет провайдера
    const currentApiBaseUrl = settings.apiBaseUrl ?? '';
    const matchedPreset = API_PROVIDER_PRESETS.find(
        (p) => p.value !== 'custom' && p.value === currentApiBaseUrl
    );
    const [apiProviderPreset, setApiProviderPreset] = useState<string>(
        matchedPreset ? matchedPreset.value : (currentApiBaseUrl ? 'custom' : '')
    );
    const [customApiBaseUrl, setCustomApiBaseUrl] = useState<string>(
        matchedPreset ? '' : currentApiBaseUrl
    );

    // Пресет провайдера для vision (обработка экрана)
    const currentScreenBaseUrl = settings.screenBaseUrl ?? '';
    const matchedVisionPreset = API_PROVIDER_PRESETS.find(
        (p) => p.value !== 'custom' && p.value === currentScreenBaseUrl
    );
    const [visionPreset, setVisionPreset] = useState<string>(
        matchedVisionPreset ? matchedVisionPreset.value : (currentScreenBaseUrl ? 'custom' : '')
    );
    const [visionCustomUrl, setVisionCustomUrl] = useState<string>(
        matchedVisionPreset ? '' : currentScreenBaseUrl
    );

    const [infoDialog, setInfoDialog] = useState<'transcribe' | 'llm' | null>(null);

    const [ollamaInstalled, setOllamaInstalled] = useState<boolean | null>(null);
    const [ollamaChecking, setOllamaChecking] = useState(false);
    const [, setOllamaModels] = useState<string[]>([]);
    const [ollamaModelDownloaded, setOllamaModelDownloaded] = useState<boolean | null>(null);
    const [ollamaModelChecking, setOllamaModelChecking] = useState(false);
    const [ollamaDownloading, setOllamaDownloading] = useState(false);
    const [ollamaModelError, setOllamaModelError] = useState<string | null>(null);
    const [ollamaModelWarming, setOllamaModelWarming] = useState(false);

    const showApiKeys = !(settings.transcriptionMode === 'local' && settings.llmHost === 'local');

    useEffect(() => {
        setOpenaiKey(settings.openaiApiKey ?? '');
        setGoogleKey(settings.googleApiKey ?? '');
        setApiSttTimeout(settings.apiSttTimeoutMs ?? 30000);
        setApiLlmTimeout(settings.apiLlmTimeoutMs ?? 30000);
        setScreenTimeout(settings.screenProcessingTimeoutMs ?? 50000);
        setTranscriptionPrompt(settings.transcriptionPrompt ?? '');
        setLlmPrompt(settings.llmPrompt ?? '');
        // Синхронизируем пресет провайдера
        const url = settings.apiBaseUrl ?? '';
        const preset = API_PROVIDER_PRESETS.find((p) => p.value !== 'custom' && (p.value === url || p.url === url));
        setApiProviderPreset(preset ? preset.value : (url ? 'custom' : ''));
        setCustomApiBaseUrl(preset?.value === 'custom' ? url : (preset ? '' : url));
    }, [settings.apiLlmTimeoutMs, settings.apiSttTimeoutMs, settings.googleApiKey, settings.openaiApiKey, settings.screenProcessingTimeoutMs, settings.transcriptionPrompt, settings.llmPrompt, settings.apiBaseUrl]);

    const showMessage = (text: string, tone: 'success' | 'error' = 'success') => {
        if (tone === 'success') return;
        toast[tone](text);
    };

    const saveOpenAi = useCallback(async (value: string) => {
        const key = value.trim();
        try {
            await window.api.settings.setOpenaiApiKey(key);
            patchLocal({openaiApiKey: key});
            logger.info('settings', 'OpenAI API key saved');
        } catch (error) {
            logger.error('settings', 'Failed to save OpenAI API key', {error});
            showMessage(t('ai.err.saveOpenAiKey'), 'error');
        }
    }, [patchLocal]);

    const saveGoogle = useCallback(async (value: string) => {
        const key = value.trim();
        try {
            await window.api.settings.setGoogleApiKey(key);
            patchLocal({googleApiKey: key});
            logger.info('settings', 'Google API key saved');
        } catch (error) {
            logger.error('settings', 'Failed to save Google API key', {error});
            showMessage(t('ai.err.saveGoogleKey'), 'error');
        }
    }, [patchLocal]);

    const requireOpenAi = () => {
        const has = Boolean(settings.openaiApiKey && settings.openaiApiKey.trim().length > 0);
        if (!has) {
            showMessage(t('ai.err.needOpenAiKey'), 'error');
        }
        return has;
    };

    const requireGoogle = () => {
        const has = Boolean(settings.googleApiKey && settings.googleApiKey.trim().length > 0);
        if (!has) {
            showMessage(t('ai.err.needGoogleKey'), 'error');
        }
        return has;
    };

    useEffect(() => {
        if (openAiSaveTimeout.current) {
            clearTimeout(openAiSaveTimeout.current);
            openAiSaveTimeout.current = null;
        }

        const trimmed = openaiKey.trim();
        const current = settings.openaiApiKey ?? '';

        if (trimmed === current) {
            return;
        }

        openAiSaveTimeout.current = setTimeout(() => {
            void saveOpenAi(trimmed);
        }, 500);
        return () => {
            if (openAiSaveTimeout.current) {
                clearTimeout(openAiSaveTimeout.current);
                openAiSaveTimeout.current = null;
            }
        };
    }, [openaiKey, saveOpenAi, settings.openaiApiKey]);

    useEffect(() => {
        if (googleSaveTimeout.current) {
            clearTimeout(googleSaveTimeout.current);
            googleSaveTimeout.current = null;
        }
        const trimmed = googleKey.trim();
        const current = settings.googleApiKey ?? '';

        if (trimmed === current) {
            return;
        }

        googleSaveTimeout.current = setTimeout(() => {
            void saveGoogle(trimmed);
        }, 500);
        return () => {
            if (googleSaveTimeout.current) {
                clearTimeout(googleSaveTimeout.current);
                googleSaveTimeout.current = null;
            }
        };
    }, [googleKey, saveGoogle, settings.googleApiKey]);

    useEffect(() => {
        if (settings.llmHost !== 'local') {
            setOllamaInstalled(null);
            setOllamaModels([]);
            setOllamaModelDownloaded(null);
            setOllamaModelError(null);
            setOllamaModelWarming(false);
            setOllamaChecking(false);
            setOllamaModelChecking(false);
            setOllamaDownloading(false);
            return;
        }

        let cancelled = false;

        const refreshOllamaState = async (forceModels = false) => {
            setOllamaModelError(null);
            setOllamaChecking(true);
            setOllamaModelChecking(true);
            try {
                const installed = await checkOllamaInstalled();
                if (cancelled) return;
                setOllamaInstalled(installed);
                if (!installed) {
                    setOllamaModels([]);
                    setOllamaModelDownloaded(false);
                    return;
                }
                const models = await listInstalledOllamaModels({force: forceModels});
                if (cancelled) return;
                setOllamaModels(models);
                const normalized = normalizeOllamaModelName(settings.localLlmModel ?? DEFAULT_LOCAL_LLM_MODEL);
                setOllamaModelDownloaded(normalized ? models.includes(normalized) : false);
            } catch (error) {
                if (cancelled) return;
                logger.error('settings', 'Failed to refresh Ollama status', {error});
                setOllamaModelError(error instanceof Error ? error.message : t('ai.err.ollamaStatus'));
                setOllamaModelDownloaded(false);
            } finally {
                if (!cancelled) {
                    setOllamaChecking(false);
                    setOllamaModelChecking(false);
                }
            }
        };

        void refreshOllamaState(true);

        const unsubscribeDownload = subscribeToOllamaDownloads((models) => {
            const normalized = normalizeOllamaModelName(settings.localLlmModel ?? DEFAULT_LOCAL_LLM_MODEL);
            setOllamaDownloading(models.has(normalized));
        });
        const unsubscribeWarmup = subscribeToOllamaWarmup((models) => {
            const normalized = normalizeOllamaModelName(settings.localLlmModel ?? DEFAULT_LOCAL_LLM_MODEL);
            setOllamaModelWarming(models.has(normalized));
        });

        return () => {
            cancelled = true;
            unsubscribeDownload();
            unsubscribeWarmup();
        };
    }, [settings.llmHost, settings.localLlmModel]);

    const handleTranscriptionModeChange = async (mode: TranscriptionMode) => {
        let targetModel = mode === 'local'
            ? (settings.localWhisperModel ?? DEFAULT_LOCAL_TRANSCRIBE_MODEL)
            : (settings.transcriptionModel ?? DEFAULT_API_TRANSCRIBE_MODEL);
        if (mode === 'api' && !isTranscribeAllowed(targetModel)) {
            const fallback = apiTranscribeOptions.find((value) => isTranscribeAllowed(value));
            if (!fallback) {
                showMessage(t('ai.err.noApiModels'), 'error');
                return;
            }
            targetModel = fallback;
        }
        try {
            await window.api.settings.setTranscriptionMode(mode);
            if (mode === 'local') {
                patchLocal({transcriptionMode: mode, localWhisperModel: targetModel as any});
            } else {
                patchLocal({transcriptionMode: mode, transcriptionModel: targetModel});
            }
        } catch (error) {
            logger.error('settings', 'Failed to set transcription mode', {error});
            showMessage(t('ai.err.transcriptionMode'), 'error');
        }
    };

    const handleTranscriptionModelChange = async (model: string) => {
        if (settings.transcriptionMode === 'api' && !isTranscribeAllowed(model)) {
            showMessage(t('ai.err.modelNeedsKey'), 'error');
            return;
        }
        if (settings.transcriptionMode === 'api') {
            if (GOOGLE_TRANSCRIBE_SET.has(model) && !hasGoogleKey) {
                showMessage(t('ai.warn.googleKeyMissing'), 'error');
            }
            if (OPENAI_TRANSCRIBE_SET.has(model) && !hasOpenAiKey) {
                showMessage(t('ai.warn.openaiKeyMissing'), 'error');
            }
        }
        try {
            await window.api.settings.setTranscriptionModel(model);
            patchLocal({transcriptionModel: model});
        } catch (error) {
            logger.error('settings', 'Failed to set transcription model', {error});
            showMessage(t('ai.err.transcriptionModel'), 'error');
        }
    };

    const handleLlmHostChange = async (host: LlmHost) => {
        let targetModel = host === 'local'
            ? (settings.localLlmModel ?? DEFAULT_LOCAL_LLM_MODEL)
            : (settings.apiLlmModel ?? DEFAULT_API_LLM_MODEL);
        if (host === 'api' && !isLlmAllowed(targetModel)) {
            const fallback = apiLlmOptions.find((value) => isLlmAllowed(value));
            if (!fallback) {
                showMessage(t('ai.err.noLlmModels'), 'error');
                return;
            }
            targetModel = fallback;
        }
        try {
            await window.api.settings.setLlmHost(host);
            if (host === 'local') {
                patchLocal({llmHost: host, llmModel: targetModel, localLlmModel: targetModel});
            } else {
                patchLocal({llmHost: host, llmModel: targetModel, apiLlmModel: targetModel});
            }
        } catch (error) {
            logger.error('settings', 'Failed to set LLM host', {error});
            showMessage(t('ai.err.llmMode'), 'error');
        }
    };

    const handleApiLlmModelChange = async (model: string) => {
        if (settings.llmHost === 'api' && !isLlmAllowed(model)) {
            showMessage(t('ai.err.modelNeedsKey'), 'error');
            return;
        }
        const needsOpenAi = OPENAI_LLM_SET.has(model);
        const needsGoogle = GEMINI_LLM_SET.has(model);
        if (needsOpenAi && !hasOpenAiKey) {
            showMessage(t('ai.warn.openaiKeyMissing'), 'error');
        }
        if (needsGoogle && !hasGoogleKey) {
            showMessage(t('ai.warn.googleKeyMissing'), 'error');
        }
        try {
            await window.api.settings.setLlmModel(model, 'api');
            const isApiHost = settings.llmHost !== 'local';
            patchLocal({
                llmModel: isApiHost ? model : settings.llmModel,
                apiLlmModel: model,
            });
        } catch (error) {
            logger.error('settings', 'Failed to set LLM model', {error});
            showMessage(t('ai.err.llmModel'), 'error');
        }
    };

    const handleApiBaseUrlChange = async (url: string) => {
        const next = url.trim();
        if (next === (settings.apiBaseUrl ?? '')) return;
        try {
            await window.api.settings.setApiBaseUrl(next);
            patchLocal({apiBaseUrl: next});
        } catch (error) {
            logger.error('settings', 'Failed to set API base URL', {error});
            showMessage(t('ai.err.apiBaseUrl'), 'error');
        }
    };

    const handleProviderPresetChange = async (presetValue: string) => {
        setApiProviderPreset(presetValue);
        if (presetValue === 'custom') {
            // При выборе "Свой URL" — оставляем текущий custom URL
            return;
        }
        // Пресет выбран — сразу сохраняем URL
        const preset = API_PROVIDER_PRESETS.find((p) => p.value === presetValue);
        const urlToSave = preset?.url ?? '';
        setCustomApiBaseUrl('');
        await handleApiBaseUrlChange(urlToSave);
    };

    const handleCustomUrlSave = async (value: string) => {
        setCustomApiBaseUrl(value);
        await handleApiBaseUrlChange(value);
    };

    // ── API Key manager handlers ────────────────────────────────────

    const refreshSavedKeys = useCallback(async () => {
        try {
            const keys = await window.api.apiKeys.list();
            setSavedKeys(keys);
        } catch (error) {
            logger.error('settings', 'Failed to load saved API keys', {error});
        }
    }, []);

    useEffect(() => { void refreshSavedKeys(); }, [refreshSavedKeys]);

    // Синхронизируем savedKeys при изменении settings
    useEffect(() => {
        setSavedKeys(settings.savedApiKeys ?? []);
    }, [settings.savedApiKeys]);

    const handleAddKey = async () => {
        if (!newKeyValue.trim()) {
            showMessage(t('ai.err.enterKey'), 'error');
            return;
        }
        const preset = KEY_PROVIDER_OPTIONS.find((p) => p.value === newKeyProvider);
        const id = crypto.randomUUID();
        const key: SavedApiKey = {
            id,
            provider: newKeyProvider,
            name: newKeyName.trim() || preset?.label || newKeyProvider,
            apiKey: newKeyValue.trim(),
            baseUrl: newKeyProvider === 'custom' ? newKeyBaseUrl.trim() || undefined : preset?.baseUrl || undefined,
        };
        try {
            await window.api.apiKeys.save(key);
            // Сразу делаем активным
            await window.api.apiKeys.activate(id);
            await refreshSavedKeys();
            setAddKeyDialogOpen(false);
            setNewKeyName('');
            setNewKeyValue('');
            setNewKeyBaseUrl('');
            showMessage(t('ai.ok.keySavedActivated'));
        } catch (error) {
            logger.error('settings', 'Failed to save API key', {error});
            showMessage(t('ai.err.saveKey'), 'error');
        }
    };

    const handleRemoveKey = async (id: string) => {
        try {
            await window.api.apiKeys.remove(id);
            await refreshSavedKeys();
        } catch (error) {
            logger.error('settings', 'Failed to remove API key', {error});
        }
    };

    const handleActivateKey = async (id: string) => {
        try {
            await window.api.apiKeys.activate(id);
            await refreshSavedKeys();
            // Sync provider preset and URL from the activated key
            const key = savedKeys.find((k) => k.id === id);
            if (key) {
                // Map KEY_PROVIDER value → API_PROVIDER_PRESETS value
                const KEY_TO_PRESET: Record<string, string> = {
                    'openai': '',
                    'deepseek': 'https://api.deepseek.com',
                    'openrouter': 'https://openrouter.ai/api',
                    'google': '',
                    'custom': 'custom',
                };
                const providerPreset = KEY_TO_PRESET[key.provider] ?? 'custom';
                setApiProviderPreset(providerPreset);
                const urlToSet = key.baseUrl || key.baseUrl || (providerPreset === 'custom' ? '' : API_PROVIDER_PRESETS.find(p => p.value === providerPreset)?.url || '') || '';
                setCustomApiBaseUrl(urlToSet);
                // Persist URL to settings so it survives tab switches
                await handleApiBaseUrlChange(urlToSet);
            }
            showMessage(t('ai.ok.keyActivated'));
        } catch (error) {
            logger.error('settings', 'Failed to activate API key', {error});
            showMessage(t('ai.err.activateKey'), 'error');
        }
    };

    const handleWhisperServerExeChange = async (path: string) => {
        const next = path.trim();
        if (next === (settings.whisperServerExe ?? '')) return;
        try {
            await window.api.settings.setWhisperServerExe(next);
            patchLocal({whisperServerExe: next});
        } catch (error) {
            logger.error('settings', 'Failed to set whisper-server exe', {error});
        }
    };

    const handleWhisperServerModelChange = async (path: string) => {
        const next = path.trim();
        if (next === (settings.whisperServerModel ?? '')) return;
        try {
            await window.api.settings.setWhisperServerModel(next);
            patchLocal({whisperServerModel: next});
        } catch (error) {
            logger.error('settings', 'Failed to set whisper-server model', {error});
        }
    };

    const handleWhisperServerStart = async () => {
        setWhisperServerBusy(true);
        try {
            const running = await invoke<boolean>('whisper_server_start', {
                exe: settings.whisperServerExe ?? '',
                model: settings.whisperServerModel ?? '',
            });
            setWhisperServerRunning(running);
            if (running) showMessage(t('ai.ok.whisperStarted'));
        } catch (error) {
            showMessage(typeof error === 'string' ? error : t('ai.err.whisperStart'), 'error');
        } finally {
            setWhisperServerBusy(false);
        }
    };

    const handleWhisperServerStop = async () => {
        setWhisperServerBusy(true);
        try {
            await invoke('whisper_server_stop');
            setWhisperServerRunning(false);
        } catch (error) {
            logger.error('settings', 'Failed to stop whisper-server', {error});
        } finally {
            setWhisperServerBusy(false);
        }
    };

    useEffect(() => {
        let active = true;
        const poll = () => {
            invoke<boolean>('whisper_server_status')
                .then((running) => {
                    if (active) setWhisperServerRunning(running);
                })
                .catch(() => {
                });
        };
        poll();
        const id = window.setInterval(poll, 4000);
        return () => {
            active = false;
            window.clearInterval(id);
        };
    }, []);

    const refreshManagedStatus = useCallback(async () => {
        try {
            const status = await invoke<ManagedStatus>('whisper_managed_status');
            setManagedStatus(status);
        } catch (error) {
            logger.error('settings', 'Failed to get managed whisper status', {error});
        }
    }, []);

    useEffect(() => {
        void refreshManagedStatus();
        let unlisten: UnlistenFn | null = null;
        void listen<{ phase: string; file: string; downloaded: number; total: number }>(
            'whisper-install:progress',
            (event) => setInstallProgress(event.payload),
        ).then((fn) => {
            unlisten = fn;
        });
        return () => {
            if (unlisten) unlisten();
        };
    }, [refreshManagedStatus]);

    const handleSttSourceChange = async (source: 'managed' | 'external') => {
        try {
            await window.api.settings.setSttSource(source);
            patchLocal({sttSource: source});
        } catch (error) {
            logger.error('settings', 'Failed to set STT source', {error});
        }
    };

    const handleManagedInstall = async () => {
        setInstallBusy(true);
        setInstallProgress(null);
        try {
            const status = await invoke<ManagedStatus>('whisper_managed_setup', {
                modelFile: managedModel,
                variant: managedVariant,
            });
            setManagedStatus(status);
            const exePath = status.variants.find((v) => v.name === managedVariant)?.exePath;
            if (exePath) {
                await window.api.settings.setWhisperServerExe(exePath);
                const modelPath = `${status.dir}/models/${managedModel}`;
                await window.api.settings.setWhisperServerModel(modelPath);
                patchLocal({whisperServerExe: exePath, whisperServerModel: modelPath});
            }
            showMessage(t('ai.ok.whisperInstalled'));
        } catch (error) {
            showMessage(typeof error === 'string' ? error : t('ai.err.whisperInstall'), 'error');
        } finally {
            setInstallBusy(false);
            setInstallProgress(null);
        }
    };

    const handleManagedDelete = async () => {
        setInstallBusy(true);
        try {
            const status = await invoke<ManagedStatus>('whisper_managed_delete');
            setManagedStatus(status);
            await window.api.settings.setWhisperServerExe('');
            await window.api.settings.setWhisperServerModel('');
            patchLocal({whisperServerExe: '', whisperServerModel: ''});
            showMessage(t('ai.ok.whisperDeleted'));
        } catch (error) {
            showMessage(typeof error === 'string' ? error : t('ai.err.whisperDelete'), 'error');
        } finally {
            setInstallBusy(false);
        }
    };

    const handleManagedOpenDir = async () => {
        try {
            await invoke('whisper_managed_open_dir');
        } catch (error) {
            logger.error('settings', 'Failed to open whisper dir', {error});
        }
    };

    const handleLocalLlmModelChange = async (model: string) => {
        try {
            await window.api.settings.setLlmModel(model, 'local');
            const isLocalHost = settings.llmHost === 'local';
            patchLocal({
                llmModel: isLocalHost ? model : settings.llmModel,
                localLlmModel: model,
            });
        } catch (error) {
            logger.error('settings', 'Failed to set local LLM model', {error});
            showMessage(t('ai.err.localLlmModel'), 'error');
        }
    };

    const handleScreenProviderChange = async (provider: ScreenProcessingProvider) => {
        // openai-путь может использовать свой vision-ключ (screenApiKey), поэтому не требуем OpenAI-ключ.
        if (provider === 'google' && !requireGoogle()) return;
        try {
            await window.api.settings.setScreenProcessingModel(provider);
            patchLocal({screenProcessingModel: provider});
        } catch (error) {
            logger.error('settings', 'Failed to set screen processing model', {error});
            showMessage(t('ai.err.screenModel'), 'error');
        }
    };

    const handleScreenBaseUrlChange = async (url: string) => {
        const next = url.trim();
        if (next === (settings.screenBaseUrl ?? '')) return;
        try {
            await window.api.settings.setScreenBaseUrl(next);
            patchLocal({screenBaseUrl: next});
        } catch (error) {
            logger.error('settings', 'Failed to set screen base URL', {error});
        }
    };

    const handleScreenModelChange = async (model: string) => {
        const next = model.trim();
        if (next === (settings.screenModel ?? '')) return;
        try {
            await window.api.settings.setScreenModel(next);
            patchLocal({screenModel: next});
        } catch (error) {
            logger.error('settings', 'Failed to set screen model', {error});
        }
    };

    const handleScreenApiKeyChange = async (key: string) => {
        const next = key.trim();
        if (next === (settings.screenApiKey ?? '')) return;
        try {
            await window.api.settings.setScreenApiKey(next);
            patchLocal({screenApiKey: next});
        } catch (error) {
            logger.error('settings', 'Failed to set screen API key', {error});
        }
    };

    const handleScreenSeparateChange = async (value: boolean) => {
        try {
            await window.api.settings.setScreenSeparate(value);
            patchLocal({screenSeparate: value});
        } catch (error) {
            logger.error('settings', 'Failed to set screen separate', {error});
        }
    };

    const handleVisionPresetChange = async (presetValue: string) => {
        setVisionPreset(presetValue);
        if (presetValue === 'custom') return;
        await handleScreenBaseUrlChange(presetValue);
    };

    const handleVisionCustomUrlSave = async (value: string) => {
        setVisionCustomUrl(value);
        await handleScreenBaseUrlChange(value);
    };

    const handleOllamaDownload = async () => {
        if (settings.llmHost !== 'local') return;
        const model = settings.localLlmModel ?? DEFAULT_LOCAL_LLM_MODEL;
        setOllamaModelError(null);
        setOllamaDownloading(true);
        try {
            await downloadOllamaModel(model);
            const models = await listInstalledOllamaModels({force: true});
            setOllamaModels(models);
            setOllamaModelDownloaded(models.includes(normalizeOllamaModelName(model)));
            try {
                await warmupOllamaModel(model);
            } catch (error) {
                logger.error('settings', 'Ollama warmup failed', {error});
                setOllamaModelError(t('ai.warn.warmupFailed'));
            }
            showMessage(t('ai.ok.llmReady'));
        } catch (error) {
            logger.error('settings', 'Failed to download Ollama model', {error});
            setOllamaModelError(error instanceof Error ? error.message : t('ai.err.modelDownload'));
        } finally {
            setOllamaDownloading(false);
        }
    };

    useEffect(() => {
        if (
            settings.apiSttTimeoutMs === apiSttTimeout &&
            settings.apiLlmTimeoutMs === apiLlmTimeout &&
            settings.screenProcessingTimeoutMs === screenTimeout
        ) {
            return;
        }
        if (timeoutSaveRef.current) {
            clearTimeout(timeoutSaveRef.current);
            timeoutSaveRef.current = null;
        }
        timeoutSaveRef.current = setTimeout(() => {
            void (async () => {
                try {
                    await Promise.all([
                        window.api.settings.setApiSttTimeoutMs(apiSttTimeout),
                        window.api.settings.setApiLlmTimeoutMs(apiLlmTimeout),
                        window.api.settings.setScreenProcessingTimeoutMs(screenTimeout),
                    ]);
                    patchLocal({
                        apiSttTimeoutMs: apiSttTimeout,
                        apiLlmTimeoutMs: apiLlmTimeout,
                        screenProcessingTimeoutMs: screenTimeout,
                    });
                } catch (error) {
                    logger.error('settings', 'Failed to save timeout values', {error});
                    showMessage(t('ai.err.saveTimeouts'), 'error');
                }
            })();
        }, 500);
        return () => {
            if (timeoutSaveRef.current) {
                clearTimeout(timeoutSaveRef.current);
                timeoutSaveRef.current = null;
            }
        };
    }, [
        apiSttTimeout,
        apiLlmTimeout,
        screenTimeout,
        settings.apiSttTimeoutMs,
        settings.apiLlmTimeoutMs,
        settings.screenProcessingTimeoutMs,
        patchLocal,
    ]);
    useEffect(() => {
        if (
            transcriptionPrompt === (settings.transcriptionPrompt ?? '') &&
            llmPrompt === (settings.llmPrompt ?? '')
        ) {
            return;
        }
        if (promptSaveRef.current) {
            clearTimeout(promptSaveRef.current);
            promptSaveRef.current = null;
        }
        promptSaveRef.current = setTimeout(() => {
            void (async () => {
                try {
                    await Promise.all([
                        window.api.settings.setTranscriptionPrompt(useDefaultTranscriptionPrompt ? '' : (transcriptionPrompt ?? '')),
                        window.api.settings.setUseDefaultTranscriptionPrompt(useDefaultTranscriptionPrompt),
                        window.api.settings.setLlmPrompt(useDefaultLlmPrompt ? '' : (llmPrompt ?? '')),
                        window.api.settings.setUseDefaultLlmPrompt(useDefaultLlmPrompt),
                    ]);
                    patchLocal({
                        transcriptionPrompt: useDefaultTranscriptionPrompt ? '' : (transcriptionPrompt ?? ''),
                        useDefaultTranscriptionPrompt,
                        llmPrompt: useDefaultLlmPrompt ? '' : (llmPrompt ?? ''),
                        useDefaultLlmPrompt,
                    });
                } catch (error) {
                    logger.error('settings', 'Failed to save prompts', {error});
                    showMessage(t('ai.err.savePrompts'), 'error');
                }
            })();
        }, 500);
        return () => {
            if (promptSaveRef.current) {
                clearTimeout(promptSaveRef.current);
                promptSaveRef.current = null;
            }
        };
    }, [transcriptionPrompt, llmPrompt, patchLocal, settings.llmPrompt, settings.transcriptionPrompt]);
    const hasOpenAiKey = Boolean(settings.openaiApiKey?.trim());
    const hasGoogleKey = Boolean(settings.googleApiKey?.trim());

    const isTranscribeAllowed = useCallback((_model: string) => true, []);

    const isLlmAllowed = useCallback((_model: string) => true, []);

    const apiTranscribeOptions = useMemo(() => {
        const models: string[] = [...OPENAI_TRANSCRIBE_MODELS, ...(GOOGLE_TRANSCRIBE_MODELS as unknown as string[])];
        return models;
    }, []);

    const apiLlmOptions = useMemo(() => {
        const models: string[] = [...(PROVIDER_LLM_MODELS[apiProviderPreset] ?? OPENAI_LLM_MODELS) as unknown as string[]];
        return models;
    }, [apiProviderPreset]);

    const apiTranscribeModel = settings.transcriptionModel ?? DEFAULT_API_TRANSCRIBE_MODEL;
    const apiLlmModel = settings.apiLlmModel ?? settings.llmModel ?? DEFAULT_API_LLM_MODEL;
    const localLlmModel = settings.localLlmModel ?? settings.llmModel ?? DEFAULT_LOCAL_LLM_MODEL;

    const transcribeOptions = useMemo(() => {
        if (settings.transcriptionMode === 'local') {
            return LOCAL_TRANSCRIBE_MODELS.map((model) => ({value: model, label: formatTranscribeLabel(model)}));
        }
        const models: string[] = [...OPENAI_TRANSCRIBE_MODELS, ...(GOOGLE_TRANSCRIBE_MODELS as unknown as string[])];
        return models.map((model) => {
            return {
                value: model,
                label: formatTranscribeLabel(model),
                disabled: false,
            };
        });
    }, [settings.transcriptionMode, hasGoogleKey, hasOpenAiKey]);

    const llmOptions = useMemo(() => {
        if (settings.llmHost === 'local') {
            return LOCAL_LLM_MODELS.map((model) => ({value: model, label: formatLlmLabel(model)}));
        }
        const models: string[] = [...(PROVIDER_LLM_MODELS[apiProviderPreset] ?? OPENAI_LLM_MODELS) as unknown as string[]];
        return models.map((model) => {
            return {
                value: model,
                label: formatLlmLabel(model),
                disabled: false,
            };
        });
    }, [settings.llmHost, hasGoogleKey, hasOpenAiKey, apiProviderPreset]);

    const screenModelOptions = useMemo(() => SCREEN_MODEL_OPTIONS.map((option) => ({
        ...option,
        disabled: option.value === 'openai' ? !hasOpenAiKey : !hasGoogleKey,
        description: option.value === 'openai'
            ? (!hasOpenAiKey ? 'Нужен ключ OpenAI' : undefined)
            : (!hasGoogleKey ? 'Нужен ключ Google AI' : undefined),
    })), [hasGoogleKey, hasOpenAiKey]);

    const selectedLocalLlmLabel = formatLlmLabel(localLlmModel);

    useEffect(() => {
        if (settings.transcriptionMode !== 'api') return;
        if (!transcribeOptions.length) return;
        const currentAllowed = isTranscribeAllowed(apiTranscribeModel);
        if (currentAllowed) return;
        const fallback = transcribeOptions.find((option) => {
            const optionMeta = option as typeof option & { disabled?: boolean };
            return !optionMeta.disabled;
        });
        if (fallback) {
            void handleTranscriptionModelChange(fallback.value);
        }
    }, [settings.transcriptionMode, apiTranscribeModel, transcribeOptions, isTranscribeAllowed]);

    useEffect(() => {
        if (settings.llmHost !== 'api') return;
        if (!llmOptions.length) return;
        const currentAllowed = isLlmAllowed(apiLlmModel);
        if (currentAllowed) return;
        const fallback = llmOptions.find((option) => {
            const optionMeta = option as typeof option & { disabled?: boolean };
            return !optionMeta.disabled;
        });
        if (fallback) {
            void handleApiLlmModelChange(fallback.value);
        }
    }, [settings.llmHost, apiLlmModel, llmOptions, isLlmAllowed]);

    return (
        <div className="ai-settings">
            <section className="settings-card card">
                <h3 className="settings-card__title">{t('ai.modesTitle')}</h3>
                <div className="ai-settings__grid ai-settings__grid--models ai-settings__grid--models-row">
                    <div className="settings-field">
                        <div className="ai-settings__select-wrapper">
                            <TextField
                                select
                                size="small"
                                label={t('ai.transcriptionMode')}
                                value={settings.transcriptionMode ?? 'api'}
                                onChange={(event) => handleTranscriptionModeChange(event.target.value as TranscriptionMode)}
                                fullWidth
                            >
                                {TRANSCRIPTION_MODE_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </div>
                        {settings.transcriptionMode === 'local' ? (
                            <div className="ai-settings__grid" style={{marginTop: 8}}>
                                <div className="settings-field">
                                    <TextField
                                        select
                                        size="small"
                                        fullWidth
                                        label={t('ai.source.title')}
                                        value={sttSource}
                                        onChange={(event) => void handleSttSourceChange(event.target.value as 'managed' | 'external')}
                                    >
                                        <MenuItem value="managed">{t('ai.source.managed')}</MenuItem>
                                        <MenuItem value="external">{t('ai.source.external')}</MenuItem>
                                    </TextField>
                                </div>

                                {sttSource === 'managed' ? (
                                    <>
                                        <div className="settings-field">
                                            <TextField
                                                select
                                                size="small"
                                                fullWidth
                                                label={t('ai.buildVariant')}
                                                value={managedVariant}
                                                onChange={(event) => setManagedVariant(event.target.value)}
                                                disabled={installBusy}
                                            >
                                                {MANAGED_VARIANTS.map((v) => (
                                                    <MenuItem key={v.value} value={v.value}>{v.label}</MenuItem>
                                                ))}
                                            </TextField>
                                        </div>
                                        <div className="settings-field">
                                            <TextField
                                                select
                                                size="small"
                                                fullWidth
                                                label={t('ai.model')}
                                                value={managedModel}
                                                onChange={(event) => setManagedModel(event.target.value)}
                                                disabled={installBusy}
                                            >
                                                {MANAGED_WHISPER_MODELS.map((m) => (
                                                    <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                                                ))}
                                            </TextField>
                                        </div>
                                        <div className="settings-field settings-actions-row">
                                            <Button
                                                variant="contained"
                                                color="primary"
                                                onClick={handleManagedInstall}
                                                disabled={installBusy}
                                                startIcon={installBusy ? <CircularProgress size={14}/> : undefined}
                                            >
                                                {installBusy
                                                    ? t('ai.installing')
                                                    : managedStatus?.variants?.some((v) => v.name === managedVariant)
                                                    && managedStatus?.models?.includes(managedModel)
                                                        ? t('ai.reinstall')
                                                        : t('ai.install')}
                                            </Button>
                                            <Button variant="outlined" size="small" onClick={handleManagedOpenDir}
                                                    disabled={installBusy}>
                                                {t('ai.openFolder')}
                                            </Button>
                                            {(managedStatus?.variants?.length ?? 0) > 0 ? (
                                                <Button variant="outlined" color="secondary" size="small"
                                                        onClick={handleManagedDelete} disabled={installBusy}>
                                                    {t('ai.deleteAll')}
                                                </Button>
                                            ) : null}
                                        </div>
                                        {installBusy && installProgress ? (
                                            <Typography variant="caption" color="text.secondary">
                                                {installProgress.phase === 'binary'
                                                    ? t('ai.downloadingWhisper')
                                                    : t('ai.downloadingModel', {file: installProgress.file})}
                                                {installProgress.total > 0
                                                    ? `: ${Math.round(installProgress.downloaded / 1e6)} / ${Math.round(installProgress.total / 1e6)} МБ`
                                                    : `: ${Math.round(installProgress.downloaded / 1e6)} МБ`}
                                            </Typography>
                                        ) : null}
                                        {(managedStatus?.variants?.length ?? 0) > 0 ? (
                                            <Typography variant="caption" color="success.main">
                                                {t('ai.installedStatus', {
                                                    variants: managedStatus!.variants.map((v) => v.name.toUpperCase()).join(', '),
                                                    models: managedStatus!.models.length ? managedStatus!.models.join(', ') : '—'
                                                })}
                                            </Typography>
                                        ) : (
                                            <Typography variant="caption" color="text.secondary">
                                                {t('ai.installNote', {kind: managedVariant === 'cublas' ? 'GPU/CUDA' : 'CPU'})}
                                            </Typography>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="settings-field">
                                            <TextField
                                                size="small"
                                                fullWidth
                                                label={t('ai.whisperExePath')}
                                                placeholder="C:\\whisper.cpp\\build\\bin\\whisper-server.exe"
                                                defaultValue={settings.whisperServerExe ?? ''}
                                                key={`exe-${settings.whisperServerExe ?? ''}`}
                                                onBlur={(event) => void handleWhisperServerExeChange(event.target.value)}
                                            />
                                        </div>
                                        <div className="settings-field">
                                            <TextField
                                                size="small"
                                                fullWidth
                                                label={t('ai.whisperModelPath')}
                                                placeholder="C:\\models\\ggml-large-v3-turbo.bin"
                                                defaultValue={settings.whisperServerModel ?? ''}
                                                key={`model-${settings.whisperServerModel ?? ''}`}
                                                onBlur={(event) => void handleWhisperServerModelChange(event.target.value)}
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="settings-field settings-actions-row">
                                    {whisperServerRunning ? (
                                        <Button
                                            variant="outlined"
                                            color="secondary"
                                            onClick={handleWhisperServerStop}
                                            disabled={whisperServerBusy}
                                            startIcon={whisperServerBusy ? <CircularProgress size={14}/> : <StopCircleIcon/>}
                                        >
                                            {t('ai.stop')}
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            onClick={handleWhisperServerStart}
                                            disabled={whisperServerBusy}
                                            startIcon={whisperServerBusy ? <CircularProgress size={14}/> : <PlayArrowIcon/>}
                                        >
                                            {t('ai.start')}
                                        </Button>
                                    )}
                                    <span
                                        className={`ai-settings__select-status ai-settings__select-status--${whisperServerRunning ? 'success' : 'warning'}`}>
                                        {whisperServerRunning ? t('ai.running8868') : t('ai.stopped')}
                                    </span>
                                </div>
                                <Typography variant="caption" color="text.secondary">
                                    {t('ai.serverNote')}
                                </Typography>
                            </div>
                        ) : null}
                    </div>

                    {settings.transcriptionMode !== 'local' ? (
                        <div className="settings-field">
                            <div className="ai-settings__select-wrapper">
                                <TextField
                                    select
                                    size="small"
                                    fullWidth
                                    label={t('ai.transcriptionModel')}
                                    value={apiTranscribeModel}
                                    onChange={(event) => void handleTranscriptionModelChange(event.target.value)}
                                >
                                    {transcribeOptions.map((option) => {
                                        const optionMeta = option as typeof option & {
                                            disabled?: boolean;
                                            description?: string;
                                        };
                                        const optionDisabled = Boolean(optionMeta.disabled);
                                        const optionDescription = optionMeta.description;
                                        return (
                                            <MenuItem
                                                key={option.value}
                                                value={option.value}
                                                disabled={optionDisabled}
                                                sx={optionDisabled ? {opacity: 0.6} : undefined}
                                            >
                                                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.25}}>
                                                    <span>{option.label}</span>
                                                    {optionDescription ? (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {optionDescription}
                                                        </Typography>
                                                    ) : null}
                                                </Box>
                                            </MenuItem>
                                        );
                                    })}
                                </TextField>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="ai-settings__grid ai-settings__grid--models ai-settings__grid--models-row">
                    <div className="settings-field">
                        <div className="ai-settings__select-wrapper">
                            <TextField
                                select
                                size="small"
                                fullWidth
                                label={t('ai.llmMode')}
                                value={settings.llmHost ?? 'api'}
                                onChange={(event) => handleLlmHostChange(event.target.value as LlmHost)}
                            >
                                {LLM_HOST_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                            {settings.llmHost === 'local' ? (
                                <IconButton
                                    size="small"
                                    className="ai-settings__select-icon"
                                    aria-label={t('ai.localLlmInfo')}
                                    onClick={() => setInfoDialog('llm')}
                                >
                                    <InfoOutlinedIcon fontSize="small"/>
                                </IconButton>
                            ) : null}
                        </div>
                    </div>

                    <div className="settings-field">
                        <div className="ai-settings__select-wrapper">
                            {settings.llmHost === 'local' ? (
                                <TextField
                                    select
                                    size="small"
                                    fullWidth
                                    label={t('ai.llmModel')}
                                    value={localLlmModel}
                                    onChange={(event) => void handleLocalLlmModelChange(event.target.value)}
                                    disabled={ollamaChecking || !ollamaInstalled}
                                >
                                    {llmOptions.map((option) => {
                                        const optionMeta = option as typeof option & {
                                            disabled?: boolean;
                                            description?: string;
                                        };
                                        const optionDisabled = Boolean(optionMeta.disabled);
                                        const optionDescription = optionMeta.description;
                                        return (
                                            <MenuItem
                                                key={option.value}
                                                value={option.value}
                                                disabled={optionDisabled}
                                                sx={optionDisabled ? {opacity: 0.6} : undefined}
                                            >
                                                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.25}}>
                                                    <span>{option.label}</span>
                                                    {optionDescription ? (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {optionDescription}
                                                        </Typography>
                                                    ) : null}
                                                </Box>
                                            </MenuItem>
                                        );
                                    })}
                                </TextField>
                            ) : (
                                <Autocomplete
                                    freeSolo
                                    size="small"
                                    fullWidth
                                    options={llmOptions.map((option) => option.value)}
                                    value={apiLlmModel}
                                    onChange={(_event, val) => {
                                        if (typeof val === 'string') void handleApiLlmModelChange(val);
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label={t('ai.llmModel')}
                                            placeholder="gpt-5.6, deepseek-v4-pro, gemini-3.5-flash…"
                                            onBlur={(event) => {
                                                const val = event.target.value.trim();
                                                if (val && val !== apiLlmModel) void handleApiLlmModelChange(val);
                                            }}
                                        />
                                    )}
                                />
                            )}
                            {settings.llmHost === 'local' && !ollamaModelWarming && ollamaModelDownloaded === true ? (
                                <span
                                    className="ai-settings__select-status ai-settings__select-status--overlay ai-settings__select-status--success">{t('ai.ready')}</span>
                            ) : null}
                            {settings.llmHost === 'local' && !ollamaModelWarming && ollamaModelDownloaded === false && !ollamaModelChecking ? (
                                <span
                                    className="ai-settings__select-status ai-settings__select-status--overlay ai-settings__select-status--warning">{t('ai.download')}</span>
                            ) : null}
                        </div>
                        {settings.llmHost === 'local' ? (
                            <Box sx={{mt: -.4}} className="ai-settings__status-block">
                                {!ollamaChecking && ollamaInstalled === false ? (
                                    <Typography variant="body2" color="warning.main">
                                        {t('ai.installOllama')}
                                    </Typography>
                                ) : null}
                                {ollamaInstalled && !ollamaModelChecking && ollamaModelWarming ? (
                                    <Typography variant="body2" color="warning.main"
                                                sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                        <CircularProgress size={16} thickness={5} sx={{color: 'warning.main'}}/>
                                        {t('ai.warmingUp', {model: selectedLocalLlmLabel})}
                                    </Typography>
                                ) : null}
                                {ollamaInstalled && !ollamaModelChecking && ollamaModelDownloaded === false ? (
                                    <Button
                                        variant="contained"
                                        size="small"
                                        color="primary"
                                        onClick={handleOllamaDownload}
                                        disabled={ollamaDownloading}
                                        startIcon={ollamaDownloading ?
                                            <CircularProgress size={14} color="inherit"/> : undefined}
                                    >
                                        {t('ai.downloadModel', {model: selectedLocalLlmLabel})}
                                    </Button>
                                ) : null}
                                {ollamaModelError ? (
                                    <Typography variant="body2" color="error" sx={{mt: 0.5}}>
                                        {ollamaModelError}
                                    </Typography>
                                ) : null}
                            </Box>
                        ) : null}
                    </div>

                    {settings.llmHost !== 'local' ? (
                        <div className="settings-field">
                            <div className="ai-settings__select-wrapper">
                                <TextField
                                    select
                                    size="small"
                                    fullWidth
                                    label={t('ai.apiProvider')}
                                    value={apiProviderPreset}
                                    onChange={(event) => void handleProviderPresetChange(event.target.value)}
                                >
                                    {API_PROVIDER_PRESETS.map((preset) => (
                                        <MenuItem key={preset.value} value={preset.value}>
                                            <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.25}}>
                                                <span>{preset.label}</span>
                                                <Typography variant="caption" color="text.secondary">
                                                    {preset.note}
                                                </Typography>
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </div>
                            {apiProviderPreset === 'custom' ? (
                                <TextField
                                    size="small"
                                    fullWidth
                                    label={t('ai.provider.customUrl')}
                                    placeholder="https://api.deepseek.com"
                                    value={customApiBaseUrl}
                                    onChange={(event) => setCustomApiBaseUrl(event.target.value)}
                                    onBlur={(event) => void handleCustomUrlSave(event.target.value)}
                                    sx={{mt: 1}}
                                    helperText={t('ai.baseUrlHelper')}
                                />
                            ) : null}
                        </div>
                    ) : null}

                    <div className="settings-field">
                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={Boolean(settings.screenSeparate)}
                                    onChange={(event) => void handleScreenSeparateChange(event.target.checked)}
                                />
                            }
                            label={t('ai.visionCheckbox')}
                        />
                        <div className="ai-settings__hint">
                            {settings.screenSeparate
                                ? t('ai.visionOn')
                                : t('ai.visionOff')}
                        </div>
                    </div>

                    {settings.screenSeparate ? (
                        <>
                            <div className="settings-field">
                                <div className="ai-settings__select-wrapper">
                                    <TextField
                                        select
                                        size="small"
                                        fullWidth
                                        label={t('ai.visionProvider')}
                                        value={visionPreset}
                                        onChange={(event) => void handleVisionPresetChange(event.target.value)}
                                    >
                                        {API_PROVIDER_PRESETS.map((preset) => (
                                            <MenuItem key={preset.value} value={preset.value}>
                                                <Box sx={{display: 'flex', flexDirection: 'column', gap: 0.25}}>
                                                    <span>{preset.label}</span>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {preset.note}
                                                    </Typography>
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                </div>
                                {visionPreset === 'custom' ? (
                                    <TextField
                                        size="small"
                                        fullWidth
                                        label={t('ai.provider.customUrl')}
                                        placeholder="https://openrouter.ai/api"
                                        value={visionCustomUrl}
                                        onChange={(event) => setVisionCustomUrl(event.target.value)}
                                        onBlur={(event) => void handleVisionCustomUrlSave(event.target.value)}
                                        sx={{mt: 1}}
                                        helperText={t('ai.baseUrlHelperShort')}
                                    />
                                ) : null}
                            </div>
                            <div className="settings-field">
                                <TextField
                                    size="small"
                                    fullWidth
                                    label={t('ai.visionModel')}
                                    placeholder="openai/gpt-4o-mini, qwen/qwen2.5-vl-72b-instruct…"
                                    defaultValue={settings.screenModel ?? ''}
                                    key={`smodel-${settings.screenModel ?? ''}`}
                                    onBlur={(event) => void handleScreenModelChange(event.target.value)}
                                    helperText={t('ai.visionModelHelper')}
                                />
                            </div>
                            <div className="settings-field">
                                <TextField
                                    size="small"
                                    fullWidth
                                    type="password"
                                    label={t('ai.visionKey')}
                                    placeholder="sk-or-…"
                                    defaultValue={settings.screenApiKey ?? ''}
                                    key={`skey-${settings.screenApiKey ?? ''}`}
                                    onBlur={(event) => void handleScreenApiKeyChange(event.target.value)}
                                    helperText={t('ai.visionKeyHelper')}
                                />
                            </div>
                        </>
                    ) : null}

                </div>
            </section>

            {showApiKeys ? (
                <section className="settings-card card">
                    <h3 className="settings-card__title">{t('ai.apiKeysTitle')}</h3>
                    <div className="ai-settings__grid">
                        {savedKeys.length > 0 ? (
                            savedKeys.map((key) => {
                                const KEY_TO_URL: Record<string, string> = {
                                    openai: '', deepseek: 'https://api.deepseek.com',
                                    openrouter: 'https://openrouter.ai/api', google: '', custom: 'custom',
                                };
                                const keyMatchesProvider = KEY_TO_URL[key.provider] === apiProviderPreset;
                                const isActive = settings.activeApiKeyId === key.id && keyMatchesProvider;
                                const providerLabel = KEY_PROVIDER_OPTIONS.find((p) => p.value === key.provider)?.label ?? key.provider;
                                const masked = key.apiKey.length > 8
                                    ? `${key.apiKey.slice(0, 4)}...${key.apiKey.slice(-4)}`
                                    : '****';
                                return (
                                    <div key={key.id} className="settings-field" style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                        <Button
                                            variant={isActive ? 'contained' : 'outlined'}
                                            size="small"
                                            onClick={() => void handleActivateKey(key.id)}
                                            sx={{
                                                flex: 1,
                                                justifyContent: 'flex-start',
                                                textTransform: 'none',
                                                ...(isActive && {
                                                    background: 'linear-gradient(135deg, #db704b, #c4603d)',
                                                    color: '#fff',
                                                    borderColor: '#db704b',
                                                    '&:hover': {
                                                        background: 'linear-gradient(135deg, #e8926e, #db704b)',
                                                        borderColor: '#db704b',
                                                    },
                                                }),
                                            }}
                                        >
                                            <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.25}}>
                                                <span style={{fontSize: 13, fontWeight: 500}}>
                                                    {key.name}
                                                    <span style={{opacity: 0.5, marginLeft: 6, fontSize: 11}}>({providerLabel})</span>
                                                </span>
                                                <span style={{fontSize: 11, opacity: 0.5, fontFamily: 'monospace'}}>{masked}</span>
                                            </Box>
                                        </Button>
                                        <IconButton size="small" onClick={() => void handleRemoveKey(key.id)}>
                                            <span style={{fontSize: 14, opacity: 0.5}}>✕</span>
                                        </IconButton>
                                    </div>
                                );
                            })
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{mb: 1}}>
                                {t('ai.noKeys')}
                            </Typography>
                        )}
                        <div className="settings-field">
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => setAddKeyDialogOpen(true)}
                                startIcon={<span>+</span>}
                            >
                                {t('ai.addKey')}
                            </Button>
                        </div>
                    </div>

                    {/* Диалог добавления ключа */}
                    <Dialog open={addKeyDialogOpen} onClose={() => setAddKeyDialogOpen(false)} maxWidth="sm" fullWidth>
                        <DialogTitle>{t('ai.newKeyDialog')}</DialogTitle>
                        <DialogContent>
                            <TextField
                                select
                                size="small"
                                fullWidth
                                label={t('ai.provider')}
                                value={newKeyProvider}
                                onChange={(event) => setNewKeyProvider(event.target.value)}
                                sx={{mb: 2, mt: 1}}
                            >
                                {KEY_PROVIDER_OPTIONS.map((opt) => (
                                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                                ))}
                            </TextField>
                            <TextField
                                size="small"
                                fullWidth
                                label={t('ai.nameOptional')}
                                value={newKeyName}
                                onChange={(event) => setNewKeyName(event.target.value)}
                                placeholder={KEY_PROVIDER_OPTIONS.find((p) => p.value === newKeyProvider)?.label ?? ''}
                                sx={{mb: 2}}
                            />
                            <TextField
                                size="small"
                                fullWidth
                                label={t('ai.apiKey')}
                                type="password"
                                value={newKeyValue}
                                onChange={(event) => setNewKeyValue(event.target.value)}
                                placeholder="sk-..."
                                sx={{mb: 2}}
                            />
                            {newKeyProvider === 'custom' ? (
                                <TextField
                                    size="small"
                                    fullWidth
                                    label="Base URL"
                                    value={newKeyBaseUrl}
                                    onChange={(event) => setNewKeyBaseUrl(event.target.value)}
                                    placeholder="https://api.example.com"
                                    helperText={t('ai.baseUrlHelperNoExamples')}
                                />
                            ) : null}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setAddKeyDialogOpen(false)}>{t('ai.cancel')}</Button>
                            <Button onClick={() => void handleAddKey()} variant="contained">{t('common.save')}</Button>
                        </DialogActions>
                    </Dialog>
                </section>
            ) : null}


            <section className="settings-card card">
                <h3 className="settings-card__title">{t('ai.promptsTitle')}</h3>
                <div className="ai-settings__grid">
                    <div className="settings-field">
                        <FormControlLabel
                            control={<Checkbox checked={useDefaultTranscriptionPrompt} onChange={(_, v) => setUseDefaultTranscriptionPrompt(v)}/>}
                            label={t('ai.transcriptionPromptUseDefault')}
                        />
                        <TextField
                            label={t('ai.transcriptionPrompt')}
                            value={useDefaultTranscriptionPrompt ? t('ai.transcriptionPromptDefault') : transcriptionPrompt}
                            onChange={(event) => setTranscriptionPrompt(event.target.value)}
                            fullWidth
                            multiline
                            minRows={3}
                            placeholder={t('ai.transcriptionPromptPlaceholder')}
                            disabled={useDefaultTranscriptionPrompt}
                        />
                    </div>
                    <div className="settings-field">
                        <FormControlLabel
                            control={<Checkbox checked={useDefaultLlmPrompt} onChange={(_, v) => setUseDefaultLlmPrompt(v)}/>}
                            label={t('ai.llmPromptUseDefault')}
                        />
                        <TextField
                            label={t('ai.llmPrompt')}
                            value={useDefaultLlmPrompt ? t('ai.llmPromptDefault') : llmPrompt}
                            onChange={(event) => setLlmPrompt(event.target.value)}
                            fullWidth
                            multiline
                            minRows={3}
                            placeholder={t('ai.llmPromptPlaceholder')}
                            disabled={useDefaultLlmPrompt}
                        />
                    </div>
                </div>
            </section>
            <section className="settings-card card">
                <h3 className="settings-card__title">{t('ai.timeoutsTitle')}</h3>
                <div className="ai-settings__grid ai-settings__grid--timeouts">
                    <div className="settings-field">
                        <TextField
                            label={t('ai.timeout.transcription')}
                            type="number"
                            value={apiSttTimeout}
                            size="small"
                            onChange={(event) => setApiSttTimeout(Number(event.target.value))}
                            inputProps={{min: 1000, max: 600000, step: 500}}
                        />
                    </div>
                    <div className="settings-field">
                        <TextField
                            label={t('ai.timeout.llm')}
                            type="number"
                            value={apiLlmTimeout}
                            size="small"
                            onChange={(event) => setApiLlmTimeout(Number(event.target.value))}
                            inputProps={{min: 1000, max: 600000, step: 500}}
                        />
                    </div>
                    <div className="settings-field">
                        <TextField
                            label={t('ai.timeout.screen')}
                            type="number"
                            size="small"
                            value={screenTimeout}
                            onChange={(event) => setScreenTimeout(Number(event.target.value))}
                            inputProps={{min: 1000, max: 600000, step: 500}}
                        />
                    </div>
                </div>
            </section>
            <Dialog
                open={infoDialog === 'llm'}
                onClose={() => setInfoDialog(null)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t('ai.localLlmDialogTitle')}</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" gutterBottom>
                        {t('ai.localLlmP1')}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                        {t('ai.localLlmP2')}
                    </Typography>
                    <Typography variant="body2">
                        {t('ai.localLlmP3')}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setInfoDialog(null)}>{t('ai.gotIt')}</Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};
