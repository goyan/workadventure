/** A colleague invites to coffee at most once in this delay, counted from the last invitation (sender and recipient). */
export const COFFEE_INVITE_COOLDOWN_MS = 15 * 60_000;
/** A card disappears after this delay even if the end of the coffee never arrives (closed tab, lost connection). */
export const COFFEE_CARD_TTL_MS = 10 * 60_000;

export interface CoffeeCard {
    senderUuid: string;
    senderName: string;
    /** Local reception time (the caller injects it). */
    receivedAt: number;
}

export class CoffeeState {
    private lastInvitedAt: number | undefined;
    private readonly lastShownAt = new Map<string, number>();
    private readonly cardsBySender = new Map<string, CoffeeCard>();

    canInvite(now: number): boolean {
        return this.lastInvitedAt === undefined || now - this.lastInvitedAt >= COFFEE_INVITE_COOLDOWN_MS;
    }

    recordInvite(now: number): void {
        this.lastInvitedAt = now;
    }

    /**
     * Shows the card of this colleague, unless they already invited during the cooldown (a reload of their tab resets
     * their own count, not this one). Returns the card, or undefined when ignored.
     */
    receiveStart(senderUuid: string, senderName: string, now: number): CoffeeCard | undefined {
        const last = this.lastShownAt.get(senderUuid);
        if (last !== undefined && now - last < COFFEE_INVITE_COOLDOWN_MS) {
            return undefined;
        }
        this.lastShownAt.set(senderUuid, now);
        const card: CoffeeCard = { senderUuid, senderName, receivedAt: now };
        this.cardsBySender.set(senderUuid, card);
        return card;
    }

    receiveEnd(senderUuid: string): void {
        this.cardsBySender.delete(senderUuid);
    }

    dismiss(senderUuid: string): void {
        this.cardsBySender.delete(senderUuid);
    }

    /** The cards still alive, most recent first. */
    cards(now: number): readonly CoffeeCard[] {
        for (const [senderUuid, card] of this.cardsBySender) {
            if (now - card.receivedAt >= COFFEE_CARD_TTL_MS) {
                this.cardsBySender.delete(senderUuid);
            }
        }
        return [...this.cardsBySender.values()].sort((a, b) => b.receivedAt - a.receivedAt);
    }
}
