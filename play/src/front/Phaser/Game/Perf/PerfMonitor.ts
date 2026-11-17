import type { Unsubscriber } from "svelte/store";
import { perfShownStore, perfStatsStore } from "../../../Stores/PerfStore";
import { PerfMeter } from "./PerfMeter";

/** What the monitor listens to: the events of a scene, and those of the game around its drawing. */
interface Emitter {
    on(event: string, callback: () => void): unknown;
    off(event: string, callback: () => void): unknown;
}

/**
 * Feeds the performance counter of a player who asked to see it (perfShownStore): times each image of the scene
 * between the events of Phaser (the scene worked out, the game drawn) and gives the figures to the counter. It
 * listens to nothing while the counter is hidden: measuring costs nothing to who does not look.
 */
export class PerfMonitor {
    private readonly meter = new PerfMeter();
    private readonly unsubscribe: Unsubscriber;
    private listening = false;
    private frameStart = 0;
    private updateMs = 0;
    private renderStart = 0;

    constructor(
        private readonly sceneEvents: Emitter,
        private readonly gameEvents: Emitter,
        private readonly now: () => number = () => performance.now(),
    ) {
        this.unsubscribe = perfShownStore.subscribe((shown) => (shown ? this.listen() : this.stop()));
    }

    private readonly onPreUpdate = (): void => {
        this.frameStart = this.now();
    };

    private readonly onPostUpdate = (): void => {
        this.updateMs = this.now() - this.frameStart;
    };

    private readonly onPreRender = (): void => {
        this.renderStart = this.now();
    };

    private readonly onPostRender = (): void => {
        const stats = this.meter.frame(this.frameStart, this.updateMs, this.now() - this.renderStart);
        if (stats) {
            perfStatsStore.set(stats);
        }
    };

    private listen(): void {
        if (this.listening) return;
        this.listening = true;
        this.sceneEvents.on("preupdate", this.onPreUpdate);
        this.sceneEvents.on("postupdate", this.onPostUpdate);
        this.gameEvents.on("prerender", this.onPreRender);
        this.gameEvents.on("postrender", this.onPostRender);
    }

    private stop(): void {
        if (!this.listening) return;
        this.listening = false;
        this.sceneEvents.off("preupdate", this.onPreUpdate);
        this.sceneEvents.off("postupdate", this.onPostUpdate);
        this.gameEvents.off("prerender", this.onPreRender);
        this.gameEvents.off("postrender", this.onPostRender);
        perfStatsStore.set(undefined);
    }

    public destroy(): void {
        this.unsubscribe();
        this.stop();
    }
}
