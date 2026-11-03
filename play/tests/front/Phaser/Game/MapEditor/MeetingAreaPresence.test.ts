import { describe, expect, it, vi } from "vitest";
import { MeetingAreaPresence } from "../../../../../src/front/Phaser/Game/MapEditor/MeetingAreaPresence";

function setup() {
    const occupiedAreas = new Set<string>();
    const events: string[] = [];
    const signals: AbortSignal[] = [];
    const onError = vi.fn();
    const presence = new MeetingAreaPresence<string>(
        (areaId) => occupiedAreas.has(areaId),
        (payload, signal) => {
            events.push(`start ${payload}`);
            signals.push(signal);
            return Promise.resolve();
        },
        (payload) => {
            events.push(`stop ${payload}`);
            return Promise.resolve();
        },
        onError,
    );
    return { presence, occupiedAreas, events, signals, onError };
}

const flush = () =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });

describe("MeetingAreaPresence", () => {
    it("does not start the meeting while the player is alone in the area", async () => {
        const { presence, events } = setup();

        presence.enter("property", "area", "room");
        presence.refresh();
        await flush();

        expect(events).toEqual([]);
    });

    it("starts the meeting when someone else comes in, and stops it when they leave", async () => {
        const { presence, occupiedAreas, events } = setup();
        presence.enter("property", "area", "room");

        occupiedAreas.add("area");
        presence.refresh();
        presence.refresh();
        await flush();
        expect(events).toEqual(["start room"]);

        occupiedAreas.delete("area");
        presence.refresh();
        await flush();
        expect(events).toEqual(["start room", "stop room"]);

        occupiedAreas.add("area");
        presence.refresh();
        await flush();
        expect(events).toEqual(["start room", "stop room", "start room"]);
    });

    it("starts at once when someone is already in the area", async () => {
        const { presence, occupiedAreas, events } = setup();
        occupiedAreas.add("area");

        presence.enter("property", "area", "room");
        await flush();

        expect(events).toEqual(["start room"]);
    });

    it("stops the meeting when the player leaves the area, and only if it was started", async () => {
        const { presence, occupiedAreas, events, signals } = setup();
        presence.enter("alone", "empty-area", "quiet room");
        occupiedAreas.add("area");
        presence.enter("property", "area", "room");
        await flush();

        presence.leave("alone");
        presence.leave("property");
        await flush();

        expect(events).toEqual(["start room", "stop room"]);
        expect(signals[0].aborted).toBe(true);
        expect(presence.size).toBe(0);
    });

    it("skips a start that was undone before its turn", async () => {
        const { presence, occupiedAreas, events } = setup();
        occupiedAreas.add("area");

        presence.enter("property", "area", "room");
        presence.leave("property");
        await flush();

        expect(events).toEqual([]);
    });

    it("forgets the areas on destroy without stopping their meeting", async () => {
        const { presence, occupiedAreas, events, signals } = setup();
        occupiedAreas.add("area");
        presence.enter("property", "area", "room");
        await flush();

        presence.destroy();
        presence.refresh();
        await flush();

        expect(events).toEqual(["start room"]);
        expect(signals[0].aborted).toBe(true);
        expect(presence.size).toBe(0);
    });
});
