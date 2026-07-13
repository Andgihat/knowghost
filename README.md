<div align="center">

  # KnowGhost

  **Your smart free assistant for interviews and exams**

  [![Download Latest Release](https://img.shields.io/badge/Download-Latest%20Release-blue?style=for-the-badge)](https://github.com/Andgihat/knowghost/releases/latest)
  [![English](https://img.shields.io/badge/English-blue?style=for-the-badge)](README.md)
  [![Русский](https://img.shields.io/badge/Русский-red?style=for-the-badge)](README_RU.md)

</div>

## ✦ Key Features

- **Stealth mode** — window is excluded from screen capture, stays hidden during Zoom, Google Meet, Teams, and other screen sharing
- **Speech recognition** — one-click whisper.cpp installer (CPU or GPU/CUDA), or bring your own whisper-server
- **LLM chat** — any OpenAI-compatible endpoint (DeepSeek, OpenRouter, local Ollama)
- **Vision** — paste screenshots into chat (`Ctrl+V`), or capture & analyze screen via a dedicated vision model
- **Card storage** — save conversations to searchable cards, auto-save while chatting
- **Local AI** — run models locally for privacy and speed
- **Cross-platform** — Windows, macOS, Linux
- **i18n** — English and Russian UI

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

### Local LLM

1. In settings: `Mode → LLM` = `Local`
2. Choose a model (e.g. `qwen3:4b` for low-spec PCs)
3. Install [Ollama](https://ollama.com/)
4. `ollama pull qwen3:4b` then `ollama serve`

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
