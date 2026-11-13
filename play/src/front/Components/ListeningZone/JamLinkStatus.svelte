<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { karaokeStatesStore, readFailedText } from "../../Karaoke/JamKaraoke";
    import { relinkedJamHostStore, updateOwnRoom, type JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { openSpotifySettings } from "../../Stores/MenuStore";
    import Button from "../UI/Button.svelte";
    import JamLinkForm from "./JamLinkForm.svelte";
    import { IconAlertTriangle } from "@wa-icons";

    interface Props {
        /** A Spotify Jam room: Jukeboxes and Live rooms have no invite link. */
        room: JamRoom;
        mine: boolean;
        joined: boolean;
    }

    let { room, mine, joined }: Props = $props();

    let replacing = $state(false);

    // What the host's browser reads of their Spotify player, sent with the karaoke state of the room.
    let hostState = $derived($karaokeStatesStore.get(room.jam.hostUuid));
    let issue = $derived(hostState?.issue);
    // Spotify's Web API knows nothing of Jams: an ended Jam is only seen as nothing playing on the host's side.
    let hostWarning = $derived.by(() => {
        switch (issue) {
            case "noPlayback":
                return $LL.spotify.listeningZone.jamStatus.noPlayback();
            case "noPlayer":
                return $LL.spotify.listeningZone.jamStatus.noPlayer();
            case "desktopNoPosition":
                return $LL.spotify.listeningZone.jamStatus.desktopNoPosition();
            case "authorizationExpired":
                return $LL.spotify.listeningZone.jamStatus.authorizationExpired();
            case "accessDenied":
                return $LL.spotify.listeningZone.jamStatus.accessDenied();
            case "rateLimited":
                return $LL.spotify.listeningZone.jamStatus.rateLimited();
            case "readFailed":
                return readFailedText($LL.spotify.listeningZone.jamStatus, hostState?.issueStatus);
            default:
                return undefined;
        }
    });
    // A position missing for a reason the host's browser knows is named; only otherwise has the Jam most likely stopped.
    let jamStopped = $derived(issue === undefined && hostState?.track !== null && hostState?.positionAt === 0);
    let positionUnavailable = $derived(
        hostState !== undefined && (issue !== undefined || (hostState.track !== null && !hostState.positionAt)),
    );
    let needsSettings = $derived(
        issue === "noPlayer" ||
            issue === "authorizationExpired" ||
            issue === "accessDenied" ||
            issue === "desktopNoPosition",
    );
</script>

{#if mine}
    {#if positionUnavailable}
        <div
            class="flex items-start gap-1.5 rounded-md bg-warning/15 p-2 text-xs text-white/90"
            role="status"
            data-testid="jam-link-warning"
        >
            <IconAlertTriangle font-size="14" class="mt-px shrink-0 text-warning" />
            <div class="flex flex-col gap-0.5">
                <p class="m-0 font-bold">
                    {hostWarning ?? $LL.spotify.listeningZone.jamStatus.positionUnavailable()}
                </p>
            </div>
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
        <JamLinkForm
            id={`jam-link-${room.jam.hostUuid}`}
            onreplace={(url) => {
                updateOwnRoom({ url });
                replacing = false;
            }}
            oncancel={() => (replacing = false)}
        />
    {:else}
        <Button
            variant="light"
            appearance={jamStopped || issue === "noPlayback" ? "filled" : "border"}
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
