# XEXAMAI — Анализ проекта

## Обзор

AI Interview Assistant — Tauri v2 десктопное приложение. Записывает аудио с собеседования, транскрибирует, отправляет в LLM, получает ответы. Прозрачное окно поверх других приложений.

**Стек:** Rust (backend) + React/TypeScript (frontend) + Vite + MUI + Tailwind 4 + SCSS

**Объём:** ~11,900 строк кода (4,200 Rust + 7,700 TS/TSX/SCSS)

**Версия:** 2.2.1

---

## Архитектура

```
┌─────────────────────────────────────────────┐
│                   Frontend                   │
│  React/MUI/Tailwind ──── Vite dev/build     │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ │
│  │ Settings  │ │   Main    │ │  Profile   │ │
│  │  (tabs)   │ │  (chat +  │ │  (auth)    │ │
│  │           │ │  controls)│ │            │ │
│  └─────┬─────┘ └─────┬─────┘ └─────┬──────┘ │
│        │             │             │         │
│  ┌─────┴─────────────┴─────────────┴──────┐ │
│  │     StreamController (896 строк)       │ │
│  │  audio session → transcribe → LLM      │ │
│  └────────────────┬───────────────────────┘ │
│                   │                          │
│  ┌────────────────┴───────────────────────┐ │
│  │     nativeAssistant.ts (1392 строки)   │ │
│  │  OpenAI / Gemini / Ollama клиенты      │ │
│  └────────────────┬───────────────────────┘ │
└───────────────────┼─────────────────────────┘
                    │ Tauri IPC (invoke + events)
┌───────────────────┼─────────────────────────┐
│                   │        Backend (Rust)    │
│  ┌────────────────┴───────────────────────┐ │
│  │          main.rs (672 строки)          │ │
│  │  ~35 Tauri commands, window mgmt       │ │
│  └──┬──────┬──────┬──────┬──────┬────────┘ │
│     │      │      │      │      │           │
│  audio  transcr  config  hotkeys  local_   │
│  .rs    .rs      .rs     .rs      speech.rs │
│  1421   244      141     97       777       │
└─────────────────────────────────────────────┘
```

---

## Backend (Rust) — 14 файлов, ~4,200 строк

### Файлы по сложности

| Файл | Строки | Сложность | Назначение |
|------|--------|-----------|------------|
| audio.rs | 1,421 | ★★★★★ | Захват аудио: WASAPI loopback, CPAL, микшер, Win32 COM unsafe |
| local_speech.rs | 777 | ★★★★ | FastWhisper: скачивание, установка, запуск, health check, Windows реестр |
| main.rs | 672 | ★★★ | Точка входа, ~35 команд, window management, deep links, tray |
| types.rs | 398 | ★★ | AppConfig (~30 полей), FastWhisperStatus |
| transcription.rs | 244 | ★★★ | 3 бэкенда: OpenAI API / локальный whisper / Google Gemini |
| config.rs | 141 | ★★ | JSON конфиг, merge патчей, persistence |
| tray.rs | 126 | ★★ | Системный трей |
| auth.rs | 103 | ★★ | OAuth deep link парсинг, очередь токенов |
| hotkeys.rs | 97 | ★ | Глобальные хоткеи |
| whisper_server.rs | 85 | ★ | Процесс whisper-server.exe |
| constants.rs | 46 | — | Константы (дефолты, URL) |
| oauth.rs | 37 | — | Построение OAuth URL |
| resources.rs | 34 | — | Путь к звуковым файлам |

### Межмодульные зависимости

```
main.rs ──→ config, hotkeys, local_speech, auth, audio, tray, transcription, whisper_server, constants, types
auth.rs ──→ constants, types
config.rs ──→ constants, types
hotkeys.rs ──→ types
local_speech.rs ──→ constants, types
audio.rs ──→ (standalone, no internal deps)
oauth.rs ──→ constants
tray.rs ──→ main.rs (show_main_window)
transcription.rs ──→ config
whisper_server.rs ──→ (standalone)
resources.rs ──→ (standalone)
```

### Зависимости (Cargo.toml)

| Крейт | Версия | Назначение |
|-------|--------|------------|
| tauri | 2.9.3 | Фреймворк приложения |
| reqwest | 0.12 | HTTP клиент |
| tokio | 1.39 | Async runtime |
| cpal | 0.15 | Кроссплатформенный аудио захват |
| windows | 0.60 | Win32 COM (WASAPI loopback) |
| serde/serde_json | 1.0 | Сериализация |
| zip | 0.6 | Распаковка архивов |
| image | 0.25 | Загрузка иконок |
| crossbeam-channel | 0.5 | Конкурентные каналы |
| base64 | 0.22 | Кодирование аудио |
| anyhow/thiserror | 1.0 | Обработка ошибок |
| uuid | 1.8 | Генерация ID |
| url/urlencoding | 2.x | Парсинг URL |
| once_cell | 1.19 | Глобальные статики |
| futures-util | 0.3 | Async утилиты |
| bytemuck | 1.15 | Zero-cost type casting |
| winreg | 0.52 | Windows реестр (win-only) |
| chrono | 0.4 | Таймстемпы |
| rand | 0.8 | Случайные значения |
| flate2 | 1.0 | Сжатие |
| serde_with | 3.9 | Продвинутый serde |

**Tauri плагины:** deep-link, global-shortcut, http, opener, shell, single-instance, clipboard-manager

---

## Frontend (TypeScript/React) — ~70 файлов, ~7,700 строк

### Ядро логики

| Файл | Строки | Сложность | Назначение |
|------|--------|-----------|------------|
| AiSettings.tsx | 1,623 | ★★★★ | Настройки AI: все модели, ключи, локальные серверы |
| nativeAssistant.ts | 1,392 | ★★★★★ | API клиент: OpenAI, Gemini, Ollama, стриминг, транскрипция |
| streamController.ts | 896 | ★★★★ | Основной контроллер: запись → транскрипция → LLM → ответ |
| LoginView.tsx | 418 | ★★★ | Экран логина (OAuth + email) |
| ipc.ts | 368 | ★★ | Типы: AppSettings, AssistantAPI, IPC каналы |
| authClient.ts | 370 | ★★★ | JWT авторизация, refresh, retry |
| GeneralSettings.tsx | 347 | ★★ | Настройки окна, opacity, scale |
| config.mui.tsx | 324 | ★★ | MUI тёмная тема (фиолет + glass) |
| welcomeModal.tsx | 312 | ★★ | Приветственная модалка |
| recorder.ts | 263 | ★★★ | Запись аудио, кольцевой буфер |
| CustomSelect.tsx | 264 | ★★ | Кастомный дропдаун с порталами |
| auth-context.tsx | 261 | ★★★ | React auth провайдер |
| nativeAssistant.network.ts | 223 | ★★★ | CORS обход для Ollama через Tauri HTTP |
| errorFormatter.ts | 216 | ★★ | Форматирование ошибок для UI |
| featureAccessModal.tsx | 207 | ★★ | Модалка тир-гейта (сейчас отключена) |

### Сервисы

| Файл | Строки | Назначение |
|------|--------|------------|
| browserAudioCapture.ts | 263 | Fallback: Web Audio API захват |
| localSpeechModels.ts | 170 | Whisper модели: проверка, скачивание |
| googleStreamingService.ts | 174 | Google Gemini Live API |
| ollama.ts | 153 | Ollama: проверка, скачивание, warmup, кеш |
| nativeAudio.ts | 111 | Бридж: Rust → TS аудио чанки |
| encoder.ts | 185 | WAV кодирование |
| ringBuffer.ts | 174 | Blob кольцевой буфер |
| visualizer.ts | 181 | Визуализатор аудио |
| pcmRingBuffer.ts | 87 | PCM кольцевой буфер |

### UI компоненты

| Файл | Строки | Назначение |
|------|--------|------------|
| controls.ts | 189 | Управление кнопками (DOM) |
| outputs.ts | 153 | Вывод ответов (markdown) |
| waveform.ts | 34 | Canvas визуализация |
| logoAnimation.ts | 36 | Анимация логотипа |
| stopButton.ts | 25 | Toggle кнопки стоп |
| status.ts | 15 | Статус бейдж |
| WindowResizer.tsx | 176 | 8-направленный ресайз окна |
| BetaFeedbackWidget.tsx | 27 | Кнопка баг-репорта |
| BugReportModal.tsx | 175 | Форма баг-репорта |
| ProfileView.tsx | 129 | Карточка профиля |
| LoadingScreen.tsx | 61 | Экран загрузки |

### Настройки (Settings)

| Файл | Строки | Назначение |
|------|--------|------------|
| SettingsView.tsx | 100 | Контейнер вкладок (General/AI/Audio/Hotkeys) |
| GeneralSettings.tsx | 347 | Окно: always-on-top, opacity, scale, размер |
| AiSettings.tsx | 1,623 | AI: модели, ключи, локальные серверы |
| AudioSettings.tsx | 133 | Аудио: тип ввода, устройство |
| HotkeysSettings.tsx | 212 | Длительности, хоткеи |

### Утилиты

| Файл | Строки | Назначение |
|------|--------|------------|
| settingsStore.ts | 54 | Синглтон настроек (observer) |
| useSettings.ts | 68 | React hook настроек |
| logger.ts | 57 | Логирование через Tauri IPC |
| features.ts | 53 | Тир-логика (сейчас always true) |
| transcriptionGuards.ts | 60 | Проверка готовности перед записью |
| featureAccess.ts | 17 | Gate функция |
| settingsEvents.ts | 7 | Кастомные события |
| errorFormatter.ts | 216 | Форматирование ошибок |

### Стили

| Файл | Строки | Назначение |
|------|--------|------------|
| AiSettings.scss | 148 | AI настройки: грид, статус, хинты |
| GeneralSettings.scss | 195 | Основные настройки: слайдеры, чекбоксы |
| CustomSelect.scss | 176 | Дропдаун: backdrop-blur, анимации |
| SettingsView.scss | 62 | Табы, скроллбар |
| WindowResizer.scss | 72 | Handles ресайза |
| HotkeysSettings.scss | 59 | Хоткеи |
| AudioSettings.scss | 11 | Аудио |
| toast.sass | — | Тосты |
| styles.css | — | Глобальные стили |

---

## Файловая структура

```
xexamai/
├── package.json
├── tsconfig.json
├── vite.config.mts
├── src/
│   ├── renderer/
│   │   ├── main.tsx              # Точка входа React
│   │   ├── App.tsx               # Главный компонент
│   │   ├── renderer.ts           # Инициализация UI
│   │   ├── types.ts              # Re-export shared/ipc
│   │   ├── styles.css            # Глобальные стили
│   │   ├── global.d.ts           # Window.api типы
│   │   ├── index.html            # HTML entry
│   │   ├── wide-classes.min.css  # Утилитарные CSS классы
│   │   ├── app/
│   │   │   ├── audioSession.ts          # Facade
│   │   │   ├── audioSession/
│   │   │   │   ├── internalState.ts     # Mutable singleton
│   │   │   │   ├── recorder.ts          # Core recording
│   │   │   │   ├── audioInput.ts        # Input switching
│   │   │   │   ├── systemTrack.ts       # Persistent system track
│   │   │   │   └── types.ts             # SwitchAudioResult
│   │   │   ├── streamController.ts      # Main controller
│   │   │   ├── screenshotController.ts  # Screenshot → AI
│   │   │   ├── preloadBridge.ts         # Bridge detector
│   │   │   └── fontSizeControls.ts      # Ctrl+scroll zoom
│   │   ├── audio/
│   │   │   ├── encoder.ts               # WAV encoder
│   │   │   ├── ringBuffer.ts            # Blob ring buffer
│   │   │   ├── pcmRingBuffer.ts         # PCM ring buffer
│   │   │   └── visualizer.ts            # Canvas visualizer
│   │   ├── auth/
│   │   │   ├── auth-context.tsx         # React auth provider
│   │   │   └── index.ts                # Re-export
│   │   ├── bridge/
│   │   │   └── tauriApi.ts             # Tauri API bridge
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── LoginView/
│   │   │   │   ├── ProfileView/
│   │   │   │   └── LoadingScreen/
│   │   │   ├── common/
│   │   │   │   ├── WindowResizer/
│   │   │   │   └── CustomSelect/
│   │   │   ├── feedback/
│   │   │   │   ├── BetaFeedbackWidget.tsx
│   │   │   │   ├── BugReportModal.tsx
│   │   │   │   └── useBugReportState.ts
│   │   │   └── settings/
│   │   │       ├── SettingsView/
│   │   │       ├── GeneralSettings/
│   │   │       ├── AiSettings/
│   │   │       │   ├── AiSettings.tsx
│   │   │       │   ├── LlmSelect.tsx
│   │   │       │   ├── ApiModelSelect.tsx
│   │   │       │   ├── PromptSettingsSection.tsx
│   │   │       │   ├── TimeoutSettingsSection.tsx
│   │   │       │   ├── LocalModelSection.tsx
│   │   │       │   ├── useAiSettingsState.ts
│   │   │       │   ├── guards.ts
│   │   │       │   ├── formatters.ts
│   │   │       │   └── *.scss
│   │   │       ├── AudioSettings/
│   │   │       └── HotkeysSettings/
│   │   ├── hooks/
│   │   │   └── useSettings.ts
│   │   ├── mui/
│   │   │   └── config.mui.tsx          # MUI dark theme
│   │   ├── services/
│   │   │   ├── nativeAssistant.ts       # API клиент (1392 строки)
│   │   │   ├── nativeAssistant.helpers.ts
│   │   │   ├── nativeAssistant.network.ts
│   │   │   ├── ollama.ts
│   │   │   ├── localSpeechModels.ts
│   │   │   ├── googleStreamingService.ts
│   │   │   ├── nativeAudio.ts
│   │   │   ├── browserAudioCapture.ts
│   │   │   ├── authClient.ts
│   │   │   └── issuesClient.ts
│   │   ├── state/
│   │   │   ├── appState.ts
│   │   │   └── settingsStore.ts
│   │   ├── ui/
│   │   │   ├── controls.ts
│   │   │   ├── outputs.ts
│   │   │   ├── status.ts
│   │   │   ├── waveform.ts
│   │   │   ├── logoAnimation.ts
│   │   │   ├── welcomeModal.tsx
│   │   │   ├── stopButton.ts
│   │   │   ├── portalRoot.tsx
│   │   │   └── featureAccessModal.tsx
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── settingsEvents.ts
│   │   │   ├── errorFormatter.ts
│   │   │   ├── featureAccess.ts
│   │   │   ├── features.ts
│   │   │   └── transcriptionGuards.ts
│   │   └── styles/
│   │       └── toast.sass
│   └── shared/
│       ├── ipc.ts                # Центральные типы
│       ├── constants.ts          # Модели, размеры
│       ├── appUrls.ts            # URL резолвер
│       └── errorTypes.ts         # Типы ошибок
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   ├── resources/
│   └── src/
│       ├── main.rs               # Entry point
│       ├── types.rs              # AppConfig, статусы
│       ├── constants.rs          # Дефолты
│       ├── config.rs             # Persistence
│       ├── audio.rs              # WASAPI + CPAL захват
│       ├── transcription.rs      # OpenAI/Google/local
│       ├── local_speech.rs       # FastWhisper lifecycle
│       ├── whisper_server.rs     # whisper-server.exe
│       ├── ollama.rs             # Ollama CLI wrapper
│       ├── hotkeys.rs            # Глобальные хоткеи
│       ├── tray.rs               # Системный трей
│       ├── auth.rs               # OAuth deep links
│       ├── oauth.rs              # OAuth URL builder
│       └── resources.rs          # Sound file paths
└── dist/
    └── renderer/                 # Build output
```

---

## Поток данных

### Запись → Транскрипция → LLM

```
1. Пользователь нажимает "Запустить аудио-цикл"
   └→ StreamController.handleRecordToggle(true)
      └→ audioSession.startRecording()
         └→ window.api.audio.startCapture('mixed')
            └→ Rust AudioManager::start() (WASAPI/CPAL)
               └→ emit audio:chunk events (base64 i16 PCM)
                  └→ nativeAudio.ts onAudioChunk()
                     └→ PcmRingBuffer.push(channels)

2. Пользователь выбирает длительность (например 15с)
   └→ StreamController.handleAskWindow(15)
      └→ pcmRingBuffer.getLastSecondsFloats(15)
         └→ encoder.floatsToWav(pcm) → ArrayBuffer
            └→ window.api.assistant.transcribeOnly({arrayBuffer, mime: 'audio/wav'})
               └→ Rust transcribe_audio() command
                  ├→ transcribe_openai() — multipart POST
                  ├→ transcribe_local() — localhost:8868
                  └→ transcribe_google() — Gemini API

3. Транскрипция получена → StreamController.sendChatRequest()
   └→ nativeAssistant.chatCompletionStream()
      ├→ OpenAI: POST /v1/chat/completions (stream=true)
      ├→ Gemini: generateContent (SSE)
      └→ Ollama: POST /api/chat (stream=true)
         └→ emit assistant:stream:delta events
            └→ StreamController обновляет chatOut
```

### Настройки

```
AiSettings.tsx → window.api.settings.setXxx()
   └→ Rust config_update() command
      └→ ConfigState::update(partial)
         └→ JSON merge + normalize + persist
            └→ app.emit("config:updated", config)
               └→ settingsStore.refresh()
                  └→ useSettings() hook → re-render
```

---

## Болевые точки

1. **audio.rs** (1,421 строк) — unsafe Win32 COM, WASAPI loopback с ручным vtable manipulation. Самый сложный файл. Стоит вынести в отдельный крейт/модуль.

2. **nativeAssistant.ts** (1,392 строки) — монолит. Все API клиенты (OpenAI, Gemini, Ollama) + стриминг + транскрипция в одном файле. Разбить на провайдеры.

3. **AiSettings.tsx** (1,623 строки) — огромный компонент со всеми настройками AI. Декомпозировать по секциям.

4. **Два способа захвата аудио** — `nativeAudio.ts` (Rust) + `browserAudioCapture.ts` (Web Audio). Browser fallback для Electron не нужен в Tauri.

5. **Auth код живёт но не используется** — `authClient.ts` (370 строк), `auth-context.tsx` (261 строка), `LoginView.tsx` (418 строк), `ProfileView.tsx` (129 строк). `features.ts` always returns true.

6. **Два менеджера whisper** — `whisper_server.rs` (простой spawn) + `local_speech.rs` (777 строк, полный lifecycle). Первый можно убрать.

7. **Mixed DOM + React** — `controls.ts`, `outputs.ts`, `status.ts`, `waveform.ts` работают через `document.getElementById`. Параллельно с React компонентами. Мигрировать на React.

---

## Рекомендации по рефакторингу

### Приоритет 1 — Убрать мёртвый код
- [ ] Удалить auth код: `authClient.ts`, `auth-context.tsx`, `LoginView.tsx`, `ProfileView.tsx`, `features.ts`, `featureAccess.ts`, `featureAccessModal.tsx`
- [ ] Удалить `browserAudioCapture.ts` (Tauri не нужен Web Audio fallback)
- [ ] Удалить `whisper_server.rs` (оставить только `local_speech.rs`)

### Приоритет 2 — Разбить монолиты
- [ ] `nativeAssistant.ts` → `providers/openai.ts`, `providers/gemini.ts`, `providers/ollama.ts`
- [ ] `AiSettings.tsx` → `AiSettings.tsx` (orchestrator) + `ModelSection.tsx`, `ApiKeysSection.tsx`, `PromptsSection.tsx`, `TimeoutsSection.tsx`, `LocalServerSection.tsx`
- [ ] `audio.rs` → `audio/mod.rs`, `audio/cpal.rs`, `audio/wasapi.rs`, `audio/mixer.rs`

### Приоритет 3 — Миграция DOM → React
- [ ] `controls.ts` → React hooks/components
- [ ] `outputs.ts` → React components (chat, answer, text)
- [ ] `status.ts` → React component
- [ ] `waveform.ts` → React component с canvas ref

### Приоритет 4 — Улучшения
- [ ] Добавить DeepSeek API (модели + ключ)
- [ ] TypeScript strict mode (уже включен, но есть `any`)
- [ ] Unit тесты для ключевых модулей
- [ ] E2E тесты для критических потоков
