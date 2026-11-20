<script lang="ts">
    import { get } from "svelte/store";
    import { LL } from "../../../i18n/i18n-svelte";
    import { EFFECTS, effectShownStores, type EffectName } from "../../Stores/EffectsStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import SettingsSection from "./SettingsSection.svelte";

    // The switches follow the stores (a quality preset changes them too) and write back what is toggled here.
    let shown = $state(
        Object.fromEntries(EFFECTS.map((name) => [name, get(effectShownStores[name])])) as Record<EffectName, boolean>,
    );
    $effect(() => {
        const unsubscribers = EFFECTS.map((name) =>
            effectShownStores[name].subscribe((value) => {
                shown[name] = value;
            }),
        );
        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    });
</script>

<!-- Each effect without a switch of its own, for this person only (the "None" quality turns them all off). -->
<SettingsSection title={$LL.menu.settings.effects.title()} dataTestId="effects-settings">
    <p class="m-0 text-xs text-white/60">{$LL.menu.settings.effects.hint()}</p>
    {#each EFFECTS as name (name)}
        <InputSwitch
            id={`effect-shown-${name}`}
            bind:value={shown[name]}
            onchange={() => effectShownStores[name].set(shown[name])}
            label={$LL.menu.settings.effects[name]()}
            labelPosition="right"
        />
    {/each}
</SettingsSection>
