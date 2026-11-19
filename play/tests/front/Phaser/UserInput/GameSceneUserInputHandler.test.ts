import * as Phaser from "phaser";
import { get, readable } from "svelte/store";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import { CatastropheKind } from "@workadventure/messages";
import { Vehicle, VehicleMode } from "@wa/front/Phaser/Vehicle/Vehicle";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { waScaleManager } from "@wa/front/Phaser/Services/WaScaleManager";
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
import type { FishingManager } from "../../../../src/front/Phaser/Game/Fishing/FishingManager";
import type { ActivatableInterface } from "../../../../src/front/Phaser/Game/ActivatableInterface";
import {
    fishingContestSetupStore,
    fishingContestStore,
    rodEquippedStore,
} from "../../../../src/front/Stores/FishingStore";
import {
    catastrophePanelStore,
    fireRadiusTilesStore,
    downpourRadiusTilesStore,
    downpourWholeMapStore,
    meteorRadiusTilesStore,
    toggleArmedCatastrophe,
} from "../../../../src/front/Stores/CatastropheStore";
import type { RoomConnection } from "../../../../src/front/Connection/RoomConnection";
import { torchEquippedStore } from "../../../../src/front/Stores/TorchStore";
import type { TorchManager } from "../../../../src/front/Phaser/Game/Torch/TorchManager";
import { findSeatAtPoint } from "../../../../src/front/Phaser/Player/Seat";
import type { Seat } from "../../../../src/front/Phaser/Player/Seat";

const setDefaultCursor = vi.fn();
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
        Object.defineProperty(scene, "input", { configurable: true, value: { setDefaultCursor } });
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
        // Releases what every handler of the test (the extra ones too: they share the scene) subscribed to.
        scene.events.emit(Phaser.Scenes.Events.SHUTDOWN);
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
                "avatar-rod",
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

        it.each([false, true])("toggles the fishing rod from the own-avatar wheel when equipped is %s", (equipped) => {
            rodEquippedStore.set(equipped);
            const fishingManager = mock<FishingManager>();
            fishingManager.toggleEquipment.mockImplementation(() => rodEquippedStore.update((value) => !value));
            Object.defineProperty(scene, "fishingManager", { configurable: true, value: fishingManager });
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
            });
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            const action = get(wokaMenuStore)?.actions.find(({ testId }) => testId === "avatar-rod");
            expect(action?.actionName).toBe(equipped ? get(LL).actionbar.rod.unequip() : get(LL).actionbar.rod.equip());
            expect(action?.icon).toBe("rod");
            action?.callback();
            expect(fishingManager.toggleEquipment.mock.calls).toHaveLength(1);
            expect(get(wokaMenuStore)).toBeUndefined();
            rodEquippedStore.set(false);
        });

        it("offers a fishing contest from the own-avatar wheel, rod in hand and no contest running", () => {
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
            });
            const offered = (): boolean => {
                wokaMenuStore.clear();
                handler.handlePointerUpEvent(pointer(0, 1), [self]);
                return get(wokaMenuStore)?.actions.some(({ testId }) => testId === "avatar-fishing-contest") ?? false;
            };
            const contest = { hostName: "Hugo", minutes: 3, endsAt: 0, rows: [] };
            expect(offered()).toBe(false);
            rodEquippedStore.set(true);
            fishingContestStore.set({ ...contest, finished: false });
            expect(offered()).toBe(false);
            // A podium still shown does not keep the next contest from starting.
            fishingContestStore.set({ ...contest, finished: true });
            expect(offered()).toBe(true);
            fishingContestStore.set(undefined);
            expect(offered()).toBe(true);
            get(wokaMenuStore)
                ?.actions.find(({ testId }) => testId === "avatar-fishing-contest")
                ?.callback();
            expect(get(fishingContestSetupStore)).toBe(true);
            expect(get(wokaMenuStore)).toBeUndefined();
            fishingContestSetupStore.set(false);
            rodEquippedStore.set(false);
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

        it("lets one's tamed animals go from the own-avatar wheel, offered only with an animal", () => {
            const self = Object.assign(Object.create(Player.prototype) as Player, {
                playerName: "Me",
                sprites: new Map([["body1", mock<Phaser.GameObjects.Sprite>()]]),
            });
            scene.tamedAnimalCount.mockReturnValue(0);
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            expect(get(wokaMenuStore)?.actions.some(({ testId }) => testId === "avatar-release-animals")).toBe(false);
            wokaMenuStore.clear();
            scene.tamedAnimalCount.mockReturnValue(2);
            handler.handlePointerUpEvent(pointer(0, 1), [self]);
            const action = get(wokaMenuStore)?.actions.find(({ testId }) => testId === "avatar-release-animals");
            expect(action?.icon).toBe("paw");
            expect(action?.actionName).toBe(get(LL).woka.menu.releaseAnimals({ count: 2 }));
            action?.callback();
            expect(scene.releaseTamedAnimals.mock.calls).toHaveLength(1);
            expect(get(wokaMenuStore)).toBeUndefined();
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

    describe("the space key and the fishing rod", () => {
        const space = (type: "keydown" | "keyup", repeat = false): KeyboardEvent =>
            new KeyboardEvent(type, { code: "Space", key: " ", repeat, cancelable: true });
        let fishingManager: ReturnType<typeof mock<FishingManager>>;

        beforeEach(() => {
            fishingManager = mock<FishingManager>();
            Object.defineProperty(fishingManager, "isEquipped", { configurable: true, value: true });
            Object.defineProperty(scene, "fishingManager", { configurable: true, value: fishingManager });
            // What the key does without the rod: the texts of the player.
            Object.assign(scene.CurrentPlayer, { handlePressSpacePlayerTextCallback: vi.fn() });
        });

        afterEach(() => {
            // clearAllMocks keeps the values a test made a mock return.
            activatablesManager.getSelectedActivatableObject.mockReset();
            activatablesManager.isSelectingByDistanceEnabled.mockReset();
        });

        it("charges the cast while the key is held and casts when it goes up", () => {
            const down = handler.handleKeyDownEvent(space("keydown"));
            expect(down.defaultPrevented).toBe(true);
            handler.handleKeyDownEvent(space("keydown", true));
            expect(fishingManager.pressKey.mock.calls).toEqual([[false], [true]]);
            handler.handleKeyUpEvent(space("keyup"));
            expect(fishingManager.releaseKey.mock.calls).toHaveLength(1);
        });

        it("leaves the key to a prompt that is shown", () => {
            const prompt = vi.fn();
            handler.addSpaceEventListener(prompt);
            handler.handleKeyDownEvent(space("keydown"));
            handler.handleKeyUpEvent(space("keyup"));
            expect(fishingManager.pressKey.mock.calls).toHaveLength(0);
            expect(fishingManager.releaseKey.mock.calls).toHaveLength(0);
            handler.removeSpaceEventListener(prompt);
            handler.handleKeyDownEvent(space("keydown"));
            expect(fishingManager.pressKey.mock.calls).toHaveLength(1);
        });

        it("leaves the key to an object the avatar stands next to", () => {
            activatablesManager.getSelectedActivatableObject.mockReturnValue(
                mock<ActivatableInterface>({ isActivatable: () => true }),
            );
            activatablesManager.isSelectingByDistanceEnabled.mockReturnValue(true);
            handler.handleKeyDownEvent(space("keydown"));
            expect(fishingManager.pressKey.mock.calls).toHaveLength(0);
        });

        it("still casts when a prompt came up while the key was held", () => {
            handler.handleKeyDownEvent(space("keydown"));
            handler.addSpaceEventListener(vi.fn());
            handler.handleKeyDownEvent(space("keydown", true));
            handler.handleKeyUpEvent(space("keyup"));
            expect(fishingManager.pressKey.mock.calls).toHaveLength(2);
            expect(fishingManager.releaseKey.mock.calls).toHaveLength(1);
        });

        it("does nothing with the rod in the map editor, nor with the rod put away", () => {
            mapEditorModeStore.set(true);
            handler.handleKeyDownEvent(space("keydown"));
            mapEditorModeStore.set(false);
            Object.defineProperty(fishingManager, "isEquipped", { configurable: true, value: false });
            handler.handleKeyDownEvent(space("keydown"));
            handler.handleKeyUpEvent(space("keyup"));
            expect(fishingManager.pressKey.mock.calls).toHaveLength(0);
            expect(fishingManager.releaseKey.mock.calls).toHaveLength(0);
        });
    });

    describe("an armed catastrophe", () => {
        const launch = vi.fn();

        function arm(): void {
            catastrophePanelStore.set(true);
            toggleArmedCatastrophe("meteor");
        }

        beforeEach(() => {
            scene.connection = mock<RoomConnection>({ emitLaunchCatastrophe: launch });
        });

        afterEach(() => {
            catastrophePanelStore.set(false);
        });

        it("the canvas shows a crosshair while armed, and the usual cursor after", () => {
            arm();
            expect(setDefaultCursor).toHaveBeenLastCalledWith("crosshair");

            catastrophePanelStore.set(false);
            expect(setDefaultCursor).toHaveBeenLastCalledWith("auto");
        });

        it("an armed meteor takes the left click", () => {
            arm();
            handler.handlePointerUpEvent(pointer(0, 1), []);

            expect(launch.mock.calls).toEqual([[CatastropheKind.CATASTROPHE_METEOR, 480, 640, 4]]);
            expect(scene.moveTo.mock.calls).toEqual([]);
        });

        it("launches the meteor of the size chosen in the panel", () => {
            arm();
            meteorRadiusTilesStore.set(12);
            handler.handlePointerUpEvent(pointer(0, 1), []);
            meteorRadiusTilesStore.set(4);

            expect(launch.mock.calls).toEqual([[CatastropheKind.CATASTROPHE_METEOR, 480, 640, 12]]);
        });

        it("sets a patch of fire of the size chosen where the fire is armed and the map is clicked", () => {
            catastrophePanelStore.set(true);
            toggleArmedCatastrophe("fire");
            fireRadiusTilesStore.set(5);
            handler.handlePointerUpEvent(pointer(0, 1), []);
            fireRadiusTilesStore.set(2);

            expect(launch.mock.calls).toEqual([[CatastropheKind.CATASTROPHE_FIRE, 480, 640, 5]]);
            expect(scene.moveTo.mock.calls).toEqual([]);
        });

        it("takes the click before an activatable object", () => {
            arm();
            vi.mocked(isActivatable).mockReturnValue(true);
            handler.handlePointerUpEvent(pointer(0, 1), [mock<Phaser.GameObjects.GameObject>()]);

            expect(launch).toHaveBeenCalledTimes(1);
            expect(activatablesManager.handlePointerDownEvent.mock.calls).toEqual([]);
        });

        it("a double click while armed does not walk", () => {
            arm();
            handler.handlePointerUpEvent(pointer(0, 2), []);

            expect(launch).toHaveBeenCalledTimes(1);
            expect(scene.moveTo.mock.calls).toEqual([]);
        });

        it("a one-finger tap launches, a long press does not", () => {
            arm();
            const tap = pointer();
            tap.wasTouch = true;
            handler.handlePointerUpEvent(tap, []);
            expect(launch).toHaveBeenCalledTimes(1);

            const press = pointer();
            press.wasTouch = true;
            press.getDuration.mockReturnValue(600);
            handler.handlePointerUpEvent(press, []);
            expect(launch).toHaveBeenCalledTimes(1);
        });

        it("a drag of the map launches nothing", () => {
            arm();
            const down = pointer();
            down.x = 100;
            down.y = 100;
            handler.handlePointerDownEvent(down, []);
            const moved = pointer();
            Object.defineProperty(moved, "id", { value: down.id });
            moved.x = 160;
            moved.y = 100;
            handler.handlePointerMoveEvent(moved, []);
            handler.handlePointerUpEvent(moved, []);

            expect(launch).not.toHaveBeenCalled();
        });

        describe("a downpour", () => {
            let ticks: (() => void)[];
            const remove = vi.fn();

            function armDownpour(): void {
                catastrophePanelStore.set(true);
                toggleArmedCatastrophe("downpour");
            }
            function held(): ReturnType<typeof pointer> {
                const result = pointer(0, 1);
                result.isDown = true;
                return result;
            }

            beforeEach(() => {
                ticks = [];
                Object.defineProperty(scene, "time", {
                    configurable: true,
                    value: {
                        addEvent: (config: { callback: () => void }) => {
                            ticks.push(config.callback);
                            return { remove };
                        },
                    },
                });
            });

            afterEach(() => {
                downpourWholeMapStore.set(false);
                downpourRadiusTilesStore.set(3);
            });

            it("rains under the pointer as soon as the click is pressed, and again while it is held", () => {
                armDownpour();
                handler.handlePointerDownEvent(held(), []);
                expect(launch.mock.calls).toEqual([[CatastropheKind.CATASTROPHE_DOWNPOUR, 480, 640, 3, false]]);

                camera.getWorldPoint.mockReturnValue(new Phaser.Math.Vector2(500, 700));
                ticks[0]();
                expect(launch.mock.calls[1]).toEqual([CatastropheKind.CATASTROPHE_DOWNPOUR, 500, 700, 3, false]);
            });

            it("holding the click does not drag the map, and releasing it launches nothing more", () => {
                armDownpour();
                const press = held();
                handler.handlePointerDownEvent(press, []);
                handler.handlePointerMoveEvent(press, []);
                expect(cameraManager.startManualPan.mock.calls).toEqual([]);
                expect(remove).not.toHaveBeenCalled();

                handler.handlePointerUpEvent(pointer(0, 1), []);
                expect(remove).toHaveBeenCalled();
                expect(launch).toHaveBeenCalledTimes(1);
                expect(scene.moveTo.mock.calls).toEqual([]);
            });

            it("carries the size and the whole map chosen in the panel", () => {
                armDownpour();
                downpourRadiusTilesStore.set(9);
                downpourWholeMapStore.set(true);
                handler.handlePointerDownEvent(held(), []);
                expect(launch.mock.calls).toEqual([[CatastropheKind.CATASTROPHE_DOWNPOUR, 480, 640, 9, true]]);
            });

            it("stops once the click is no longer held or the downpour is disarmed, and keeps the cloud on the map", () => {
                armDownpour();
                const press = held();
                camera.getWorldPoint.mockReturnValue(new Phaser.Math.Vector2(-50, 9999));
                handler.handlePointerDownEvent(press, []);
                expect(launch.mock.calls[0].slice(1, 3)).toEqual([0, 1183]);

                press.isDown = false;
                ticks[0]();
                expect(launch).toHaveBeenCalledTimes(1);
                expect(remove).toHaveBeenCalled();

                remove.mockClear();
                handler.handlePointerDownEvent(held(), []);
                catastrophePanelStore.set(false);
                expect(remove).toHaveBeenCalled();
            });

            it("does not rain with the right button", () => {
                armDownpour();
                const right = pointer(2, 1);
                right.isDown = true;
                handler.handlePointerDownEvent(right, []);
                expect(launch).not.toHaveBeenCalled();
            });
        });

        it("nothing is launched with the right button, in the editor, or unarmed", () => {
            arm();
            handler.handlePointerUpEvent(pointer(2, 1), []);
            expect(launch).not.toHaveBeenCalled();

            mapEditorModeStore.set(true);
            handler.handlePointerUpEvent(pointer(0, 1), []);
            expect(launch).not.toHaveBeenCalled();
            mapEditorModeStore.set(false);

            catastrophePanelStore.set(false);
            handler.handlePointerUpEvent(pointer(0, 1), []);
            expect(launch).not.toHaveBeenCalled();
        });

        it("launches nothing outside the map", () => {
            arm();
            camera.getWorldPoint.mockReturnValue(new Phaser.Math.Vector2(-5, 640));
            handler.handlePointerUpEvent(pointer(0, 1), []);

            expect(launch).not.toHaveBeenCalled();
        });

        it("a click the canvas did not receive launches nothing", () => {
            const windowListen = vi.spyOn(window, "addEventListener");
            const documentListen = vi.spyOn(document, "addEventListener");
            try {
                arm();
                new GameSceneUserInputHandler(scene);

                const pointerLike = /^(pointer|mouse|click|touch)/;
                const listened = [...windowListen.mock.calls, ...documentListen.mock.calls].map(([type]) =>
                    String(type),
                );
                expect(listened.filter((type) => pointerLike.test(type))).toEqual([]);
                expect(launch.mock.calls).toEqual([]);
            } finally {
                windowListen.mockRestore();
                documentListen.mockRestore();
            }
        });
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

        it("pans inside a focus zone too (a personal desk, a meeting room): the zone frames the view, it does not hold it", () => {
            waScaleManager.setFocusTarget({ x: 100, y: 100, width: 192, height: 224 });
            try {
                handler.handleMouseWheelEvent(trackpadScroll(), [], 4, 6, 0);
            } finally {
                waScaleManager.setFocusTarget();
            }

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
