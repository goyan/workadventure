/** Anti-spam: the same colleague cannot be waved at again before this delay, counted from the last wave sent. */
export const WAVE_COOLDOWN_MS = 10_000;

export interface WaveCard {
    senderUuid: string;
    senderName: string;
    /** Local reception time (the caller injects it). */
    receivedAt: number;
}

export class WaveState {
    private readonly lastSentAt = new Map<string, number>();
    private readonly lastReceivedAt = new Map<string, number>();
    private readonly cardsBySender = new Map<string, WaveCard>();

    canWave(targetUuid: string, now: number): boolean {
        const last = this.lastSentAt.get(targetUuid);
        return last === undefined || now - last >= WAVE_COOLDOWN_MS;
    }

    recordSent(targetUuid: string, now: number): void {
        this.lastSentAt.set(targetUuid, now);
    }

    /**
     * Recipient-side anti-spam: true when no wave from this sender was received during the last cooldown. Every call
     * counts as a reception, so a sender who keeps waving stays silent until they stop for a full cooldown.
     */
    shouldAlert(senderUuid: string, now: number): boolean {
        const last = this.lastReceivedAt.get(senderUuid);
        this.lastReceivedAt.set(senderUuid, now);
        return last === undefined || now - last >= WAVE_COOLDOWN_MS;
    }

    /** Upserts the single card of this sender and returns it. */
    receive(senderUuid: string, senderName: string, now: number): WaveCard {
        const card: WaveCard = { senderUuid, senderName, receivedAt: now };
        this.cardsBySender.set(senderUuid, card);
        return card;
    }

    dismiss(senderUuid: string): void {
        this.cardsBySender.delete(senderUuid);
    }

    /** Most recent first. */
    cards(): readonly WaveCard[] {
        return [...this.cardsBySender.values()].sort((a, b) => b.receivedAt - a.receivedAt);
    }
}
