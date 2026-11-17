import { Subject } from "rxjs";
import { get } from "svelte/store";
import { describe, expect, it, vi } from "vitest";
import { EntityStatesManager } from "../../../../../src/front/Phaser/Game/EntityStates/EntityStatesManager";

type StateMessage = { entityId: string; key: string; value: string };

function createManager(initial: StateMessage[] = []) {
    const stream = new Subject<StateMessage>();
    const emitSetEntityState = vi.fn();
    const manager = new EntityStatesManager({ entityStateMessageStream: stream, emitSetEntityState }, initial);
    return { manager, stream, emitSetEntityState };
}

describe("EntityStatesManager", () => {
    it("has an object the server said nothing about on", () => {
        const { manager } = createManager();
        expect(manager.get("l1", "on")).toBe("true");
        expect(manager.isOn("l1")).toBe(true);
    });

    it("starts from the states received on joining the room", () => {
        const { manager } = createManager([{ entityId: "l1", key: "on", value: "false" }]);
        expect(manager.isOn("l1")).toBe(false);
        expect(manager.isOn("l2")).toBe(true);
    });

    it("follows the changes the server sends", () => {
        const { manager, stream } = createManager([{ entityId: "l1", key: "on", value: "false" }]);
        const before = get(manager.version);

        stream.next({ entityId: "l1", key: "on", value: "true" });

        expect(manager.isOn("l1")).toBe(true);
        expect(get(manager.version)).toBe(before + 1);
    });

    it("ignores a key or a value it does not know", () => {
        const { manager, stream } = createManager([{ entityId: "l2", key: "on", value: "dimmed" }]);
        const before = get(manager.version);

        stream.next({ entityId: "l1", key: "open", value: "false" });
        stream.next({ entityId: "l1", key: "on", value: "0" });

        expect(manager.isOn("l1")).toBe(true);
        expect(manager.isOn("l2")).toBe(true);
        expect(get(manager.version)).toBe(before);
    });

    it("asks the server and changes nothing before it answers", () => {
        const { manager, emitSetEntityState } = createManager();

        manager.press("switch", ["l1", "l2"], "on", "false");

        expect(emitSetEntityState).toHaveBeenCalledWith("switch", ["l1", "l2"], "on", "false");
        expect(manager.isOn("l1")).toBe(true);
    });

    it("sends nothing for a press without target", () => {
        const { manager, emitSetEntityState } = createManager();
        manager.press("switch", [], "on", "false");
        expect(emitSetEntityState).not.toHaveBeenCalled();
    });

    it("stops following the server once destroyed", () => {
        const { manager, stream } = createManager();
        manager.destroy();
        stream.next({ entityId: "l1", key: "on", value: "false" });
        expect(manager.isOn("l1")).toBe(true);
    });

    it("forgets everything on a new connection: what the server sends then is the whole truth", () => {
        const first = createManager([{ entityId: "l1", key: "on", value: "false" }]);
        first.manager.destroy();
        const second = createManager([]);
        expect(second.manager.isOn("l1")).toBe(true);
    });
});
