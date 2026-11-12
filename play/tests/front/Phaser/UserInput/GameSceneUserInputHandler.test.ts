import * as Phaser from "phaser";
import { get, readable } from "svelte/store";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { Vehicle, VehicleMode } from "@wa/front/Phaser/Vehicle/Vehicle";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { CameraManager } from "../../../../src/front/Phaser/Game/CameraManager";
import type { UserInputManager } from "../../../../src/front/Phaser/UserInput/UserInputManager";
import type { ActivatablesManager } from "../../../../src/front/Phaser/Game/ActivatablesManager";
import { GameSceneUserInputHandler } from "../../../../src/front/Phaser/UserInput/GameSceneUserInputHandler";
import { isActivatable } from "../../../../src/front/Phaser/Game/ActivatableInterface";
import { mapEditorModeStore } from "../../../../src/front/Stores/MapEditorStore";
import { characterPickerStore } from "../../../../src/front/Stores/CharacterPickerStore";
import { RemotePlayer } from "../../../../src/front/Phaser/Entity/RemotePlayer";
import { Player } from "../../../../src/front/Phaser/Player/Player";
import { WOKA_SPEED } from "../../../../src/front/Enum/EnvironmentVariable";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";
import { wokaMenuStore, avatarActionsOpenStore } from "../../../../src/front/Stores/WokaMenuStore";
import { AvatarAction } from "../../../../src/front/Phaser/Entity/AvatarAction";
import { Swimwear } from "../../../../src/front/Phaser/Entity/Swimwear";
import { LL, setLocale } from "../../../../src/i18n/i18n-svelte";
import { nerfEquippedStore } from "../../../../src/front/Stores/NerfStore";
import type { NerfManager } from "../../../../src/front/Phaser/Game/Nerf/NerfManager";
import { torchEquippedStore } from "../../../../src/front/Stores/TorchStore";
import type { TorchManager } from "../../../../src/front/Phaser/Game/Torch/TorchManager";
import { findSeatAtPoint } from "../../../../src/front/Phaser/Player/Seat";
import type { Seat } from "../../../../src/front/Phaser/Player/Seat";

const tileSnap = vi.hoisted(() => ({ enabled: false }));
vi.mock("../../../../src/front/Enum/EnvironmentVariable", async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    get ENABLE_TILE_SNAP() {
        return tileSnap.enabled;
    },
}));

// Pointer navigation does not need character rendering or the chat and menu UI.
vi.mock("../../../../src/front/Phaser/Player/Player", () => ({ Player: class {} }));
vi.mock("../../../../src/front/Phaser/Entity/RemotePlayer", () => ({ RemotePlayer: class {} }));
vi.mock("../../../../src/front/Phaser/Game/ActivatableInterface", () => ({ isActivatable: vi.fn() }));
vi.mock("../../../../src/front/Stores/MenuStore", () => ({}));
vi.mock("../../../../src/front/Stores/FollowStore", () => ({}));
vi.mock("../../../../src/front/Stores/EmoteStore", () => ({}));
vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: "self-uuid" }), getVehicle: vi.fn(() => Vehicle.None) },
}));
vi.mock("../../../../src/front/Chat/Stores/ChatStore", () => ({}));
vi.mock("../../../../src/front/Components/PopUp/SayPopUp.svelte", () => ({ default: vi.fn() }));
vi.mock("../../../../src/front/Phaser/Player/Seat", () => ({ findSeatAtPoint: vi.fn(), isSeatTaken: vi.fn() }));

describe("GameSceneUserInputHandler pointer navigation", () => {
    const camera = mock<Phaser.Cameras.Scene2D.Camera>();
    const cameraManager = mock<CameraManager>();
    const activatablesManager = mock<ActivatablesManager>();
    let scene: ReturnType<typeof mock<GameScene>>;
    let handler: GameSceneUserInputHandler;
    let currentPlayer: { sitOnSeat: ReturnType<typeof vi.fn>; stayStandingHere: ReturnType<typeof vi.fn> };
    const chair: Seat = {
        id: "chair:0",
        entityId: "chair",
        feet: { x: 496, y: 650 },
        direction: 0,
        depth: 0,
        trigger: "auto",
    };

    function pointer(button = 0, detail = 2): ReturnType<typeof mock<Phaser.Input.Pointer>> {
        const result = mock<Phaser.Input.Pointer>({
            x: 120,
            y: 160,
            wasTouch: false,
            prevPosition: new Phaser.Math.Vector2(120, 160),
        });
        result.event = new MouseEvent("mouseup", { button, detail });
        result.leftButtonReleased.mockReturnValue(button === 0);
        result.leftButtonDown.mockReturnValue(button === 0);
        result.getDuration.mockReturnValue(50);
        return result;
    }

    beforeAll(async () => {
        await loadLocaleAsync("en-US");
        setLocale("en-US");
    });

    beforeEach(() => {
        vi.clearAllMocks();
        tileSnap.enabled = false;
        wokaMenuStore.clear();
        mapEditorModeStore.set(false);
        vi.mocked(isActivatable).mockReturnValue(false);
        camera.getWorldPoint.mockReturnValue(new Phaser.Math.Vector2(480, 640));
        cameraManager.getCamera.mockReturnValue(camera);
        cameraManager.isZoomLocked.mockReturnValue(false);
        scene = mock<GameScene>({
            userInputManager: mock<UserInputManager>({ isControlsEnabled: true, isRightClickEnabled: true }),
        });
        Object.defineProperty(scene, "game", {
            configurable: true,
            value: { canvas: document.createElement("canvas") },
        });
        Object.defineProperty(scene, "events", { configurable: true, value: new Phaser.Events.EventEmitter() });
        Object.defineProperty(scene, "input", { configurable: true, value: {} });
        scene.Map = mock<Phaser.Tilemaps.Tilemap>({ widthInPixels: 1504, heightInPixels: 1184 });
        scene.getCameraManager.mockReturnValue(cameraManager);
        scene.getActivatablesManager.mockReturnValue(activatablesManager);
        scene.getGameMapFrontWrapper.mockReturnValue(
            mock<GameMapFrontWrapper>({ getTileDimensions: () => ({ width: 32, height: 32 }) }),
        );
        scene.moveTo.mockResolvedValue({ x: 480, y: 640, cancelled: false });
        currentPlayer = { sitOnSeat: vi.fn(), stayStandingHere: vi.fn() };
        Object.defineProperty(scene, "CurrentPlayer", { configurable: true, value: currentPlayer });
        vi.mocked(findSeatAtPoint).mockReturnValue(undefined);
        handler = new GameSceneUserInputHandler(scene);
    });

    afterEach(() => {
        wokaMenuStore.clear();
        nerfEquippedStore.set(false);
        mapEditorModeStore.set(false);
        vi.restoreAllMocks();
    });

    it("runs to the exact world point under a double left-click when tile snapping is disabled", () => {
        handler.handlePointerUpEvent(pointer(0, 1), []);
        handler.handlePointerUpEvent(pointer(0, 2), []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 480, y: 640 }, true, WOKA_SPEED * 2.5]]);
    });

    it("runs to the center of the tile under a double left-click when tile snapping is enabled", () => {
        tileSnap.enabled = true;
        handler.handlePointerUpEvent(pointer(0, 1), []);
        handler.handlePointerUpEvent(pointer(0, 2), []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 496, y: 656 }, true, WOKA_SPEED * 2.5]]);
        expect(camera.getWorldPoint.mock.calls).toEqual([[120, 160]]);
    });

    it("keeps the exact point for right-click navigation even when tile snapping is enabled", () => {
        tileSnap.enabled = true;
        handler.handlePointerUpEvent(pointer(2, 1), []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 480, y: 640 }, true, undefined]]);
    });

    it("runs to a seat under a double left-click, then sits on it", async () => {
        vi.mocked(findSeatAtPoint).mockReturnValue(chair);
        handler.handlePointerUpEvent(pointer(0, 2), []);

        expect(scene.moveTo.mock.calls).toEqual([[chair.feet, true, WOKA_SPEED * 2.5]]);
        await vi.waitFor(() => expect(currentPlayer.sitOnSeat).toHaveBeenCalledWith("chair:0"));
        expect(currentPlayer.stayStandingHere).not.toHaveBeenCalled();
    });

    it("looks for the seat under the clicked point itself, even when tile snapping is enabled", () => {
        tileSnap.enabled = true;
        handler.handlePointerUpEvent(pointer(0, 2), []);

        expect(vi.mocked(findSeatAtPoint).mock.calls[0]?.[1]).toEqual({ x: 480, y: 640 });
    });

    it("still sits when the player already stands on the seat tile (no path to walk)", async () => {
        vi.mocked(findSeatAtPoint).mockReturnValue(chair);
        scene.moveTo.mockRejectedValue(new Error("No path found"));
        handler.handlePointerUpEvent(pointer(0, 2), []);

        await vi.waitFor(() => expect(currentPlayer.sitOnSeat).toHaveBeenCalledWith("chair:0"));
    });

    it("does not sit when the run to the seat is cancelled", async () => {
        vi.mocked(findSeatAtPoint).mockReturnValue(chair);
        scene.moveTo.mockResolvedValue({ x: 300, y: 300, cancelled: true });
        handler.handlePointerUpEvent(pointer(0, 2), []);

        await vi.waitFor(() => expect(cameraManager.endWalkFraming.mock.calls.length).toBeGreaterThan(0));
        expect(currentPlayer.sitOnSeat).not.toHaveBeenCalled();
    });

    it("ends a double-click run on the floor standing, even against a seat", async () => {
        handler.handlePointerUpEvent(pointer(0, 2), []);

        await vi.waitFor(() => expect(currentPlayer.stayStandingHere).toHaveBeenCalledOnce());
        expect(currentPlayer.sitOnSeat).not.toHaveBeenCalled();
    });

    it("never aims at a seat with a right-click", async () => {
        vi.mocked(findSeatAtPoint).mockReturnValue(chair);
        handler.handlePointerUpEvent(pointer(2, 1), []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 480, y: 640 }, true, undefined]]);
        await vi.waitFor(() => expect(cameraManager.endWalkFraming.mock.calls.length).toBeGreaterThan(0));
        expect(currentPlayer.sitOnSeat).not.toHaveBeenCalled();
        expect(currentPlayer.stayStandingHere).not.toHaveBeenCalled();
    });

    it("does not start navigation after a single left-click", () => {
        handler.handlePointerUpEvent(pointer(0, 1), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("keeps right-click navigation at its existing speed", () => {
        handler.handlePointerUpEvent(pointer(2, 1), []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 480, y: 640 }, true, undefined]]);
    });

    it("keeps touch navigation at its existing speed", () => {
        const touch = pointer();
        touch.wasTouch = true;
        handler.handlePointerUpEvent(touch, []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 480, y: 640 }, true, undefined]]);
    });

    it("does not run when controls are disabled even if right-click is still enabled", () => {
        scene.userInputManager = mock<UserInputManager>({ isControlsEnabled: false, isRightClickEnabled: true });
        handler.handlePointerUpEvent(pointer(), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("respects the scripting API disabling navigation by click", () => {
        scene.userInputManager = mock<UserInputManager>({ isControlsEnabled: true, isRightClickEnabled: false });
        handler.handlePointerUpEvent(pointer(), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("does not run while editing the map", () => {
        mapEditorModeStore.set(true);
        handler.handlePointerUpEvent(pointer(), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it.each([true, false])(
        "does not navigate on a right-click while editing the map with controls enabled: %s",
        (isControlsEnabled) => {
            mapEditorModeStore.set(true);
            scene.userInputManager = mock<UserInputManager>({ isControlsEnabled, isRightClickEnabled: true });

            handler.handlePointerUpEvent(pointer(2, 1), []);

            expect(scene.moveTo.mock.calls).toEqual([]);
        },
    );

    it.each([true, false])(
        "does not navigate on a touch while editing the map with controls enabled: %s",
        (isControlsEnabled) => {
            mapEditorModeStore.set(true);
            scene.userInputManager = mock<UserInputManager>({ isControlsEnabled, isRightClickEnabled: true });
            const touch = pointer();
            touch.wasTouch = true;

            handler.handlePointerUpEvent(touch, []);

            expect(scene.moveTo.mock.calls).toEqual([]);
        },
    );

    it("restores right-click navigation after closing the map editor", () => {
        mapEditorModeStore.set(true);
        scene.userInputManager = mock<UserInputManager>({ isControlsEnabled: false, isRightClickEnabled: true });
        handler.handlePointerUpEvent(pointer(2, 1), []);
        expect(scene.moveTo.mock.calls).toEqual([]);

        mapEditorModeStore.set(false);
        scene.userInputManager = mock<UserInputManager>({ isControlsEnabled: true, isRightClickEnabled: true });
        handler.handlePointerUpEvent(pointer(2, 1), []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 480, y: 640 }, true, undefined]]);
    });

    it("activates an interactive object without starting navigation", () => {
        const object = mock<Phaser.GameObjects.GameObject>();
        vi.mocked(isActivatable).mockReturnValue(true);
        handler.handlePointerUpEvent(pointer(), [object]);

        expect(activatablesManager.handlePointerDownEvent.mock.calls).toEqual([[object]]);
        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    describe("overlapping characters", () => {
        function remote(name: string, userUuid: string): RemotePlayer {
            return Object.assign(Object.create(RemotePlayer.prototype) as RemotePlayer, {
                playerName: name,
                userUuid,
                userId: 1,
                pictureStore: readable(undefined),
                scene: {},
                isActivatable: () => true,
            });
        }

        beforeEach(() => {
            characterPickerStore.set(undefined);
            vi.mocked(isActivatable).mockImplementation((object) => object instanceof RemotePlayer);
        });

        it("offers a choice, front-most first, when one click hits several wokas", () => {
            const front = remote("Alice", "uuid-a");
            const hidden = remote("Bob", "uuid-b");
            handler.handlePointerUpEvent(pointer(0, 1), [front, hidden]);

            expect(get(characterPickerStore)?.map((candidate) => candidate.name)).toEqual(["Alice", "Bob"]);
            expect(activatablesManager.handlePointerDownEvent.mock.calls).toEqual([]);
            expect(scene.moveTo.mock.calls).toEqual([]);
        });

        it("opens the woka hidden behind another one once chosen", () => {
            const hidden = remote("Bob", "uuid-b");
            handler.handlePointerUpEvent(pointer(0, 1), [remote("Alice", "uuid-a"), hidden]);
            get(characterPickerStore)?.[1].select();

            expect(activatablesManager.handlePointerDownEvent.mock.calls).toEqual([[hidden]]);
        });

        it("lists one's own woka among the choices", () => {
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                pictureStore: readable(undefined),
            });
            handler.handlePointerUpEvent(pointer(0, 1), [self, remote("Alice", "uuid-a")]);

            expect(get(characterPickerStore)?.map(({ name, isSelf }) => ({ name, isSelf }))).toEqual([
                { name: "Me", isSelf: true },
                { name: "Alice", isSelf: false },
            ]);
        });

        it("opens the own-avatar wheel, runs dance, and exposes a swimwear selection", () => {
            const setAvatarAction = vi.fn();
            const setSwimwear = vi.fn();
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
                setAvatarAction,
                setSwimwear,
            });
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            expect(get(avatarActionsOpenStore)).toBe(true);
            const actions = get(wokaMenuStore)?.actions ?? [];
            expect(actions.map(({ testId }) => testId)).toEqual([
                "avatar-profile",
                "avatar-nerf",
                "avatar-torch",
                "avatar-action-dance",
                "avatar-action-coffee",
                "avatar-change-outfit",
                "avatar-swimwear",
            ]);
            expect(actions.filter(({ testId }) => testId !== "avatar-profile").every(({ icon }) => icon)).toBe(true);
            // The swimsuit is worn in the water, not right away: its entry says so.
            expect(actions.find(({ testId }) => testId === "avatar-swimwear")?.detail).toBe(
                get(LL).woka.menu.swimwearDetail(),
            );
            actions.find(({ testId }) => testId === "avatar-action-dance")?.callback();
            expect(setAvatarAction).toHaveBeenCalledWith(AvatarAction.Dance);
            expect(get(wokaMenuStore)).toBeUndefined();
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            get(wokaMenuStore)
                ?.actions.find(({ testId }) => testId === "avatar-swimwear")
                ?.callback();
            get(wokaMenuStore)
                ?.actions.find(({ testId }) => testId === "avatar-swimwear-twoPiece")
                ?.callback();
            expect(setSwimwear).toHaveBeenCalledWith(Swimwear.TwoPiece);
            expect(get(avatarActionsOpenStore)).toBe(false);
        });

        it.each([false, true])("toggles the Nerf from the own-avatar wheel when equipped is %s", (equipped) => {
            nerfEquippedStore.set(equipped);
            const nerfManager = mock<NerfManager>();
            nerfManager.toggleEquipment.mockImplementation(() => nerfEquippedStore.update((value) => !value));
            Object.defineProperty(scene, "nerfManager", { configurable: true, value: nerfManager });
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
            });
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            const action = get(wokaMenuStore)?.actions.find(({ testId }) => testId === "avatar-nerf");
            expect(action?.actionName).toBe(
                equipped ? get(LL).actionbar.nerf.unequip() : get(LL).actionbar.nerf.equip(),
            );
            action?.callback();
            expect(nerfManager.toggleEquipment.mock.calls).toHaveLength(1);
            expect(get(nerfEquippedStore)).toBe(!equipped);
            expect(get(wokaMenuStore)).toBeUndefined();
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            expect(get(wokaMenuStore)?.actions.find(({ testId }) => testId === "avatar-nerf")?.actionName).toBe(
                equipped ? get(LL).actionbar.nerf.equip() : get(LL).actionbar.nerf.unequip(),
            );
        });

        it.each([false, true])("toggles the torch from the own-avatar wheel when equipped is %s", (equipped) => {
            torchEquippedStore.set(equipped);
            const torchManager = mock<TorchManager>();
            torchManager.toggleEquipment.mockImplementation(() => torchEquippedStore.update((value) => !value));
            Object.defineProperty(scene, "torchManager", { configurable: true, value: torchManager });
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
            });
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            const action = get(wokaMenuStore)?.actions.find(({ testId }) => testId === "avatar-torch");
            expect(action?.icon).toBe("torch");
            expect(action?.actionName).toBe(
                equipped ? get(LL).actionbar.torch.unequip() : get(LL).actionbar.torch.equip(),
            );
            action?.callback();
            expect(torchManager.toggleEquipment.mock.calls).toHaveLength(1);
            expect(get(torchEquippedStore)).toBe(!equipped);
            expect(get(wokaMenuStore)).toBeUndefined();
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            expect(get(wokaMenuStore)?.actions.find(({ testId }) => testId === "avatar-torch")?.actionName).toBe(
                equipped ? get(LL).actionbar.torch.equip() : get(LL).actionbar.torch.unequip(),
            );
            torchEquippedStore.set(false);
        });

        it("offers no swimwear to a costume such as the duck, whose body has no swimwear poses", () => {
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                sprites: new Map([["duck", mock<Phaser.GameObjects.Sprite>()]]),
            });
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            const testIds = (get(wokaMenuStore)?.actions ?? []).map(({ testId }) => testId);
            expect(testIds).not.toContain("avatar-swimwear");
            expect(testIds).toContain("avatar-change-outfit");
            expect(testIds).toContain("avatar-action-dance");
        });

        it("offers a selected scooter only on the own human avatar and equips it permanently", () => {
            vi.spyOn(localUserStore, "getVehicle").mockReturnValue(Vehicle.Skateboard);
            const equipVehicle = vi.fn();
            const self = Object.assign(Object.create(Player.prototype) as unknown as Player, {
                playerName: "Me",
                sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
                equipVehicle,
            });
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            get(wokaMenuStore)
                ?.actions.find(({ testId }) => testId === "avatar-vehicle")
                ?.callback();
            expect(equipVehicle).toHaveBeenCalledWith(VehicleMode.Always);
            Object.assign(self, { sprites: new Map([["duck", mock<Phaser.GameObjects.Sprite>()]]) });
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            expect(get(wokaMenuStore)?.actions.some(({ testId }) => testId === "avatar-vehicle")).toBe(false);
            vi.spyOn(localUserStore, "getVehicle").mockReturnValue(Vehicle.None);
        });

        it("opens a lone woka directly, without a choice", () => {
            const alone = remote("Alice", "uuid-a");
            handler.handlePointerUpEvent(pointer(0, 1), [alone]);

            expect(get(characterPickerStore)).toBeUndefined();
            expect(activatablesManager.handlePointerDownEvent.mock.calls).toEqual([[alone]]);
            expect(get(avatarActionsOpenStore)).toBe(false);
            expect(get(wokaMenuStore)?.actions.some(({ testId }) => testId === "avatar-action-dance")).not.toBe(true);
        });

        it("opens another player's profile after choosing them from overlapping avatars", () => {
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                pictureStore: readable(undefined),
            });
            const other = remote("Alice", "uuid-a");
            vi.spyOn(activatablesManager, "handlePointerDownEvent").mockImplementation(() => {
                wokaMenuStore.initialize(other.playerName, other.userId, other.userUuid, undefined);
            });
            handler.handlePointerUpEvent(pointer(0, 1), [self, other]);
            get(characterPickerStore)
                ?.find(({ isSelf }) => !isSelf)
                ?.select();

            expect(get(wokaMenuStore)?.userUuid).toBe("uuid-a");
            expect(get(wokaMenuStore)?.isSelf).not.toBe(true);
            expect(get(avatarActionsOpenStore)).toBe(false);
            expect(get(wokaMenuStore)?.actions).toEqual([]);
        });

        it("ignores a woka that has left the map while the choice was open", () => {
            const leaving = remote("Bob", "uuid-b");
            handler.handlePointerUpEvent(pointer(0, 1), [remote("Alice", "uuid-a"), leaving]);
            Object.assign(leaving, { scene: undefined });
            get(characterPickerStore)?.[1].select();

            expect(activatablesManager.handlePointerDownEvent.mock.calls).toEqual([]);
        });
    });

    it("does not turn a long press into running", () => {
        const longPress = pointer();
        longPress.getDuration.mockReturnValue(300);
        handler.handlePointerUpEvent(longPress, []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it.each([
        [-1, 48],
        [1504, 48],
        [16, -1],
        [16, 1184],
    ])("does not run into the inaccessible exterior at (%s, %s)", (x, y) => {
        camera.getWorldPoint.mockReturnValue(new Phaser.Math.Vector2(x, y));
        handler.handlePointerUpEvent(pointer(), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("handles an unreachable destination without an unhandled rejection", async () => {
        const error = new Error("No path found");
        const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        scene.moveTo.mockRejectedValue(error);

        handler.handlePointerUpEvent(pointer(), []);
        await Promise.resolve();

        expect(warning).toHaveBeenCalledWith(error);
    });

    describe("camera panning", () => {
        function trackpadScroll(): ReturnType<typeof mock<Phaser.Input.Pointer>> {
            const wheel = pointer();
            wheel.event = new WheelEvent("wheel", { deltaX: 4, deltaY: 6, deltaMode: WheelEvent.DOM_DELTA_PIXEL });
            return wheel;
        }

        it("pans with a two-finger trackpad scroll outside the map editor", () => {
            handler.handleMouseWheelEvent(trackpadScroll(), [], 4, 6, 0);

            expect(cameraManager.startManualPan.mock.calls).toHaveLength(1);
            expect(cameraManager.panBy.mock.calls).toEqual([[4, 6]]);
        });

        it("pans with a two-finger trackpad scroll while editing the map", () => {
            mapEditorModeStore.set(true);
            handler.handleMouseWheelEvent(trackpadScroll(), [], 4, 6, 0);

            expect(cameraManager.panBy.mock.calls).toEqual([[4, 6]]);
        });
    });
});
