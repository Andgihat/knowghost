import {useEffect, useRef, useState} from 'react';
import {CssBaseline, TextField, ThemeProvider} from '@mui/material';
import {initializeRenderer} from './renderer';
import {setStatus} from './ui/status';
import {SettingsView} from './components/settings/SettingsView/SettingsView';
import {WindowResizer} from './components/common/WindowResizer/WindowResizer';
import {Sidebar} from './components/sidebar/Sidebar';
import {ToastContainer} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './styles/toast.sass';
import {darkTheme, lightTheme} from './mui/config.mui';
import {applyThemeAttribute, normalizeThemeMode, THEME_CHANGED_EVENT, ThemeMode} from './ui/theme';
import {t} from './i18n';

function AuthenticatedApp() {
    const initializedRef = useRef(false);
    const [activeTab, setActiveTab] = useState<'main' | 'settings'>('main');

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;
        initializeRenderer().catch((error) => {
            console.error(error);
            setStatus('Initialization error', 'error');
        });
    }, []);

    return (
        <div className="app-grid disable-tap-select relative fr h-screen min-w-[330px]">
            <WindowResizer/>

            {activeTab === 'main' && <Sidebar/>}
            <div className="fc flex-1 min-w-0">
            <header className="app-topbar frbc px-3 py-2 drag-region">
                <div id="status" className="status-badge ready">{t('status.ready')}</div>
                <div className="topbar-actions no-drag frsc gap-1">
                    <button
                        type="button"
                        className={`topbar-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab(activeTab === 'settings' ? 'main' : 'settings')}
                        title={t('topbar.settings')}
                        aria-label={t('topbar.settings')}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3"/>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                    <button id="closeBtn" className="topbar-btn topbar-btn--close" type="button"
                            title={t('topbar.close')} aria-label={t('topbar.close')}>
                        <svg width="14" height="14" viewBox="0 0 12 12">
                            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                        </svg>
                    </button>
                </div>
            </header>

            <main className="app-main fc flex-1 overflow-hidden">
                <div className="chat-view fc flex-1 overflow-hidden" hidden={activeTab !== 'main'}>
                    <div id="chatOut"
                         className="chat-history enable-tap-select-text flex-1 overflow-auto px-3 py-3"/>

                    <div className="composer">
                        <div className="composer__durations">
                            <span className="composer__dur-label">{t('composer.recent')}</span>
                            <div id="durations" className="flex flex-wrap gap-1.5"/>
                        </div>

                        <div id="waveform-container" className="composer__wave"/>

                        <div className="composer__input">
                            <button id="btnToggleInput" type="button" className="composer__icon-btn"
                                    title={t('composer.mic')}>
                                <img id="toggleInputIcon" src="img/icons/mic.png" alt="MIC"/>
                            </button>
                            <button id="btnScreenshot" type="button" className="composer__icon-btn"
                                    title={t('composer.screenshot')}>
                                <img src="img/icons/image.png" alt="Screenshot"/>
                            </button>
                            <TextField
                                id="textInput"
                                placeholder={t('composer.askPlaceholder')}
                                fullWidth
                                variant="outlined"
                                size="small"
                                multiline
                                minRows={1}
                                maxRows={4}
                            />
                            <button id="btnSendText" className="composer__send" type="button" disabled
                                    title={t('composer.send')} aria-label={t('composer.send')}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 19V5M5 12l7-7 7 7"/>
                                </svg>
                            </button>
                        </div>

                        <div id="composerImageArea" className="composer__image-area"/>

                        <div className="composer__row2">
                            <button id="btnRecord" className="composer__audio" data-state="idle" type="button">
                                {t('composer.audioLoop')}
                            </button>
                            <div className="composer__spacer"/>
                            <button id="btnSummary" className="composer__mini composer__mini--accent" type="button" title={t('composer.summaryTitle')}>
                                {t('composer.summary')}
                            </button>
                            <button id="btnSaveCard" className="composer__mini" type="button" title={t('composer.saveCardTitle')}>
                                {t('composer.saveCard')}
                            </button>
                            <button id="btnStopStream" className="composer__mini hidden" type="button">
                                {t('composer.stop')}
                            </button>
                            <button id="btnClearHistory" className="composer__mini" type="button">
                                {t('composer.clear')}
                            </button>
                        </div>

                        <div id="streamResultsSection" className="composer__stream hidden">
                            <div className="label mb-2">{t('composer.streamResults')}</div>
                            <div className="flex gap-2">
                                <TextField
                                    id="streamResultsTextarea"
                                    placeholder={t('composer.streamPlaceholder')}
                                    variant="outlined"
                                    multiline
                                    minRows={4}
                                    fullWidth
                                />
                                <button id="btnSendStreamText" className="composer__send self-start" type="button"
                                        disabled aria-label={t('composer.send')}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 19V5M5 12l7-7 7 7"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="content-area fc overflow-auto flex-1 px-4 pb-4" hidden={activeTab !== 'settings'}>
                    <SettingsView/>
                </div>
            </main>
            </div>
        </div>
    );
}

export function App() {
    // Регистрация/вход убраны — приложение работает без аккаунта.
    const [mode, setMode] = useState<ThemeMode>('dark');

    useEffect(() => {
        let mounted = true;
        window.api.settings.get()
            .then((settings) => {
                if (!mounted) return;
                const next = normalizeThemeMode(settings?.theme);
                setMode(next);
                applyThemeAttribute(next);
            })
            .catch(() => applyThemeAttribute('dark'));

        const onThemeChange = (event: Event) => {
            const next = normalizeThemeMode((event as CustomEvent<ThemeMode>).detail);
            setMode(next);
        };
        window.addEventListener(THEME_CHANGED_EVENT, onThemeChange);
        return () => {
            mounted = false;
            window.removeEventListener(THEME_CHANGED_EVENT, onThemeChange);
        };
    }, []);

    return (
        <ThemeProvider theme={mode === 'light' ? lightTheme : darkTheme}>
            <CssBaseline/>
            <AuthenticatedApp/>
            <ToastContainer
                position="top-center"
                style={{marginTop: 49}}
                autoClose={3200}
                newestOnTop
                pauseOnFocusLoss={false}
                pauseOnHover
                theme={mode}
                closeOnClick
            />
        </ThemeProvider>
    );
}

export default App;
