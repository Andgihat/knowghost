import {Dialog, DialogTitle, DialogContent, DialogActions, Button} from '@mui/material';
import {t} from '../../i18n';

type Props = {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export function DeleteCardDialog({open, onClose, onConfirm}: Props) {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{t('sidebar.deleteTitle')}</DialogTitle>
            <DialogContent>
                {t('sidebar.deleteConfirm')}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="secondary">{t('sidebar.deleteCancel')}</Button>
                <Button onClick={onConfirm} variant="contained" color="error" autoFocus>
                    {t('sidebar.deleteConfirmBtn')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
