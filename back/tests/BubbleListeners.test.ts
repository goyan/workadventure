import { describe, expect, it, vi } from "vitest";
import { BubbleListeners, LISTENING_MARGIN, LISTENING_RELEASE_MARGIN } from "../src/Model/BubbleListeners";
import type { Group } from "../src/Model/Group";
import type { User } from "../src/Model/User";

const GROUP_RADIUS = 48;

interface FakeUser {
    x: number;
    y: number;
    moving: boolean;
    silent: boolean;
    group?: Group;
    disconnected: boolean;
}

function fakeGroup(x: number, y: number, { locked = false } = {}) {
    const state = { x, y, locked, isDestroyed: false };
    const group = {
        getPosition: () => ({ x: state.x, y: state.y }),
        isLocked: () => state.locked,
        get isDestroyed() {
            return state.isDestroyed;
        },
    } as unknown as Group;
    return { group, state };
}

function fakeUser(x: number, y: number): { user: User; state: FakeUser } {
    const state: FakeUser = { x, y, moving: false, silent: false, disconnected: false };
    const user = {
        getPosition: () => ({ x: state.x, y: state.y, moving: state.moving }),
        get silent() {
            return state.silent;
        },
        get group() {
            return state.group;
        },
        get disconnected() {
            return state.disconnected;
        },
    } as unknown as User;
    return { user, state };
}

function setup(groups: Group[], users: User[] = []) {
    const callbacks = { startListening: vi.fn(), stopListening: vi.fn() };
    const listeners = new BubbleListeners(
        GROUP_RADIUS,
        callbacks,
        () => groups,
        () => users,
    );
    return { callbacks, listeners };
}

describe("BubbleListeners", () => {
    it("hears a bubble from right at its edge", () => {
        const { group } = fakeGroup(0, 0);
        const { user } = fakeUser(GROUP_RADIUS + LISTENING_MARGIN - 1, 0);
        const { callbacks, listeners } = setup([group]);

        listeners.update(user);

        expect(callbacks.startListening).toHaveBeenCalledWith(user, group);
    });

    it("does not hear a bubble from farther than one tile past its radius", () => {
        const { group } = fakeGroup(0, 0);
        const { user } = fakeUser(GROUP_RADIUS + LISTENING_MARGIN + 1, 0);
        const { callbacks, listeners } = setup([group]);

        listeners.update(user);

        expect(callbacks.startListening).not.toHaveBeenCalled();
    });

    it("keeps hearing a little past the edge, and stops once the user walks away", () => {
        const { group } = fakeGroup(0, 0);
        const { user, state } = fakeUser(GROUP_RADIUS + LISTENING_MARGIN, 0);
        const { callbacks, listeners } = setup([group]);
        listeners.update(user);

        state.moving = true;
        state.x = GROUP_RADIUS + LISTENING_RELEASE_MARGIN - 1;
        listeners.update(user);
        expect(callbacks.stopListening).not.toHaveBeenCalled();

        state.x = GROUP_RADIUS + LISTENING_RELEASE_MARGIN + 1;
        listeners.update(user);
        expect(callbacks.stopListening).toHaveBeenCalledWith(user, group);
    });

    it("waits for the user to stop before hearing a bubble: walking past is not eavesdropping", () => {
        const { group } = fakeGroup(0, 0);
        const { user, state } = fakeUser(GROUP_RADIUS + 10, 0);
        state.moving = true;
        const { callbacks, listeners } = setup([group]);

        listeners.update(user);

        expect(callbacks.startListening).not.toHaveBeenCalled();
    });

    it("never overhears a locked bubble, and stops when the bubble gets locked", () => {
        const locked = fakeGroup(0, 0, { locked: true });
        const near = fakeUser(GROUP_RADIUS + 10, 0);
        const lockedSetup = setup([locked.group]);
        lockedSetup.listeners.update(near.user);
        expect(lockedSetup.callbacks.startListening).not.toHaveBeenCalled();

        const open = fakeGroup(0, 0);
        const listener = fakeUser(GROUP_RADIUS + 10, 0);
        const { callbacks, listeners } = setup([open.group], [listener.user]);
        listeners.update(listener.user);
        open.state.locked = true;
        listeners.updateAround(open.group);
        expect(callbacks.stopListening).toHaveBeenCalledWith(listener.user, open.group);
    });

    it("does not listen while silent (do not disturb, silent zone, meeting room)", () => {
        const { group } = fakeGroup(0, 0);
        const { user, state } = fakeUser(GROUP_RADIUS + 10, 0);
        state.silent = true;
        const { callbacks, listeners } = setup([group]);

        listeners.update(user);

        expect(callbacks.startListening).not.toHaveBeenCalled();
    });

    it("hears the closest of two bubbles", () => {
        const far = fakeGroup(-GROUP_RADIUS - 30, 0);
        const close = fakeGroup(GROUP_RADIUS + 10, 0);
        const { user } = fakeUser(0, 0);
        const { callbacks, listeners } = setup([far.group, close.group]);

        listeners.update(user);

        expect(callbacks.startListening).toHaveBeenCalledOnce();
        expect(callbacks.startListening).toHaveBeenCalledWith(user, close.group);
    });

    it("starts hearing a bubble that moved next to a user standing still", () => {
        const { group, state } = fakeGroup(500, 0);
        const { user } = fakeUser(0, 0);
        const { callbacks, listeners } = setup([group], [user]);
        listeners.update(user);

        state.x = GROUP_RADIUS + 10;
        listeners.updateAround(group);

        expect(callbacks.startListening).toHaveBeenCalledWith(user, group);
    });

    it("stops silently when the user joins a bubble, and its listeners stop when it is gone", () => {
        const { group } = fakeGroup(0, 0);
        const joining = fakeUser(GROUP_RADIUS + 10, 0);
        const staying = fakeUser(-GROUP_RADIUS - 10, 0);
        const { callbacks, listeners } = setup([group]);
        listeners.update(joining.user);
        listeners.update(staying.user);

        listeners.forget(joining.user, { notify: true });
        expect(callbacks.stopListening).toHaveBeenCalledWith(joining.user, group);
        expect(listeners.listenersOf(group)).toEqual([staying.user]);

        listeners.dropGroup(group);
        expect(callbacks.stopListening).toHaveBeenCalledWith(staying.user, group);
        expect(listeners.listenersOf(group)).toEqual([]);
    });
});
