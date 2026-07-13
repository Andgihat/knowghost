// noinspection JSUnusedGlobalSymbols

export const TRANSCRIPTION_MODES = {
    API: 'api',
    LOCAL: 'local',
} as const;

export const LLM_HOSTS = {
    API: 'api',
    LOCAL: 'local',
} as const;

export const OPENAI_TRANSCRIBE_MODELS = [
    'gpt-4o-mini-transcribe',
    'gpt-4o-transcribe',
    'whisper-1',
] as const;

export const GOOGLE_TRANSCRIBE_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
] as const;

export const TRANSCRIBE_API_MODELS = [
    ...OPENAI_TRANSCRIBE_MODELS,
    ...GOOGLE_TRANSCRIBE_MODELS,
] as const;

export const LOCAL_TRANSCRIBE_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3'] as const;

export const LOCAL_TRANSCRIBE_MODEL_DETAILS = {
    tiny: {label: 'Tiny', size: '~75MB'},
    base: {label: 'Base', size: '~141MB'},
    small: {label: 'Small', size: '~463MB'},
    medium: {label: 'Medium', size: '~1.42GB'},
    'large-v3': {label: 'Large', size: '~3GB'},
} as const;

export const LOCAL_TRANSCRIBE_ALIASES = {
    large: 'large-v3',
    'large-v2': 'large-v3',
} as const;

export const OPENAI_LLM_MODELS = [
    'gpt-5.6',
    'gpt-5.5',
    'gpt-5.4',
    'gpt-5.2',
    'gpt-4.1',
    'gpt-4.1-mini',
    'o3',
    'o3-pro',
    'o4-mini',
] as const;

export const GEMINI_LLM_MODELS = [
    'gemini-3.5-flash',
    'gemini-3-pro',
    'gemini-3-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
] as const;

export const API_LLM_MODELS = [...OPENAI_LLM_MODELS, ...GEMINI_LLM_MODELS] as const;

export const LOCAL_LLM_MODELS = [
    'gpt-oss:120b',
    'gpt-oss:20b',
    'gemma3:27b',
    'gemma3:12b',
    'gemma3:4b',
    'gemma3:1b',
    'deepseek-r1:8b',
    'qwen3-coder:30b',
    'qwen3:30b',
    'qwen3:8b',
    'qwen3:4b',
] as const;

export const LOCAL_LLM_SIZE_HINTS: Record<string, string> = {
    'gpt-oss:120b': '~90GB',
    'gpt-oss:20b': '~13GB',
    'gemma3:27b': '~21GB',
    'gemma3:12b': '~9.5GB',
    'gemma3:4b': '~2.2GB',
    'gemma3:1b': '~815MB',
    'deepseek-r1:8b': '~5.5GB',
    'qwen3-coder:30b': '~23GB',
    'qwen3:30b': '~23GB',
    'qwen3:8b': '~5.2GB',
    'qwen3:4b': '~2.5GB',
};

export type ApiTranscribeModel = (typeof TRANSCRIBE_API_MODELS)[number];
export type LocalTranscribeModel = (typeof LOCAL_TRANSCRIBE_MODELS)[number];
export type ApiLlmModel = (typeof API_LLM_MODELS)[number];
export type LocalLlmModel = (typeof LOCAL_LLM_MODELS)[number];

// ── Per-provider LLM models ───────────────────────────────────────────

export const DEEPSEEK_LLM_MODELS = [
    'deepseek-v4-pro',
    'deepseek-v4-flash',
] as const;

export const OPENROUTER_LLM_MODELS = [
    // Frontier
    'anthropic/claude-fable-5',
    'anthropic/claude-opus-4.8',
    'anthropic/claude-sonnet-5',
    'openai/gpt-5.6',
    'openai/gpt-5.5',
    'google/gemini-3.5-flash',
    'google/gemini-3-pro',
    'x-ai/grok-4.5',
    // Open-weight leaders
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-v4-flash',
    'z-ai/glm-5.2',
    'xiaomi/mimo-v2.5',
    'qwen/qwen3-235b-a22b',
    'meta-llama/llama-4-maverick',
    // Budget-friendly
    'minimax/minimax-m3',
    'stepfun/step-3.7-flash',
    'anthropic/claude-haiku-4.5',
] as const;

export const GOOGLE_LLM_MODELS = [
    'gemini-3.5-flash',
    'gemini-3-pro',
    'gemini-3-flash',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
] as const;

// Maps provider preset value → its model list
export const PROVIDER_LLM_MODELS: Record<string, readonly string[]> = {
    '': OPENAI_LLM_MODELS,            // default (OpenAI)
    'https://api.deepseek.com': DEEPSEEK_LLM_MODELS,
    'https://openrouter.ai/api': OPENROUTER_LLM_MODELS,
    'custom': API_LLM_MODELS,          // fallback: all known models
};

// Maps provider preset value → its transcription models
export const PROVIDER_TRANSCRIBE_MODELS: Record<string, readonly string[]> = {
    '': OPENAI_TRANSCRIBE_MODELS,
    'https://api.deepseek.com': [],    // DeepSeek has no STT
    'https://openrouter.ai/api': OPENAI_TRANSCRIBE_MODELS,
    'custom': TRANSCRIBE_API_MODELS,
};
