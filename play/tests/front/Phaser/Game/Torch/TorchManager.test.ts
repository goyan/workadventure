import { PositionMessage_Direction } from "@workadventure/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { get } from "svelte/store";
import { MapStore } from "@workadventure/store-utils";
import { WeatherType } from "@workadventure/map-editor";
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
const { TORCH_EQUIPPED_VARIABLE, TORCH_INTENSITY_VARIABLE } =
    await import("../../../../../src/front/Phaser/Game/Torch/TorchProtocol");
const { torchFlicker, torchFlickerPhase, torchFlickerSeed, torchFlickerStep } =
    await import("../../../../../src/front/Phaser/Game/Torch/TorchFlicker");
const { torchColour } = await import("../../../../../src/front/Phaser/Game/Torch/TorchGlow");
const { TORCH_GUST_SLOT_MS, torchGust, torchGustAt } =
    await import("../../../../../src/front/Phaser/Game/Torch/TorchGust");
const { torchFlameShape } = await import("../../../../../src/front/Phaser/Game/Torch/TorchFlameShape");
const { torchEquippedStore, torchIntensityStore } = await import("../../../../../src/front/Stores/TorchStore");
const { nerfEquippedStore } = await import("../../../../../src/front/Stores/NerfStore");
const { mapEditorModeStore } = await import("../../../../../src/front/Stores/MapEditorStore");

describe("TorchManager", () => {
    const variables = mock<PlayerVariablesManager>();
    let scene: ReturnType<typeof mock<GameScene>>;
    let player: ReturnType<typeof mock<Player>>;
    let remote: ReturnType<typeof mock<RemotePlayer>>;
    let manager: InstanceType<typeof TorchManager>;
    /** The server time the scene gives (see GameScene.getServerDate); the light follows it, not the page's clock. */
    let serverNow: number | undefined;
    let outdoor: boolean;
    /** An image of the game at `time`, the server clock on the same time. */
    const tick = (time: number): void => {
        // A Date keeps whole milliseconds.
        serverNow = Math.ceil(time);
        manager.update(time);
    };

    beforeEach(() => {
        vi.clearAllMocks();
        updates.length = 0;
        destroyed.count = 0;
        torchEquippedStore.set(false);
        torchIntensityStore.set(100);
        nerfEquippedStore.set(false);
        mapEditorModeStore.set(false);
        player = mock<Player>({ x: 100, y: 120, lastDirection: PositionMessage_Direction.RIGHT });
        player.isSeated.mockReturnValue(false);
        player.isTorchLit.mockReturnValue(false);
        player.getTorchIntensity.mockReturnValue(100);
        remote = mock<RemotePlayer>({ x: 300, y: 320, lastDirection: PositionMessage_Direction.UP });
        remote.isSeated.mockReturnValue(true);
        remote.isTorchLit.mockReturnValue(true);
        remote.getTorchIntensity.mockReturnValue(100);
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
        scene.connection = mock<NonNullable<GameScene["connection"]>>({ getUserId: () => 1 });
        serverNow = undefined;
        outdoor = false;
        scene.getServerDate.mockImplementation(() => (serverNow === undefined ? undefined : new Date(serverNow)));
        scene.getOutdoorGrid.mockReturnValue(
            mock<NonNullable<ReturnType<GameScene["getOutdoorGrid"]>>>({ isOutdoorAt: () => outdoor }),
        );
        scene.getMapWeather.mockReturnValue(WeatherType.Storm);
        manager = new TorchManager(scene);
    });

    afterEach(() => {
        manager.destroy();
        torchEquippedStore.set(false);
        torchIntensityStore.set(100);
        nerfEquippedStore.set(false);
        mapEditorModeStore.set(false);
        localStorage.clear();
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

    it("publishes the intensity set by the local player as a nonpersistent variable of its own", () => {
        expect(player.setTorchIntensity.mock.calls.at(-1)).toEqual([100]);
        expect(variables.setVariableFromApp.mock.calls).toContainEqual([
            TORCH_INTENSITY_VARIABLE,
            100,
            { public: true, persist: false, scope: "room" },
        ]);
        torchIntensityStore.set(60);
        expect(player.setTorchIntensity.mock.calls.at(-1)).toEqual([60]);
        expect(variables.setVariableFromApp.mock.calls.at(-1)).toEqual([
            TORCH_INTENSITY_VARIABLE,
            60,
            { public: true, persist: false, scope: "room" },
        ]);
    });

    const seedOf = (id: string) => torchFlickerSeed(id);

    it("lights each torch at the intensity its bearer set, the flicker within it", () => {
        player.isTorchLit.mockReturnValue(true);
        player.getTorchIntensity.mockReturnValue(30);
        remote.getTorchIntensity.mockReturnValue(100);
        tick(1000);
        const [me, colleague] = updates[0].bearers;
        // The glow: the flicker times the intensity; the night veil: the intensity alone.
        expect(me.intensity).toBeCloseTo(0.3 * torchFlicker(1000, seedOf("1"), false));
        expect(me.strength).toBeCloseTo(0.3);
        expect(colleague.intensity).toBe(torchFlicker(1000, seedOf("2"), false));
        expect(colleague.strength).toBe(1);
    });

    it("is the same flame on every browser: seeded by the user id, on the server clock", () => {
        player.isTorchLit.mockReturnValue(true);
        serverNow = 5_000_000;
        manager.update(1000);
        const [me, colleague] = updates[0].bearers;
        // The local player is user 1: the others see their torch under that id too.
        expect(me.intensity).toBe(torchFlicker(torchFlickerStep(5_000_000), seedOf("1"), false));
        expect(colleague.intensity).toBe(torchFlicker(torchFlickerStep(5_000_000), seedOf("2"), false));
        expect(me.colour).toBe(torchColour(me.intensity));
        expect(colleague.colour).toBe(torchColour(colleague.intensity));
    });

    it("lights up from nothing in half a second when equipped, but a torch already lit shows at once", () => {
        const me = (index: number) => updates[index].bearers.find((bearer) => bearer.id === "me");
        tick(1000);
        // Already lit when first seen: at once.
        expect(updates[0].bearers.find((bearer) => bearer.id === "2")?.intensity).toBe(
            torchFlicker(1000, seedOf("2"), false),
        );
        player.isTorchLit.mockReturnValue(true);
        const stepMs = 1000 / 15;
        tick(1000 + 3 * stepMs);
        expect(me(1)?.intensity).toBe(0);
        expect(me(1)?.strength).toBe(0);
        tick(1000 + 3 * stepMs + 250);
        // Half lit, 250 ms later on the page's clock; the flame itself on the step of the server clock.
        const half = torchFlickerStep(Math.ceil(1000 + 3 * stepMs + 250));
        expect(me(2)?.intensity).toBeCloseTo(0.5 * torchFlicker(half, seedOf("1"), false));
        expect(me(2)?.strength).toBeCloseTo(0.5);
        for (let step = 1; step <= 15; step++) tick(1000 + 3 * stepMs + 250 + step * stepMs);
        expect(me(updates.length - 1)?.strength).toBe(1);
    });

    it("lights up on the page's own clock: a server clock known later, even earlier, does not put it out", () => {
        const me = () => updates.at(-1)?.bearers.find((bearer) => bearer.id === "me");
        serverNow = undefined;
        manager.update(1000);
        player.isTorchLit.mockReturnValue(true);
        manager.update(1100);
        expect(me()?.strength).toBe(0);
        // The server clock arrives, behind the computer's.
        serverNow = 5000;
        manager.update(1350);
        expect(me()?.strength).toBeCloseTo(0.5);
        manager.update(1700);
        expect(me()?.strength).toBe(1);
    });

    it("feels the wind outdoors, more in a storm, and none indoors", () => {
        const seed = seedOf("2");
        let slot = Math.floor(1_000_000 / TORCH_GUST_SLOT_MS);
        while (!torchGustAt(slot, seed, 1)) slot++;
        const gust = torchGustAt(slot, seed, 1);
        // At the bottom of a storm gust, on a step of the light.
        const time = torchFlickerStep((gust?.start ?? 0) + 200);
        tick(time - 1000);
        tick(time);
        const indoors = updates.at(-1)?.bearers.find((bearer) => bearer.id === "2")?.intensity;
        expect(indoors).toBe(torchFlicker(torchFlickerStep(Math.ceil(time)), seed, false));
        outdoor = true;
        manager.destroy();
        manager = new TorchManager(scene);
        tick(time);
        const at = torchFlickerStep(Math.ceil(time));
        const storm = updates.at(-1)?.bearers.find((bearer) => bearer.id === "2")?.intensity ?? 1;
        expect(torchGust(at, seed, 1, false)).toBeLessThan(0.8);
        expect(storm).toBeCloseTo(torchFlicker(at, seed, false) * torchGust(at, seed, 1, false));
        expect(storm).toBeLessThan(indoors ?? 0);
    });

    it("moves a torch to a new intensity in steps, from full to the dimmest in one second", () => {
        const colleague = (index: number) => updates[index].bearers.find((bearer) => bearer.id === "2");
        tick(1000);
        expect(colleague(0)?.strength).toBe(1);
        remote.getTorchIntensity.mockReturnValue(10);
        const stepMs = 1000 / 15;
        tick(1000 + stepMs);
        expect(colleague(1)?.strength).toBeCloseTo(1 - 0.9 / 15);
        for (let step = 2; step <= 20; step++) tick(1000 + step * stepMs);
        const last = 1000 + 20 * stepMs;
        expect(colleague(updates.length - 1)?.strength).toBeCloseTo(0.1);
        expect(colleague(updates.length - 1)?.intensity).toBeCloseTo(
            0.1 * torchFlicker(torchFlickerStep(last), seedOf("2"), false),
        );
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
        tick(1010);
        const [{ bearers, editorOpen }] = updates;
        expect(editorOpen).toBe(false);
        expect(bearers.map(({ id, local }) => ({ id, local }))).toEqual([
            { id: "me", local: true },
            { id: "2", local: false },
        ]);
        expect(bearers[1]).toMatchObject({ x: 300, y: 320, direction: PositionMessage_Direction.UP, seated: true });
        // The flicker steps every 1000 / 15 ms: 1010 ms and 1060 ms are in the step that starts at 1000 ms.
        const expected = torchFlicker(1000, seedOf("2"), false);
        expect(bearers[1].intensity).toBe(expected);
        expect(remote.setTorchFlame.mock.calls.at(-1)).toEqual([torchFlameShape(1000, torchFlickerPhase("2"), false)]);
        tick(1060);
        expect(updates[1].bearers[1].intensity).toBe(expected);
        tick(1070);
        expect(updates[2].bearers[1].intensity).toBe(torchFlicker(1000 + 1000 / 15, seedOf("2"), false));
    });

    it("renders the scene 30 times a second for a flame on the screen, without drawing its light again", () => {
        tick(1000);
        expect(scene.markDirty.mock.calls).toHaveLength(1);
        // Same step of the flame (1000 to 1033 ms): nothing more to render.
        tick(1020);
        expect(scene.markDirty.mock.calls).toHaveLength(1);
        tick(1040);
        expect(scene.markDirty.mock.calls).toHaveLength(2);
        expect(remote.setTorchFlame.mock.calls.at(-1)).toEqual([
            torchFlameShape((31 * 1000) / 30, torchFlickerPhase("2"), false),
        ]);

        // Out of the screen: the flame is not looked at.
        Object.assign(remote, { x: 5000, y: 5000 });
        tick(1080);
        expect(scene.markDirty.mock.calls).toHaveLength(2);
    });

    it("keeps the flame in the hand moving in the map editor, where the lights are out", () => {
        mapEditorModeStore.set(true);
        tick(1000);
        tick(1040);
        expect(scene.markDirty.mock.calls).toHaveLength(2);
        expect(remote.setTorchFlame.mock.calls.at(-1)).toEqual([
            torchFlameShape((31 * 1000) / 30, torchFlickerPhase("2"), false),
        ]);
    });

    it("tells the torches when the map editor is open", () => {
        mapEditorModeStore.set(true);
        tick(1000);
        expect(updates[0].editorOpen).toBe(true);
    });

    it("puts its lights out when the scene ends", () => {
        manager.destroy();
        expect(destroyed.count).toBe(1);
    });
});
