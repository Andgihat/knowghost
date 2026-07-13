// noinspection JSUnusedGlobalSymbols
// noinspection XmlDeprecatedElement

import {Checkbox, FormControlLabel, TextField} from '@mui/material';
import {t} from '../../../i18n';

type Props = {
    transcriptionPrompt: string;
    llmPrompt: string;
    useDefaultLlmPrompt: boolean;
    onChangeTranscription: (value: string) => void;
    onChangeLlm: (value: string) => void;
    onChangeUseDefault: (value: boolean) => void;
};

export function PromptSettingsSection({transcriptionPrompt, llmPrompt, useDefaultLlmPrompt, onChangeTranscription, onChangeLlm, onChangeUseDefault}: Props) {
    return (
        <section className="settings-card card">
            <h3 className="settings-card__title">Prompts</h3>
            <div className="ai-settings__grid">
                <div className="settings-field">
                    <TextField
                        label="Transcription prompt"
                        value={transcriptionPrompt}
                        onChange={(event) => onChangeTranscription(event.target.value)}
                        fullWidth
                        multiline
                        minRows={3}
                        placeholder="Optional: appended to transcription requests"
                    />
                </div>
                <div className="settings-field">
                    <FormControlLabel
                        control={<Checkbox checked={useDefaultLlmPrompt} onChange={(_, v) => onChangeUseDefault(v)}/>}
                        label={t('ai.llmPromptUseDefault')}
                    />
                    <TextField
                        label={t('ai.llmPrompt')}
                        value={useDefaultLlmPrompt ? t('ai.llmPromptDefault') : llmPrompt}
                        onChange={(event) => onChangeLlm(event.target.value)}
                        fullWidth
                        multiline
                        minRows={3}
                        placeholder={t('ai.llmPromptPlaceholder')}
                        disabled={useDefaultLlmPrompt}
                    />
                </div>
            </div>
        </section>
    );
}
