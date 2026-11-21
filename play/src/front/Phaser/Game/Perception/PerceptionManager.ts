import { derived, get, type Readable, type Unsubscriber } from "svelte/store";
import LL from "../../../../i18n/i18n-svelte";
import { basicModeStore } from "../../../Stores/BasicModeStore";
import type { Character } from "../../Entity/Character";
import type { GameScene } from "../GameScene";
import { chosenPlaceStore } from "../Weather/ChosenPlaceWeather";
import { weatherPreviewStore } from "../Weather/RealWeatherClient";
import {
    PERCEPTION_VARIABLE,
    perceptionOf,
    shownPerceptionMark,
    type Perception,
    type PerceptionMark,
} from "./PerceptionProtocol";

/**
 * What the local player perceives. Basique as they chose it (in the map editor too, where it waits: their symbol does
 * not blink each time they edit). A city followed on their clock, as showsChosenPlaceWeather tells it: not while they
 * try a weather in the settings panel of the map, which then shows for them instead.
 */
export const localPerceptionStore: Readable<Perception> = derived(
    [basicModeStore, chosenPlaceStore, weatherPreviewStore],
    ([basic, place, preview]) => perceptionOf({ basic, place: place !== undefined && preview === undefined }),
);

/** The tooltip of a symbol: the place followed is not told (it is not sent). */
function perceptionTitle(mark: PerceptionMark): string {
    const texts = get(LL).woka.perception;
    return mark === "basic" ? texts.basic() : texts.place();
}

/**
 * Publishes what the local player perceives (a public player variable, not saved, like the torch), when it changes
 * and on entering the room; and puts the symbol of a changed perception over the other players, for a local player who
 * perceives the shared world only (see shownPerceptionMark).
 */
export class PerceptionManager {
    private local: Perception = "none";
    private readonly unsubscribe: Unsubscriber;

    constructor(
        private readonly scene: GameScene,
        store: Readable<Perception> = localPerceptionStore,
    ) {
        this.unsubscribe = store.subscribe((perception) => {
            this.local = perception;
            scene.getPlayerVariablesManager()?.setVariableFromApp(PERCEPTION_VARIABLE, perception, {
                public: true,
                persist: false,
                scope: "room",
            });
            // The local player's own perception decides what they see over the others.
            for (const player of scene.MapPlayersByKey.values()) this.refresh(player);
        });
    }

    /** Puts over `player` the symbol the local player sees (after their variable was read, see setPerception). */
    public refresh(player: Character): void {
        const mark = shownPerceptionMark(this.local, player.getPerception(), false);
        player.showPerceptionMark(mark, mark === undefined ? "" : perceptionTitle(mark));
    }

    public destroy(): void {
        this.unsubscribe();
    }
}
