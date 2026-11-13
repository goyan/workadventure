<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { dismissJamLinkRequests, jamLinkRequestCardStore } from "../../ListeningZone/JamLinkRequest";
    import { ownJamLinkSaveStore, replaceOwnJamLink } from "../../ListeningZone/ListeningZoneController";
    import JamLinkForm from "./JamLinkForm.svelte";

    let pasting = $state(false);
    let card = $derived($jamLinkRequestCardStore);
    let title = $derived.by(() => {
        if (!card) return "";
        const [latest, ...others] = card.requesters;
        return others.length === 0
            ? $LL.spotify.listeningZone.jamLinkRequest.one({ name: latest?.name ?? "" })
            : $LL.spotify.listeningZone.jamLinkRequest.many({ name: latest?.name ?? "", count: others.length });
    });
</script>

<!-- Guests asking the local host for a new Jam link, gathered in one card; it goes once the link changes. -->
{#if card}
    <div
        class="rounded bg-contrast/90 backdrop-blur-md text-white p-3 max-w-sm shadow-xl pointer-events-auto flex flex-col gap-2"
        role="alert"
        data-testid="jam-link-request-card"
    >
        <div class="flex items-start gap-2">
            <strong class="grow">{title}</strong>
            <button
                type="button"
                class="rounded hover:bg-white/20 px-2 leading-none"
                aria-label={$LL.actionbar.close()}
                data-testid="jam-link-request-dismiss"
                onclick={dismissJamLinkRequests}
            >
                ×
            </button>
        </div>
        {#if pasting}
            <JamLinkForm
                id="jam-link-request-url"
                onreplace={(url) => {
                    replaceOwnJamLink(url).catch((error) => console.error("Cannot replace the Jam link", error));
                    pasting = false;
                }}
                oncancel={() => (pasting = false)}
            />
        {:else}
            {#if $ownJamLinkSaveStore?.status === "failed"}
                <p class="m-0 text-xs text-red-400" role="alert">
                    {$LL.spotify.listeningZone.jamStatus.linkFailed()}
                </p>
            {:else if $ownJamLinkSaveStore?.status === "saving"}
                <p class="m-0 text-xs text-white/70" role="status">
                    {$LL.spotify.listeningZone.jamStatus.linkSaving()}
                </p>
            {/if}
            <button
                type="button"
                class="self-start rounded bg-success px-3 py-1"
                data-testid="jam-link-request-paste"
                onclick={() => (pasting = true)}
            >
                {$LL.spotify.listeningZone.jamStatus.replace()}
            </button>
        {/if}
    </div>
{/if}
