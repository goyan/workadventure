import { writable } from "svelte/store";
import type { Writable } from "svelte/store";
import type { CoffeeCard } from "../Phaser/Game/Coffee/CoffeeState";

/** The colleagues taking a coffee right now, one card each, most recent first. Written by the CoffeeManager only. */
export const coffeeCardsStore: Writable<readonly CoffeeCard[]> = writable([]);
