import type { Group } from "./Group";
import type { User } from "./User";

/**
 * Who hears a bubble without being in it: a user standing right at its edge, like someone overhearing a
 * conversation in a corridor. Being heard does not open the bubble to them: they publish nothing and the
 * members see no video box for them, only a discreet "someone is listening".
 */
export interface BubbleListeningCallbacks {
    startListening: (user: User, group: Group) => void;
    stopListening: (user: User, group: Group) => void;
}

/** A user hears a bubble from this far past its radius: a tile and a half, they must stand close to it. */
export const LISTENING_MARGIN = 48;
/** They stop hearing it a bit farther, so that a step back and forth on the edge does not cut the sound in and out. */
export const LISTENING_RELEASE_MARGIN = 72;

export class BubbleListeners {
    private readonly listening = new Map<User, Group>();

    constructor(
        private readonly groupRadius: number,
        private readonly callbacks: BubbleListeningCallbacks,
        /** The groups a circle touches, from the room's spatial index. */
        private readonly queryGroups: (x: number, y: number, radius: number) => Iterable<Group>,
        /** The users a circle touches, from the room's spatial index. */
        private readonly queryUsers: (x: number, y: number, radius: number) => Iterable<User>,
    ) {}

    /** Re-evaluates what a user hears: after they moved, or changed status. */
    public update(user: User): void {
        const current = this.listening.get(user);
        const next = this.groupToHear(user, current);
        if (next === current) return;
        if (current) this.stop(user, current);
        if (next) this.start(user, next);
    }

    /** After a bubble moved, was locked or unlocked: its listeners and the users around it. */
    public updateAround(group: Group): void {
        const { x, y } = group.getPosition();
        const candidates = new Set([
            ...this.listenersOf(group),
            ...this.queryUsers(x, y, this.groupRadius + LISTENING_RELEASE_MARGIN),
        ]);
        for (const user of candidates) this.update(user);
    }

    /** A user joins a bubble or leaves the room: they stop listening, without looking for another bubble. */
    public forget(user: User, { notify }: { notify: boolean }): void {
        const group = this.listening.get(user);
        if (!group) return;
        this.listening.delete(user);
        if (notify) this.callbacks.stopListening(user, group);
    }

    /** A bubble is gone: its listeners stop hearing it. */
    public dropGroup(group: Group): void {
        for (const user of this.listenersOf(group)) this.stop(user, group);
    }

    public listenersOf(group: Group): User[] {
        return [...this.listening].filter(([, heard]) => heard === group).map(([user]) => user);
    }

    private groupToHear(user: User, current: Group | undefined): Group | undefined {
        if (user.silent || user.group || user.disconnected) return undefined;
        const position = user.getPosition();
        if (current && this.canBeHeard(current)) {
            const distance = distanceBetween(position, current.getPosition());
            if (distance <= this.groupRadius + LISTENING_RELEASE_MARGIN) return current;
        }
        // Like joining a bubble, starting to hear one waits for the user to stop: walking past is not eavesdropping.
        if (position.moving) return undefined;
        return this.closestAudibleGroup(position);
    }

    private closestAudibleGroup(position: { x: number; y: number }): Group | undefined {
        let closest: Group | undefined;
        let closestDistance = this.groupRadius + LISTENING_MARGIN;
        for (const group of this.queryGroups(position.x, position.y, closestDistance)) {
            if (!this.canBeHeard(group)) continue;
            const distance = distanceBetween(position, group.getPosition());
            if (distance <= closestDistance) {
                closest = group;
                closestDistance = distance;
            }
        }
        return closest;
    }

    /** A locked bubble is a private conversation: nobody overhears it. */
    private canBeHeard(group: Group): boolean {
        return !group.isLocked() && !group.isDestroyed;
    }

    private start(user: User, group: Group): void {
        this.listening.set(user, group);
        this.callbacks.startListening(user, group);
    }

    private stop(user: User, group: Group): void {
        this.listening.delete(user);
        this.callbacks.stopListening(user, group);
    }
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
