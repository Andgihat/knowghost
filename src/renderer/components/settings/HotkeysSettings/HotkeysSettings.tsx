// noinspection JSUnusedGlobalSymbols
// noinspection XmlDeprecatedElement

import {useMemo, useState} from 'react';
import {TextField} from '@mui/material';
import {toast} from 'react-toastify';
import {useSettingsContext} from '../SettingsView/SettingsView';
import {logger} from '../../../utils/logger';
import {emitSettingsChange} from '../../../utils/settingsEvents';
import {t} from '../../../i18n';
import './HotkeysSettings.scss';

const clampDuration = (duration: number) => Math.max(1, Math.min(300, duration));

export const HotkeysSettings = () => {
    const {settings, patchLocal} = useSettingsContext();
    const [newDuration, setNewDuration] = useState('');
    const [durationHotkeys, setDurationHotkeys] = useState<Record<number, string>>(settings.durationHotkeys ?? {});
    const [toggleHotkey, setToggleHotkey] = useState(settings.toggleInputHotkey ?? 'g');
    const [streamSendHotkey, setStreamSendHotkey] = useState(settings.streamSendHotkey ?? '~');

    const durations = useMemo(() => [...(settings.durations ?? [])].sort((a, b) => a - b), [settings.durations]);

    const showMessage = (text: string, tone: 'success' | 'error' = 'success') => {
        toast[tone](text);
    };

    const updateDurations = async (next: number[]) => {
        try {
            await window.api.settings.setDurations(next);
            patchLocal({durations: next});
            emitSettingsChange('durations', next);
            showMessage(t('hotkeys.durationsSaved'));
        } catch (error) {
            logger.error('settings', 'Failed to save durations', {error});
            showMessage(t('hotkeys.durationsSaveFailed'), 'error');
        }
    };

    const addDuration = async () => {
        const raw = Number(newDuration);
        if (Number.isNaN(raw)) {
            showMessage(t('hotkeys.invalidDuration'), 'error');
            return;
        }
        const duration = clampDuration(Math.round(raw));
        if (durations.includes(duration)) {
            showMessage(t('hotkeys.durationExists'), 'error');
            return;
        }
        const next = [...durations, duration].sort((a, b) => a - b);
        await updateDurations(next);
        setNewDuration('');
    };

    const removeDuration = async (duration: number) => {
        const next = durations.filter((value) => value !== duration);
        await updateDurations(next);
        const hotkeys = {...durationHotkeys};
        delete hotkeys[duration];
        setDurationHotkeys(hotkeys);
        await saveDurationHotkeys(hotkeys, false);
    };

    const saveDurationHotkeys = async (map: Record<number, string>, showToast = true) => {
        try {
            await (window.api.settings as any).setDurationHotkeys(map);
            patchLocal({durationHotkeys: map});
            emitSettingsChange('durationHotkeys', map);
            if (showToast) {
                showMessage(t('hotkeys.durationKeysSaved'));
            }
        } catch (error) {
            logger.error('settings', 'Failed to save duration hotkeys', {error});
            if (showToast) {
                showMessage(t('hotkeys.durationKeysFailed'), 'error');
            }
        }
    };

    const saveHotkeyForDuration = async (duration: number) => {
        const value = (durationHotkeys[duration] ?? '').trim();
        if (!value) {
            showMessage(t('hotkeys.keyEmpty'), 'error');
            return;
        }
        const char = value[0].toLowerCase();
        const map = {...durationHotkeys, [duration]: char};
        setDurationHotkeys(map);
        await saveDurationHotkeys(map);
    };

    const saveToggleHotkey = async () => {
        const value = toggleHotkey.trim().toLowerCase();
        if (!value) {
            showMessage(t('hotkeys.keyEmpty'), 'error');
            return;
        }
        try {
            await (window.api.settings as any).setToggleInputHotkey(value);
            patchLocal({toggleInputHotkey: value});
            showMessage(t('hotkeys.toggleSaved'));
        } catch (error) {
            logger.error('settings', 'Failed to save toggle input hotkey', {error});
            showMessage(t('hotkeys.toggleFailed'), 'error');
        }
    };

    const saveStreamSendHotkey = async () => {
        const value = streamSendHotkey.trim();
        if (!value) {
            showMessage(t('hotkeys.keyEmpty'), 'error');
            return;
        }
        const char = value[0];
        try {
            await (window.api.settings as any).setStreamSendHotkey(char);
            patchLocal({streamSendHotkey: char});
            emitSettingsChange('streamSendHotkey', char);
            showMessage(t('hotkeys.streamSaved'));
        } catch (error) {
            logger.error('settings', 'Failed to save stream hotkey', {error});
            showMessage(t('hotkeys.streamFailed'), 'error');
        }
    };

    return (
        <div className="hotkeys-settings">
            <section className="settings-card card">
                <h3 className="settings-card__title">{t('settings.tab.hotkeys')}</h3>

                <div className="hotkeys-duration-list">
                    {durations.map((duration) => (
                        <div className="hotkeys-duration" key={duration}>
                            <span className="hotkeys-duration__label">{duration}s</span>
                            <TextField
                                className="hotkeys-duration__input"
                                placeholder={t('hotkeys.keyPlaceholder')}
                                size="small"
                                value={(durationHotkeys[duration] ?? '').toUpperCase()}
                                onChange={(event) => {
                                    const value = event.target.value.slice(0, 1);
                                    setDurationHotkeys((prev) => ({...prev, [duration]: value.toLowerCase()}));
                                }}
                                inputProps={{maxLength: 1, style: {textTransform: 'uppercase', textAlign: 'center'}}}
                            />
                            <button type="button" className="btn btn-sm hotkeys-duration__save"
                                    onClick={() => saveHotkeyForDuration(duration)}
                                    title={t('common.save')}>
                                ✓
                            </button>
                            <button type="button" className="btn btn-sm btn-danger hotkeys-duration__del"
                                    onClick={() => removeDuration(duration)}
                                    title={t('common.delete')}>
                                ✗
                            </button>
                        </div>
                    ))}
                </div>
                <div className="hotkeys-duration-add">
                    <TextField
                        type="number"
                        placeholder={t('hotkeys.durationPlaceholder')}
                        value={newDuration}
                        sx={{maxWidth: 140}}
                        onChange={(event) => setNewDuration(event.target.value)}
                        inputProps={{min: 1, max: 300}}
                        size="small"
                    />
                    <button type="button" className="btn btn-sm" onClick={addDuration}>
                        {t('hotkeys.addDuration')}
                    </button>
                </div>

                <div className="hotkeys-global">
                    <div className="hotkeys-global__item">
                        <span className="hotkeys-global__label">{t('hotkeys.toggleTitle')}</span>
                        <div className="hotkeys-global__row">
                            <span className="hotkeys-global__prefix">Ctrl-</span>
                            <TextField
                                className="hotkeys-global__input"
                                size="small"
                                value={toggleHotkey.toUpperCase()}
                                onChange={(event) => setToggleHotkey(event.target.value.slice(0, 1).toLowerCase())}
                                inputProps={{maxLength: 1, style: {textTransform: 'uppercase', textAlign: 'center'}}}
                            />
                            <button type="button" className="btn btn-sm" onClick={saveToggleHotkey}
                                    title={t('common.save')}>
                                ✓
                            </button>
                        </div>
                        <span className="hotkeys-global__helper">{t('hotkeys.toggleHelper')}</span>
                    </div>
                    <div className="hotkeys-global__item">
                        <span className="hotkeys-global__label">{t('hotkeys.streamTitle')}</span>
                        <div className="hotkeys-global__row">
                            <span className="hotkeys-global__prefix">Ctrl-</span>
                            <TextField
                                className="hotkeys-global__input"
                                size="small"
                                value={streamSendHotkey}
                                onChange={(event) => setStreamSendHotkey(event.target.value.slice(0, 1))}
                                inputProps={{maxLength: 1, style: {textTransform: 'uppercase', textAlign: 'center'}}}
                            />
                            <button type="button" className="btn btn-sm" onClick={saveStreamSendHotkey}
                                    title={t('common.save')}>
                                ✓
                            </button>
                        </div>
                        <span className="hotkeys-global__helper">{t('hotkeys.streamHelper')}</span>
                    </div>
                </div>
            </section>
        </div>
    );
};
