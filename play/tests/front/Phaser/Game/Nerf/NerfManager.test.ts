import * as Phaser from "phaser";
import { PositionMessage_Direction } from "@workadventure/messages";
import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { get } from "svelte/store";
import { MapStore } from "@workadventure/store-utils";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import type { RoomConnection } from "../../../../../src/front/Connection/RoomConnection";
import type { GameMapFrontWrapper } from "../../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { Player } from "../../../../../src/front/Phaser/Player/Player";
import type { RemotePlayer } from "../../../../../src/front/Phaser/Entity/RemotePlayer";
import type { PlayerVariablesManager } from "../../../../../src/front/Phaser/Game/PlayerVariablesManager";
import type { UserInputManager } from "../../../../../src/front/Phaser/UserInput/UserInputManager";
import { NerfManager } from "../../../../../src/front/Phaser/Game/Nerf/NerfManager";
import { NERF_SHOT_EVENT, NERF_EQUIPPED_VARIABLE } from "../../../../../src/front/Phaser/Game/Nerf/NerfProtocol";
import { nerfEquippedStore } from "../../../../../src/front/Stores/NerfStore";
import { mapEditorModeStore } from "../../../../../src/front/Stores/MapEditorStore";
import { environmentVolumeStore } from "../../../../../src/front/Stores/SoundEffectsStore";

const getBlockAudio = vi.hoisted(() => vi.fn(() => false));
vi.mock("../../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getBlockAudio },
}));

describe("NerfManager", () => {
    const stream = new Subject<{ name: string; data: unknown; senderId: number | undefined }>();
    const variables = mock<PlayerVariablesManager>();
    let scene: ReturnType<typeof mock<GameScene>>;
    let connection: ReturnType<typeof mock<RoomConnection>>;
    let player: ReturnType<typeof mock<Player>>;
    let manager: NerfManager;
    let graphics: Phaser.GameObjects.Graphics[];
    let grid: number[][];
    const sound = mock<Phaser.Sound.WebAudioSoundManager>();

    beforeEach(() => {
        vi.clearAllMocks();
        getBlockAudio.mockReturnValue(false);
        nerfEquippedStore.set(false);
        mapEditorModeStore.set(false);
        environmentVolumeStore.set(1);
        player = mock<Player>({ x: 100, y: 100, lastDirection: PositionMessage_Direction.RIGHT });
        player.getNerfHeading.mockReturnValue(6);
        player.getCollisionRectangle.mockReturnValue({ x: 92, y: 100, width: 16, height: 16 });
        scene = mock<GameScene>();
        scene.sys = mock<Phaser.Scenes.Systems>();
        scene.sys.displayList = mock<Phaser.GameObjects.DisplayList>();
        scene.CurrentPlayer = player;
        scene.MapPlayersByKey = new MapStore<number, RemotePlayer>();
        scene.MapPlayersByKey.set(
            2,
            mock<RemotePlayer>({
                x: 140,
                y: 180,
                getCollisionRectangle: () => ({ x: 132, y: 180, width: 16, height: 16 }),
            }),
        );
        scene.userInputManager = mock<UserInputManager>({ isControlsEnabled: true });
        scene.time = mock<Phaser.Time.Clock>({ now: 1000 });
        Object.defineProperty(sound, "locked", { value: false, configurable: true });
        scene.sound = sound;
        scene.physics = mock<Phaser.Physics.Arcade.ArcadePhysics>();
        scene.physics.world = mock<Phaser.Physics.Arcade.World>();
        scene.physics.world.staticBodies = new Set<Phaser.Physics.Arcade.StaticBody>();
        connection = mock<RoomConnection>();
        Object.defineProperty(connection, "receivedEventMessageStream", { value: stream });
        connection.getUserId.mockReturnValue(1);
        connection.emitScriptableEvent.mockResolvedValue();
        scene.connection = connection;
        scene.getPlayerVariablesManager.mockReturnValue(variables);
        graphics = [];
        const factory = mock<Phaser.GameObjects.GameObjectFactory>();
        scene.add = factory;
        factory.graphics.mockImplementation(() => {
            const graphic = new Phaser.GameObjects.Graphics(scene);
            graphics.push(graphic);
            return graphic;
        });
        grid = Array.from({ length: 25 }, () => Array<number>(25).fill(0));
        scene.getGameMapFrontWrapper.mockReturnValue(
            mock<GameMapFrontWrapper>({
                getSharedCollisionGrid: () => grid,
                getTileDimensions: () => ({ width: 32, height: 32 }),
            }),
        );
        manager = new NerfManager(scene);
    });

    afterEach(() => {
        manager?.destroy();
        nerfEquippedStore.set(false);
        mapEditorModeStore.set(false);
        environmentVolumeStore.set(0.15);
        vi.restoreAllMocks();
    });

    it("equips the local avatar and publishes nonpersistent equipment for colleagues and late arrivals", () => {
        manager.toggleEquipment();
        expect(get(nerfEquippedStore)).toBe(true);
        expect(player.setNerfEquipped.mock.calls.at(-1)).toEqual([true]);
        expect(variables.setVariableFromApp.mock.calls.at(-1)).toEqual([
            NERF_EQUIPPED_VARIABLE,
            true,
            { public: true, persist: false, scope: "room" },
        ]);
        manager.toggleEquipment();
        expect(get(nerfEquippedStore)).toBe(false);
        expect(player.setNerfEquipped.mock.calls.at(-1)).toEqual([false]);
    });

    it("does not fire when unequipped, editing or controls are locked", () => {
        manager.fire();
        manager.toggleEquipment();
        mapEditorModeStore.set(true);
        manager.fire();
        mapEditorModeStore.set(false);
        Object.defineProperty(scene.userInputManager, "isControlsEnabled", { value: false });
        manager.fire();
        expect(graphics).toHaveLength(0);
        expect(connection.emitScriptableEvent.mock.calls).toEqual([]);
    });

    it("plays a shot immediately, moves its dart forward and ignores its own server echo", () => {
        manager.toggleEquipment();
        manager.fire();
        expect(graphics).toHaveLength(1);
        expect(sound.play.mock.calls).toHaveLength(1);
        expect(connection.emitScriptableEvent.mock.calls).toEqual([
            [
                NERF_SHOT_EVENT,
                { x: 100, y: 100, direction: PositionMessage_Direction.RIGHT, seated: false, heading: 6 },
                undefined,
            ],
        ]);
        const startX = graphics[0].x;
        manager.update(1100);
        expect(graphics[0].x).toBeGreaterThan(startX);
        expect(graphics[0].y).toBe(99);
        stream.next({
            name: NERF_SHOT_EVENT,
            data: { x: 100, y: 100, direction: PositionMessage_Direction.RIGHT },
            senderId: 1,
        });
        expect(graphics).toHaveLength(1);
    });

    it("limits bursts but allows another shot after the documented 300 ms", () => {
        manager.toggleEquipment();
        manager.fire();
        scene.time.now = 1299;
        manager.fire();
        expect(graphics).toHaveLength(1);
        scene.time.now = 1300;
        manager.fire();
        expect(graphics).toHaveLength(2);
    });

    it.each([
        { heading: 1, xSign: -1, ySign: 1 },
        { heading: 3, xSign: -1, ySign: -1 },
        { heading: 5, xSign: 1, ySign: -1 },
        { heading: 7, xSign: 1, ySign: 1 },
    ])("fires along diagonal heading $heading at the same speed as a cardinal shot", ({ heading, xSign, ySign }) => {
        player.getNerfHeading.mockReturnValue(heading);
        manager.toggleEquipment();
        manager.fire();
        const start = { x: graphics[0].x, y: graphics[0].y };
        manager.update(1100);
        const dx = graphics[0].x - start.x;
        const dy = graphics[0].y - start.y;
        expect(Math.sign(dx)).toBe(xSign);
        expect(Math.sign(dy)).toBe(ySign);
        expect(Math.abs(dx)).toBeCloseTo(Math.abs(dy));
        expect(Math.hypot(dx, dy)).toBeCloseTo(32);
        expect(connection.emitScriptableEvent.mock.calls[0][1]).toMatchObject({ heading });
    });

    it("shows a colleague's shot even when the local player has put their gun away", () => {
        stream.next({
            name: NERF_SHOT_EVENT,
            data: { x: 140, y: 100, direction: PositionMessage_Direction.LEFT },
            senderId: 2,
        });
        expect(graphics).toHaveLength(1);
        const startX = graphics[0].x;
        manager.update(1005);
        expect(graphics[0].x).toBeLessThan(startX);
        expect(sound.play.mock.calls).toHaveLength(1);
    });

    it.each([
        { data: { x: Infinity, y: 100, direction: 1 }, senderId: 2 },
        { data: { x: 140, y: 100, direction: 42 }, senderId: 2 },
        { data: { x: 140, y: 100, direction: 1, heading: 8 }, senderId: 2 },
        { data: { x: 140, y: 100, direction: 1 }, senderId: undefined },
        { data: { x: 140, y: 100, direction: 1 }, senderId: 3 },
        { data: { x: 700, y: 100, direction: 1 }, senderId: 2 },
    ])("ignores invalid, unknown or implausibly positioned remote shots: %j", (message) => {
        stream.next({ name: NERF_SHOT_EVENT, ...message });
        expect(graphics).toHaveLength(0);
        expect(sound.play.mock.calls).toEqual([]);
    });

    it("stops at a blocked tile even when a slow frame would move past it", () => {
        manager.toggleEquipment();
        manager.fire();
        grid[3][5] = 1;
        manager.update(1700);
        expect(graphics[0].scene).toBeUndefined();
        expect(graphics).toHaveLength(2);
        expect(graphics[1].x).toBeGreaterThanOrEqual(160);
        expect(graphics[1].x).toBeLessThan(164);
        manager.update(1830);
        expect(graphics[1].alpha).toBeCloseTo(0.5);
        manager.update(1960);
        expect(graphics[1].scene).toBeUndefined();
    });

    it("stops on an avatar with a short foam burst and does not hit the shooter", () => {
        scene.MapPlayersByKey.set(
            2,
            mock<RemotePlayer>({
                x: 180,
                y: 100,
                getCollisionRectangle: () => ({ x: 172, y: 100, width: 16, height: 16 }),
            }),
        );
        manager.toggleEquipment();
        manager.fire();
        manager.update(1100);
        expect(graphics).toHaveLength(1);
        manager.update(1400);
        expect(graphics[0].scene).toBeUndefined();
        expect(graphics).toHaveLength(2);
        expect(graphics[1].x).toBeGreaterThanOrEqual(172);
        expect(graphics[1].x).toBeLessThan(176);
        manager.destroy();
        expect(graphics[1].scene).toBeUndefined();
    });

    it("cannot shoot past a thin wall that the barrel overlaps", () => {
        const wall = mock<Phaser.Physics.Arcade.StaticBody>({ x: 111, y: 80, width: 3, height: 50 });
        scene.physics.world.staticBodies.add(wall);
        manager.toggleEquipment();
        manager.fire();
        manager.update(1000);
        expect(graphics[0].scene).toBeUndefined();
    });

    it("removes darts at the documented 384 px range without accumulating scene objects", () => {
        manager.toggleEquipment();
        manager.fire();
        manager.update(2200);
        expect(graphics[0].scene).toBeUndefined();
        expect(scene.markDirty.mock.calls.length).toBeGreaterThan(0);
    });

    it("respects muted ambience and personal audio blocking", () => {
        manager.toggleEquipment();
        environmentVolumeStore.set(0);
        manager.fire();
        environmentVolumeStore.set(1);
        getBlockAudio.mockReturnValue(true);
        scene.time.now = 1300;
        manager.fire();
        expect(graphics).toHaveLength(2);
        expect(sound.play.mock.calls).toEqual([]);
    });

    it("disposes projectiles and detaches network and equipment observers", () => {
        manager.toggleEquipment();
        manager.fire();
        manager.destroy();
        const calls = player.setNerfEquipped.mock.calls.length;
        nerfEquippedStore.set(false);
        stream.next({
            name: NERF_SHOT_EVENT,
            data: { x: 140, y: 100, direction: 1 },
            senderId: 2,
        });
        expect(graphics).toHaveLength(1);
        expect(graphics[0].scene).toBeUndefined();
        expect(player.setNerfEquipped.mock.calls.length).toBe(calls);
    });
});
