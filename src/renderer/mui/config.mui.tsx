import {alpha, createTheme, PaletteOptions, Theme, ThemeOptions} from '@mui/material/styles';

type Mode = 'dark' | 'light';

const darkPalette: PaletteOptions = {
    mode: 'dark',
    primary: {main: '#db704b', light: '#e8926e', dark: '#a8502e'},
    secondary: {main: '#38bdf8'},
    background: {default: '#080c14', paper: 'rgba(10, 14, 22, 0.95)'},
    text: {primary: '#f1f5f9', secondary: '#cbd5f5'},
    divider: 'rgba(148, 163, 184, 0.18)',
};

const lightPalette: PaletteOptions = {
    mode: 'light',
    primary: {main: '#db704b', light: '#e8926e', dark: '#a8502e'},
    secondary: {main: '#0284c7'},
    background: {default: '#f3f4f8', paper: 'rgba(255, 255, 255, 0.98)'},
    text: {primary: '#1e293b', secondary: '#475569'},
    divider: 'rgba(15, 23, 42, 0.12)',
};

const primaryMain = '#db704b';

const menuScrollbar = {
    scrollbarWidth: 'thin' as const,
    scrollbarColor: `${primaryMain} rgba(219, 112, 75, 0.18)`,
    '&::-webkit-scrollbar': {
        width: '10px',
    },
    '&::-webkit-scrollbar-track': {
        background: 'linear-gradient(180deg, rgba(12,17,27,0.95), rgba(12,17,27,0.75))',
        borderRadius: '9999px',
        boxShadow: 'inset 0 0 0 1px rgba(219, 112, 75, 0.12)',
    },
    '&::-webkit-scrollbar-thumb': {
        background: 'linear-gradient(180deg, #e8926e, #db704b) !important',
        borderRadius: '9999px',
        border: '2px solid rgba(12, 17, 27, 0.9) !important',
        boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.12) !important',
        transition: 'background 200ms ease, box-shadow 200ms ease',
    },
    '&::-webkit-scrollbar-thumb:hover': {
        background: 'linear-gradient(180deg, #e8926e, #db704b) !important',
        boxShadow: 'inset 0 1px 2px rgba(255, 255, 255, 0.2), 0 0 6px rgba(219, 112, 75, 0.18) !important',
    },
};

const makeComponents = (mode: Mode, palette: PaletteOptions): ThemeOptions['components'] => {
    const isDark = mode === 'dark';
    const text = (palette.text as { primary: string; secondary: string });
    const bg = (palette.background as { default: string; paper: string });

    // Поверхности/границы, зависящие от темы.
    const inputBg = isDark ? 'rgba(0, 0, 0, 0.1)' : 'rgba(15, 23, 42, 0.03)';
    const inputBgFocus = isDark ? 'rgba(0, 0, 0, 0.16)' : 'rgba(15, 23, 42, 0.05)';
    const outlineColor = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.12)';
    const outlineHover = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 23, 42, 0.28)';
    const containedBg = isDark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)'
        : 'linear-gradient(135deg, rgba(219,112,75,0.12) 0%, rgba(219,112,75,0.05) 100%)';
    const containedBgHover = isDark
        ? 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)'
        : 'linear-gradient(135deg, rgba(219,112,75,0.18) 0%, rgba(219,112,75,0.08) 100%)';
    const containedText = isDark ? '#f8fafc' : '#7c2d12';
    const menuPaperBg = isDark ? 'transparent !important' : 'rgba(255, 255, 255, 0.9) !important';
    const dialogBg = isDark ? '#0005' : 'rgba(255, 255, 255, 0.88)';
    const dialogBorder = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.08)';
    const backdropBg = isDark ? 'rgba(4, 6, 12, 0.6)' : 'rgba(15, 23, 42, 0.22)';
    const labelColor = isDark ? 'rgba(196, 205, 222, 0.78)' : 'rgba(51, 65, 85, 0.82)';

    return {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    backgroundColor: bg.default,
                    color: text.primary,
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    borderRadius: '18px',
                    padding: 0,
                    background: dialogBg,
                    border: `1px solid ${dialogBorder}`,
                    boxShadow: '0 30px 90px rgba(4, 6, 12, 0.6)',
                    backdropFilter: 'none',
                    backgroundColor: dialogBg,
                    '&.MuiDialog-paperScrollPaper': {
                        maxHeight: '90vh',
                    },
                },
            },
            defaultProps: {
                fullWidth: true,
                maxWidth: 'sm',
            },
        },
        MuiDialogContent: {
            styleOverrides: {
                root: {
                    padding: '24px',
                    backgroundColor: 'transparent',
                },
            },
        },
        MuiDialogActions: {
            styleOverrides: {
                root: {
                    padding: '20px 24px',
                    gap: '12px',
                    backgroundColor: 'transparent',
                },
            },
        },
        MuiBackdrop: {
            styleOverrides: {
                root: {
                    backdropFilter: 'blur(12px)',
                    backgroundColor: backdropBg,
                },
            },
        },
        MuiButton: {
            defaultProps: {
                disableElevation: true,
            },
            styleOverrides: {
                root: {
                    borderRadius: '12px',
                    textTransform: 'none',
                    fontWeight: 600,
                    letterSpacing: '0.015em',
                    paddingInline: '18px',
                    paddingBlock: '4px',
                    transition: 'all 0.3s ease',
                },
                contained: {
                    color: containedText,
                    background: containedBg,
                    border: 0,
                    boxShadow: '0 1px 8px rgba(0, 0, 0, 0.2)',
                    position: 'relative',
                    overflow: 'hidden',
                    '&:hover': {
                        background: containedBgHover,
                        boxShadow: isDark ? '0 4px 16px rgba(0, 0, 0, 0.35)' : '0 4px 16px rgba(15, 23, 42, 0.14)',
                        borderColor: 'rgba(148, 163, 184, 0.3)',
                    },
                    '&:disabled': {
                        background: isDark ? 'rgba(17, 24, 39, 0.35)' : 'rgba(15, 23, 42, 0.06)',
                        borderColor: 'rgba(148, 163, 184, 0.12)',
                        boxShadow: 'none',
                    },
                },
                outlined: {
                    color: text.primary,
                    border: '0',
                    transition: 'all 0.3s ease',
                    background: isDark
                        ? 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)'
                        : 'linear-gradient(135deg, rgba(15,23,42,0.05) 0%, rgba(15,23,42,0.02) 100%)',
                    boxShadow: isDark ? '0 1px 6px rgba(0, 0, 0, 0.2)' : '0 1px 6px rgba(15, 23, 42, 0.1)',
                    '&:hover': {
                        borderColor: 'rgba(148, 163, 184, 0.3)',
                        background: isDark
                            ? 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)'
                            : 'linear-gradient(135deg, rgba(15,23,42,0.08) 0%, rgba(15,23,42,0.04) 100%)',
                        boxShadow: isDark ? '0 6px 16px rgba(0, 0, 0, 0.3)' : '0 6px 16px rgba(15, 23, 42, 0.14)',
                    },
                },
                text: {
                    color: text.primary,
                },
            },
        },
        MuiFormLabel: {
            styleOverrides: {
                root: {
                    color: labelColor,
                    fontSize: '0.82rem',
                    letterSpacing: '0.04em',
                    textTransform: 'none',
                    '&.Mui-focused': {
                        color: text.primary,
                    },
                },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: {
                    transform: 'translate(14px, 12px) scale(1)',
                    '&.MuiInputLabel-shrink': {
                        transform: 'translate(14px, -8px) scale(0.85)',
                    },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    borderRadius: '14px',
                    backgroundColor: inputBg,
                    transition: 'all 0.2s ease',
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: outlineColor,
                        transition: 'all 0.3s ease',
                        borderWidth: '1px',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: outlineHover,
                        borderWidth: '1px',
                    },
                    '&.Mui-focused': {
                        backgroundColor: inputBgFocus,
                        boxShadow: isDark ? '0 0 0 1px rgba(255, 255, 255, 0.06)' : '0 0 0 1px rgba(219, 112, 75, 0.18)',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: outlineHover,
                        borderWidth: '1px',
                    },
                },
                input: {
                    color: text.primary,
                    padding: '9px 14px 12px',
                },
                multiline: {
                    padding: 0,
                },
            },
        },
        MuiTextField: {
            defaultProps: {
                variant: 'outlined',
                fullWidth: true,
            },
        },
        MuiMenu: {
            defaultProps: {
                disablePortal: false,
                slotProps: {
                    backdrop: {
                        invisible: true,
                        sx: {
                            backgroundColor: 'transparent',
                            backdropFilter: 'none',
                        },
                    },
                },
            },
            styleOverrides: {
                paper: {
                    borderRadius: '16px',
                    marginTop: '8px',
                    border: `1px solid ${alpha(primaryMain, 0.35)}`,
                    backgroundColor: menuPaperBg,
                    backdropFilter: 'blur(18px) saturate(160%)',
                    color: text.primary,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
                    overflow: 'hidden',
                    maxHeight: '60vh',
                    ...menuScrollbar,
                },
                list: {
                    paddingTop: '8px',
                    paddingBottom: '8px',
                    backgroundColor: 'transparent',
                    overflowY: 'auto',
                    maxHeight: 'inherit',
                    ...menuScrollbar,
                    '& .MuiMenuItem-root': {
                        borderRadius: '10px',
                        margin: '4px 8px',
                        fontWeight: 500,
                        fontSize: '0.94rem',
                        color: text.primary,
                        transition: 'background-color 150ms ease, color 150ms ease',
                        '&:hover': {
                            backgroundColor: alpha(primaryMain, isDark ? 0.08 : 0.1),
                        },
                        '&.Mui-selected': {
                            backgroundColor: alpha(primaryMain, isDark ? 0.12 : 0.16),
                            color: text.primary,
                            '&:hover': {
                                backgroundColor: alpha(primaryMain, isDark ? 0.18 : 0.22),
                            },
                        },
                    },
                },
            },
        },
        MuiMenuList: {
            styleOverrides: {
                root: {
                    ...menuScrollbar,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    '&.MuiMenu-paper, &.MuiPopover-paper': {
                        ...menuScrollbar,
                        backgroundColor: menuPaperBg,
                        backdropFilter: 'blur(18px) saturate(160%)',
                        borderColor: alpha(primaryMain, 0.35),
                    },
                },
            },
        },
    };
};

const typography: ThemeOptions['typography'] = {
    fontFamily: `'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif`,
    button: {
        fontWeight: 600,
    },
};

export const makeMuiTheme = (mode: Mode): Theme => {
    const palette = mode === 'light' ? lightPalette : darkPalette;
    return createTheme({
        palette,
        typography,
        components: makeComponents(mode, palette),
    });
};

export const darkTheme = makeMuiTheme('dark');
export const lightTheme = makeMuiTheme('light');

// Обратная совместимость: старый импорт muiTheme = тёмная тема.
export const muiTheme = darkTheme;
