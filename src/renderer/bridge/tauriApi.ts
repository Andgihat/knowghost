import {invoke} from '@tauri-apps/api/core';
import {getCurrentWindow, LogicalPosition, LogicalSize,} from '@tauri-apps/api/window';
import {
    AssistantAPI,
    SavedApiKey,
    ScreenProcessRequest,
    ScreenProcessResponse,
} from '@shared/ipc';
import {listen, UnlistenFn} from '@tauri-apps/api/event';
import {
    assistantAskChat,
    assistantOffStreamDelta,
    assistantOffStreamDone,
    assistantOffStreamError,
    assistantOffStreamTranscript,
    assistantOnStreamDelta,
    assistantOnStreamDone,
    assistantOnStreamError,
    assistantOnStreamTranscript,
    assistantProcessAudio,
    assistantProcessAudioStream,
    assistantStopStream,
    assistantTranscribeOnly,
    processScreenImage as assistantProcessScreenImage,
} from '../services/nativeAssistant';

const currentWindow = getCurrentWindow();

async function patchSettings(payload: Record<string, unknown>) {
    await invoke('config_update', {payload});
}

const makeSettingSetter =
    <T>(key: keyof AssistantAPI['settings'] extends never ? string : string) =>
        async (value: T) => {
            await patchSettings({[key]: value});
        };

async function replaceListener<T>(
    current: UnlistenFn | null,
    event: string,
    handler: (event: any) => void
): Promise<UnlistenFn> {
    if (current) {
        try {
            await current();
        } catch {
        }
    }
    return listen<T>(event, handler);
}

function clearListener(current: UnlistenFn | null): null {
    if (current) {
        try {
            void current();
        } catch {
        }
    }
    return null;
}

const settingsApi: AssistantAPI['settings'] = {
    get: () => invoke('config_get'),
    setOpenaiApiKey: makeSettingSetter<string>('openaiApiKey'),
    setApiBaseUrl: makeSettingSetter<string>('apiBaseUrl'),
    setWhisperServerExe: makeSettingSetter<string>('whisperServerExe'),
    setWhisperServerModel: makeSettingSetter<string>('whisperServerModel'),
    setSttSource: makeSettingSetter<'managed' | 'external'>('sttSource'),
    setScreenSeparate: makeSettingSetter<boolean>('screenSeparate'),
    setScreenBaseUrl: makeSettingSetter<string>('screenBaseUrl'),
    setScreenApiKey: makeSettingSetter<string>('screenApiKey'),
    setScreenModel: makeSettingSetter<string>('screenModel'),
    setWindowOpacity: async (opacity: number) => {
        await patchSettings({windowOpacity: opacity});
        // Opacity is applied in Rust via DWM
    },
    setAlwaysOnTop: async (alwaysOnTop: boolean) => {
        await patchSettings({alwaysOnTop});
        try {
            await currentWindow.setAlwaysOnTop(alwaysOnTop);
        } catch {
        }
    },
    setHideApp: async (hideApp: boolean) => {
        await patchSettings({hideApp});
        // Screen recording exclusion is applied in Rust via SetWindowDisplayAffinity
    },
    setWindowSize: async (size) => {
        const width = Math.max(size.width, 400);
        const height = Math.max(size.height, 500);
        await patchSettings({windowWidth: width, windowHeight: height});
        try {
            await currentWindow.setSize(new LogicalSize(width, height));
        } catch {
        }
    },
    setWindowScale: async (scale) => {
        await patchSettings({windowScale: scale});
        // Scale is applied in Rust by resizing the window and adjusting CSS zoom
    },
    setDurations: makeSettingSetter('durations'),
    setDurationHotkeys: makeSettingSetter('durationHotkeys'),
    setAudioInputDevice: makeSettingSetter('audioInputDeviceId'),
    setToggleInputHotkey: makeSettingSetter('toggleInputHotkey'),
    setAudioInputType: makeSettingSetter('audioInputType'),
    setTranscriptionModel: makeSettingSetter('transcriptionModel'),
    setTranscriptionPrompt: makeSettingSetter('transcriptionPrompt'),
    setUseDefaultTranscriptionPrompt: makeSettingSetter('useDefaultTranscriptionPrompt'),
    setLlmModel: async (model, host) => {
        const payload: Record<string, unknown> = {llmModel: model};
        if (host === 'local') {
            payload.localLlmModel = model;
        } else if (host === 'api') {
            payload.apiLlmModel = model;
        }
        await patchSettings(payload);
    },
    setLlmPrompt: makeSettingSetter('llmPrompt'),
    setUseDefaultLlmPrompt: makeSettingSetter('useDefaultLlmPrompt'),
    setTranscriptionMode: makeSettingSetter('transcriptionMode'),
    setTheme: makeSettingSetter('theme'),
    setLlmHost: makeSettingSetter('llmHost'),
    setLocalWhisperModel: makeSettingSetter('localWhisperModel'),
    setLocalDevice: makeSettingSetter('localDevice'),
    setApiSttTimeoutMs: makeSettingSetter('apiSttTimeoutMs'),
    setApiLlmTimeoutMs: makeSettingSetter('apiLlmTimeoutMs'),
    getAudioDevices: async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices
                .filter((device) => device.kind === 'audioinput')
                .map((device) => ({
                    deviceId: device.deviceId,
                    label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
                    kind: 'audioinput' as const,
                }));
        } catch {
            return [];
        }
    },
    openConfigFolder: async () => {
        await invoke('open_config_folder');
    },
    setScreenProcessingModel: makeSettingSetter('screenProcessingModel'),
    setScreenProcessingPrompt: makeSettingSetter('screenProcessingPrompt'),
    setScreenProcessingTimeoutMs: makeSettingSetter('screenProcessingTimeoutMs'),
    setGoogleApiKey: makeSettingSetter('googleApiKey'),
    setStreamSendHotkey: makeSettingSetter<string>('streamSendHotkey'),
};

const audioApi: AssistantAPI['audio'] = {
    listDevices: () => invoke('audio_list_devices'),
    startCapture: (source: 'mic' | 'system' | 'mixed', deviceId?: string) =>
        invoke('audio_start_capture', {source, deviceId}),
    stopCapture: () => invoke('audio_stop_capture'),
};

const windowApi: AssistantAPI['window'] = {
    minimize: () => currentWindow.minimize(),
    close: () => currentWindow.close(),
    async getBounds() {
        const [position, size] = await Promise.all([
            currentWindow.outerPosition(),
            currentWindow.outerSize(),
        ]);
        return {
            x: position.x as number,
            y: position.y as number,
            width: size.width as number,
            height: size.height as number,
        };
    },
    async setBounds(bounds) {
        await currentWindow.setPosition(new LogicalPosition(bounds.x, bounds.y));
        await currentWindow.setSize(new LogicalSize(bounds.width, bounds.height));
    },
};

const assistantApi: AssistantAPI['assistant'] = {
    processAudio: assistantProcessAudio,
    processAudioStream: assistantProcessAudioStream,
    transcribeOnly: assistantTranscribeOnly,
    askChat: assistantAskChat,
    stopStream: assistantStopStream,
    onStreamTranscript: (cb) => assistantOnStreamTranscript(cb),
    onStreamDelta: (cb) => assistantOnStreamDelta(cb),
    onStreamDone: (cb) => assistantOnStreamDone(cb),
    onStreamError: (cb) => assistantOnStreamError(cb),
    offStreamTranscript: () => assistantOffStreamTranscript(),
    offStreamDelta: () => assistantOffStreamDelta(),
    offStreamDone: () => assistantOffStreamDone(),
    offStreamError: () => assistantOffStreamError(),
};

let durationUnlisten: UnlistenFn | null = null;
let toggleUnlisten: UnlistenFn | null = null;

const hotkeysApi: AssistantAPI['hotkeys'] = {
    onDuration: (cb) => {
        void (async () => {
            durationUnlisten = await replaceListener<{ sec: number }>(
                durationUnlisten,
                'hotkeys:duration',
                (event) => cb(event, event.payload)
            );
        })();
    },
    offDuration: () => {
        durationUnlisten = clearListener(durationUnlisten);
    },
    onToggleInput: (cb) => {
        void (async () => {
            toggleUnlisten = await replaceListener(
                toggleUnlisten,
                'hotkeys:toggle-input',
                () => cb()
            );
        })();
    },
    offToggleInput: () => {
        toggleUnlisten = clearListener(toggleUnlisten);
    },
};

const loopbackApi: AssistantAPI['loopback'] = {
    enable: async () => ({success: false, error: 'Not implemented'}),
    disable: async () => ({success: false, error: 'Not implemented'}),
};

const screenApi: AssistantAPI['screen'] = {
    capture: async () => {
        return captureScreenFrame();
    },
    process: async (payload: ScreenProcessRequest): Promise<ScreenProcessResponse> => {
        return assistantProcessScreenImage(payload);
    },
};

const googleApi: AssistantAPI['google'] = {
    startLive: async () => {
        throw new Error('Google live is not implemented');
    },
    sendAudioChunk: () => {
        throw new Error('Google live is not implemented');
    },
    stopLive: () => {
    },
    onMessage: () => {
    },
    onError: () => {
    },
};

const mediaApi: AssistantAPI['media'] = {
    getPrimaryDisplaySourceId: async () => null,
};

const ollamaApi: AssistantAPI['ollama'] = {
    checkInstalled: () => invoke<boolean>('ollama_check_installed'),
    listModels: () => invoke<string[]>('ollama_list_models'),
    pullModel: (model: string) => invoke('ollama_pull_model', {model}),
    warmupModel: (model: string) => invoke('ollama_warmup_model', {model}),
};

const apiKeysApi = {
    list: () => invoke<SavedApiKey[]>('api_keys_list'),
    save: (key: SavedApiKey): Promise<void> => invoke('api_keys_save', {key}),
    remove: (id: string): Promise<void> => invoke('api_keys_remove', {id}),
    activate: (id: string): Promise<void> => invoke('api_keys_activate', {id}),
};

const api: AssistantAPI = {
    assistant: assistantApi,
    hotkeys: hotkeysApi,
    settings: settingsApi,
    apiKeys: apiKeysApi,
    window: windowApi,
    loopback: loopbackApi,
    screen: screenApi,
    google: googleApi,
    media: mediaApi,
    ollama: ollamaApi,
    audio: audioApi,
    db: {
        listCards: () => invoke("list_cards"),
        getCard: (id: string) => invoke("get_card", {id}),
        createCard: (req) => invoke("create_card", {req: {title: req.title, card_type: (req as any).type, tags: (req as any).tags}}),
        updateCard: (req) => invoke("update_card", {req}),
        deleteCard: (id: string) => invoke("delete_card", {id}),
        searchCards: (query: string) => invoke("search_cards", {query}),
        listMessages: (cardId: string) => invoke("list_messages", {cardId}),
        createMessage: (req) => invoke("create_message", {req: {card_id: req.cardId, role: req.role, content: req.content}}),
        deleteMessages: (cardId: string) => invoke("delete_messages", {cardId}),
        listPrompts: (type?: string) => invoke("list_prompts", {promptType: type ?? null}),
        createPrompt: (req: any) => invoke("create_prompt", {req}),
        updatePrompt: (id: string, patch: any) => invoke("update_prompt", {id, name: patch.name ?? null, content: patch.content ?? null}),
        setActivePrompt: (id: string, type: string) => invoke("set_active_prompt", {id, promptType: type}),
        deletePrompt: (id: string) => invoke("delete_prompt", {id}),
        getActivePrompt: (type: string) => invoke("get_active_prompt", {promptType: type}),
    },
    log: async (entry) => {
        const prefix = `[${entry.category}] ${entry.message}`;
        const data = entry.data;
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
            console.groupCollapsed(prefix);
            console.log(data);
            console.groupEnd();
        } else {
            console.info(prefix);
        }
    },
};

if (typeof window !== 'undefined') {
    (window as any).api = api;
}

async function captureScreenFrame(): Promise<{ base64: string; width: number; height: number; mime: string }> {
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
            frameRate: 1,
        },
        audio: false,
    });
    try {
        const video = document.createElement('video');
        video.srcObject = stream;
        await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => resolve();
        });
        await video.play().catch(() => {
        });
        const width = video.videoWidth || 1920;
        const height = video.videoHeight || 1080;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Unable to capture screen frame');
        }
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1] || '';
        return {
            base64,
            width,
            height,
            mime: 'image/png',
        };
    } finally {
        stream.getTracks().forEach((t) => t.stop());
    }
}
