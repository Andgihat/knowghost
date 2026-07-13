# Knowghost

Десктоп-ассистент для собеседований/экзаменов: слушает системный звук, распознаёт речь, отвечает через LLM и остаётся невидимым для захвата и шаринга экрана.

- **LLM**: любой OpenAI-совместимый эндпоинт (DeepSeek, OpenRouter, локальный llama.cpp / TabbyAPI) — свой base URL, ключ и модель.
- **Речь → текст**: whisper.cpp (установка в один клик — CPU или GPU-сборка) либо подключение своего whisper-сервера.
- **Vision**: отдельный эндпоинт/ключ/модель для анализа экрана (опционально).
- **Невидимость**: окно исключено из захвата экрана (`WDA_EXCLUDEFROMCAPTURE`).

## Разработка

```bash
npm install
npm run dev        # запуск в dev-режиме (Tauri)
npm run build      # сборка десктоп-приложения
npm run typecheck  # проверка типов
```

Стек: Tauri 2 (Rust) + React/TypeScript + Vite + MUI.

## Лицензия

GPL-3.0 (форк проекта xexamai). См. [LICENSE](LICENSE).
