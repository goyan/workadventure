import { writable } from "svelte/store";
import type { Writable } from "svelte/store";
import type { WaveCard } from "../Phaser/Game/Wave/WaveState";

/** The waves received by the local player, one card per sender, most recent first. Written by the WaveManager only. */
export const waveCardsStore: Writable<readonly WaveCard[]> = writable([]);
