import { get, type Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { torchEquippedStore, torchIntensityStore } from "../../../Stores/TorchStore";
import type { Character } from "../../Entity/Character";
import { DEPTH_LAMP_LIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import { toggleHandTool } from "../../../Stores/HandToolStore";
import { CHARACTER_BODY_OFFSET_Y } from "../../Entity/Character";
import { isBasicActive } from "../../../Stores/BasicModeStore";
import {
    TORCH_MARKED_VARIATION,
    startTorchFade,
    torchFadeTowards,
    torchFlickerPhase,
    torchFlickerSeed,
    torchFlickerStep,
    type TorchFade,
} from "./TorchFlicker";
import { torchColour, torchGlow, torchIgnition } from "./TorchGlow";
import { torchWind } from "./TorchGust";
import { TORCH_FLAME_FRAMES_PER_SECOND, torchFlameShape, torchFlameStep } from "./TorchFlameShape";
import {
    decodeTorchIntensity,
    TORCH_EQUIPPED_VARIABLE,
    TORCH_INTENSITY_MAX,
    TORCH_INTENSITY_VARIABLE,
} from "./TorchProtocol";
import { Torches, type TorchBearer } from "./Torches";

/** The id of the local player among the bearers (the others go by their numeric key). */
const LOCAL_ID = "me";

/**
 * The fade of the glow may follow a gust (35 % in 150 ms) and an ignition (all of it in 500 ms): what keeps it safe
 * is its turning back (see torchFadeTowards), not its speed.
 */
const GLOW_FADE_PER_SECOND = 3;

/** The system asks for less motion: the torches give a steady light. */
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * The torch of the local player (equipped from the own-avatar wheel, shared as a player variable), and the lights of
 * every torch this browser sees, the local player's included (see Torches). Nothing changes in the protocol.
 */
export class TorchManager {
    private readonly equipmentUnsubscribe: Unsubscriber;
    private readonly intensityUnsubscribe: Unsubscriber;
    /**
     * How bright each torch is drawn now, on its way to the intensity its bearer set (see torchFadeTowards): its glow
     * (the flicker within the intensity) and the share of the night veil it pierces (the intensity alone).
     */
    private readonly fades = new Map<string, { glow: TorchFade; veil: TorchFade }>();
    /**
     * When each torch seen was lit (the page's clock: an observation of this browser, not shaken when the server clock
     * arrives), to light it up from nothing: undefined while it is out, -Infinity
     * when it was already lit the first time it was seen (a player found with a lit torch shows it lit at once).
     */
    private readonly litAt = new Map<string, number | undefined>();
    private readonly torches: Torches;
    /** The step of the flames last rendered (see torchFlameStep). */
    private flameStep: number | undefined;

    constructor(private readonly scene: GameScene) {
        this.torches = new Torches(scene, DEPTH_LAMP_LIGHT_INDEX);
        this.equipmentUnsubscribe = torchEquippedStore.subscribe((equipped) => {
            scene.CurrentPlayer.setTorchEquipped(equipped);
            scene.getPlayerVariablesManager()?.setVariableFromApp(TORCH_EQUIPPED_VARIABLE, equipped, {
                public: true,
                persist: false,
                scope: "room",
            });
        });
        // The intensity saved with the account (any computer, any map of the world) wins over the one of this browser;
        // an unreadable saved value is ignored.
        const saved = scene.getPlayerVariablesManager()?.variables.get(TORCH_INTENSITY_VARIABLE);
        if (typeof saved === "number" && Number.isFinite(saved)) torchIntensityStore.set(decodeTorchIntensity(saved));
        this.intensityUnsubscribe = torchIntensityStore.subscribe((percent) => {
            scene.CurrentPlayer.setTorchIntensity(percent);
            scene.getPlayerVariablesManager()?.setVariableFromApp(TORCH_INTENSITY_VARIABLE, percent, {
                public: true,
                persist: true,
                scope: "world",
            });
        });
    }

    public get isEquipped(): boolean {
        return get(torchEquippedStore);
    }

    /** Equips or puts away the torch; equipping it puts the Nerf away (one hand), and is refused in the map editor. */
    public toggleEquipment(): void {
        toggleHandTool("torch", { refuseEquip: get(mapEditorModeStore) });
    }

    public update(time: number): void {
        // The server clock, shared by every browser: each one draws the same flame for the same bearer. Until it is
        // known, the computer's clock (close to it).
        const now = this.scene.getServerDate()?.getTime() ?? Date.now();
        const step = torchFlickerStep(now);
        // The flames in the hands move 30 times a second, on their own clock: their light is not drawn again for it.
        const flameStep = torchFlameStep(now);
        const flameTime = (flameStep * 1000) / TORCH_FLAME_FRAMES_PER_SECOND;
        const view = this.scene.cameras.main.worldView;
        const weather = this.scene.getMapWeather();
        const outdoorGrid = this.scene.getOutdoorGrid();
        let flameSeen = false;
        const bearers: TorchBearer[] = [];
        const seen = new Set<string>();
        const add = (id: string, userId: string, character: Character, local: boolean): void => {
            seen.add(id);
            if (!character.isTorchLit()) {
                this.litAt.set(id, undefined);
                this.fades.delete(id);
                return;
            }
            if (!this.litAt.has(id)) {
                // Lit the first time it is seen: already burning.
                this.litAt.set(id, Number.NEGATIVE_INFINITY);
            } else if (this.litAt.get(id) === undefined) {
                // Seen out, now lit: it lights up from now.
                this.litAt.set(id, time);
            }
            const litAt = this.litAt.get(id) ?? time;
            const seed = torchFlickerSeed(userId);
            const phase = torchFlickerPhase(userId);
            // Weather falls where there is no grid: the wind blows there too (see keepOutdoorParticles).
            const outdoor = outdoorGrid?.isOutdoorAt(character.x, character.y + CHARACTER_BODY_OFFSET_Y) ?? true;
            const wind = torchWind(weather, outdoor);
            const litForMs = time - litAt;
            // On the steps of the flicker: a torch set dimmer or brighter is rendered 15 times a second at most.
            const strength = character.getTorchIntensity() / TORCH_INTENSITY_MAX;
            const previous = this.fades.get(id);
            const veil = previous ? torchFadeTowards(previous.veil, strength, step) : startTorchFade(strength, step);
            const glowTarget =
                veil.value * torchGlow({ epochMs: step, seed, wind, litForMs, reducedMotion: REDUCED_MOTION });
            const glow = previous
                ? torchFadeTowards(previous.glow, glowTarget, step, GLOW_FADE_PER_SECOND, TORCH_MARKED_VARIATION)
                : startTorchFade(glowTarget, step);
            this.fades.set(id, { glow, veil });
            character.setTorchFlame(torchFlameShape(flameTime, phase, REDUCED_MOTION));
            // A flame is a few pixels around the avatar: the margin of a tile is plenty.
            flameSeen ||=
                character.x > view.x - 32 &&
                character.y > view.y - 32 &&
                character.x < view.x + view.width + 32 &&
                character.y < view.y + view.height + 32;
            bearers.push({
                id,
                x: character.x,
                y: character.y,
                direction: character.lastDirection,
                seated: character.isSeated(),
                floorZ: character.getFloorZ(),
                intensity: glow.value,
                // The night veil: the intensity set, lit up with the torch (one rise, no flicker nor gust).
                strength: veil.value * torchIgnition(litForMs, REDUCED_MOTION),
                colour: torchColour(glow.value),
                local,
            });
        };
        const localUserId = this.scene.connection?.getUserId();
        add(LOCAL_ID, localUserId === undefined ? LOCAL_ID : String(localUserId), this.scene.CurrentPlayer, true);
        for (const [key, player] of this.scene.MapPlayersByKey) add(String(key), String(key), player, false);
        // Gone players are forgotten: a player coming back with a lit torch shows it lit at once.
        for (const id of this.litAt.keys()) if (!seen.has(id)) this.litAt.delete(id);
        for (const id of this.fades.keys()) if (!seen.has(id)) this.fades.delete(id);
        // Basique: no torch is lit, its flame nor its light.
        this.torches.update(time, isBasicActive() ? [] : bearers, get(mapEditorModeStore));
        // The scene is only rendered when asked: a flame on the screen asks for it at each of its steps.
        if (flameSeen && !REDUCED_MOTION && flameStep !== this.flameStep) {
            this.flameStep = flameStep;
            this.scene.markDirty();
        }
    }

    public destroy(): void {
        this.equipmentUnsubscribe();
        this.intensityUnsubscribe();
        this.torches.destroy();
    }
}
