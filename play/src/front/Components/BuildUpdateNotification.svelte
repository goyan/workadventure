<script lang="ts">
    import { onMount } from "svelte";
    import LL from "../../i18n/i18n-svelte";
    import { watchForBuildUpdate } from "../Network/BuildUpdate";
    import ToastContainer from "./Toasts/ToastContainer.svelte";

    let updateAvailable = $state(false);

    onMount(() => {
        const currentVersion = document.querySelector<HTMLMetaElement>('meta[name="wa-build-version"]')?.content;
        if (!currentVersion) {
            return;
        }
        return watchForBuildUpdate(currentVersion, () => {
            updateAvailable = true;
        });
    });

    function refresh(): void {
        window.location.reload();
    }

    function dismiss(): void {
        updateAvailable = false;
    }
</script>

{#if updateAvailable}
    <div
        role="status"
        class="fixed top-4 left-1/2 -translate-x-1/2 z-[1000] w-max max-w-[calc(100vw-2rem)] pointer-events-auto"
    >
        <ToastContainer theme="secondary" extraClasses="w-full max-w-sm">
            <p class="m-0 text-sm leading-snug">{$LL.refreshPrompt.newVersion()}</p>
            {#snippet buttons()}
                <button type="button" class="btn btn-ghost btn-sm flex-1" onclick={dismiss}>
                    {$LL.refreshPrompt.later()}
                </button>
                <button type="button" class="btn btn-secondary btn-sm flex-1" onclick={refresh}>
                    {$LL.refreshPrompt.refresh()}
                </button>
            {/snippet}
        </ToastContainer>
    </div>
{/if}
