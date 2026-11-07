<script lang="ts">
    import { onMount } from "svelte";
    import type { Readable } from "svelte/store";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        forbiddenAudioInputs,
        type JamAudioSession,
        type JamAudioTarget,
    } from "../../ListeningZone/JamAudioSession";
    import type { JamMusicCaptureError, JamMusicCaptureState } from "../../ListeningZone/JamMusicCapture";
    import { jamAudioInputStore } from "../../ListeningZone/JamAudioInputStore";
    import { jamMusicMutedStore, jamMusicVolumeStore } from "../../ListeningZone/JamMusicStore";
    import PlayerPauseIcon from "../Icons/PlayerPauseIcon.svelte";
    import PlayerPlayIcon from "../Icons/PlayerPlayIcon.svelte";
    import PlayerStopIcon from "../Icons/PlayerStopIcon.svelte";
    import VolumeIcon from "../Icons/VolumeIcon.svelte";
    import Button from "../UI/Button.svelte";
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
    let forbiddenDeviceIds = $derived(forbiddenAudioInputs(micDeviceId));
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
    <!-- A small player: the round button pauses or resumes the music, the slider sets its volume, the other stops it. -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-black/25 px-2.5 py-2">
        <TooltipAbove label={muteLabel}>
            <button
                type="button"
                class="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-[#1ed760] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                onclick={() => jamMusicMutedStore.update((muted) => !muted)}
                data-testid="jam-audio-mute"
                aria-label={muteLabel}
            >
                {#if $jamMusicMutedStore}
                    <PlayerPlayIcon
                        height="h-5"
                        width="w-5"
                        strokeColor="stroke-black"
                        fillColor="fill-black"
                        hover=""
                    />
                {:else}
                    <PlayerPauseIcon
                        height="h-5"
                        width="w-5"
                        strokeColor="stroke-black"
                        fillColor="fill-black"
                        hover=""
                    />
                {/if}
            </button>
        </TooltipAbove>
        <div class="flex min-w-[7rem] flex-1 items-center gap-2">
            <VolumeIcon height="h-5" width="w-5" strokeColor="stroke-white/70" hover="" classList="shrink-0" />
            <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                class="jam-volume min-w-0 flex-1"
                style="--fill: {$jamMusicVolumeStore * 100}%"
                aria-label={$LL.spotify.listeningZone.audioVolume()}
                bind:value={$jamMusicVolumeStore}
                data-testid="jam-audio-volume"
            />
        </div>
        <TooltipAbove label={$LL.spotify.listeningZone.audioStopListen()}>
            <button
                type="button"
                class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-transparent hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                onclick={() => report(session.stopListening())}
                data-testid="jam-audio-stop-listen"
                aria-label={$LL.spotify.listeningZone.audioStopListen()}
            >
                <PlayerStopIcon height="h-4" width="w-4" fillColor="fill-white" hover="" />
            </button>
        </TooltipAbove>
    </div>
{:else}
    <Button variant="success" size="sm" onclick={() => report(session.listen(jam))} dataTestId="jam-audio-listen">
        {$LL.spotify.listeningZone.audioListen()}
    </Button>
{/if}
{#if errorMessage}
    <p class="m-0 text-xs text-red-300" data-testid="jam-audio-error">{errorMessage}</p>
{/if}

<style>
    /*
     * A thin green track filled up to the volume, with a round thumb centred on it. The track and the thumb are sized
     * explicitly: left to the browser, the 14px thumb is not centred on a 4px bar everywhere (on Windows it sat above it).
     */
    .jam-volume {
        -webkit-appearance: none;
        appearance: none;
        height: 14px;
        margin: 0;
        padding: 0;
        background: transparent;
        outline: none;
        cursor: pointer;
    }
    .jam-volume::-webkit-slider-runnable-track {
        height: 4px;
        border-radius: 9999px;
        background: linear-gradient(to right, #1ed760 var(--fill), rgb(255 255 255 / 0.25) var(--fill));
    }
    .jam-volume::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        /* (track height - thumb height) / 2 */
        margin-top: -5px;
        border: 0;
        border-radius: 9999px;
        background: #fff;
    }
    .jam-volume::-moz-range-track {
        height: 4px;
        border-radius: 9999px;
        background: rgb(255 255 255 / 0.25);
    }
    .jam-volume::-moz-range-progress {
        height: 4px;
        border-radius: 9999px;
        background: #1ed760;
    }
    .jam-volume::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border: 0;
        border-radius: 9999px;
        background: #fff;
    }
    .jam-volume:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 4px;
    }
</style>
