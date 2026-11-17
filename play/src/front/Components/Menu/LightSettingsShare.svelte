<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { applyLightSettingsCode, currentLightSettingsCode } from "../../Stores/LightSettings";

    const labels = $derived($LL.menu.settings.lightShare);
    let code = $state("");
    let pasted = $state("");
    let message = $state("");

    async function copy(): Promise<void> {
        code = currentLightSettingsCode();
        try {
            await navigator.clipboard.writeText(code);
            message = labels.copied();
        } catch {
            // Clipboard refused: the code is shown, selected at a click, to be copied by hand.
            message = labels.copyByHand();
        }
    }

    function apply(): void {
        const applied = applyLightSettingsCode(pasted);
        message = applied === undefined ? labels.unknown() : labels.applied({ count: applied });
        if (applied !== undefined) pasted = "";
    }
</script>

<div class="flex flex-col gap-2" data-testid="light-settings-share">
    <p class="m-0 text-sm font-bold text-white/90">{labels.title()}</p>
    <p class="m-0 text-xs text-white/60">{labels.help()}</p>
    <div class="flex flex-row flex-wrap items-center gap-2">
        <button type="button" class="btn btn-sm btn-light btn-ghost" data-testid="light-settings-copy" onclick={copy}>
            {labels.copy()}
        </button>
        {#if code}
            <input
                type="text"
                readonly
                class="grow min-w-0 rounded bg-contrast/60 px-2 py-1 text-xs text-white"
                aria-label={labels.code()}
                value={code}
                onclick={(event) => event.currentTarget.select()}
            />
        {/if}
    </div>
    <div class="flex flex-row flex-wrap items-center gap-2">
        <input
            type="text"
            class="grow min-w-0 rounded bg-contrast/60 px-2 py-1 text-xs text-white"
            data-testid="light-settings-paste"
            placeholder={labels.paste()}
            aria-label={labels.paste()}
            bind:value={pasted}
        />
        <button
            type="button"
            class="btn btn-sm btn-light btn-ghost"
            data-testid="light-settings-apply"
            disabled={pasted.trim() === ""}
            onclick={apply}
        >
            {labels.apply()}
        </button>
    </div>
    {#if message}
        <p class="m-0 text-xs text-white/80" role="status">{message}</p>
    {/if}
</div>
