import { get } from "svelte/store";
import * as Sentry from "@sentry/svelte";
import { Player } from "../Player/Player";
import { RemotePlayer } from "../Entity/RemotePlayer";
import type { UserInputHandlerInterface } from "../../Interfaces/UserInputHandlerInterface";
import type { GameScene } from "../Game/GameScene";
import { mapEditorModeStore } from "../../Stores/MapEditorStore";
import { isActivatable } from "../Game/ActivatableInterface";
import { mapManagerActivated } from "../../Stores/MenuStore";
import { displayEmote, isEmoteIndex } from "../../Stores/EmoteStore";
import { analyticsClient } from "../../Administration/AnalyticsClient";
import { navChat } from "../../Chat/Stores/ChatStore";
import { chatVisibilityStore } from "../../Stores/ChatStore";
import { popupStore } from "../../Stores/PopupStore";
import SayPopUp from "../../Components/PopUp/SayPopUp.svelte";
import { isPopupJustClosed } from "../Game/Say/SayManager";
import LL from "../../../i18n/i18n-svelte";
import { followRoleStore, followStateStore, followUsersStore } from "../../Stores/FollowStore";
import { localUserStore } from "../../Connection/LocalUserStore";
import type { Shortcut } from "./UserInputManager";

// Below this distance (in screen pixels), a press followed by a move is still a click, not a drag.
const DRAG_THRESHOLD_PIXELS = 6;

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
    private dragStart?: { x: number; y: number };
    private isDragPanning = false;
    public shortcuts: Shortcut[] = [];

    constructor(gameScene: GameScene) {
        this.gameScene = gameScene;

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
        pointer: Phaser.Input.Pointer,
        gameObjects: Phaser.GameObjects.GameObject[],
        deltaX: number,
        deltaY: number,
        deltaZ: number,
    ): void {
        const event = pointer.event;
        if (event instanceof WheelEvent && isTrackpadScroll(event) && this.canPan()) {
            // Two-finger scroll on a trackpad moves the view. Pinch and Ctrl+wheel (ctrlKey) and notched
            // mouse wheels still zoom.
            this.gameScene.getCameraManager().panBy(deltaX, deltaY);
            return;
        }
        const isPinch = event instanceof WheelEvent && event.ctrlKey && Math.abs(deltaY) < PINCH_MAX_DELTA_Y;
        this.gameScene.handleMouseWheel(deltaY, isPinch ? PINCH_ZOOM_RATE_MULTIPLIER : 1);
    }

    private canPan(): boolean {
        return !get(mapEditorModeStore) && this.gameScene.getCameraManager().canPan();
    }

    public handlePointerUpEvent(pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]): void {
        this.dragStart = undefined;
        if (this.isDragPanning) {
            // The end of a drag must neither move the avatar nor activate what is under the cursor.
            this.isDragPanning = false;
            return;
        }

        if (pointer.wasTouch || pointer.leftButtonReleased()) {
            for (const object of gameObjects) {
                if (isActivatable(object)) {
                    this.gameScene.getActivatablesManager().handlePointerDownEvent(object);
                    return;
                }
            }
        }

        if ((!pointer.wasTouch && pointer.leftButtonReleased()) || pointer.getDuration() > 250) {
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
        const camera = this.gameScene.getCameraManager().getCamera();
        const worldPoint = camera.getWorldPoint(pointer.x, pointer.y);
        this.gameScene
            .moveTo(
                {
                    x: worldPoint.x,
                    y: worldPoint.y,
                },
                true,
            )
            .catch((reason) => {
                console.warn(reason);
            });
    }

    public handlePointerDownEvent(pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]): void {
        // Touch screens already use the finger for the joystick. Dragging starts on an empty spot of the map only.
        if (pointer.wasTouch || !pointer.leftButtonDown() || gameObjects.length > 0 || !this.canPan()) {
            return;
        }
        this.dragStart = { x: pointer.x, y: pointer.y };
        this.isDragPanning = false;
    }

    public handlePointerMoveEvent(pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]): void {
        if (!this.dragStart) {
            return;
        }
        if (!pointer.leftButtonDown()) {
            this.dragStart = undefined;
            this.isDragPanning = false;
            return;
        }
        if (!this.isDragPanning) {
            if (Math.hypot(pointer.x - this.dragStart.x, pointer.y - this.dragStart.y) < DRAG_THRESHOLD_PIXELS) {
                return;
            }
            this.isDragPanning = true;
        }
        this.gameScene.getCameraManager().panBy(pointer.prevPosition.x - pointer.x, pointer.prevPosition.y - pointer.y);
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
            analyticsClient.openThinkBubble();
        } else {
            analyticsClient.openSayBubble();
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
