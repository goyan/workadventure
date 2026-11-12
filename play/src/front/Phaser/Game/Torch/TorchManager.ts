import { get, type Unsubscriber } from "svelte/store";
import { mapEditorModeStore } from "../../../Stores/MapEditorStore";
import { torchEquippedStore } from "../../../Stores/TorchStore";
import type { Character } from "../../Entity/Character";
import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import { toggleHandTool } from "./HandTools";
import { torchFlicker, torchFlickerPhase } from "./TorchFlicker";
import { TORCH_EQUIPPED_VARIABLE } from "./TorchProtocol";
import { Torches, type TorchBearer } from "./Torches";

/** With the lights of the RGB lamps (see LampManager): above the night veil, which they pierce. */
const TORCH_DEPTH = DEPTH_NIGHT_INDEX + 100;
/** The flicker moves 15 times a second: soft enough to look alive, and the scene is not rendered at every image. */
const FLICKER_STEPS_PER_SECOND = 15;
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

    constructor(private readonly scene: GameScene) {
        this.torches = new Torches(scene, TORCH_DEPTH);
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
        const step = (Math.floor((time * FLICKER_STEPS_PER_SECOND) / 1000) * 1000) / FLICKER_STEPS_PER_SECOND;
        const bearers: TorchBearer[] = [];
        const add = (id: string, character: Character, local: boolean): void => {
            if (!character.isTorchLit()) return;
            const intensity = torchFlicker(step, torchFlickerPhase(id), REDUCED_MOTION);
            character.setTorchIntensity(intensity);
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
    }

    public destroy(): void {
        this.equipmentUnsubscribe();
        this.torches.destroy();
    }
}
