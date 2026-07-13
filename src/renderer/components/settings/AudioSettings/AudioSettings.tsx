// noinspection XmlDeprecatedElement

import {useEffect, useState} from 'react';
import {MenuItem, TextField} from '@mui/material';
import {toast} from 'react-toastify';
import {useSettingsContext} from '../SettingsView/SettingsView';
import type {AudioDeviceInfo} from '@shared/ipc';
import {logger} from '../../../utils/logger';
import {emitSettingsChange} from '../../../utils/settingsEvents';
import {t} from '../../../i18n';
import './AudioSettings.scss';

const AUDIO_INPUT_TYPES: { value: 'microphone' | 'system' | 'mixed'; labelKey: string }[] = [
    {value: 'microphone', labelKey: 'audio.mic'},
    {value: 'system', labelKey: 'audio.system'},
    {value: 'mixed', labelKey: 'audio.mixed'},
];

type MessageTone = 'success' | 'error';

export const AudioSettings = () => {
    const {settings, patchLocal} = useSettingsContext();
    const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        void loadDevices();
    }, []);

    const showMessage = (text: string, tone: MessageTone = 'success') => {
        if (tone === 'success') return;
        toast[tone](text);
    };

    const loadDevices = async () => {
        setLoading(true);
        try {
            const list = await window.api.audio.listDevices();
            setDevices(list);
        } catch (error) {
            logger.error('settings', 'Failed to load audio devices', {error});
            setDevices([]);
            showMessage(t('audio.loadDevicesFailed'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleInputTypeChange = async (type: 'microphone' | 'system' | 'mixed') => {
        try {
            await window.api.settings.setAudioInputType(type);
            patchLocal({audioInputType: type});
            emitSettingsChange('audioInputType', type);
        } catch (error) {
            logger.error('settings', 'Failed to set audio input type', {error});
            showMessage(t('audio.inputTypeFailed'), 'error');
        }
    };

    const handleDeviceChange = async (deviceId: string) => {
        try {
            await window.api.settings.setAudioInputDevice(deviceId);
            patchLocal({audioInputDeviceId: deviceId});
        } catch (error) {
            logger.error('settings', 'Failed to set audio input device', {error});
            showMessage(t('audio.deviceFailed'), 'error');
        }
    };

    const deviceOptions = [{value: '', label: t('audio.defaultDevice')}, ...devices.map((device) => ({
        value: device.id,
        label: device.name
    }))];
    const currentDeviceId = settings.audioInputDeviceId ?? '';
    const renderDeviceLabel = (value: string) => {
        if (!value) return t('audio.defaultDevice');
        return deviceOptions.find((option) => option.value === value)?.label ?? t('audio.defaultDevice');
    };

    return (
        <div className="audio-settings">
            <section className="settings-card card">
                <h3 className="settings-card__title">{t('audio.source')}</h3>
                <div className="settings-field">
                    <TextField
                        select
                        size="small"
                        label={t('audio.inputType')}
                        value={settings.audioInputType ?? 'mixed'}
                        onChange={(event) => handleInputTypeChange(event.target.value as 'microphone' | 'system' | 'mixed')}
                        fullWidth
                    >
                        {AUDIO_INPUT_TYPES.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {t(option.labelKey)}
                            </MenuItem>
                        ))}
                    </TextField>
                </div>

                {settings.audioInputType === 'system' ? null : (
                    <div className="settings-field">
                        <TextField
                            select
                            size="small"
                            label={t('audio.device')}
                            value={currentDeviceId}
                            onChange={(event) => handleDeviceChange(event.target.value)}
                            fullWidth
                            slotProps={{
                                select: {
                                    displayEmpty: true,
                                    renderValue: (value) => renderDeviceLabel((value as string) ?? ''),
                                },
                                inputLabel: {shrink: true},
                            }}
                        >
                            {deviceOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </TextField>
                        <div className="audio-settings__actions">
                            <button type="button" className="btn btn-sm" onClick={loadDevices} disabled={loading}>
                                {t('audio.refreshDevices')}
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};
