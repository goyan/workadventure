import * as Phaser from "phaser";
import { get } from "svelte/store";
import * as Sentry from "@sentry/svelte";
import { CatastropheKind } from "@workadventure/messages";
import { BALL_REPORT_MS, BALL_STILL_REPORT_MS, ballRadiusPx, DOWNPOUR_REPORT_MS } from "@workadventure/map-editor";
import { getTileCenter } from "@wa/front/Phaser/Player/TileSnap";
import { Player } from "@wa/front/Phaser/Player/Player";
import { findSeatAtPoint, isSeatTaken } from "@wa/front/Phaser/Player/Seat";
import { RemotePlayer } from "@wa/front/Phaser/Entity/RemotePlayer";
import type { UserInputHandlerInterface } from "@wa/front/Interfaces/UserInputHandlerInterface";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import { mapEditorModeStore, mapExplorationModeStore } from "@wa/front/Stores/MapEditorStore";
import { isActivatable } from "@wa/front/Phaser/Game/ActivatableInterface";
import { basicModeStore } from "@wa/front/Stores/BasicModeStore";
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
import { nerfEquippedStore } from "@wa/front/Stores/NerfStore";
import { torchEquippedStore } from "@wa/front/Stores/TorchStore";
import { grenadeLauncherEquippedStore } from "@wa/front/Stores/ZombieGrenadeStore";
import { toggleHandTool } from "@wa/front/Stores/HandToolStore";
import { fishingContestSetupStore, fishingContestStore, rodEquippedStore } from "@wa/front/Stores/FishingStore";
import { characterPickerStore, type CharacterPickerCandidate } from "@wa/front/Stores/CharacterPickerStore";
import { Vehicle, VehicleMode, VehicleMedium } from "@wa/front/Phaser/Vehicle/Vehicle";
import { isHumanAvatar } from "@wa/front/Phaser/Entity/MusicHeadphonesEffect";
import { AvatarAction } from "@wa/front/Phaser/Entity/AvatarAction";
import { Swimwear } from "@wa/front/Phaser/Entity/Swimwear";
import { ENABLE_TILE_SNAP, WOKA_SPEED } from "@wa/front/Enum/EnvironmentVariable";
import {
    armedCatastropheStore,
    ballDiameterTilesStore,
    coldCelsiusStore,
    coldRadiusTilesStore,
    disarmCatastrophe,
    heldBallStore,
    downpourRadiusTilesStore,
    downpourWholeMapStore,
    fireRadiusTilesStore,
    drainRadiusTilesStore,
    meteorRadiusTilesStore,
    zombieShownStore,
    type CatastropheChoice,
} from "@wa/front/Stores/CatastropheStore";
import {
    endWaterLevelGesture,
    noteWaterLevelPress,
    takeWaterLevel,
    waterLevelPipetteStore,
} from "@wa/front/Stores/WaterLevelPipetteStore";
import { cameraDetachedStore } from "@wa/front/Stores/CameraStore";
import { weatherPipetteStore } from "@wa/front/Stores/VisualisationStore";
import { isKeyFromInteractiveElement } from "@wa/front/Utils/isKeyFromInteractiveElement";
import { findShortcutAction } from "@wa/front/Stores/ShortcutsStore";
import { spaceClimbs } from "../Vehicle/AirplaneAltitudeKeys";
import { MapDragPointerCapture } from "./MapDragPointerCapture";
import { MapDragGesture, mapDragThreshold } from "./MapDragGesture";
import { MapPanShortcut } from "./MapPanShortcut";

import Pointer = Phaser.Input.Pointer;
import GameObject = Phaser.GameObjects.GameObject;

// A notched mouse wheel reports a deltaY of about 100 per notch, a trackpad pinch (a wheel event with ctrlKey) reports a
// burst of tiny deltas. The zoom formula is tuned for the wheel, so a pinch needs a gain to feel as fast as a few notches.
// 6 is close to the pinch gain used by d3-zoom and most map/design tools.
const PINCH_ZOOM_RATE_MULTIPLIER = 6;
/** The keys a pilot may hold with control (coming down): moves, and space to climb back. */
const FLIGHT_KEYS = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "KeyZ",
    "KeyQ",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
]);

/** A field or an editable element, where the keys type text. */
function isTypingTarget(event: KeyboardEvent): boolean {
    const target = event.target;
    return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}
// Under this |deltaY|, a ctrlKey wheel event is a pinch. A Ctrl+notched-wheel keeps the normal rate.
const PINCH_MAX_DELTA_Y = 50;

/**
 * How long the click of an armed catastrophe, with a mouse, waits for a second click before throwing anything: a
 * double click walks there and disarms the catastrophe, so its first click must not have thrown it. A press held as
 * long, or moved, is a held throw (a downpour, a ball…) at once.
 */
export const ARMED_CLICK_WAIT_MS = 300;

/** A first click of an armed catastrophe, released, waiting to be thrown unless a second click comes. */
interface PendingArmedClick {
    kind: CatastropheChoice;
    timer: Phaser.Time.TimerEvent;
    run: () => void;
}

/** A press of an armed held catastrophe that is not held yet: a click, or the start of a hold. */
interface PendingArmedPress {
    kind: HeldCatastrophe;
    pointer: Pointer;
    id: number;
    x: number;
    y: number;
    /** The point of the map pressed, where a click throws it. */
    point: { x: number; y: number };
    timer: Phaser.Time.TimerEvent;
}

type HeldCatastrophe = "downpour" | "fire" | "drain" | "ball" | "cold";

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
    /** While the click of an armed downpour is held: tells the server where the pointer is, a few times a second. */
    private downpourReports: Phaser.Time.TimerEvent | undefined;
    /** The catastrophe a held click is throwing: a downpour that follows the pointer, or fire painted along it. */
    private heldKind: HeldCatastrophe | undefined;
    /** The first click of an armed catastrophe, waiting for a second one (see ARMED_CLICK_WAIT_MS). */
    private pendingClick: PendingArmedClick | undefined;
    /** The press of an armed held catastrophe, not held yet (see ARMED_CLICK_WAIT_MS). */
    private pendingPress: PendingArmedPress | undefined;
    /** The ball held under the pointer: the pointer that holds it, and what the server was last told of it. */
    private ballPointer: Pointer | undefined;
    private ballTold: { x: number; y: number; tiles: number; ticksAgo: number } | undefined;
    // The current touch gesture involved two fingers or more (a pinch): lifting a finger must not count as a tap.
    private multiTouch = false;
    private pinchFreedView = false;
    private readonly pointerCapture: MapDragPointerCapture;
    private readonly panShortcut: MapPanShortcut;
    private readonly spaceKey: Phaser.Input.Keyboard.Key | undefined;
    private nerfSpacePressed = false;
    /** The space key went down for the fishing rod: its release casts, and nothing else. */
    private rodSpacePressed = false;
    /** The space key held now climbs the airplane (or took it off): it is the airplane's until it goes up. */
    private climbSpacePressed = false;
    private readonly spaceListeners = new Map<() => void, () => void>();

    constructor(gameScene: GameScene) {
        this.gameScene = gameScene;
        this.pointerCapture = new MapDragPointerCapture(
            gameScene.game.canvas,
            // A held downpour or fire keeps the pointer too: its release is seen even over a panel.
            () => this.canDragMap() || this.heldCatastrophe() !== undefined,
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
        // The canvas shows a crosshair while a catastrophe is armed, through the same default cursor as the map drag.
        let wasArmed = false;
        const unsubscribeArmed = armedCatastropheStore.subscribe((armed) => {
            // A downpour only rains, and a fire is only painted, while it is the armed one.
            if (armed !== this.heldKind) this.stopDownpour();
            // A click of another catastrophe, or of none, throws nothing any more.
            if (this.pendingClick && this.pendingClick.kind !== armed) this.cancelPendingClick();
            if (this.pendingPress && this.pendingPress.kind !== armed) this.cancelPendingPress();
            if (wasArmed === (armed !== undefined)) return;
            wasArmed = armed !== undefined;
            this.gameScene.input.setDefaultCursor(this.aiming() ? "crosshair" : this.idleCursor());
        });
        // The weather pipette only reads under the pointer: its own cursor, and no click of the map taken.
        const unsubscribeWeatherPipette = weatherPipetteStore.subscribe(() => {
            this.gameScene.input.setDefaultCursor(this.aiming() ? "crosshair" : this.idleCursor());
        });
        // The pipette of the level of a source aims with the same crosshair.
        let wasAiming = false;
        const unsubscribePipette = waterLevelPipetteStore.subscribe((take) => {
            if (wasAiming === (take !== undefined)) return;
            wasAiming = take !== undefined;
            this.gameScene.input.setDefaultCursor(this.aiming() ? "crosshair" : this.idleCursor());
        });
        gameScene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            unsubscribeArmed();
            unsubscribePipette();
            unsubscribeWeatherPipette();
            this.cancelPendingClick();
            this.cancelPendingPress();
            this.stopDownpour();
            this.pointerCapture.destroy();
            this.panShortcut.destroy();
            for (const listener of this.spaceListeners.values()) {
                this.gameScene.input.keyboard?.removeListener("keyup-SPACE", listener);
            }
            this.spaceListeners.clear();
        });
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
        // A gesture of the pipette ends here, whatever it was (a drag of the view, a click that takes a level).
        endWaterLevelGesture();
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
        // The armed pipette of the level of a source takes the click that is not a drag (the drag test above): the
        // point clicked, and the ground under the water with Alt. Nothing else answers it: no walk, no object.
        if (get(waterLevelPipetteStore) !== undefined && (pointer.wasTouch || pointer.leftButtonReleased())) {
            if (!pointer.wasTouch || pointer.getDuration() <= 250) {
                const ground = pointer.event instanceof MouseEvent && pointer.event.altKey;
                takeWaterLevel(this.mapPointUnder(pointer), ground);
            }
            return;
        }
        // An armed catastrophe takes the click that is not a drag (the drag test above): it walks, activates and
        // picks nothing. The press itself is left to the map drag, which stays free. In the map editor too, whose
        // tool is put aside while a catastrophe is armed.
        if (get(armedCatastropheStore) !== undefined && (pointer.wasTouch || pointer.leftButtonReleased())) {
            // A press released before it was held is a click: thrown once, unless a second click comes.
            if (this.pendingPress) this.clickPendingPress();
            // The downpour rained, the fire was painted, while the click was held: releasing it only ends it.
            else if (this.heldCatastrophe() !== undefined) this.stopDownpour();
            else this.launchArmedCatastrophe(pointer);
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
                // Clicking your own woka also brings the view back on it, as the "show my location" button does.
                if (object instanceof Player) this.gameScene.getCameraManager().resumePlayerFollow();
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
        const clicked = cameraManager.getCamera().getWorldPoint(pointer.x, pointer.y);
        // In a hollow of the relief seen in 3/4, the ground is drawn lower than its place: aim at the ground drawn there.
        const worldPoint = this.gameScene.groundPointUnder(clicked);
        if (
            isDoubleClick &&
            (worldPoint.x < 0 ||
                worldPoint.y < 0 ||
                worldPoint.x >= this.gameScene.Map.widthInPixels ||
                worldPoint.y >= this.gameScene.Map.heightInPixels)
        ) {
            return;
        }
        // A double-click on a free seat (anywhere on the image of its object) runs there and sits: the only seat a
        // run sits on, since running does not pull the player onto the seats on its way.
        const seat = isDoubleClick
            ? findSeatAtPoint(
                  this.gameScene,
                  worldPoint,
                  (candidate) => !isSeatTaken(this.gameScene, candidate),
                  this.gameScene.floorLevelAt(worldPoint),
              )
            : undefined;
        // Otherwise a double-click ends at the center of the targeted tile, like the avatar does when it stops.
        const target =
            seat?.feet ??
            (isDoubleClick && ENABLE_TILE_SNAP ? this.getTileCenterOf(worldPoint.x, worldPoint.y) : worldPoint);
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
            .then(
                (result) => {
                    if (result.cancelled) return;
                    if (seat) this.gameScene.CurrentPlayer.sitOnSeat(seat.id);
                    else if (isDoubleClick) this.gameScene.CurrentPlayer.stayStandingHere();
                },
                (reason) => {
                    // Already on the tile of the seat: there is no path to walk, the seat is right there.
                    if (seat) this.gameScene.CurrentPlayer.sitOnSeat(seat.id);
                    else console.warn(reason);
                },
            )
            .finally(() => cameraManager.endWalkFraming(walk));
    }

    private launchArmedCatastrophe(pointer: Pointer): void {
        // A long touch is a press, not a tap.
        if (!this.gameScene.userInputManager.isControlsEnabled || (pointer.wasTouch && pointer.getDuration() > 250)) {
            return;
        }
        // What the pointer shows: the ground or the water drawn there, where the relief is seen in 3/4.
        const worldPoint = this.gameScene.seenPointUnder(
            this.gameScene.getCameraManager().getCamera().getWorldPoint(pointer.x, pointer.y),
        );
        if (
            worldPoint.x < 0 ||
            worldPoint.y < 0 ||
            worldPoint.x >= this.gameScene.Map.widthInPixels ||
            worldPoint.y >= this.gameScene.Map.heightInPixels
        ) {
            return;
        }
        // The server decides what the comet or the fireball does there: where, and how wide, as clicked.
        const kind =
            get(armedCatastropheStore) === "fireball"
                ? CatastropheKind.CATASTROPHE_FIREBALL
                : CatastropheKind.CATASTROPHE_METEOR;
        const tiles = get(meteorRadiusTilesStore);
        const launch = () => this.gameScene.connection?.emitLaunchCatastrophe(kind, worldPoint.x, worldPoint.y, tiles);
        if (this.awaitsDoubleClick(pointer)) this.deferClick(launch);
        else launch();
    }

    /**
     * Whether a click of an armed catastrophe waits for a second one before throwing it: with a mouse, where a
     * double click walks. A tap throws at once (no double tap walks), and so does a click in the map editor.
     */
    private awaitsDoubleClick(pointer: Pointer): boolean {
        const input = this.gameScene.userInputManager;
        return !pointer.wasTouch && !get(mapEditorModeStore) && input.isControlsEnabled && input.isRightClickEnabled;
    }

    /** The press is the second one of a double click: the browser counts the clicks of the mouse in a row. */
    private isDoubleClickPress(pointer: Pointer): boolean {
        return pointer.leftButtonDown() && pointer.event instanceof MouseEvent && pointer.event.detail >= 2;
    }

    /**
     * Throws a first click once ARMED_CLICK_WAIT_MS passed without a second one. Another single click throws the one
     * still waiting at once: it was no double click.
     */
    private deferClick(run: () => void): void {
        this.flushPendingClick();
        const kind = get(armedCatastropheStore);
        if (kind === undefined) return;
        const guarded = (): void => {
            this.pendingClick = undefined;
            if (get(armedCatastropheStore) === kind && this.gameScene.userInputManager.isControlsEnabled) run();
        };
        this.pendingClick = {
            kind,
            run: guarded,
            timer: this.gameScene.time.addEvent({ delay: ARMED_CLICK_WAIT_MS, callback: guarded }),
        };
    }

    private flushPendingClick(): void {
        const pending = this.pendingClick;
        if (!pending) return;
        pending.timer.remove();
        pending.run();
    }

    private cancelPendingClick(): void {
        this.pendingClick?.timer.remove();
        this.pendingClick = undefined;
    }

    /**
     * The press of an armed held catastrophe, with a mouse: nothing is thrown yet, it may be the first click of a
     * double click. It is held as soon as the pointer moves, or once it stayed pressed ARMED_CLICK_WAIT_MS.
     */
    private awaitHold(pointer: Pointer): void {
        this.cancelPendingPress();
        const kind = this.heldCatastrophe();
        if (kind === undefined || !this.gameScene.userInputManager.isControlsEnabled) return;
        this.pendingPress = {
            kind,
            pointer,
            id: pointer.id,
            x: pointer.x,
            y: pointer.y,
            point: this.mapPointUnder(pointer),
            timer: this.gameScene.time.addEvent({
                delay: ARMED_CLICK_WAIT_MS,
                callback: () => this.holdPendingPress(),
            }),
        };
    }

    private holdPendingPress(): void {
        const press = this.pendingPress;
        if (!press) return;
        this.cancelPendingPress();
        if (press.pointer.isDown) this.startDownpour(press.pointer);
    }

    /** The press was released before it was held: a click, which throws once where it was pressed, as a short hold. */
    private clickPendingPress(): void {
        const press = this.pendingPress;
        if (!press) return;
        this.cancelPendingPress();
        this.deferClick(() => {
            this.heldKind = press.kind;
            this.reportHeld(press.kind, press.point);
            // A ball is let go at once, and the server is told so.
            this.stopDownpour();
        });
    }

    private cancelPendingPress(): void {
        this.pendingPress?.timer.remove();
        this.pendingPress = undefined;
    }

    /**
     * The catastrophe a held click throws, when one of those is armed: the downpour, the fire, the drain, the ball,
     * the cold snap.
     */
    private heldCatastrophe(): HeldCatastrophe | undefined {
        const armed = get(armedCatastropheStore);
        return armed === "downpour" || armed === "fire" || armed === "drain" || armed === "ball" || armed === "cold"
            ? armed
            : undefined;
    }

    /**
     * The click of an armed downpour or fire is pressed: it rains, or burns, under the pointer at once, and for as
     * long as it is held, wherever the pointer goes.
     */
    private startDownpour(pointer: Pointer): void {
        this.stopDownpour();
        if (!this.gameScene.userInputManager.isControlsEnabled) return;
        const kind = this.heldCatastrophe();
        if (kind === undefined) return;
        this.heldKind = kind;
        const report = (): void => {
            if (get(armedCatastropheStore) !== kind || !pointer.isDown) {
                this.stopDownpour();
                return;
            }
            this.reportHeld(kind, this.mapPointUnder(pointer));
        };
        if (kind === "ball") this.ballPointer = pointer;
        report();
        this.downpourReports = this.gameScene.time.addEvent({
            // A ball is seen by everybody under the pointer of its player: it is told far more often.
            delay: kind === "ball" ? BALL_REPORT_MS : DOWNPOUR_REPORT_MS,
            loop: true,
            callback: report,
        });
    }

    /** Throws the held catastrophe once at a point of the map: one report of its hold. */
    private reportHeld(kind: HeldCatastrophe, { x, y }: { x: number; y: number }): void {
        if (kind === "fire") {
            // A patch of fire at each report: the fire is painted along the way of the pointer.
            this.gameScene.connection?.emitLaunchCatastrophe(
                CatastropheKind.CATASTROPHE_FIRE,
                x,
                y,
                get(fireRadiusTilesStore),
            );
            return;
        }
        if (kind === "drain") {
            this.gameScene.connection?.emitLaunchCatastrophe(
                CatastropheKind.CATASTROPHE_DRAIN,
                x,
                y,
                get(drainRadiusTilesStore),
            );
            return;
        }
        if (kind === "ball") {
            // The ball is under the pointer at once, here; the server is told when it moved, and now and then
            // while it is held still.
            const tiles = get(ballDiameterTilesStore);
            heldBallStore.set({ x, y, radiusPx: ballRadiusPx(tiles) });
            const told = this.ballTold;
            if (told && told.x === x && told.y === y && told.tiles === tiles) {
                told.ticksAgo++;
                if (told.ticksAgo * BALL_REPORT_MS < BALL_STILL_REPORT_MS) return;
            }
            this.ballTold = { x, y, tiles, ticksAgo: 0 };
            this.gameScene.connection?.emitLaunchCatastrophe(CatastropheKind.CATASTROPHE_BALL, x, y, tiles);
            return;
        }
        if (kind === "cold") {
            // The server lays the cold air there, and alone freezes what lies under it.
            this.gameScene.connection?.emitLaunchCatastrophe(
                CatastropheKind.CATASTROPHE_COLD,
                x,
                y,
                get(coldRadiusTilesStore),
                false,
                false,
                get(coldCelsiusStore),
            );
            return;
        }
        this.gameScene.connection?.emitLaunchCatastrophe(
            CatastropheKind.CATASTROPHE_DOWNPOUR,
            x,
            y,
            get(downpourRadiusTilesStore),
            get(downpourWholeMapStore),
        );
    }

    /** The point of the map under a pointer. One past the edge is on the edge: a cloud never leaves the map. */
    private mapPointUnder(pointer: Pointer): { x: number; y: number } {
        // What the pointer shows: the ground or the water drawn there, where the relief is seen in 3/4.
        const worldPoint = this.gameScene.seenPointUnder(
            this.gameScene.getCameraManager().getCamera().getWorldPoint(pointer.x, pointer.y),
        );
        return {
            x: Math.min(this.gameScene.Map.widthInPixels - 1, Math.max(0, worldPoint.x)),
            y: Math.min(this.gameScene.Map.heightInPixels - 1, Math.max(0, worldPoint.y)),
        };
    }

    private stopDownpour(): void {
        this.downpourReports?.remove();
        this.downpourReports = undefined;
        // A ball that was held is let go: gone at once here, and the server is told so.
        if (this.heldKind === "ball") {
            heldBallStore.set(undefined);
            const told = this.ballTold;
            if (told) {
                this.gameScene.connection?.emitLaunchCatastrophe(
                    CatastropheKind.CATASTROPHE_BALL,
                    told.x,
                    told.y,
                    told.tiles,
                    false,
                    true,
                );
            }
        }
        this.ballPointer = undefined;
        this.ballTold = undefined;
        this.heldKind = undefined;
    }

    /** Whether a click of the map is aimed: an armed catastrophe, or the pipette of the level of a source. */
    private aiming(): boolean {
        return get(armedCatastropheStore) !== undefined || get(waterLevelPipetteStore) !== undefined;
    }

    private idleCursor(): string {
        if (get(weatherPipetteStore)) return "help";
        return get(mapExplorationModeStore) ? "grab" : "auto";
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
        wokaMenuStore.addAction({
            actionName: get(nerfEquippedStore) ? get(LL).actionbar.nerf.unequip() : get(LL).actionbar.nerf.equip(),
            icon: "nerf",
            testId: "avatar-nerf",
            callback: () => {
                this.gameScene.nerfManager?.toggleEquipment();
                wokaMenuStore.clear();
            },
        });
        // The launcher exists during a horde only; once held, it can always be put away.
        // Not in Basique: the horde does not exist there (PerceptionProtocol).
        if ((get(zombieShownStore) !== undefined && !get(basicModeStore)) || get(grenadeLauncherEquippedStore)) {
            wokaMenuStore.addAction({
                actionName: get(grenadeLauncherEquippedStore)
                    ? get(LL).actionbar.grenadeLauncher.unequip()
                    : get(LL).actionbar.grenadeLauncher.equip(),
                icon: "grenade",
                testId: "avatar-grenade-launcher",
                callback: () => {
                    toggleHandTool("grenades");
                    wokaMenuStore.clear();
                },
            });
        }
        wokaMenuStore.addAction({
            actionName: get(torchEquippedStore) ? get(LL).actionbar.torch.unequip() : get(LL).actionbar.torch.equip(),
            icon: "torch",
            testId: "avatar-torch",
            callback: () => {
                this.gameScene.torchManager?.toggleEquipment();
                wokaMenuStore.clear();
            },
        });
        wokaMenuStore.addAction({
            actionName: get(rodEquippedStore) ? get(LL).actionbar.rod.unequip() : get(LL).actionbar.rod.equip(),
            icon: "rod",
            testId: "avatar-rod",
            callback: () => {
                this.gameScene.fishingManager?.toggleEquipment();
                wokaMenuStore.clear();
            },
        });
        // Rod in hand and no contest running: the player may start one (its length is asked next).
        if (get(rodEquippedStore) && get(fishingContestStore)?.finished !== false) {
            wokaMenuStore.addAction({
                actionName: get(LL).actionbar.rod.contest.start(),
                icon: "rod",
                testId: "avatar-fishing-contest",
                callback: () => {
                    fishingContestSetupStore.set(true);
                    wokaMenuStore.clear();
                },
            });
        }
        // On the ice: put up an ice fishing shack, or sit in one, get up, take one's own down.
        for (const action of this.gameScene.iceShackManager?.wheelActions() ?? []) {
            wokaMenuStore.addAction({
                ...action,
                callback: () => {
                    action.callback();
                    wokaMenuStore.clear();
                },
            });
        }
        // The interaction key lets a companion go only next to it: here, all of them, from anywhere.
        const tamed = this.gameScene.tamedAnimalCount() ?? 0;
        if (tamed > 0) {
            wokaMenuStore.addAction({
                actionName: get(LL).woka.menu.releaseAnimals({ count: tamed }),
                icon: "paw",
                testId: "avatar-release-animals",
                callback: () => {
                    this.gameScene.releaseTamedAnimals();
                    wokaMenuStore.clear();
                },
            });
        }
        // A costume such as the duck has no swimwear poses nor skateboard pose.
        const human = isHumanAvatar(player.sprites.keys());
        const vehicle = localUserStore.getVehicleForMedium(VehicleMedium.Land);
        // A canoe is boarded by itself on the water: nothing to mount from the wheel.
        if (vehicle !== Vehicle.None && vehicle !== Vehicle.Canoe && human) {
            const equipped = player.vehicleMode === VehicleMode.Always;
            const unicycle = vehicle === Vehicle.ElectricUnicycle;
            wokaMenuStore.addAction({
                actionName: equipped
                    ? get(LL).woka.vehicle.dismount()
                    : unicycle
                      ? get(LL).woka.vehicle.mountElectricUnicycle()
                      : get(LL).woka.vehicle.mount(),
                emoji: unicycle ? "🛞" : "🛹",
                icon: unicycle ? "electricUnicycle" : "skateboard",
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
                detail: get(LL).woka.menu.swimwearDetail(),
                emoji: "🩱",
                icon: "swimwear",
                testId: "avatar-swimwear",
                callback: () => {
                    wokaMenuStore.openOwnCard(player.playerName, uuid, position);
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
        // A gesture pressed while the pipette aims is the pipette's to its end (see waterLevelPipetteOwnsPointer).
        noteWaterLevelPress();
        if (pointer.wasTouch) {
            // A first finger starts a new gesture; a second one turns it into a pinch and ends the one-finger drag.
            this.multiTouch = this.touchPointersDown() > 1;
            if (!this.multiTouch) this.pinchFreedView = false;
            if (this.multiTouch) {
                this.handlePointerCancelEvent();
                return;
            }
        }
        if (get(armedCatastropheStore) !== undefined && !pointer.wasTouch && pointer.leftButtonDown()) {
            if (this.isDoubleClickPress(pointer) && this.awaitsDoubleClick(pointer)) {
                // The second press of a double click: the player walks there at its release (handlePointerUpEvent),
                // as if the catastrophe had been unselected in its panel, and its first click throws nothing.
                this.cancelPendingClick();
                this.cancelPendingPress();
                disarmCatastrophe();
            } else {
                // A new single click: the one still waiting was no double click.
                this.flushPendingClick();
            }
        }
        // An armed downpour or fire takes the press: it rains, or burns, while it is held, and the drag moves the
        // cloud or paints the fire, not the map. With a mouse, it waits to be held (awaitHold).
        if (this.heldCatastrophe() !== undefined) {
            if (pointer.wasTouch) this.startDownpour(pointer);
            else if (pointer.leftButtonDown()) {
                if (this.awaitsDoubleClick(pointer)) this.awaitHold(pointer);
                else this.startDownpour(pointer);
            }
            return;
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
        // A held ball is under the pointer at each of its moves, without waiting for the next report.
        if (this.ballPointer) {
            const { x, y } = this.mapPointUnder(this.ballPointer);
            heldBallStore.set({ x, y, radiusPx: ballRadiusPx(get(ballDiameterTilesStore)) });
        }
        // A press of a held catastrophe that moves is held: it is no drag of the map either.
        const press = this.pendingPress;
        if (press) {
            if (
                pointer.id === press.id &&
                Math.hypot(pointer.x - press.x, pointer.y - press.y) >= mapDragThreshold(pointer)
            ) {
                this.holdPendingPress();
            }
            return;
        }
        // A held downpour follows the pointer by itself (see startDownpour): the move is no drag of the map.
        if (this.downpourReports) return;
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
        // A press cancelled before its release is no click.
        this.cancelPendingPress();
        this.stopDownpour();
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
        // A focus zone (a personal desk, a meeting room) frames the view on entering it, but never holds it: a drag
        // or a two-finger scroll frees the view as anywhere else, and it comes back on the zone when the avatar moves.
        return true;
    }

    private canDragMap(): boolean {
        // The other editor tools use the left drag themselves; they pan with MapPanShortcut instead.
        const armed = get(armedCatastropheStore);
        if (armed === "downpour" || armed === "drain" || armed === "ball" || armed === "cold") return false;
        // While the pipette aims, the left drag moves the view in the map editor too: only a click takes a level.
        return (
            this.canMoveView() &&
            (!get(mapEditorModeStore) || get(mapExplorationModeStore) || get(waterLevelPipetteStore) !== undefined)
        );
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
            this.gameScene.input.setDefaultCursor(this.aiming() ? "crosshair" : this.idleCursor());
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
        if (event.code === "Space" && !event.repeat) {
            this.nerfSpacePressed = false;
            this.rodSpacePressed = false;
            this.climbSpacePressed = this.spaceClimbsNow(event);
        }
        const hasExecutedCommand = this.gameScene.getMapEditorModeManager()?.handleKeyDownEvent(event);
        if (hasExecutedCommand) {
            return event;
        }

        // In the sky, nothing on the ground is in reach: no rod, nerf, seat, door nor object until landing.
        // Space climbs instead (see Player.pilotAltitude), and takes off from the ground when nothing else asks for it.
        if (event.code === "Space" && (this.isFlying() || this.climbSpacePressed)) {
            if (this.climbSpacePressed) event.preventDefault();
            return event;
        }
        // In flight the control key comes down: keep the browser shortcuts it can stop from the keys held with it.
        if (event.ctrlKey && this.isAltitudeKeysActive() && FLIGHT_KEYS.has(event.code) && !isTypingTarget(event)) {
            event.preventDefault();
        }

        // The fishing rod takes the space key only when nothing else asks for it: a prompt (seat, door, animal) wins.
        if (
            event.code === "Space" &&
            this.gameScene.fishingManager?.isEquipped &&
            !get(mapEditorModeStore) &&
            (this.rodSpacePressed || !this.isSpaceAskedFor())
        ) {
            if (!isKeyFromInteractiveElement(event) && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                this.rodSpacePressed = true;
                this.gameScene.fishingManager.pressKey(event.repeat);
            }
            return event;
        }

        if (event.code === "Space" && this.gameScene.nerfManager?.isEquipped && !get(mapEditorModeStore)) {
            if (!isKeyFromInteractiveElement(event) && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                this.nerfSpacePressed = true;
                if (!event.repeat) this.gameScene.nerfManager.fire();
            }
            return event;
        }

        if (event.code === "Space" && get(grenadeLauncherEquippedStore) && !get(mapEditorModeStore)) {
            if (!isKeyFromInteractiveElement(event) && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                if (!event.repeat) this.gameScene.fireZombieGrenade();
            }
            return event;
        }

        switch (findShortcutAction(event)) {
            case "toggleMapEditor": {
                if (get(mapManagerActivated) == false) return event;
                mapEditorModeStore.switchMode(!get(mapEditorModeStore));
                break;
            }
            case "toggleAirVehicle": {
                const typing =
                    event.target instanceof HTMLElement &&
                    (event.target.isContentEditable || event.target.matches("input, textarea, select"));
                if (!event.repeat && !typing && !get(mapEditorModeStore)) {
                    this.gameScene.CurrentPlayer?.toggleAirVehicle();
                }
                break;
            }
            case "rotatePlayer": {
                this.gameScene.CurrentPlayer?.rotate();
                break;
            }
            case "openChat":
                this.handleKeyC();
                break;
            case "openUserList":
                this.handleKeyU();
                break;
            case "walkMyDesk": {
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
                break;
            }
            case "follow": {
                this.handleKeyF();
                break;
            }
            default: {
                break;
            }
        }

        switch (event.code) {
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
                // A press that climbed: nothing of the ground answers it.
                if (this.climbSpacePressed) break;
                if (this.rodSpacePressed) {
                    this.gameScene.fishingManager?.releaseKey();
                    break;
                }
                const shotPressed = this.nerfSpacePressed;
                if (shotPressed || this.gameScene.nerfManager?.isEquipped) break;
                if (isKeyFromInteractiveElement(event)) break;
                this.handleActivableEntity();
                break;
            }
            case "Control": {
                this.controlKeyisPressed = false;
                break;
            }
            case "Enter": {
                if (!isKeyFromInteractiveElement(event)) this.openSayPopup();
                this.controlKeyisPressed = false;
                break;
            }
            default: {
                break;
            }
        }
        return event;
    }

    /** Whether the space key has something to do now: a prompt is shown, or an object next to the avatar is selected. */
    private isSpaceAskedFor(): boolean {
        if (this.spaceListeners.size > 0) return true;
        const activatableManager = this.gameScene.getActivatablesManager();
        const activatable = activatableManager.getSelectedActivatableObject();
        return Boolean(activatable?.isActivatable() && activatableManager.isSelectingByDistanceEnabled());
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

    /** In flight: the control key comes down (see UserInputManager.getEventListForGameTick). */
    public isAltitudeKeysActive(): boolean {
        return this.isFlying() && !get(mapEditorModeStore);
    }

    public isClimbPressed(): boolean {
        return this.climbSpacePressed;
    }

    /** Whether this press of space climbs or takes off (see spaceClimbs), decided once when the key goes down. */
    private spaceClimbsNow(event: KeyboardEvent): boolean {
        if (get(mapEditorModeStore) || event.ctrlKey || event.altKey || event.metaKey) return false;
        if (isKeyFromInteractiveElement(event)) return false;
        // Optional calls: a scene without a full player (tests, loading) has no airplane.
        const player = this.gameScene.CurrentPlayer;
        const inAirplane = player?.isInAirplane?.() ?? false;
        const flying = this.isFlying();
        if (!inAirplane || flying) return spaceClimbs({ inAirplane, flying, spaceAskedFor: false, toolInHand: false });
        // The airplane's own hint answers space too: it does not keep the plane on the ground.
        const ownPrompt = player?.isAirplanePromptShown?.() ? 1 : 0;
        const activatableManager = this.gameScene.getActivatablesManager();
        const activatable = activatableManager.getSelectedActivatableObject();
        return spaceClimbs({
            inAirplane,
            flying,
            spaceAskedFor:
                this.spaceListeners.size > ownPrompt ||
                Boolean(activatable?.isActivatable() && activatableManager.isSelectingByDistanceEnabled()),
            toolInHand: Boolean(this.gameScene.nerfManager?.isEquipped || this.gameScene.fishingManager?.isEquipped),
        });
    }

    private isFlying(): boolean {
        // Optional call: a scene without a full player (tests, loading) is on the ground.
        return this.gameScene.CurrentPlayer?.isFlying?.() ?? false;
    }

    public addSpaceEventListener(callback: () => void): void {
        const previous = this.spaceListeners.get(callback);
        if (previous) this.gameScene.input.keyboard?.removeListener("keyup-SPACE", previous);
        const listener = (): void => {
            if (this.rodSpacePressed || this.isFlying() || this.climbSpacePressed) return;
            if (!this.nerfSpacePressed && !this.gameScene.nerfManager?.isEquipped) callback();
        };
        this.spaceListeners.set(callback, listener);
        this.gameScene.input.keyboard?.addListener("keyup-SPACE", listener);
        this.gameScene.getActivatablesManager().disableSelectingByDistance();
    }
    public removeSpaceEventListener(callback: () => void): void {
        const listener = this.spaceListeners.get(callback);
        if (listener) this.gameScene.input.keyboard?.removeListener("keyup-SPACE", listener);
        this.spaceListeners.delete(callback);
        this.gameScene.getActivatablesManager().enableSelectingByDistance();
    }
}
