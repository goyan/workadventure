import { get, type Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { torchEquippedStore } from "../../../Stores/TorchStore";
import type { Character } from "../../Entity/Character";
import { DEPTH_LAMP_LIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import { toggleHandTool } from "../../../Stores/HandToolStore";
import { torchFlicker, torchFlickerPhase, torchFlickerStep } from "./TorchFlicker";
import { TORCH_FLAME_FRAMES_PER_SECOND, torchFlameShape, torchFlameStep } from "./TorchFlameShape";
import { TORCH_EQUIPPED_VARIABLE } from "./TorchProtocol";
import { Torches, type TorchBearer } from "./Torches";

/** The id of the local player among the bearers (the others go by their numeric key). */
const LOCAL_ID = "me";

/** The system asks for less motion: the torches give a steady light. */
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * The torch of the local player (equipped from the own-avatar wheel, shared as a player variable), and the lights of
 * every torch this browser sees, the local player's included (see Torches). Nothing changes in the protocol.
 */
export class TorchManager {
    private readonly equipmentUnsubscribe: Unsubscriber;
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
    }

    public get isEquipped(): boolean {
        return get(torchEquippedStore);
    }

    /** Equips or puts away the torch; equipping it puts the Nerf away (one hand), and is refused in the map editor. */
    public toggleEquipment(): void {
        toggleHandTool("torch", { refuseEquip: get(mapEditorModeStore) });
    }

    public update(time: number): void {
        const step = torchFlickerStep(time);
        // The flames in the hands move 30 times a second, on their own clock: their light is not drawn again for it.
        const flameStep = torchFlameStep(time);
        const flameTime = (flameStep * 1000) / TORCH_FLAME_FRAMES_PER_SECOND;
        const view = this.scene.cameras.main.worldView;
        let flameSeen = false;
        const bearers: TorchBearer[] = [];
        const add = (id: string, character: Character, local: boolean): void => {
            if (!character.isTorchLit()) return;
            const phase = torchFlickerPhase(id);
            const intensity = torchFlicker(step, phase, REDUCED_MOTION);
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
                intensity,
                local,
            });
        };
        add(LOCAL_ID, this.scene.CurrentPlayer, true);
        for (const [key, player] of this.scene.MapPlayersByKey) add(String(key), player, false);
        this.torches.update(time, bearers, get(mapEditorModeStore));
        // The scene is only rendered when asked: a flame on the screen asks for it at each of its steps.
        if (flameSeen && !REDUCED_MOTION && flameStep !== this.flameStep) {
            this.flameStep = flameStep;
            this.scene.markDirty();
        }
    }

    public destroy(): void {
        this.equipmentUnsubscribe();
        this.torches.destroy();
    }
}
