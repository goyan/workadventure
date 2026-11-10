import type * as Phaser from "phaser";
import type { Subscription } from "rxjs";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import Debug from "debug";
import { localUserStore } from "../../../Connection/LocalUserStore";
import { nerfEquippedStore, nerfHeartsStore } from "../../../Stores/NerfStore";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { nerfVolumeStore } from "../../../Stores/SoundEffectsStore";
import { PathTileType } from "../../../Utils/PathfindingManager";
import { RectangleObstacles } from "../../../Utils/RectangleObstacles";
import type { GameScene } from "../GameScene";
import type { Character } from "../../Entity/Character";
import { CHARACTER_BODY_HEIGHT } from "../../Entity/Character";
import { Area } from "../../Entity/Area";
import { NerfImpactEffect } from "./NerfImpactEffect";
import { countsAsHit, fullHearts, hit, release, thirdsAt, type NerfHeartsState } from "./NerfHearts";
import { findNerfPrison, isInZone, zoneCenter, type NerfZone } from "./NerfPrison";
import {
    decodeNerfShot,
    nerfGunPose,
    NERF_COOLDOWN_MS,
    NERF_EQUIPPED_VARIABLE,
    NERF_HEARTS_VARIABLE,
    NERF_HEARING_DISTANCE,
    NERF_MAX_VOLUME,
    NERF_OUCH_SOUND_KEY,
    NERF_RANGE,
    NERF_SHOT_EVENT,
    NERF_SOUND_KEY,
    NERF_SPEED,
    type NerfShot,
} from "./NerfProtocol";

const debug = Debug("front:nerf");
const MAX_PROJECTILES = 64;

interface Projectile {
    sprite: Phaser.GameObjects.Graphics;
    x: number;
    y: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    bornAt: number;
    senderId: number;
    /** Where the shooter stood: a shot fired from the prison hurts nobody. */
    originX: number;
    originY: number;
}

/**
 * Room-wide shots, with local playback. A dart from an equipped player that reaches the equipped local player takes a
 * third of a heart: the target's browser decides (it sees the dart reach its own avatar), and publishes its hearts.
 * Nothing is saved and nobody keeps a score.
 */
export class NerfManager {
    private readonly eventSubscription: Subscription | undefined;
    private readonly equipmentUnsubscribe: Unsubscriber;
    private readonly projectiles = new Set<Projectile>();
    private readonly impacts = new Set<NerfImpactEffect>();
    private readonly lastShots = new Map<number, number>();
    /** Hearts of the local player, kept while the Nerf is put away; created on the first equipment. */
    private hearts: NerfHeartsState | undefined;
    private publishedHearts: { thirds: number; jailed: boolean } | undefined;

    constructor(private readonly scene: GameScene) {
        this.equipmentUnsubscribe = nerfEquippedStore.subscribe((equipped) => {
            scene.CurrentPlayer.setNerfEquipped(equipped);
            scene.getPlayerVariablesManager()?.setVariableFromApp(NERF_EQUIPPED_VARIABLE, equipped, {
                public: true,
                persist: false,
                scope: "room",
            });
            if (equipped) this.hearts ??= fullHearts();
            this.publishHearts(scene.time.now);
        });
        this.eventSubscription = scene.connection?.receivedEventMessageStream.subscribe(({ name, data, senderId }) => {
            const shot = decodeNerfShot(name, data);
            const connection = scene.connection;
            if (!shot || senderId === undefined || !connection || senderId === connection.getUserId()) return;
            const sender = scene.MapPlayersByKey.get(senderId);
            // Events are room-wide, whereas avatars and effects are only relevant inside the viewport.
            if (!sender || Math.hypot(shot.x - sender.x, shot.y - sender.y) > 96) return;
            this.spawn(shot, senderId);
        });
    }

    public get isEquipped(): boolean {
        return get(nerfEquippedStore);
    }

    public toggleEquipment(): void {
        nerfEquippedStore.update((equipped) => !equipped);
    }

    public fire(): void {
        const connection = this.scene.connection;
        if (
            !connection ||
            !this.isEquipped ||
            get(mapEditorModeStore) ||
            !this.scene.userInputManager.isControlsEnabled
        ) {
            return;
        }
        const player = this.scene.CurrentPlayer;
        const shot = decodeNerfShot(NERF_SHOT_EVENT, {
            x: player.x,
            y: player.y,
            direction: player.lastDirection,
            seated: player.isSeated(),
            heading: player.getNerfHeading(),
        });
        if (!shot || !this.spawn(shot, connection.getUserId())) return;
        connection.emitScriptableEvent(NERF_SHOT_EVENT, shot, undefined).catch((error: unknown) => {
            debug("Could not send a shot", { error });
        });
    }

    public update(time: number): void {
        const prison = this.getPrison();
        // Walking out of the prison (or being moved out of it) gives the hearts back. Checked before the darts of this
        // frame: the teleport into the prison is applied by the time the next frame looks.
        if (this.hearts?.jailed && !isInZone(prison, this.scene.CurrentPlayer)) this.hearts = release();
        for (const [id, lastShot] of this.lastShots) {
            if (time - lastShot >= NERF_COOLDOWN_MS) this.lastShots.delete(id);
        }
        const hadEffects = this.projectiles.size > 0 || this.impacts.size > 0;
        for (const impact of this.impacts) {
            if (!impact.update(time)) {
                impact.destroy();
                this.impacts.delete(impact);
            }
        }
        if (hadEffects) this.scene.markDirty();
        if (this.projectiles.size === 0) {
            this.publishHearts(time);
            return;
        }
        const wrapper = this.scene.getGameMapFrontWrapper();
        const grid = wrapper.getSharedCollisionGrid();
        const tile = wrapper.getTileDimensions();
        // Areas have static bodies even when open: only walls and furniture are solid obstacles for darts.
        const obstacles = new RectangleObstacles(
            Array.from(this.scene.physics.world.staticBodies)
                .filter((body) => !(body.gameObject instanceof Area))
                .map((body) => ({
                    x: body.x,
                    y: body.y,
                    width: body.width,
                    height: body.height,
                })),
            { offsetX: 0, offsetY: 0, width: 0, height: 0 },
        );
        const characters = new Map<number, Character>(this.scene.MapPlayersByKey);
        const ownId = this.scene.connection?.getUserId();
        if (ownId !== undefined) characters.set(ownId, this.scene.CurrentPlayer);
        // Include the visible upper body, which extends above the avatar's feet collision box.
        const bodies = [...characters].map(([id, character]) => {
            const body = character.getCollisionRectangle();
            return {
                id,
                obstacles: new RectangleObstacles(
                    [{ ...body, y: body.y - CHARACTER_BODY_HEIGHT, height: body.height + CHARACTER_BODY_HEIGHT }],
                    { offsetX: 0, offsetY: 0, width: 0, height: 0 },
                ),
            };
        });
        for (const projectile of this.projectiles) {
            const distance = Math.min(NERF_RANGE, (Math.max(0, time - projectile.bornAt) * NERF_SPEED) / 1000);
            const next = {
                x: projectile.startX + projectile.dx * distance,
                y: projectile.startY + projectile.dy * distance,
            };
            const targets = bodies.filter(({ id }) => id !== projectile.senderId);
            // Sample the complete travelled segment: a slow frame must not let a dart skip a blocked tile.
            const steps = Math.max(1, Math.ceil(Math.hypot(next.x - projectile.x, next.y - projectile.y) / 4));
            let previous = { x: projectile.x, y: projectile.y };
            let impactPoint: { x: number; y: number } | undefined;
            let hitId: number | undefined;
            for (let step = 0; step <= steps; step++) {
                const x = projectile.x + ((next.x - projectile.x) * step) / steps;
                const y = projectile.y + ((next.y - projectile.y) * step) / steps;
                const row = grid[Math.floor(y / tile.height)];
                const cell = row?.[Math.floor(x / tile.width)];
                const point = { x, y };
                hitId = targets.find(
                    ({ obstacles: body }) => body.blocksSegment(previous, point) || body.blocksPoint(point),
                )?.id;
                if (
                    hitId !== undefined ||
                    cell === undefined ||
                    cell === PathTileType.Collider ||
                    obstacles.blocksSegment(previous, point) ||
                    obstacles.blocksPoint(point)
                ) {
                    impactPoint = point;
                    break;
                }
                previous = point;
            }
            if (hitId !== undefined && hitId === ownId) this.receiveDart(projectile, prison, time);
            if (impactPoint || distance >= NERF_RANGE) {
                if (impactPoint && this.impacts.size < MAX_PROJECTILES) {
                    this.impacts.add(new NerfImpactEffect(this.scene, impactPoint.x, impactPoint.y, time));
                }
                projectile.sprite.destroy();
                this.projectiles.delete(projectile);
            } else {
                projectile.x = next.x;
                projectile.y = next.y;
                projectile.sprite.setPosition(next.x, next.y).setDepth(next.y);
            }
        }
        this.publishHearts(time);
        this.scene.markDirty();
    }

    public destroy(): void {
        this.equipmentUnsubscribe();
        this.eventSubscription?.unsubscribe();
        for (const projectile of this.projectiles) projectile.sprite.destroy();
        for (const impact of this.impacts) impact.destroy();
        this.projectiles.clear();
        this.impacts.clear();
        this.lastShots.clear();
        this.scene.markDirty();
    }

    private spawn(shot: NerfShot, senderId: number): boolean {
        const now = this.scene.time.now;
        const lastShot = this.lastShots.get(senderId);
        if (lastShot !== undefined && now - lastShot < NERF_COOLDOWN_MS) return false;
        if (this.projectiles.size >= MAX_PROJECTILES) return false;
        this.lastShots.set(senderId, now);
        const pose = nerfGunPose(shot.direction, shot.heading);
        const x = shot.x + pose.x + pose.dx * 14;
        const y = shot.y + pose.y + pose.dy * 14 - (shot.seated ? 4 : 0);
        const sprite = this.scene.add.graphics();
        sprite.fillStyle(0x208edd).fillRect(-4, -1, 7, 3);
        sprite.fillStyle(0xff8d24).fillRect(3, -1, 3, 3);
        sprite.setPosition(x, y).setRotation(Math.atan2(pose.dy, pose.dx)).setDepth(y);
        // The first update also checks the path to the muzzle: a barrel protruding through a wall cannot shoot past it.
        this.projectiles.add({
            sprite,
            x: shot.x,
            y: shot.y,
            startX: x,
            startY: y,
            dx: pose.dx,
            dy: pose.dy,
            bornAt: now,
            senderId,
            originX: shot.x,
            originY: shot.y,
        });
        this.scene.markDirty();
        this.playPop(shot);
        return true;
    }

    /** The prison of the map, read again each frame: the map editor may move it. */
    private getPrison(): NerfZone | undefined {
        return findNerfPrison((this.scene as Partial<GameScene>).wamFile?.areas ?? []);
    }

    /** A dart reached the local player: it takes a third if both players carry a Nerf and nobody is in the prison. */
    private receiveDart(projectile: Projectile, prison: NerfZone | undefined, time: number): void {
        const player = this.scene.CurrentPlayer;
        const counts = countsAsHit({
            targetEquipped: this.isEquipped,
            targetInPrison: this.hearts?.jailed === true || isInZone(prison, player),
            shooterEquipped: this.scene.MapPlayersByKey.get(projectile.senderId)?.isNerfEquipped() === true,
            shotFromPrison: isInZone(prison, { x: projectile.originX, y: projectile.originY }),
        });
        if (counts && this.hearts) this.applyHit(prison, time);
    }

    private applyHit(prison: NerfZone | undefined, time: number): void {
        if (!this.hearts) return;
        const { state, eliminated } = hit(this.hearts, time);
        this.hearts = state;
        this.scene.CurrentPlayer.flashNerfHit();
        this.playOuch();
        if (!eliminated) return;
        if (prison) {
            const center = zoneCenter(prison);
            this.scene.CurrentPlayer.teleportTo(center.x, center.y);
        } else {
            this.hearts = release();
        }
    }

    /** Sends the hearts to the colleagues and the screen, only when they change; nothing while the Nerf is put away. */
    private publishHearts(time: number): void {
        const shown =
            this.isEquipped && this.hearts
                ? { thirds: thirdsAt(this.hearts, time), jailed: this.hearts.jailed }
                : undefined;
        if (shown?.thirds === this.publishedHearts?.thirds && shown?.jailed === this.publishedHearts?.jailed) return;
        this.publishedHearts = shown;
        nerfHeartsStore.set(shown);
        this.scene.getPlayerVariablesManager()?.setVariableFromApp(NERF_HEARTS_VARIABLE, shown?.thirds, {
            public: true,
            persist: false,
            scope: "room",
        });
    }

    /** The player's own "ouch": at the Nerf volume, not faded with the distance. */
    private playOuch(): void {
        if (localUserStore.getBlockAudio() || this.scene.sound.locked) return;
        const volume = get(nerfVolumeStore) * NERF_MAX_VOLUME;
        if (volume > 0) this.scene.sound.play(NERF_OUCH_SOUND_KEY, { volume });
    }

    private playPop(shot: NerfShot): void {
        if (localUserStore.getBlockAudio() || this.scene.sound.locked) return;
        const listener = this.scene.CurrentPlayer;
        const closeness = Math.max(0, 1 - Math.hypot(shot.x - listener.x, shot.y - listener.y) / NERF_HEARING_DISTANCE);
        const volume = get(nerfVolumeStore) * NERF_MAX_VOLUME * closeness * closeness;
        if (volume === 0) return;
        this.scene.sound.play(NERF_SOUND_KEY, {
            volume,
            pan: Math.max(-0.6, Math.min(0.6, (shot.x - listener.x) / NERF_HEARING_DISTANCE)),
        });
    }
}
