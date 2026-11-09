import * as Phaser from "phaser";
import { get } from "svelte/store";
import * as Sentry from "@sentry/svelte";
import { getTileCenter } from "@wa/front/Phaser/Player/TileSnap";
import { Player } from "@wa/front/Phaser/Player/Player";
import { RemotePlayer } from "@wa/front/Phaser/Entity/RemotePlayer";
import type { UserInputHandlerInterface } from "@wa/front/Interfaces/UserInputHandlerInterface";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import { mapEditorModeStore, mapExplorationModeStore } from "@wa/front/Stores/MapEditorStore";
import { isActivatable } from "@wa/front/Phaser/Game/ActivatableInterface";
import { mapManagerActivated } from "@wa/front/Stores/MenuStore";
import { displayEmote, isEmoteIndex } from "@wa/front/Stores/EmoteStore";
import { analyticsClient } from "@wa/front/Administration/AnalyticsClient";
import { navChat } from "@wa/front/Chat/Stores/ChatStore";
import { chatVisibilityStore } from "@wa/front/Stores/ChatStore";
import { popupStore } from "@wa/front/Stores/PopupStore";
import SayPopUp from "@wa/front/Components/PopUp/SayPopUp.svelte";
import { isPopupJustClosed } from "@wa/front/Phaser/Game/Say/SayManager";
import LL from "@wa/i18n/i18n-svelte";
import { followRoleStore, followStateStore, followUsersStore } from "@wa/front/Stores/FollowStore";
import { localUserStore } from "@wa/front/Connection/LocalUserStore";
import { wokaMenuStore } from "@wa/front/Stores/WokaMenuStore";
import { characterPickerStore, type CharacterPickerCandidate } from "@wa/front/Stores/CharacterPickerStore";
import { Vehicle, VehicleMode } from "@wa/front/Phaser/Vehicle/Vehicle";
import { isHumanAvatar } from "@wa/front/Phaser/Entity/MusicHeadphonesEffect";
import { AvatarAction } from "@wa/front/Phaser/Entity/AvatarAction";
import { Swimwear } from "@wa/front/Phaser/Entity/Swimwear";
import { ENABLE_TILE_SNAP, WOKA_SPEED } from "@wa/front/Enum/EnvironmentVariable";
import { cameraDetachedStore } from "@wa/front/Stores/CameraStore";
import { waScaleManager } from "@wa/front/Phaser/Services/WaScaleManager";
import { MapDragPointerCapture } from "./MapDragPointerCapture";
import { MapDragGesture } from "./MapDragGesture";
import { MapPanShortcut } from "./MapPanShortcut";
import type { Shortcut } from "./UserInputManager";

import Pointer = Phaser.Input.Pointer;
import GameObject = Phaser.GameObjects.GameObject;

// A notched mouse wheel reports a deltaY of about 100 per notch, a trackpad pinch (a wheel event with ctrlKey) reports a
// burst of tiny deltas. The zoom formula is tuned for the wheel, so a pinch needs a gain to feel as fast as a few notches.
// 6 is close to the pinch gain used by d3-zoom and most map/design tools.
const PINCH_ZOOM_RATE_MULTIPLIER = 6;
// Under this |deltaY|, a ctrlKey wheel event is a pinch. A Ctrl+notched-wheel keeps the normal rate.
const PINCH_MAX_DELTA_Y = 50;

/**
 * A trackpad two-finger scroll is told apart from a notched mouse wheel: a notched wheel (Windows/Linux) reports
 * multiples of 120 on the legacy wheelDeltaY and never scrolls horizontally, a trackpad reports continuous values.
 * Pinch gestures and Ctrl+wheel (ctrlKey) are zoom gestures and are never treated as a scroll.
 */
function isTrackpadScroll(event: WheelEvent): boolean {
    if (event.ctrlKey || event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
        return false;
    }
    const wheelDeltaY = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
    return event.deltaX !== 0 || (wheelDeltaY !== undefined && wheelDeltaY % 120 !== 0);
}

export class GameSceneUserInputHandler implements UserInputHandlerInterface {
    private gameScene: GameScene;
    private controlKeyisPressed: boolean = false;
    private readonly mapDrag = new MapDragGesture();
    private draggingMap = false;
    // The current touch gesture involved two fingers or more (a pinch): lifting a finger must not count as a tap.
    private multiTouch = false;
    private pinchFreedView = false;
    private readonly pointerCapture: MapDragPointerCapture;
    private readonly panShortcut: MapPanShortcut;
    private readonly spaceKey: Phaser.Input.Keyboard.Key | undefined;
    public shortcuts: Shortcut[] = [];

    constructor(gameScene: GameScene) {
        this.gameScene = gameScene;
        this.pointerCapture = new MapDragPointerCapture(
            gameScene.game.canvas,
            () => this.canDragMap(),
            () => this.handlePointerCancelEvent(),
        );
        // Same Key object as the "interact" key: addKey returns the existing one.
        this.spaceKey = gameScene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
        this.panShortcut = new MapPanShortcut(gameScene.game.canvas, {
            // Middle button everywhere. Space + left button only in the map editor: in game mode, Space interacts.
            canStart: (event) =>
                (event.button === 1 ||
                    (event.button === 0 && this.spaceKey?.isDown === true && get(mapEditorModeStore))) &&
                this.canMoveView(),
            start: () => this.gameScene.getCameraManager().startManualPan(),
            pan: (deltaX, deltaY) => {
                // CSS pixels to game pixels, the unit Phaser pointers (and so panBy) use.
                const scale = this.gameScene.scale.displayScale;
                this.gameScene.getCameraManager().panBy(deltaX * scale.x, deltaY * scale.y);
            },
        });
        gameScene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.pointerCapture.destroy();
            this.panShortcut.destroy();
        });

        this.initShortcuts();
    }

    public initShortcuts() {
        this.shortcuts = [
            {
                key: "C",
                description: get(LL).menu.shortcuts.openChat(),
            },
            {
                key: "U",
                description: get(LL).menu.shortcuts.openUserList(),
            },
            {
                key: "E",
                description: get(LL).menu.shortcuts.toggleMapEditor(),
            },
            {
                key: "R",
                description: get(LL).menu.shortcuts.rotatePlayer(),
            },
            {
                key: "1",
                description: get(LL).menu.shortcuts.emote1(),
            },
            {
                key: "2",
                description: get(LL).menu.shortcuts.emote2(),
            },
            {
                key: "3",
                description: get(LL).menu.shortcuts.emote3(),
            },
            {
                key: "4",
                description: get(LL).menu.shortcuts.emote4(),
            },
            {
                key: "5",
                description: get(LL).menu.shortcuts.emote5(),
            },
            {
                key: "6",
                description: get(LL).menu.shortcuts.emote6(),
            },
            // Enter
            {
                key: "Enter",
                description: get(LL).menu.shortcuts.openSayPopup(),
            },
            // Ctrl + Enter
            {
                key: "Enter",
                description: get(LL).menu.shortcuts.openThinkPopup(),
                ctrlKey: true,
            },
            // Cmd (Mac) / Ctrl (Windows & Linux) + D
            {
                key: "D",
                description: get(LL).menu.shortcuts.walkMyDesk(),
                ctrlKey: true,
            },
            // F
            {
                key: "F",
                description: get(LL).menu.shortcuts.follow(),
            },
        ];
    }

    public handleMouseWheelEvent(
        pointer: Pointer,
        gameObjects: GameObject[],
        deltaX: number,
        deltaY: number,
        deltaZ: number,
    ): void {
        const event = pointer.event;
        if (event instanceof WheelEvent && isTrackpadScroll(event) && this.canMoveView()) {
            // Two-finger scroll on a trackpad moves the view, in the map editor too. Pinch and Ctrl+wheel
            // (ctrlKey) and notched mouse wheels still zoom.
            const cameraManager = this.gameScene.getCameraManager();
            if (!get(mapEditorModeStore) && !get(cameraDetachedStore)) {
                cameraManager.startManualPan();
            }
            cameraManager.panBy(deltaX, deltaY);
            return;
        }
        const isPinch = event instanceof WheelEvent && event.ctrlKey && Math.abs(deltaY) < PINCH_MAX_DELTA_Y;
        this.gameScene.handleMouseWheel(deltaY, pointer, isPinch ? PINCH_ZOOM_RATE_MULTIPLIER : 1);
    }

    public handlePointerUpEvent(pointer: Pointer, gameObjects: GameObject[]): void {
        if (pointer.leftButtonReleased()) {
            const wasDragging = this.draggingMap;
            const dragged = this.mapDrag.end(pointer.id);
            this.restoreDragCursor();
            this.pointerCapture.release();
            if (dragged) {
                if (wasDragging && this.canDragMap() && pointer.velocity) {
                    this.gameScene.getCameraManager().releaseManualPan(pointer.velocity);
                }
                return;
            }
        }
        if (pointer.wasTouch && this.multiTouch) {
            return;
        }
        if (get(mapEditorModeStore)) {
            return;
        }
        if (pointer.wasTouch || pointer.leftButtonReleased()) {
            if (!this.gameScene.userInputManager.isControlsEnabled) {
                return;
            }
            for (const object of gameObjects) {
                const isCharacter = object instanceof Player || object instanceof RemotePlayer;
                if (isCharacter && this.offerCharacterChoice(gameObjects, pointer)) {
                    return;
                }
                if (isActivatable(object)) {
                    this.gameScene.getActivatablesManager().handlePointerDownEvent(object);
                    return;
                }
                if (object instanceof Player) {
                    this.toggleOwnCard(object, pointer);
                    return;
                }
            }
        }

        // Phaser keeps the native mouseup event, including the browser's double-click count.
        const isDoubleClick =
            !pointer.wasTouch &&
            pointer.leftButtonReleased() &&
            pointer.event instanceof MouseEvent &&
            pointer.event.detail === 2;

        if ((!pointer.wasTouch && pointer.leftButtonReleased() && !isDoubleClick) || pointer.getDuration() > 250) {
            return;
        }

        if (isDoubleClick && !this.gameScene.userInputManager.isControlsEnabled) {
            return;
        }

        if (
            !this.gameScene.userInputManager.isControlsEnabled &&
            !this.gameScene.userInputManager.isRightClickEnabled
        ) {
            return;
        }

        // If right click is disabled, we don't want to move the player
        if (!this.gameScene.userInputManager.isRightClickEnabled) {
            return;
        }

        for (const object of gameObjects) {
            if (object instanceof Player || object instanceof RemotePlayer) {
                return;
            }
        }
        const cameraManager = this.gameScene.getCameraManager();
        const worldPoint = cameraManager.getCamera().getWorldPoint(pointer.x, pointer.y);
        if (
            isDoubleClick &&
            (worldPoint.x < 0 ||
                worldPoint.y < 0 ||
                worldPoint.x >= this.gameScene.Map.widthInPixels ||
                worldPoint.y >= this.gameScene.Map.heightInPixels)
        ) {
            return;
        }
        // A double-click ends at the center of the targeted tile, like the avatar does when it stops.
        const target =
            isDoubleClick && ENABLE_TILE_SNAP ? this.getTileCenterOf(worldPoint.x, worldPoint.y) : worldPoint;
        // Keep the avatar and the spot the user pointed at in view while walking there.
        const walk = cameraManager.startWalkFraming({ x: target.x, y: target.y });
        this.gameScene
            .moveTo(
                {
                    x: target.x,
                    y: target.y,
                },
                true,
                isDoubleClick ? WOKA_SPEED * 2.5 : undefined,
            )
            .catch((reason) => {
                console.warn(reason);
            })
            .finally(() => cameraManager.endWalkFraming(walk));
    }

    private getTileCenterOf(x: number, y: number): { x: number; y: number } {
        const { width, height } = this.gameScene.getGameMapFrontWrapper().getTileDimensions();
        return getTileCenter(x, y, width, height);
    }

    /**
     * Several wokas under one click (people standing on the same spot): let the user pick one instead of always
     * opening the front-most one, which made a character hidden behind another unreachable.
     * Returns false when only one character is clickable here, so the usual click handling applies.
     */
    private offerCharacterChoice(gameObjects: GameObject[], pointer: Pointer): boolean {
        const candidates: CharacterPickerCandidate[] = [];
        for (const object of gameObjects) {
            if (object instanceof Player) {
                candidates.push({
                    key: "self",
                    name: object.playerName,
                    pictureStore: object.pictureStore,
                    isSelf: true,
                    select: () => this.toggleOwnCard(object, pointer),
                });
            } else if (object instanceof RemotePlayer && object.isActivatable()) {
                candidates.push({
                    key: object.userUuid || `user-${object.userId}`,
                    name: object.playerName,
                    pictureStore: object.pictureStore,
                    isSelf: false,
                    select: () => {
                        // The woka may have left the map while the choice was open.
                        if (!object.scene) return;
                        this.gameScene.getActivatablesManager().handlePointerDownEvent(object);
                    },
                });
            }
        }
        if (candidates.length < 2) {
            characterPickerStore.set(undefined);
            return false;
        }
        wokaMenuStore.clear();
        characterPickerStore.set(candidates);
        return true;
    }

    /** A click on one's own woka shows one's own card, as others see it, without the actions meant for others. */
    private toggleOwnCard(player: Player, pointer: Pointer): void {
        const uuid = localUserStore.getLocalUser()?.uuid;
        if (!uuid) return;
        if (get(wokaMenuStore)?.isSelf) {
            wokaMenuStore.clear();
            return;
        }
        const position =
            pointer.event instanceof MouseEvent
                ? { x: pointer.event.clientX, y: pointer.event.clientY }
                : { x: pointer.x, y: pointer.y };
        wokaMenuStore.openOwnCard(player.playerName, uuid, position);
        wokaMenuStore.addAction({
            actionName: get(LL).woka.menu.profile(),
            emoji: "👤",
            testId: "avatar-profile",
            callback: () => wokaMenuStore.openOwnCard(player.playerName, uuid),
        });
        // A costume such as the duck has no swimwear poses nor skateboard pose.
        const human = isHumanAvatar(player.sprites.keys());
        if (localUserStore.getVehicle() !== Vehicle.None && human) {
            const equipped = player.vehicleMode === VehicleMode.Always;
            wokaMenuStore.addAction({
                actionName: equipped ? get(LL).woka.vehicle.dismount() : get(LL).woka.vehicle.mount(),
                emoji: "🛹",
                icon: "skateboard",
                testId: "avatar-vehicle",
                callback: () => {
                    player.equipVehicle(equipped ? VehicleMode.Off : VehicleMode.Always);
                    wokaMenuStore.clear();
                },
            });
        }
        // No "stop": moving ends any action.
        for (const action of [AvatarAction.Dance, AvatarAction.Coffee] as const) {
            wokaMenuStore.addAction({
                actionName: get(LL).woka.actions[action](),
                emoji: action === AvatarAction.Dance ? "🕺" : "☕",
                icon: action === AvatarAction.Dance ? "dance" : "coffee",
                testId: `avatar-action-${action}`,
                callback: () => {
                    player.setAvatarAction(action);
                    wokaMenuStore.clear();
                },
            });
        }
        wokaMenuStore.addAction({
            actionName: get(LL).woka.menu.changeOutfit(),
            emoji: "👕",
            icon: "outfit",
            testId: "avatar-change-outfit",
            callback: () => {
                wokaMenuStore.clear();
                Promise.all([
                    import("@wa/front/Phaser/Game/GameManager"),
                    import("@wa/front/Phaser/Login/SelectCharacterScene"),
                    import("@wa/front/Stores/SelectCharacterStore"),
                ])
                    .then(
                        ([
                            { gameManager },
                            { SelectCharacterScene, SelectCharacterSceneName },
                            { selectCharacterSceneVisibleStore },
                        ]) => {
                            selectCharacterSceneVisibleStore.set(true);
                            gameManager.leaveGame(SelectCharacterSceneName, new SelectCharacterScene());
                        },
                    )
                    .catch((error) => console.error("Could not open avatar customization", error));
            },
        });
        if (human) {
            wokaMenuStore.addAction({
                actionName: get(LL).woka.menu.swimwear(),
                emoji: "🩱",
                icon: "swimwear",
                testId: "avatar-swimwear",
                callback: () => {
                    wokaMenuStore.openOwnCard(player.playerName, uuid, position, get(LL).woka.menu.swimwearHint());
                    for (const style of Object.values(Swimwear)) {
                        wokaMenuStore.addAction({
                            actionName: get(LL).woka.swimwear[style](),
                            emoji: style === Swimwear.TwoPiece ? "👙" : style === Swimwear.Shorts ? "🩳" : "🩱",
                            icon:
                                style === Swimwear.TwoPiece
                                    ? "twoPiece"
                                    : style === Swimwear.Shorts
                                      ? "shorts"
                                      : "onePiece",
                            testId: `avatar-swimwear-${style}`,
                            callback: () => {
                                player.setSwimwear(style);
                                wokaMenuStore.clear();
                            },
                        });
                    }
                },
            });
        }
    }

    public handlePointerDownEvent(pointer: Pointer, gameObjects: GameObject[]): void {
        if (pointer.wasTouch) {
            // A first finger starts a new gesture; a second one turns it into a pinch and ends the one-finger drag.
            this.multiTouch = this.touchPointersDown() > 1;
            if (!this.multiTouch) this.pinchFreedView = false;
            if (this.multiTouch) {
                this.handlePointerCancelEvent();
                return;
            }
        }
        if (!pointer.leftButtonDown() || !this.canDragMap()) {
            return;
        }
        pointer.motionFactor = 0.35;
        this.gameScene.getCameraManager().stopManualPanInertia();
        this.restoreDragCursor();
        this.mapDrag.begin(pointer);
    }

    public handlePointerMoveEvent(pointer: Pointer, gameObjects: GameObject[]): void {
        if (pointer.wasTouch && this.multiTouch) {
            return;
        }
        if (!pointer.leftButtonDown()) {
            if (this.draggingMap) this.handlePointerCancelEvent();
            return;
        }
        if (!this.canDragMap()) {
            this.handlePointerCancelEvent();
            return;
        }
        const delta = this.mapDrag.move(pointer);
        if (!delta) {
            return;
        }
        const cameraManager = this.gameScene.getCameraManager();
        if (!this.draggingMap) {
            cameraManager.startManualPan();
            this.draggingMap = true;
            this.gameScene.input.setDefaultCursor("grabbing");
        }
        cameraManager.panBy(delta.x, delta.y);
    }

    public handlePointerOutEvent(): void {
        if (this.draggingMap && !this.pointerCapture.active) this.handlePointerCancelEvent();
    }

    public handlePointerCancelEvent(): void {
        this.pointerCapture.release();
        this.gameScene.getCameraManager().stopManualPanInertia();
        this.mapDrag.cancel();
        this.restoreDragCursor();
    }

    /** Whether the user may move the view: not behind a modal or a zoom lock, nor (in game mode) in a focus zone. */
    private canMoveView(): boolean {
        if (!this.gameScene.userInputManager.isControlsEnabled || this.gameScene.getCameraManager().isZoomLocked()) {
            return false;
        }
        // The explorer list sets a focus target on hover, which must not hold the editor's view like a focus zone.
        return get(mapEditorModeStore) || !waScaleManager.getFocusTarget();
    }

    private canDragMap(): boolean {
        // The other editor tools use the left drag themselves; they pan with MapPanShortcut instead.
        return this.canMoveView() && (!get(mapEditorModeStore) || get(mapExplorationModeStore));
    }

    public handlePinch(zoomFactor: number, centre: { x: number; y: number }, pan: { x: number; y: number }): void {
        const cameraManager = this.gameScene.getCameraManager();
        if (this.canMoveView()) {
            // As in map apps, a pinch keeps the map under the fingers: its first move frees the view from the avatar.
            if (!this.pinchFreedView) {
                cameraManager.startManualPan();
                this.pinchFreedView = true;
            }
            cameraManager.panBy(pan.x, pan.y);
        }
        this.gameScene.zoomByFactor(zoomFactor, false, this.gameScene.zoomAnchor(centre));
    }

    private touchPointersDown(): number {
        return this.gameScene.input.manager.pointers.filter((pointer) => pointer.wasTouch && pointer.isDown).length;
    }

    private restoreDragCursor(): void {
        if (this.draggingMap) {
            this.gameScene.input.setDefaultCursor(get(mapExplorationModeStore) ? "grab" : "auto");
            this.draggingMap = false;
        }
    }

    private handleKeyF() {
        const state = get(followStateStore);

        if (state === "off" && this.gameScene.groups.size > 0) {
            this.sendFollowRequest();
        } else if (state === "active") {
            followStateStore.set("ending");
            this.gameScene.connection?.emitFollowAbort();
            followUsersStore.stopFollowing();
        }
    }

    public sendFollowRequest() {
        this.gameScene.connection?.emitFollowRequest();
        followRoleStore.set("leader");
        followStateStore.set("active");
    }

    private handleKeyC() {
        if (!this.gameScene.room.isChatEnabled) return;

        const isChatVisible = get(chatVisibilityStore);
        const isInMapEditor = get(mapEditorModeStore);
        const currentNav = get(navChat).key;

        if (currentNav === "users" && isChatVisible) {
            navChat.switchToChat();
        } else if (!isChatVisible && !isInMapEditor) {
            navChat.switchToChat();
            chatVisibilityStore.set(true);
        } else if (isChatVisible) {
            chatVisibilityStore.set(false);
        }
    }
    private handleKeyU() {
        const isChatVisible = get(chatVisibilityStore);
        const isInMapEditor = get(mapEditorModeStore);
        const currentNav = get(navChat).key;
        if (!this.gameScene.room.isChatOnlineListEnabled) return;
        if (currentNav === "chat" && isChatVisible) {
            navChat.switchToUserList();
        } else if (!isChatVisible && !isInMapEditor) {
            navChat.switchToUserList();
            chatVisibilityStore.set(true);
        } else if (isChatVisible) {
            chatVisibilityStore.set(false);
        }
    }
    public handleKeyDownEvent(event: KeyboardEvent): KeyboardEvent {
        const hasExecutedCommand = this.gameScene.getMapEditorModeManager()?.handleKeyDownEvent(event);
        if (hasExecutedCommand) {
            return event;
        }

        switch (event.code) {
            case "KeyE": {
                if (get(mapManagerActivated) == false) return event;
                mapEditorModeStore.switchMode(!get(mapEditorModeStore));
                break;
            }
            case "KeyR": {
                this.gameScene.CurrentPlayer?.rotate();
                break;
            }
            case "KeyC":
                this.handleKeyC();
                break;
            case "KeyU":
                this.handleKeyU();
                break;
            case "KeyD": {
                // Handle Cmd (Mac) / Ctrl (Windows & Linux) + D for "walk my desk"
                if (event.metaKey || event.ctrlKey) {
                    // Prevent the shortcut from being triggered when typing in input fields
                    if (
                        event.target instanceof HTMLInputElement ||
                        event.target instanceof HTMLTextAreaElement ||
                        event.target instanceof HTMLSelectElement
                    ) {
                        return event;
                    }
                    event.preventDefault();
                    this.gameScene.walkToPersonalDesk().catch((error) => {
                        console.warn("Error walking to personal desk", error);
                    });
                }
                break;
            }
            case "Digit1":
            case "Digit2":
            case "Digit3":
            case "Digit4":
            case "Digit5":
            case "Digit6": {
                // Extract the digit from event.code (e.g., "Digit1" -> 1)
                const digit = event.code.replace("Digit", "");
                const emoteIndex = Number.parseInt(digit, 10);

                if (isEmoteIndex(emoteIndex)) {
                    displayEmote(emoteIndex);
                } else {
                    console.warn(`Invalid emote index: ${emoteIndex}`);
                    Sentry.captureException(new Error(`Invalid emote index: ${emoteIndex}`));
                }
                break;
            }
            case "KeyF": {
                this.handleKeyF();
                break;
            }
            default: {
                break;
            }
        }

        switch (event.key) {
            case "Control": {
                this.controlKeyisPressed = true;
                break;
            }
            default: {
                break;
            }
        }

        return event;
    }

    private openSayPopup(): void {
        if (!this.gameScene.room.isSayEnabled) {
            return;
        }
        // Don't open if we just closed.
        if (isPopupJustClosed() || popupStore.hasPopup("say")) {
            return;
        }
        popupStore.addPopup(SayPopUp, { type: this.controlKeyisPressed ? "think" : "say" }, "say");
        if (this.controlKeyisPressed) {
            analyticsClient.trackAdminEvent("bubble.think.opened");
        } else {
            analyticsClient.trackAdminEvent("bubble.say.opened");
        }
    }

    public handleKeyUpEvent(event: KeyboardEvent): KeyboardEvent {
        switch (event.key) {
            case "Escape": {
                const dismissed = this.gameScene.CurrentPlayer?.dismissNewMediaDevicePrompts((deviceId) => {
                    localUserStore.addIgnoredNewMediaDeviceId(deviceId);
                });
                if (dismissed) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                break;
            }
            // SPACE
            case " ": {
                this.handleActivableEntity();
                break;
            }
            case "Control": {
                this.controlKeyisPressed = false;
                break;
            }
            case "Enter": {
                this.openSayPopup();
                this.controlKeyisPressed = false;
                break;
            }
            default: {
                break;
            }
        }
        return event;
    }

    public handleActivableEntity() {
        const activatableManager = this.gameScene.getActivatablesManager();
        const activatable = activatableManager.getSelectedActivatableObject();
        if (activatable && activatable.isActivatable() && activatableManager.isSelectingByDistanceEnabled()) {
            activatable.activate();
            activatable.destroyText("object");
        }
        this.gameScene.CurrentPlayer?.handlePressSpacePlayerTextCallback();
    }

    public addSpaceEventListener(callback: () => void): void {
        this.gameScene.input.keyboard?.addListener("keyup-SPACE", callback);
        this.gameScene.getActivatablesManager().disableSelectingByDistance();
    }
    public removeSpaceEventListener(callback: () => void): void {
        this.gameScene.input.keyboard?.removeListener("keyup-SPACE", callback);
        this.gameScene.getActivatablesManager().enableSelectingByDistance();
    }
}
