import * as Phaser from "phaser";
import type { Unsubscriber } from "svelte/store";
import { localUserStore } from "../../Connection/LocalUserStore";
import { karaokeSpotlightStore } from "../../Karaoke/KaraokeShow";
import type { Character } from "../Entity/Character";
import { isEffectShown } from "../../Stores/EffectsStore";
import type { GameScene } from "./GameScene";
import { nerfGunPose } from "./Nerf/NerfProtocol";

const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const BEAM_HEIGHT = 96;
const COLOUR = 0xffe08a;
const NOTE_EVERY_MS = 650;
const NOTES = ["♪", "♫", "♬"];
const NOTE_COLOURS = ["#ffe08a", "#ff8ad8", "#8ad8ff", "#b6ff8a"];

/**
 * The karaoke singers on the map: a stage light (a beam from above and a halo on the floor, drawn over the avatar), a
 * microphone in the hand, drawn in code like the torch, and music notes rising from them.
 */
export class KaraokeSpotlight {
    private readonly light: Phaser.GameObjects.Graphics;
    private singers: ReadonlySet<string> = new Set();
    private readonly unsubscribe: Unsubscriber;
    private shown = false;
    private readonly mics = new Map<Character, Phaser.GameObjects.Graphics>();
    private readonly lastNoteAt = new Map<Character, number>();

    constructor(private readonly scene: GameScene) {
        this.light = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        this.unsubscribe = karaokeSpotlightStore.subscribe((singers) => {
            this.singers = singers;
            this.scene.markDirty();
        });
    }

    public update(time: number): void {
        const lit = isEffectShown("karaokeSpotlight") ? this.singerCharacters() : [];
        this.updateMics(lit, time);
        if (!lit.length) {
            if (this.shown) {
                this.light.clear().setVisible(false);
                this.shown = false;
                this.scene.markDirty();
            }
            return;
        }
        const pulse = REDUCED_MOTION ? 1 : 0.8 + 0.2 * Math.sin(time / 380);
        this.light.clear().setVisible(true);
        for (const character of lit) {
            const floorY = character.y + 14;
            this.light.fillStyle(COLOUR, 0.1 * pulse);
            this.light.fillTriangle(
                character.x - 6,
                floorY - BEAM_HEIGHT,
                character.x + 6,
                floorY - BEAM_HEIGHT,
                character.x + 22,
                floorY,
            );
            this.light.fillTriangle(
                character.x - 6,
                floorY - BEAM_HEIGHT,
                character.x + 22,
                floorY,
                character.x - 22,
                floorY,
            );
            for (const [radius, alpha] of [
                [26, 0.08],
                [20, 0.12],
                [13, 0.18],
            ] as const) {
                this.light.fillStyle(COLOUR, alpha * pulse);
                this.light.fillEllipse(character.x, floorY, radius * 2, radius * 0.8);
            }
        }
        this.light.setDepth(Math.max(...lit.map((character) => character.depth)) + 1);
        this.shown = true;
        this.scene.markDirty();
    }

    public destroy(): void {
        this.unsubscribe();
        this.light.destroy();
        for (const mic of this.mics.values()) mic.destroy();
        this.mics.clear();
    }

    private updateMics(lit: readonly Character[], time: number): void {
        for (const [character, mic] of this.mics) {
            if (lit.includes(character) && character.active) continue;
            if (character.active) character.remove(mic);
            mic.destroy();
            this.mics.delete(character);
            this.lastNoteAt.delete(character);
        }
        for (const character of lit) {
            let mic = this.mics.get(character);
            if (!mic) {
                mic = this.scene.add.graphics();
                mic.fillStyle(0x1f1f24).fillRect(-1, -5, 2, 7);
                mic.fillStyle(0x9aa0aa).fillRect(-2, -9, 4, 4);
                mic.fillStyle(0xd8dde6).fillRect(-1, -9, 1, 2);
                character.add(mic);
                this.mics.set(character, mic);
            }
            const hand = nerfGunPose(character.lastDirection);
            mic.setPosition(hand.x, hand.y - (character.isSeated() ? 4 : 0));
            character.bringToTop(mic);
            if (REDUCED_MOTION || time - (this.lastNoteAt.get(character) ?? -Infinity) < NOTE_EVERY_MS) continue;
            this.lastNoteAt.set(character, time);
            this.emitNote(character);
        }
    }

    private emitNote(character: Character): void {
        const note = this.scene.add
            .text(character.x + (Math.random() - 0.5) * 14, character.y - 22, NOTES[Math.floor(Math.random() * 3)], {
                fontFamily: "sans-serif",
                fontSize: "11px",
                color: NOTE_COLOURS[Math.floor(Math.random() * NOTE_COLOURS.length)],
                stroke: "#000000",
                strokeThickness: 2,
                resolution: 2,
            })
            .setOrigin(0.5)
            .setDepth(character.depth + 2);
        this.scene.tweens.add({
            targets: note,
            y: note.y - 34,
            x: note.x + (Math.random() - 0.5) * 24,
            alpha: 0,
            angle: (Math.random() - 0.5) * 50,
            duration: 1700,
            ease: "Sine.easeOut",
            onComplete: () => note.destroy(),
        });
    }

    private singerCharacters(): Character[] {
        if (!this.singers.size) return [];
        const localUuid = localUserStore.getLocalUser()?.uuid;
        const remote = [...this.scene.MapPlayersByKey.values()].filter((player) => this.singers.has(player.userUuid));
        return localUuid && this.singers.has(localUuid) ? [this.scene.CurrentPlayer, ...remote] : remote;
    }
}
