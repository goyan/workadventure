import type { FishingEventMessage, FishingLineMessage, FishingMessage } from "@workadventure/messages";
import { FISHING_EVENT } from "./FishingProtocol";

const MINUTE_MS = 60_000;

/** The fishing lines of the room as the server last told them, and the catches this browser saw. */
export class FishingLines {
    private current: readonly FishingLineMessage[] = [];
    private total = 0;
    /** When each catch seen by this browser was told. */
    private catches: number[] = [];

    /** Takes what the server tells; gives back what just happened. */
    public receive(message: FishingMessage, now: number): readonly FishingEventMessage[] {
        this.current = message.lines;
        this.total = message.caughtTotal;
        for (const event of message.events) if (event.type === FISHING_EVENT.caught) this.catches.push(now);
        return message.events;
    }

    public get lines(): readonly FishingLineMessage[] {
        return this.current;
    }

    public lineOf(userId: number): FishingLineMessage | undefined {
        return this.current.find((line) => line.userId === userId);
    }

    /** How many fish were caught in the room since the life of its map began. */
    public get caughtTotal(): number {
        return this.total;
    }

    /** How many of them this browser saw during the last minute. */
    public caughtLastMinute(now: number): number {
        this.catches = this.catches.filter((at) => now - at < MINUTE_MS);
        return this.catches.length;
    }
}
