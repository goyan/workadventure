import type * as Phaser from "phaser";
import type { Subscription } from "rxjs";
import { derived, get } from "svelte/store";
import { LL } from "../../../../i18n/i18n-svelte";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { resetAllStatusStoreExcept } from "../../../Rules/StatusRules/statusChangerFunctions";
import { setAreaPropertyVariable } from "../../../Stores/AreaPropertyVariablesStore";
import { currentPlayerLockableAreasStore } from "../../../Stores/CurrentPlayerAreaLockStore";
import { knockRequestsStore } from "../../../Stores/KnockStore";
import { requestedStatusStore } from "../../../Stores/MediaStore";
import { personalAreaDataStore } from "../../../Stores/PersonalDeskStore";
import { touchScreenManager } from "../../../Touch/TouchScreenManager";
import type { AreasManager } from "../GameMap/AreasManager";
import type { GameScene } from "../GameScene";
import type { DoorLocks, LockedDoorZone } from "../MapEditor/MapLayer/DoorAnimator";
import { decodeKnockMessage, encodeKnockMessage } from "./KnockProtocol";
import type { KnockAnswer, KnockMessage } from "./KnockProtocol";
import { KNOCK_REPLY_TIMEOUT_MS, KnockState } from "./KnockState";
import type { KnockEffect, KnockRequest } from "./KnockState";
import { KnockStatusLink } from "./KnockStatusLink";

export const KNOCK_SOUND_KEY = "audio-door-knock";
export const KNOCK_SOUND_URL = "/resources/objects/doors/door-knock.ogg";
/** A visitor farther than this from the area it knocked on (0 inside) withdraws its request. */
export const KNOCK_CANCEL_DISTANCE_PX = 64;

/** Expiries, walk-away cancels, unlocked areas and the occupant's view: checked twice a second. */
const TICK_INTERVAL_MS = 500;
/** How long the answers stay above the visitor's head. */
const ANSWER_TEXT_DURATION_MS = 5000;

/**
 * Knocking on the door of a locked area. The visitor broadcasts a request through the scriptable events of the
 * room; the occupants of the area hear it and answer; "enter" gives the visitor a short pass through the lock.
 * Every message is applied locally before it is sent: the echo is ignored by the KnockState.
 */
export class KnockManager {
    private readonly state = new KnockState();
    /** Empty when the local user has no uuid: such a player cannot knock. */
    public readonly localUuid: string;
    private readonly eventSubscription: Subscription | undefined;
    private readonly tickTimer: Phaser.Time.TimerEvent;
    private readonly statusLink: KnockStatusLink;
    /** The requests the local player was already told about (knock sound played). */
    private readonly announced = new Set<KnockRequest>();
    /** The areas manager the lock pass was given to: it may not exist yet when the manager is created. */
    private lockPassTarget: AreasManager | undefined;

    constructor(private readonly scene: GameScene) {
        this.localUuid = localUserStore.getLocalUser()?.uuid ?? "";
        this.eventSubscription = scene.connection?.receivedEventMessageStream.subscribe(({ name, data }) => {
            const message = decodeKnockMessage(name, data);
            if (message) {
                this.apply(this.state.receive(message, Date.now()));
            }
        });
        this.statusLink = new KnockStatusLink({
            lockableAreas: currentPlayerLockableAreasStore,
            ownAreaId: derived(personalAreaDataStore, (area) => area?.id),
            requestedStatus: requestedStatusStore,
            setStatus: resetAllStatusStoreExcept,
        });
        this.installLockPass();
        this.tickTimer = scene.time.addEvent({
            delay: TICK_INTERVAL_MS,
            loop: true,
            callback: () => this.tick(),
        });
    }

    /** The local player knocks on the door of a locked area. Does nothing while a knock on it is too recent. */
    public knock(areaId: string): void {
        const now = Date.now();
        if (this.localUuid === "") {
            return;
        }
        if (!this.state.canKnock(this.localUuid, areaId, now)) {
            // Refused silently, except that an admin keeps the forced unlock at hand during the cooldown.
            const lockedArea = this.adminLockedArea(areaId);
            if (lockedArea) {
                this.showWaitingAdmin(areaId, lockedArea.propertyId);
            }
            return;
        }
        this.send({
            kind: "request",
            areaId,
            visitorUuid: this.localUuid,
            visitorName: this.scene.CurrentPlayer.playerName,
            at: now,
        });
        this.showWaiting(areaId);
    }

    /** An occupant answers a knock. The first answer wins: an answer to a request already settled is not sent. */
    public answer(areaId: string, visitorUuid: string, answer: KnockAnswer): void {
        const sent = this.send({
            kind: "answer",
            areaId,
            visitorUuid,
            answer,
            answeredBy: this.scene.CurrentPlayer.playerName,
            at: Date.now(),
        });
        if (sent && answer === "enter") {
            // A DND set by the lock of the own desk would prevent the bubble with the visitor.
            this.statusLink.onVisitorAccepted();
        }
    }

    public hasPass(uuid: string, areaId: string): boolean {
        return this.state.hasPass(uuid, areaId, Date.now());
    }

    public getDoorLocks(): DoorLocks {
        const zones: LockedDoorZone[] = (this.areasManager?.getLockedAreas() ?? []).map(({ areaId, area }) => ({
            areaId,
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
        }));
        return { zones, hasPass: (uuid, areaId) => this.hasPass(uuid, areaId) };
    }

    public destroy(): void {
        this.eventSubscription?.unsubscribe();
        this.tickTimer.remove();
        this.statusLink.destroy();
        this.areasManager?.setLockPass(() => false);
        this.lockPassTarget = undefined;
        this.announced.clear();
        knockRequestsStore.set([]);
    }

    private get areasManager(): AreasManager | undefined {
        return this.scene.getGameMapFrontWrapper()?.areasManager;
    }

    private installLockPass(): void {
        const areasManager = this.areasManager;
        if (areasManager && areasManager !== this.lockPassTarget) {
            areasManager.setLockPass((areaId) => this.hasPass(this.localUuid, areaId));
            this.lockPassTarget = areasManager;
        }
    }

    /** Applies the message locally, then broadcasts it if it changed anything. */
    private send(message: KnockMessage): boolean {
        const effects = this.state.receive(message, Date.now());
        if (effects.length === 0) {
            return false;
        }
        this.apply(effects);
        const { name, data } = encodeKnockMessage(message);
        this.scene.connection?.emitScriptableEvent(name, data, undefined).catch((error) => {
            console.warn("Could not send a knock event", error);
        });
        return true;
    }

    private tick(): void {
        this.installLockPass();
        const now = Date.now();
        this.apply(this.state.expire(now));

        const lockedAreas = this.areasManager?.getLockedAreas();
        if (lockedAreas) {
            // An unlocked area (by an occupant, or by the back once empty): nothing left to knock on.
            const locked = new Map(lockedAreas.map((entry) => [entry.areaId, entry.area]));
            for (const areaId of new Set(this.state.pending().map((request) => request.areaId))) {
                if (!locked.has(areaId)) {
                    this.apply(this.state.dropArea(areaId));
                }
            }
            // The local visitor who walks away withdraws its request.
            const player = this.scene.CurrentPlayer;
            for (const request of this.state.pending()) {
                const area = locked.get(request.areaId);
                if (request.visitorUuid !== this.localUuid || !area) {
                    continue;
                }
                if (distanceToRectangle(player.x, player.y, area) > KNOCK_CANCEL_DISTANCE_PX) {
                    this.send({ kind: "cancel", areaId: request.areaId, visitorUuid: this.localUuid, at: now });
                }
            }
        }
        // The local player may have walked into or out of an area.
        this.refreshRequests();
    }

    private apply(effects: KnockEffect[]): void {
        for (const effect of effects) {
            // Only the local visitor is told about its own knock; the occupants see the store.
            if (effect.kind === "requested" || effect.visitorUuid !== this.localUuid) {
                continue;
            }
            switch (effect.kind) {
                case "answered":
                    if (effect.answer === "enter") {
                        this.showText(effect.areaId, get(LL).area.knock.opened({ name: effect.answeredBy }), "message");
                        this.areasManager?.updateAreaCollision(effect.areaId);
                    } else {
                        this.showText(effect.areaId, get(LL).area.knock.later(), "warning");
                    }
                    break;
                case "noAnswer":
                    this.showText(effect.areaId, get(LL).area.knock.noAnswer(), "warning");
                    break;
                case "withdrawn":
                    this.scene.CurrentPlayer.destroyText(textId(effect.areaId));
                    break;
                case "passExpired":
                    this.areasManager?.updateAreaCollision(effect.areaId);
                    break;
            }
        }
        if (effects.length > 0) {
            this.refreshRequests();
        }
    }

    /** Shows the pending knocks on the areas the local player is inside; a knock is heard when it first shows. */
    private refreshRequests(): void {
        const areasManager = this.areasManager;
        const pending = this.state.pending();
        const visible = pending.filter(
            (request) =>
                request.visitorUuid !== this.localUuid &&
                (areasManager?.isCurrentPlayerInArea(request.areaId) ?? false),
        );
        for (const request of visible) {
            if (!this.announced.has(request)) {
                this.announced.add(request);
                // Not GameScene.playSound: the knock must be heard even in "Do not disturb".
                this.scene.sound.play(KNOCK_SOUND_KEY, { volume: 0.5 });
            }
        }
        for (const request of this.announced) {
            if (!pending.includes(request)) {
                this.announced.delete(request);
            }
        }
        const shown = get(knockRequestsStore);
        if (shown.length !== visible.length || shown.some((request, index) => request !== visible[index])) {
            knockRequestsStore.set(visible);
        }
    }

    private showWaiting(areaId: string): void {
        const lockedArea = this.adminLockedArea(areaId);
        if (lockedArea) {
            this.showWaitingAdmin(areaId, lockedArea.propertyId);
            return;
        }
        const id = textId(areaId);
        this.scene.CurrentPlayer.playText(
            id,
            get(LL).area.knock.waiting(),
            KNOCK_REPLY_TIMEOUT_MS,
            () => this.scene.CurrentPlayer.destroyText(id),
            true,
            "message",
        );
    }

    /** An admin may still force the door open, as before the knock existed: Space on this text unlocks the area. */
    private showWaitingAdmin(areaId: string, propertyId: string): void {
        const id = textId(areaId);
        const trigger = touchScreenManager.detectPrimaryTouchDevice() ? "👆" : get(LL).trigger.spaceKeyboard();
        this.scene.CurrentPlayer.playText(
            id,
            get(LL).area.knock.waitingAdmin({ trigger }),
            KNOCK_REPLY_TIMEOUT_MS,
            () => {
                setAreaPropertyVariable(areaId, propertyId, "lock", false);
                this.scene.CurrentPlayer.destroyText(id);
            },
            true,
            "message",
        );
    }

    /** The locked area, when the local player is an admin who may force it open. */
    private adminLockedArea(areaId: string): { areaId: string; propertyId: string } | undefined {
        if (!this.scene.connection?.hasTag("admin")) {
            return undefined;
        }
        return this.areasManager?.getLockedAreas().find((entry) => entry.areaId === areaId);
    }

    private showText(areaId: string, text: string, type: "warning" | "message"): void {
        const id = textId(areaId);
        this.scene.CurrentPlayer.playText(
            id,
            text,
            ANSWER_TEXT_DURATION_MS,
            () => this.scene.CurrentPlayer.destroyText(id),
            true,
            type,
        );
    }
}

/** Each new text of a knock replaces the previous one above the visitor's head. */
function textId(areaId: string): string {
    return `knock-${areaId}`;
}

function distanceToRectangle(
    x: number,
    y: number,
    rectangle: { x: number; y: number; width: number; height: number },
): number {
    const dx = Math.max(rectangle.x - x, 0, x - (rectangle.x + rectangle.width));
    const dy = Math.max(rectangle.y - y, 0, y - (rectangle.y + rectangle.height));
    return Math.hypot(dx, dy);
}
