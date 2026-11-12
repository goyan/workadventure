import { PositionMessage_Direction } from "@workadventure/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { get } from "svelte/store";
import { MapStore } from "@workadventure/store-utils";
import type * as Phaser from "phaser";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import type { Player } from "../../../../../src/front/Phaser/Player/Player";
import type { RemotePlayer } from "../../../../../src/front/Phaser/Entity/RemotePlayer";
import type { PlayerVariablesManager } from "../../../../../src/front/Phaser/Game/PlayerVariablesManager";
import type { TorchBearer } from "../../../../../src/front/Phaser/Game/Torch/Torches";

const updates = vi.hoisted(() => [] as { now: number; bearers: readonly TorchBearer[]; editorOpen: boolean }[]);
const destroyed = vi.hoisted(() => ({ count: 0 }));
vi.mock("../../../../../src/front/Phaser/Game/Torch/Torches", () => ({
    Torches: class {
        update(now: number, bearers: readonly TorchBearer[], editorOpen: boolean): void {
            updates.push({ now, bearers, editorOpen });
        }
        destroy(): void {
            destroyed.count++;
        }
    },
}));
vi.mock("../../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: { getCurrentGameScene: vi.fn() },
}));

const { TorchManager } = await import("../../../../../src/front/Phaser/Game/Torch/TorchManager");
const { TORCH_EQUIPPED_VARIABLE } = await import("../../../../../src/front/Phaser/Game/Torch/TorchProtocol");
const { torchFlicker, torchFlickerPhase } = await import("../../../../../src/front/Phaser/Game/Torch/TorchFlicker");
const { torchFlameShape } = await import("../../../../../src/front/Phaser/Game/Torch/TorchFlameShape");
const { torchEquippedStore } = await import("../../../../../src/front/Stores/TorchStore");
const { nerfEquippedStore } = await import("../../../../../src/front/Stores/NerfStore");
const { mapEditorModeStore } = await import("../../../../../src/front/Stores/MapEditorStore");

describe("TorchManager", () => {
    const variables = mock<PlayerVariablesManager>();
    let scene: ReturnType<typeof mock<GameScene>>;
    let player: ReturnType<typeof mock<Player>>;
    let remote: ReturnType<typeof mock<RemotePlayer>>;
    let manager: InstanceType<typeof TorchManager>;

    beforeEach(() => {
        vi.clearAllMocks();
        updates.length = 0;
        destroyed.count = 0;
        torchEquippedStore.set(false);
        nerfEquippedStore.set(false);
        mapEditorModeStore.set(false);
        player = mock<Player>({ x: 100, y: 120, lastDirection: PositionMessage_Direction.RIGHT });
        player.isSeated.mockReturnValue(false);
        player.isTorchLit.mockReturnValue(false);
        remote = mock<RemotePlayer>({ x: 300, y: 320, lastDirection: PositionMessage_Direction.UP });
        remote.isSeated.mockReturnValue(true);
        remote.isTorchLit.mockReturnValue(true);
        scene = mock<GameScene>();
        scene.CurrentPlayer = player;
        scene.MapPlayersByKey = new MapStore<number, RemotePlayer>();
        scene.MapPlayersByKey.set(2, remote);
        scene.MapPlayersByKey.set(3, mock<RemotePlayer>({ isTorchLit: () => false }));
        scene.time = mock<Phaser.Time.Clock>({ now: 1000 });
        Object.defineProperty(scene, "cameras", {
            value: { main: { worldView: { x: 0, y: 0, width: 1000, height: 1000 } } },
        });
        scene.getPlayerVariablesManager.mockReturnValue(variables);
        manager = new TorchManager(scene);
    });

    afterEach(() => {
        manager.destroy();
        torchEquippedStore.set(false);
        nerfEquippedStore.set(false);
        mapEditorModeStore.set(false);
    });

    it("equips the local avatar and publishes nonpersistent equipment for colleagues and late arrivals", () => {
        manager.toggleEquipment();
        expect(get(torchEquippedStore)).toBe(true);
        expect(manager.isEquipped).toBe(true);
        expect(player.setTorchEquipped.mock.calls.at(-1)).toEqual([true]);
        expect(variables.setVariableFromApp.mock.calls.at(-1)).toEqual([
            TORCH_EQUIPPED_VARIABLE,
            true,
            { public: true, persist: false, scope: "room" },
        ]);
        manager.toggleEquipment();
        expect(get(torchEquippedStore)).toBe(false);
        expect(player.setTorchEquipped.mock.calls.at(-1)).toEqual([false]);
        expect(variables.setVariableFromApp.mock.calls.at(-1)?.[1]).toBe(false);
    });

    it("puts the Nerf away when the torch is equipped", () => {
        nerfEquippedStore.set(true);
        manager.toggleEquipment();
        expect(get(nerfEquippedStore)).toBe(false);
        expect(get(torchEquippedStore)).toBe(true);
    });

    it("is not equipped in the map editor, but can be put away there", () => {
        mapEditorModeStore.set(true);
        manager.toggleEquipment();
        expect(get(torchEquippedStore)).toBe(false);
        torchEquippedStore.set(true);
        manager.toggleEquipment();
        expect(get(torchEquippedStore)).toBe(false);
    });

    it("lights the torches of the bearers seen now, each with its own soft flicker, 15 times a second", () => {
        player.isTorchLit.mockReturnValue(true);
        manager.update(1010);
        const [{ bearers, editorOpen }] = updates;
        expect(editorOpen).toBe(false);
        expect(bearers.map(({ id, local }) => ({ id, local }))).toEqual([
            { id: "me", local: true },
            { id: "2", local: false },
        ]);
        expect(bearers[1]).toMatchObject({ x: 300, y: 320, direction: PositionMessage_Direction.UP, seated: true });
        // The flicker steps every 1000 / 15 ms: 1010 ms and 1060 ms are in the step that starts at 1000 ms.
        const expected = torchFlicker(1000, torchFlickerPhase("2"), false);
        expect(bearers[1].intensity).toBe(expected);
        expect(remote.setTorchFlame.mock.calls.at(-1)).toEqual([torchFlameShape(1000, torchFlickerPhase("2"), false)]);
        manager.update(1060);
        expect(updates[1].bearers[1].intensity).toBe(expected);
        manager.update(1070);
        expect(updates[2].bearers[1].intensity).toBe(torchFlicker(1000 + 1000 / 15, torchFlickerPhase("2"), false));
    });

    it("renders the scene 30 times a second for a flame on the screen, without drawing its light again", () => {
        manager.update(1000);
        expect(scene.markDirty.mock.calls).toHaveLength(1);
        // Same step of the flame (1000 to 1033 ms): nothing more to render.
        manager.update(1020);
        expect(scene.markDirty.mock.calls).toHaveLength(1);
        manager.update(1040);
        expect(scene.markDirty.mock.calls).toHaveLength(2);
        expect(remote.setTorchFlame.mock.calls.at(-1)).toEqual([
            torchFlameShape((31 * 1000) / 30, torchFlickerPhase("2"), false),
        ]);

        // Out of the screen: the flame is not looked at.
        Object.assign(remote, { x: 5000, y: 5000 });
        manager.update(1080);
        expect(scene.markDirty.mock.calls).toHaveLength(2);
    });

    it("tells the torches when the map editor is open", () => {
        mapEditorModeStore.set(true);
        manager.update(1000);
        expect(updates[0].editorOpen).toBe(true);
    });

    it("puts its lights out when the scene ends", () => {
        manager.destroy();
        expect(destroyed.count).toBe(1);
    });
});
