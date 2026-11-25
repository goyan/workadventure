<script lang="ts">
    import { onDestroy } from "svelte";
    import { get, type Readable } from "svelte/store";
    import { LL } from "../../../i18n/i18n-svelte";
    import { nerfEquippedStore } from "../../Stores/NerfStore";
    import { grenadeLauncherEquippedStore } from "../../Stores/ZombieGrenadeStore";
    import PixelIcon from "../ActionsMenu/PixelIcon.svelte";

    /** How long the help stays once a weapon is taken. */
    const HELP_MS = 5000;

    type Weapon = "nerf" | "grenade";

    let shown = $state<Weapon | undefined>(undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** Shows the help of a weapon when it is taken (not when it was already held), hides it when put away. */
    function watch(store: Readable<boolean>, weapon: Weapon): () => void {
        let held = get(store);
        return store.subscribe((holds) => {
            if (holds && !held) {
                shown = weapon;
                clearTimeout(timer);
                timer = setTimeout(() => (shown = undefined), HELP_MS);
            } else if (!holds && shown === weapon) {
                shown = undefined;
                clearTimeout(timer);
            }
            held = holds;
        });
    }

    const unsubscribers = [watch(nerfEquippedStore, "nerf"), watch(grenadeLauncherEquippedStore, "grenade")];

    onDestroy(() => {
        for (const unsubscribe of unsubscribers) unsubscribe();
        clearTimeout(timer);
    });
</script>

<!-- How to fire the weapon just taken, a few seconds, with the look of the fishing cards; never in the way of a click. -->
{#if shown}
    <div
        class="pointer-events-none absolute left-1/2 top-40 z-[300] -translate-x-1/2 select-none"
        aria-live="polite"
        data-testid="weapon-help"
    >
        <div class="fishing-card">
            <span class="fishing-badge" aria-hidden="true"><PixelIcon name={shown} size={18} /></span>
            {shown === "nerf" ? $LL.actionbar.nerf.help() : $LL.actionbar.grenadeLauncher.help()}
        </div>
    </div>
{/if}
