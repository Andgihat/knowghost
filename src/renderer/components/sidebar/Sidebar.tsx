import {useCallback, useEffect, useState} from 'react';
import {
    getState,
    subscribe,
    loadCards,
    createCard,
    selectCard,
    deleteCard,
    updateCardTitle,
    setSearchQuery,
    getFilteredCards,
} from '../../state/cardsStore';
import type {Card} from '../../types';
import {t} from '../../i18n';
import {DeleteCardDialog} from './DeleteCardDialog';
import './Sidebar.scss';

export function Sidebar() {
    const [, rerender] = useState(0);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [collapsed, setCollapsed] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

    useEffect(() => {
        loadCards();
        const unsub = subscribe(() => rerender((n) => n + 1));
        return () => { unsub(); };
    }, []);

    const s = getState();
    const cards = getFilteredCards();

    const handleNew = useCallback(async () => {
        const card = await createCard({title: t('sidebar.newChat')});
        if (card) {
            setEditingId(card.id);
            setEditTitle(card.title);
        }
    }, []);

    const handleSelect = useCallback(async (id: string) => {
        await selectCard(id);
        window.dispatchEvent(new CustomEvent('knowghost:card-selected', {detail: {cardId: id}}));
    }, []);

    const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteTarget(id);
    }, []);

    const handleRenameStart = useCallback((card: Card, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(card.id);
        setEditTitle(card.title);
    }, []);

    const handleRenameCommit = useCallback(async () => {
        if (editingId && editTitle.trim()) {
            await updateCardTitle(editingId, editTitle.trim());
        }
        setEditingId(null);
    }, [editingId, editTitle]);

    const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
    }, []);

    return (
        <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
            {collapsed ? (
                <div className="sidebar__collapsed">
                    <button type="button" className="sidebar__toggle" onClick={() => setCollapsed(false)} title={t('sidebar.expand')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M3 12h18M3 6h18M3 18h18"/>
                        </svg>
                    </button>
                    <button type="button" className="sidebar__new-btn sidebar__new-btn--icon" onClick={handleNew} title={t('sidebar.newChat')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M12 5v14M5 12h14"/>
                        </svg>
                    </button>
                    {cards.slice(0, 8).map((card) => (
                        <div
                            key={card.id}
                            className={`sidebar__card-mini ${card.id === s.activeCardId ? 'sidebar__card-mini--active' : ''} ${card.type === 'summary' ? 'sidebar__card-mini--summary' : ''}`}
                            onClick={() => handleSelect(card.id)}
                            title={card.title}
                        >
                            {card.type === 'summary' ? '📋' : '💬'}
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    <div className="sidebar__header">
                        <button type="button" className="sidebar__toggle" onClick={() => setCollapsed(true)} title={t('sidebar.collapse')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M3 12h18M3 6h18M3 18h18"/>
                            </svg>
                        </button>
                        <button type="button" className="sidebar__new-btn" onClick={handleNew}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                <path d="M12 5v14M5 12h14"/>
                            </svg>
                            {t('sidebar.newChat')}
                        </button>
                    </div>

                    <div className="sidebar__search">
                        <input
                            type="text"
                            placeholder={t('sidebar.search')}
                            value={s.searchQuery}
                            onChange={handleSearch}
                            className="sidebar__search-input"
                        />
                    </div>

                    <div className="sidebar__list">
                        {cards.length === 0 && !s.loading && (
                            <div className="sidebar__empty">{t('sidebar.empty')}</div>
                        )}
                        {cards.map((card) => (
                            <div
                                key={card.id}
                                className={`sidebar__card ${card.id === s.activeCardId ? 'sidebar__card--active' : ''} ${card.type === 'summary' ? 'sidebar__card--summary' : ''}`}
                                onClick={() => handleSelect(card.id)}
                            >
                                {card.type === 'summary' && (
                                    <span className="sidebar__card-icon" title={t('sidebar.summary')}>📋</span>
                                )}
                                <div className="sidebar__card-content">
                                    {editingId === card.id ? (
                                        <input
                                            type="text"
                                            className="sidebar__card-edit"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onBlur={handleRenameCommit}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleRenameCommit();
                                                if (e.key === 'Escape') setEditingId(null);
                                            }}
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <>
                                            <span className="sidebar__card-title">{card.title}</span>
                                            {card.tags.length > 0 && (
                                                <div className="sidebar__card-tags">
                                                    {card.tags.slice(0, 3).map((tag) => (
                                                        <span key={tag} className="sidebar__card-tag">{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                <div className="sidebar__card-actions">
                                    <button
                                        type="button"
                                        className="sidebar__card-action"
                                        onClick={(e) => handleRenameStart(card, e)}
                                        title={t('sidebar.rename')}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        className="sidebar__card-action sidebar__card-action--danger"
                                        onClick={(e) => handleDelete(e, card.id)}
                                        title={t('sidebar.delete')}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
            <DeleteCardDialog
                open={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={() => {
                    if (deleteTarget) deleteCard(deleteTarget);
                    setDeleteTarget(null);
                }}
            />
        </aside>
    );
}
