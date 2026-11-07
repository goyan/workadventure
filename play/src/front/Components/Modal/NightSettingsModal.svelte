<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import NightSettings from "../Menu/NightSettings.svelte";
    import Popup from "./Popup.svelte";

    let { isOpen }: { isOpen: boolean } = $props();
</script>

<Popup {isOpen} withAction={false}>
    {#snippet title()}
        <h1>{$LL.menu.settings.night.label()}</h1>
    {/snippet}
    {#snippet content()}
        <div class="w-full" data-testid="night-settings-modal">
            <NightSettings />
        </div>
    {/snippet}
</Popup>
