import type { FishingMessage } from "@workadventure/messages";
import { get, type Unsubscriber } from "svelte/store";
import type { Subscription } from "rxjs";
import { fishingCaughtStore, rodEquippedStore, showFishingCard } from "../../../Stores/FishingStore";
import { toggleHandTool } from "../../../Stores/HandToolStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import type { Character } from "../../Entity/Character";
import type { GameScene } from "../GameScene";
import { joinedUserId } from "../Jungle/JungleCompanions";
import { FishingLines } from "./FishingLines";
import { FISHING_EVENT, fishingDirection, ROD_EQUIPPED_VARIABLE } from "./FishingProtocol";
import { FishingRod } from "./FishingRod";
import { FishingView, type RodHolder } from "./FishingView";

/** The system asks for less motion: the floats stay still. */
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
/** A charging cast is given up when the avatar moved this far. */
const MOVED_PX = 1;
/** The count of the last minute is read again this often. */
const COUNT_EVERY_MS = 5000;

/**
 * The fishing rod of the local player (equipped from the own-avatar wheel, shared as a player variable) and the
 * fishing of the room as this browser draws it. The server decides everything: this only sends "cast" and "reel",
 * and shows the lines it is told (see FishingManager in back).
 */
export class FishingManager {
    private readonly rod = new FishingRod();
    private readonly lines = new FishingLines();
    private readonly view: FishingView;
    private readonly equipmentUnsubscribe: Unsubscriber;
    private readonly messageSubscription: Subscription | undefined;
    /** Where the avatar stood when the cast started charging. */
    private chargedFrom: { x: number; y: number } | undefined;
    private countedAt = -Infinity;

    constructor(
        private readonly scene: GameScene,
        joined: FishingMessage | undefined,
    ) {
        this.view = new FishingView(scene, REDUCED_MOTION);
        this.equipmentUnsubscribe = rodEquippedStore.subscribe((equipped) => {
            scene.CurrentPlayer.setRodEquipped(equipped);
            scene.getPlayerVariablesManager()?.setVariableFromApp(ROD_EQUIPPED_VARIABLE, equipped, {
                public: true,
                persist: false,
                scope: "room",
            });
            if (!equipped) {
                this.giveUpCast();
                // The rod put away: its line comes back.
                if (this.ownLine()) scene.connection?.emitReelFishingLine();
            }
        });
        if (joined) this.receive(joined);
        this.messageSubscription = scene.connection?.fishingMessageStream.subscribe((message) => {
            this.receive(message);
        });
    }

    public get isEquipped(): boolean {
        return get(rodEquippedStore);
    }

    /** Equips or puts away the rod; equipping it puts the torch and the Nerf away, and is refused in the editor. */
    public toggleEquipment(): void {
        toggleHandTool("rod", { refuseEquip: get(mapEditorModeStore) });
    }

    /** The key of the rod goes down: with a line in the water it reels, else a cast starts charging. */
    public pressKey(repeat: boolean): void {
        const connection = this.scene.connection;
        if (!connection || !this.mayFish()) return;
        if (this.rod.press(Date.now(), this.ownLine() !== undefined) === "reel") {
            if (!repeat) connection.emitReelFishingLine();
            return;
        }
        const player = this.scene.CurrentPlayer;
        this.chargedFrom ??= { x: player.x, y: player.y };
    }

    /** The key goes up: the line is cast where the gauge says. */
    public releaseKey(): void {
        const player = this.scene.CurrentPlayer;
        const point = this.rod.release(Date.now(), {
            x: player.x,
            y: player.y,
            direction: fishingDirection(player.lastDirection),
        });
        this.chargedFrom = undefined;
        if (point && this.mayFish()) this.scene.connection?.emitCastFishingLine(point.x, point.y);
    }

    public update(time: number): void {
        const player = this.scene.CurrentPlayer;
        const from = this.chargedFrom;
        if (from && (!this.mayFish() || Math.hypot(player.x - from.x, player.y - from.y) > MOVED_PX)) {
            this.giveUpCast();
        }
        const holders: RodHolder[] = [];
        const add = (userId: number, character: Character): void => {
            if (!character.isRodEquipped()) return;
            holders.push({
                userId,
                x: character.x,
                y: character.y,
                direction: character.lastDirection,
                seated: character.isSeated(),
            });
        };
        const ownId = joinedUserId(this.scene.connection);
        if (ownId !== undefined) add(ownId, player);
        for (const [userId, character] of this.scene.MapPlayersByKey) add(userId, character);
        const tiles = this.rod.chargeTiles(Date.now());
        this.view.update(
            time,
            holders,
            // In the editor the map is edited, not played.
            get(mapEditorModeStore) ? [] : this.lines.lines,
            tiles === undefined ? undefined : { x: player.x, y: player.y, tiles },
        );
        if (time - this.countedAt >= COUNT_EVERY_MS) {
            this.countedAt = time;
            this.publishCount();
        }
    }

    public destroy(): void {
        this.equipmentUnsubscribe();
        this.messageSubscription?.unsubscribe();
        this.view.destroy();
        fishingCaughtStore.set(undefined);
    }

    private receive(message: FishingMessage): void {
        const ownId = joinedUserId(this.scene.connection);
        for (const event of this.lines.receive(message, Date.now())) {
            const own = event.userId === ownId;
            if (event.type === FISHING_EVENT.caught) {
                // Another player's catch is shown when that player is in sight.
                const name = own ? undefined : this.scene.MapPlayersByKey.get(event.userId)?.playerName;
                if (own || name !== undefined) {
                    showFishingCard({ kind: "caught", own, name, grams: event.grams, female: event.kind % 2 === 1 });
                }
            } else if (own && event.type === FISHING_EVENT.missed) {
                showFishingCard({ kind: "missed", own });
            } else if (own && event.type === FISHING_EVENT.lost) {
                showFishingCard({ kind: "lost", own });
            } else if (own && event.type === FISHING_EVENT.refused) {
                showFishingCard({ kind: "refused", own });
            }
        }
        this.publishCount();
        this.scene.markDirty();
    }

    private publishCount(): void {
        const total = this.lines.caughtTotal;
        const lastMinute = this.lines.caughtLastMinute(Date.now());
        fishingCaughtStore.set(total > 0 || lastMinute > 0 ? { total, lastMinute } : undefined);
    }

    private ownLine(): unknown {
        const ownId = joinedUserId(this.scene.connection);
        return ownId === undefined ? undefined : this.lines.lineOf(ownId);
    }

    /** Standing (or in a canoe), not swimming, out of the editor, with the controls of the avatar. */
    private mayFish(): boolean {
        return (
            this.isEquipped &&
            !get(mapEditorModeStore) &&
            this.scene.userInputManager.isControlsEnabled &&
            !this.scene.CurrentPlayer.isSwimming()
        );
    }

    private giveUpCast(): void {
        this.rod.cancel();
        this.chargedFrom = undefined;
    }
}
