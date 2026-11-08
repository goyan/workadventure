export interface FadingEntry<T> {
    item: T;
    addedAt: number;
}

/** A bounded list of items that fade out over their lifetime; the oldest goes first when it is full. */
export class FadingPool<T> {
    private entries: FadingEntry<T>[] = [];

    constructor(
        private readonly capacity: number,
        private readonly lifetimeMs: number,
    ) {}

    get size(): number {
        return this.entries.length;
    }

    get items(): readonly FadingEntry<T>[] {
        return this.entries;
    }

    /** Adds an item and returns the one pushed out, if the pool was full. */
    add(item: T, now: number): T | undefined {
        this.entries.push({ item, addedAt: now });
        return this.entries.length > this.capacity ? this.entries.shift()?.item : undefined;
    }

    alphaAt(addedAt: number, now: number, start: number): number {
        return Math.max(0, start * (1 - (now - addedAt) / this.lifetimeMs));
    }

    /** Removes and returns the items whose lifetime is over. */
    expire(now: number): T[] {
        const expired: T[] = [];
        while (this.entries.length > 0 && now - this.entries[0].addedAt >= this.lifetimeMs) {
            const entry = this.entries.shift();
            if (entry) expired.push(entry.item);
        }
        return expired;
    }

    clear(): T[] {
        const items = this.entries.map((entry) => entry.item);
        this.entries = [];
        return items;
    }
}
