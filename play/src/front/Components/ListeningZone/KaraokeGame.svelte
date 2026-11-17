<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { derived, readable } from "svelte/store";
    import { buildKaraokeStageSpaceName, KaraokeStageAction } from "@workadventure/map-editor";
    import Debug from "debug";
    import type { JamRoom } from "../../ListeningZone/ListeningZoneController";
    import { isLocalUser } from "../../ListeningZone/ListeningZoneController";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        karaokeStagesStore,
        enableKaraokeGame,
        selectKaraokeSinger,
        requestKaraokeTurn,
        karaokeSingerName,
    } from "../../Karaoke/KaraokeStage";
    import { createKaraokeVoiceSession } from "../../Karaoke/KaraokeVoiceSession";
    import type { KaraokeVoiceSession } from "../../Karaoke/KaraokeVoiceSession";
    import { enterKaraokeGame } from "../../Karaoke/KaraokeGameStore";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { localUserStore } from "../../Connection/LocalUserStore";
    import {
        jamMusicStreamsStore,
        getJamMusicPublisher,
        onJamMusicPublisherRegistered,
    } from "../../ListeningZone/JamMusicStore";
    import { requestedMicrophoneDeviceIdStore } from "../../Stores/MediaStore";
    import { speakerSelectedStore } from "../../Stores/AudioOutputStore";
    import Button from "../UI/Button.svelte";
    import AudioStream from "../Video/PictureInPicture/AudioStream.svelte";

    let { room, mine }: { room: JamRoom; mine: boolean } = $props();
    const logger = Debug("karaoke-stage");
    const unblocked = readable(false);
    const volume = readable(1);
    let stage = $derived($karaokeStagesStore.get(room.jam.hostUuid));
    let singer = $derived(stage?.singerUuid ?? undefined);
    let myMic = $derived(singer !== undefined && isLocalUser(singer));
    let queued = $derived(stage?.queue.includes(localUserStore.getLocalUser()?.uuid ?? "") ?? false);
    let spaceName = $derived(
        stage?.enabled && singer
            ? buildKaraokeStageSpaceName({
                  ...stage,
                  singerUuid: singer,
                  roomUrl: gameManager.getCurrentGameScene().roomUrl,
              })
            : undefined,
    );
    let streamStore = $derived(
        derived(jamMusicStreamsStore, (streams) => (spaceName ? streams.get(spaceName) : undefined)),
    );
    let session: KaraokeVoiceSession | undefined;
    let connected = $state(false);
    let recording = $state(false);
    let pending = $state(false);
    let failed = $state(false);
    let clapped = $state(false);
    onMount(enterKaraokeGame);

    $effect(() => {
        const name = spaceName;
        connected = false;
        recording = false;
        pending = false;
        failed = false;
        clapped = false;
        if (!name) return;
        const current = createKaraokeVoiceSession(gameManager.getCurrentGameScene().spaceRegistry, (constraints) =>
            navigator.mediaDevices.getUserMedia(constraints),
        );
        session = current;
        let alive = true;
        const unwatch = onJamMusicPublisherRegistered(name, () => {
            if (alive) connected = true;
        });
        current
            .join(name)
            .then(() => {
                if (alive) connected = getJamMusicPublisher(name) !== undefined;
            })
            .catch((error: unknown) => {
                if (alive) failed = true;
                logger("Stage connection failed", error);
            });
        return () => {
            alive = false;
            unwatch();
            if (session === current) session = undefined;
            current.leave().catch((error: unknown) => logger("Stage cleanup failed", error));
        };
    });
    $effect(() => {
        requestKaraokeTurn(room, KaraokeStageAction.Request);
    });
    onDestroy(() => {
        requestKaraokeTurn(room, KaraokeStageAction.Leave);
    });

    async function sing(): Promise<void> {
        const current = session;
        if (!current || !myMic || pending) return;
        pending = true;
        failed = false;
        try {
            await current.sing($requestedMicrophoneDeviceIdStore);
            if (session === current && myMic) recording = true;
        } catch (error) {
            if (session === current) failed = true;
            logger("Mic refused or unavailable", error);
        } finally {
            finishAttempt(current);
        }
    }
    function finishAttempt(current: KaraokeVoiceSession): void {
        if (session === current) pending = false;
    }
</script>

<div class="rounded-xl border border-white/10 bg-white/5 p-3 text-sm" data-testid="karaoke-game">
    {#if !stage?.enabled}
        {#if mine}<Button size="sm" onclick={() => enableKaraokeGame(room, true)}
                >{$LL.spotify.karaoke.game.start()}</Button
            >
        {:else}<p class="m-0 text-white/70">{$LL.spotify.karaoke.game.waiting()}</p>{/if}
    {:else}
        <p class="m-0 font-bold" aria-live="polite">
            {singer
                ? $LL.spotify.karaoke.game.onStage({ name: karaokeSingerName(singer) })
                : $LL.spotify.karaoke.game.ready()}
        </p>
        {#if singer}
            <p class="m-0 pt-1 text-xs text-white/70" aria-live="polite">
                👏 {$LL.spotify.karaoke.game.applause({ count: stage.applause })}
            </p>
        {/if}
        <div class="mt-2 flex flex-wrap gap-2">
            {#if myMic}
                <Button size="sm" disabled={!connected || pending || recording} onclick={sing}
                    >{recording ? $LL.spotify.karaoke.game.singing() : $LL.spotify.karaoke.game.sing()}</Button
                >
                <Button size="sm" onclick={() => requestKaraokeTurn(room, KaraokeStageAction.Leave)}
                    >{$LL.spotify.karaoke.game.end()}</Button
                >
            {:else}
                <Button
                    size="sm"
                    onclick={() =>
                        requestKaraokeTurn(room, queued ? KaraokeStageAction.Leave : KaraokeStageAction.Join)}
                    >{queued ? $LL.spotify.karaoke.game.leave() : $LL.spotify.karaoke.game.myTurn()}</Button
                >
                {#if singer}<Button
                        size="sm"
                        disabled={clapped}
                        onclick={() => {
                            clapped = true;
                            requestKaraokeTurn(room, KaraokeStageAction.Clap);
                        }}>👏 {$LL.spotify.karaoke.game.clap()}</Button
                    >{/if}
            {/if}
            {#if mine}
                {#if !singer}<Button size="sm" onclick={() => selectKaraokeSinger(room, room.jam.hostUuid)}
                        >{$LL.spotify.karaoke.game.self()}</Button
                    >
                {:else}<Button size="sm" onclick={() => selectKaraokeSinger(room, null)}
                        >{$LL.spotify.karaoke.game.next()}</Button
                    >{/if}
                <Button size="sm" onclick={() => enableKaraokeGame(room, false)}
                    >{$LL.spotify.karaoke.game.stop()}</Button
                >
            {/if}
        </div>
        {#if stage.queue.length}
            <p class="m-0 pt-2 text-xs text-white/70">{$LL.spotify.karaoke.game.queue()}</p>
            <div class="mt-1 flex max-h-24 flex-col gap-1 overflow-y-auto">
                {#each stage.queue as uuid (uuid)}
                    {#if mine}<Button size="sm" onclick={() => selectKaraokeSinger(room, uuid)}
                            >{$LL.spotify.karaoke.game.choose({ name: karaokeSingerName(uuid) })}</Button
                        >
                    {:else}<span dir="auto" class="truncate text-xs">{karaokeSingerName(uuid)}</span>{/if}
                {/each}
            </div>
        {/if}
        {#if spaceName && !connected}<p class="m-0 pt-2 text-xs text-white/70" role="status">
                {$LL.spotify.karaoke.game.connecting()}
            </p>{/if}
        {#if failed}<p class="m-0 pt-2 text-xs text-red-400" role="alert">{$LL.spotify.karaoke.game.micError()}</p>{/if}
    {/if}
</div>
{#if spaceName}<AudioStream
        conversation={false}
        {streamStore}
        outputDeviceId={$speakerSelectedStore}
        isBlocked={unblocked}
        {volume}
    />{/if}
