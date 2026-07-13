<div align="center">

  # KnowGhost

  **Your smart free assistant for interviews and exams**

  [![Download Latest Release](https://img.shields.io/badge/Download-Latest%20Release-blue?style=for-the-badge)](https://github.com/Andgihat/knowghost/releases/latest)
  [![English](https://img.shields.io/badge/English-blue?style=for-the-badge)](README.md)
  [![Русский](https://img.shields.io/badge/Русский-red?style=for-the-badge)](README_RU.md)

</div>

## ✦ Key Features

### 🎤 Speech & Transcription
- **System audio capture** — captures audio directly from your system (Zoom, Teams, browser, any app) without microphone feedback
- **Microphone support** — also works as a classic voice recorder
- **Multi-provider transcription** — OpenAI Whisper, Google AI, Deepgram, or local whisper.cpp (CPU or GPU/CUDA)
- **One-click whisper.cpp installer** — downloads and sets up whisper.cpp automatically, no manual configuration
- **Customizable transcription prompt** — tuned for technical interviews, preserves English terms (APIs, Redis, Postgres, etc.)

### 🤖 AI & Chat
- **LLM-agnostic** — works with any OpenAI-compatible endpoint: DeepSeek, OpenRouter, Google AI, local Ollama, TabbyAPI, or your own custom provider
- **Multimodal chat** — paste images directly into messages (`Ctrl+V`), the LLM sees and understands them (diagrams, code screenshots, whiteboards)
- **Screenshot analysis** — capture screen region or full display and send to a dedicated vision model for analysis
- **Adjustable system prompt** — customize the AI's behavior, or use the built-in prompts that adapt to your UI language
- **Conversation history** — full chat history preserved, scrollable and searchable

### 💾 Card Storage
- **Save any conversation** — press one button to save a full Q&A session into a searchable card
- **Auto-save** — when chatting inside a card, messages are saved automatically — no manual saving needed
- **Search & filter** — find past conversations by title or tags
- **Summary cards** — one-click summarization of any conversation into a concise card

### 👁 Stealth & UI
- **Invisible to screen capture** — the window is excluded from screen recording and screen sharing (Zoom, Google Meet, Teams, OBS, etc.)
- **Always-on-top** — floats above other windows, with adjustable transparency for minimal intrusion
- **Dark & light themes** — MUI-based with orange accent (#db704b)
- **i18n** — English and Russian interface

### ⚡ Other
- **Hotkeys** — customizable shortcuts for quick audio capture and stream sending
- **Local AI** — run both LLM and transcription fully offline for privacy and zero latency
- **Cross-platform** — Windows, macOS, Linux

## ▸ How to Use

### 1. Setup

1. Open KnowGhost
2. Go to `Settings` → `AI`
3. Enter your **API key** (OpenAI, Google AI, or any OpenAI-compatible provider)
4. Choose **LLM Model**
5. Choose **audio input**:
   - `System Audio` — capture sound from apps (Zoom, Teams, etc.)
   - `Microphone` — record your voice
6. Configure **Transcription** model and prompt

### 2. Usage

1. Switch to `Main` tab
2. Click `Start Audio Loop` — recording in the background
3. When needed, press hotkey or `Send Last X Seconds` to get an AI response
4. Get instant answers during interviews or exams

### 3. Tips

- Use **system audio** to capture interviewer's questions
- Adjust **opacity** and **always-on-top** for stealth
- Configure **hotkeys** for quick actions
- Practice before important events

## ⊕ Local Setup

KnowGhost supports fully local operation — no cloud dependency, maximum privacy.

### Local Speech Recognition

1. In settings: `Mode → Transcription` = `Local`
2. Choose `Source` = `Managed` (one-click install) or `External` (your own whisper-server)
3. For managed: pick variant (`CPU` or `GPU/CUDA`), click `Install`
4. The app downloads and sets up whisper.cpp automatically

## ⬇ Download

[Download the latest release](https://github.com/Andgihat/knowghost/releases/latest)

---

<div align="center">
  Made with ❤️ for successful interviews and exams
</div>
