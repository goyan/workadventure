<script lang="ts">
    import { isSpotifyJamUrl } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { karaokeStatesStore } from "../../Karaoke/JamKaraoke";
    import { relinkedJamHostStore, updateOwnRoom, type JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { openSpotifySettings } from "../../Stores/MenuStore";
    import Input from "../Input/Input.svelte";
    import Button from "../UI/Button.svelte";
    import { IconAlertTriangle } from "@wa-icons";

    interface Props {
        /** A Spotify Jam room: Jukeboxes and Live rooms have no invite link. */
        room: JamRoom;
        mine: boolean;
        joined: boolean;
    }

    let { room, mine, joined }: Props = $props();

    let replacing = $state(false);
    let jamUrl = $state("");
    let invalidLink = $state(false);

    // What the host's browser reads of their Spotify player, sent with the karaoke state of the room.
    let issue = $derived($karaokeStatesStore.get(room.jam.hostUuid)?.issue);
    // Spotify's Web API knows nothing of Jams: an ended Jam is only seen as nothing playing on the host's side.
    let hostWarning = $derived.by(() => {
        switch (issue) {
            case "noPlayback":
                return $LL.spotify.listeningZone.jamStatus.noPlayback();
            case "noPlayer":
                return $LL.spotify.listeningZone.jamStatus.noPlayer();
            case "authorizationExpired":
                return $LL.spotify.listeningZone.jamStatus.authorizationExpired();
            case "accessDenied":
                return $LL.spotify.listeningZone.jamStatus.accessDenied();
            default:
                return undefined;
        }
    });
    let needsSettings = $derived(issue === "noPlayer" || issue === "authorizationExpired" || issue === "accessDenied");

    function cancel(): void {
        replacing = false;
        jamUrl = "";
        invalidLink = false;
    }

    function submit(event: SubmitEvent): void {
        event.preventDefault();
        const url = jamUrl.trim();
        if (!isSpotifyJamUrl(url)) {
            invalidLink = true;
            return;
        }
        updateOwnRoom({ url });
        cancel();
    }
</script>

{#if mine}
    {#if hostWarning}
        <div
            class="flex items-start gap-1.5 rounded-md bg-warning/15 p-2 text-xs text-white/90"
            role="status"
            data-testid="jam-link-warning"
        >
            <IconAlertTriangle font-size="14" class="mt-px shrink-0 text-warning" />
            <p class="m-0">{hostWarning}</p>
        </div>
        {#if needsSettings}
            <Button
                variant="light"
                appearance="border"
                size="sm"
                onclick={openSpotifySettings}
                dataTestId="jam-link-open-settings">{$LL.spotify.listeningZone.jamStatus.openSettings()}</Button
            >
        {/if}
    {/if}
    {#if replacing}
        <form class="flex flex-col gap-2" onsubmit={submit} data-testid="jam-link-replace-form">
            <Input
                id={`jam-link-${room.jam.hostUuid}`}
                type="url"
                size="sm"
                placeholder={$LL.spotify.listeningZone.sharePlaceholder()}
                bind:value={jamUrl}
                status={invalidLink ? "error" : undefined}
                oninput={() => (invalidLink = false)}
            />
            <!-- The url variant of Input does not render its error helper text. -->
            {#if invalidLink}
                <p class="m-0 text-xs text-red-500" role="alert">{$LL.spotify.listeningZone.invalidLink()}</p>
            {/if}
            <div class="flex justify-end gap-2">
                <Button variant="light" appearance="ghost" size="sm" onclick={cancel}>
                    {$LL.spotify.listeningZone.cancel()}
                </Button>
                <Button variant="success" size="sm" type="submit" dataTestId="jam-link-replace-submit">
                    {$LL.spotify.listeningZone.jamStatus.replaceSubmit()}
                </Button>
            </div>
        </form>
    {:else}
        <Button
            variant="light"
            appearance={hostWarning ? "filled" : "border"}
            size="sm"
            onclick={() => (replacing = true)}
            dataTestId="jam-link-replace">{$LL.spotify.listeningZone.jamStatus.replace()}</Button
        >
    {/if}
{:else if $relinkedJamHostStore === room.jam.hostUuid && !joined}
    <p class="m-0 text-xs text-white/80" role="status" data-testid="jam-link-relinked">
        {$LL.spotify.listeningZone.jamStatus.relinked()}
    </p>
{:else if issue === "noPlayback"}
    <p class="m-0 flex items-start gap-1.5 text-xs text-white/70" role="status" data-testid="jam-link-warning">
        <IconAlertTriangle
            font-size="14"
            class="mt-px shrink-0 text-warning"
        />{$LL.spotify.listeningZone.jamStatus.noPlaybackGuest()}
    </p>
{/if}
