<script lang="ts">
    import { onMount } from "svelte";
    import type { Readable } from "svelte/store";
    import { LL } from "../../../i18n/i18n-svelte";
    import type { JamAudioSession, JamAudioTarget } from "../../ListeningZone/JamAudioSession";
    import type { JamMusicCaptureError, JamMusicCaptureState } from "../../ListeningZone/JamMusicCapture";
    import { jamAudioInputStore } from "../../ListeningZone/JamAudioInputStore";
    import { jamMusicMutedStore, jamMusicVolumeStore } from "../../ListeningZone/JamMusicStore";
    import PlayerPauseIcon from "../Icons/PlayerPauseIcon.svelte";
    import PlayerPlayIcon from "../Icons/PlayerPlayIcon.svelte";
    import PlayerStopIcon from "../Icons/PlayerStopIcon.svelte";
    import Button from "../UI/Button.svelte";
    import JamMusicPlayer from "./JamMusicPlayer.svelte";
    import TooltipAbove from "./TooltipAbove.svelte";

    interface Props {
        jam: JamAudioTarget;
        /** The local user hosts this Jam: they share the music, the others listen to it. */
        mine: boolean;
        session: JamAudioSession;
        /** The input the user speaks into: it is never offered, it would carry their voice and not the music. */
        micDeviceId: string | undefined;
        captureState: Readable<JamMusicCaptureState>;
    }

    let { jam, mine, session, micDeviceId, captureState }: Props = $props();

    // The session never changes for a given card: reading it once is what we want.
    // svelte-ignore state_referenced_locally
    const listeningSpaceName = session.listeningSpaceName;
    // svelte-ignore state_referenced_locally
    const sharingSpaceName = session.sharingSpaceName;
    let spaceName = $derived(session.spaceNameOf(jam));
    let listening = $derived($listeningSpaceName === spaceName);
    let sharing = $derived($sharingSpaceName === spaceName);

    let inputs = $state<{ deviceId: string; label: string }[]>([]);
    let failed = $state(false);

    // The system default is the user's own microphone more often than not: it is hidden when we do not know which.
    let forbiddenDeviceIds = $derived(micDeviceId ? [micDeviceId] : ["default"]);
    let offeredInputs = $derived(inputs.filter((input) => !forbiddenDeviceIds.includes(input.deviceId)));
    // A remembered input that is unplugged, or that is now the microphone, is not a choice any more.
    let chosenDeviceId = $derived(
        offeredInputs.some((input) => input.deviceId === $jamAudioInputStore) ? $jamAudioInputStore : "",
    );

    async function refreshInputs(): Promise<void> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            inputs = devices
                .filter((device) => device.kind === "audioinput")
                .map((device) => ({ deviceId: device.deviceId, label: device.label || device.deviceId }));
        } catch {
            inputs = [];
        }
    }

    onMount(() => {
        if (mine) {
            refreshInputs().catch(() => undefined);
        }
    });

    function report(promise: Promise<void>): void {
        failed = false;
        promise.catch((error) => {
            console.error("Jam audio failed", error);
            failed = true;
        });
    }

    function errorText(reason: JamMusicCaptureError): string {
        switch (reason) {
            case "denied":
                return $LL.spotify.listeningZone.audioErrorDenied();
            case "microphone":
                return $LL.spotify.listeningZone.audioErrorMicrophone();
            case "no-session":
                return $LL.spotify.listeningZone.audioErrorSession();
            default:
                return $LL.spotify.listeningZone.audioErrorDevice();
        }
    }

    let muteLabel = $derived(
        $jamMusicMutedStore ? $LL.spotify.listeningZone.audioUnmute() : $LL.spotify.listeningZone.audioMute(),
    );

    let errorMessage = $derived(
        $captureState.status === "error" && mine
            ? errorText($captureState.reason)
            : failed
              ? $LL.spotify.listeningZone.audioErrorSession()
              : undefined,
    );
</script>

{#if mine}
    {#if sharing}
        <Button
            variant="light"
            appearance="border"
            size="sm"
            onclick={() => report(session.stopSharingMusic())}
            dataTestId="jam-audio-stop-share"
        >
            {$LL.spotify.listeningZone.audioStopShare()}
        </Button>
    {:else}
        <label class="flex flex-col gap-1 text-xs text-white/70">
            {$LL.spotify.listeningZone.audioInput()}
            <select
                class="rounded border border-white/20 bg-white/10 px-1.5 py-1 text-xs text-white"
                value={chosenDeviceId}
                onchange={(event) => jamAudioInputStore.set(event.currentTarget.value)}
                onfocus={refreshInputs}
                data-testid="jam-audio-input"
            >
                <option value="">—</option>
                {#each offeredInputs as input (input.deviceId)}
                    <option value={input.deviceId}>{input.label}</option>
                {/each}
            </select>
        </label>
        <p class="m-0 text-xs text-white/50">{$LL.spotify.listeningZone.audioHint()}</p>
        <Button
            variant="success"
            size="sm"
            disabled={!chosenDeviceId}
            onclick={() => report(session.shareMusic(jam, chosenDeviceId, { forbiddenDeviceIds }))}
            dataTestId="jam-audio-share"
        >
            {$LL.spotify.listeningZone.audioShare()}
        </Button>
    {/if}
{:else if listening}
    <div data-testid="jam-audio-player"><JamMusicPlayer {spaceName} /></div>
    <div class="flex flex-wrap items-center gap-2">
        <TooltipAbove label={$LL.spotify.listeningZone.audioStopListen()}>
            <Button
                variant="light"
                appearance="border"
                size="sm"
                square
                onclick={() => report(session.stopListening())}
                dataTestId="jam-audio-stop-listen"
                aria-label={$LL.spotify.listeningZone.audioStopListen()}
            >
                {#snippet icon()}
                    <PlayerStopIcon height="h-5" width="w-5" hover="" />
                {/snippet}
            </Button>
        </TooltipAbove>
        <!-- Pause while the music plays, play while it is silenced: an icon takes less room than a long label. -->
        <TooltipAbove label={muteLabel}>
            <Button
                variant="light"
                appearance="ghost"
                size="sm"
                square
                onclick={() => jamMusicMutedStore.update((muted) => !muted)}
                dataTestId="jam-audio-mute"
                aria-label={muteLabel}
            >
                {#snippet icon()}
                    {#if $jamMusicMutedStore}
                        <PlayerPlayIcon height="h-5" width="w-5" hover="" />
                    {:else}
                        <PlayerPauseIcon height="h-5" width="w-5" hover="" />
                    {/if}
                {/snippet}
            </Button>
        </TooltipAbove>
    </div>
    <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        class="w-full"
        aria-label={$LL.spotify.listeningZone.audioVolume()}
        bind:value={$jamMusicVolumeStore}
        data-testid="jam-audio-volume"
    />
{:else}
    <Button variant="success" size="sm" onclick={() => report(session.listen(jam))} dataTestId="jam-audio-listen">
        {$LL.spotify.listeningZone.audioListen()}
    </Button>
{/if}
{#if errorMessage}
    <p class="m-0 text-xs text-red-300" data-testid="jam-audio-error">{errorMessage}</p>
{/if}
