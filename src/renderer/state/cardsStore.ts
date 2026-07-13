import type {Card, CardMessage, CreateCardRequest} from '../types';
import {invoke} from '@tauri-apps/api/core';
import {toast} from 'react-toastify';
import {t} from '../i18n';

export type CardsState = {
    cards: Card[];
    activeCardId: string | null;
    messages: CardMessage[];
    loading: boolean;
    searchQuery: string;
};

const state: CardsState = {
    cards: [],
    activeCardId: null,
    messages: [],
    loading: false,
    searchQuery: '',
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
    for (const fn of listeners) fn();
}

export function subscribe(fn: Listener) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export function getState() {
    return state;
}

// ── Cards ────────────────────────────────────────────────────────────

export async function loadCards() {
    state.loading = true;
    notify();
    try {
        state.cards = await window.api.db.listCards();
    } catch (error) {
        console.error('[cardsStore] loadCards failed', error);
        state.cards = [];
    } finally {
        state.loading = false;
        notify();
    }
}

export async function createCard(req: CreateCardRequest): Promise<Card | null> {
    try {
        const card = await window.api.db.createCard(req);
        state.cards.unshift(card);
        state.activeCardId = card.id;
        state.messages = [];
        notify();
        return card;
    } catch (error) {
        console.error('[cardsStore] createCard failed', error);
        try { await invoke('debug_log', {msg: `createCard catch: ${String(error).slice(0,200)}`}); } catch {}
        return null;
    }
}

export async function selectCard(id: string | null) {
    state.activeCardId = id;
    state.messages = [];
    if (!id) {
        notify();
        return;
    }
    try {
        state.messages = await window.api.db.listMessages(id);
    } catch (error) {
        console.error('[cardsStore] selectCard failed', error);
        toast.error(t('cards.loadFailed', {error: String(error)}));
    }
    notify();
}

export async function deleteCard(id: string) {
    try {
        await window.api.db.deleteCard(id);
        state.cards = state.cards.filter((c) => c.id !== id);
        if (state.activeCardId === id) {
            state.activeCardId = state.cards[0]?.id ?? null;
            if (state.activeCardId) {
                await selectCard(state.activeCardId);
            } else {
                state.messages = [];
            }
        }
        notify();
    } catch (error) {
        console.error('[cardsStore] deleteCard failed', error);
    }
}

export async function updateCardTitle(id: string, title: string) {
    try {
        const updated = await window.api.db.updateCard({id, title});
        const idx = state.cards.findIndex((c) => c.id === id);
        if (idx >= 0) state.cards[idx] = updated;
        notify();
    } catch (error) {
        console.error('[cardsStore] updateCardTitle failed', error);
    }
}

// ── Messages ─────────────────────────────────────────────────────────

export async function addMessage(cardId: string, role: 'user' | 'assistant', content: string): Promise<CardMessage | null> {
    try {
        await invoke('debug_log', {msg: `addMessage called: cardId=${cardId}, role=${role}, len=${content.length}`});
        const msg = await window.api.db.createMessage({cardId, role, content});
        state.messages.push(msg);
        // Update card's updatedAt
        const idx = state.cards.findIndex((c) => c.id === cardId);
        if (idx >= 0) {
            state.cards[idx].updatedAt = msg.createdAt;
            // Move to top
            const [card] = state.cards.splice(idx, 1);
            state.cards.unshift(card);
        }
        notify();
        return msg;
    } catch (error) {
        console.error('[cardsStore] addMessage failed', error);
        toast.error(t('cards.messageFailed', {error: String(error)}));
        return null;
    }
}

// ── Search ───────────────────────────────────────────────────────────

export function setSearchQuery(query: string) {
    state.searchQuery = query;
    notify();
}

export function getFilteredCards(): Card[] {
    const q = state.searchQuery.toLowerCase().trim();
    if (!q) return state.cards;
    return state.cards.filter(
        (c) =>
            c.title.toLowerCase().includes(q) ||
            c.tags.some((t) => t.toLowerCase().includes(q)),
    );
}

// ── Auto-title from first message ────────────────────────────────────

export function generateTitle(content: string): string {
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length <= 60) return firstLine;
    return firstLine.slice(0, 57) + '...';
}
