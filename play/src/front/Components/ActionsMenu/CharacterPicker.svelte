<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { characterPickerStore } from "../../Stores/CharacterPickerStore";
    import type { CharacterPickerCandidate } from "../../Stores/CharacterPickerStore";
    import ButtonClose from "../Input/ButtonClose.svelte";
    import RaisedHandAvatar from "../Video/RaisedHandAvatar.svelte";
    import LL from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { startMovingEventName } from "../../Phaser/Player/Player";

    // Opened by a click on several overlapping wokas: the user picks the one they meant.

    function close() {
        characterPickerStore.set(undefined);
    }

    function choose(candidate: CharacterPickerCandidate) {
        close();
        candidate.select();
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === "Escape") close();
    }

    // Walking away makes the choice stale: the wokas under the click are no longer the ones around.
    onMount(() => {
        gameManager.getCurrentGameScene().CurrentPlayer?.on(startMovingEventName, close);
    });

    onDestroy(() => {
        gameManager.getCurrentGameScene().CurrentPlayer?.off(startMovingEventName, close);
    });
</script>

<svelte:window onkeydown={onKeyDown} />

{#if $characterPickerStore}
    <div
        class="m-auto my-0 h-fit w-80 max-w-[calc(100vw-1.5rem)] z-50 bg-contrast/80 backdrop-blur rounded-lg pointer-events-auto overflow-hidden md:mr-0"
        data-testid="character-picker"
    >
        <div class="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
            <h3 class="text-white text-base font-bold m-0">{$LL.woka.picker.title()}</h3>
            <ButtonClose onclick={close} />
        </div>
        <ul class="list-none m-0 p-2 flex flex-col gap-1">
            {#each $characterPickerStore as candidate (candidate.key)}
                <li>
                    <button
                        type="button"
                        class="w-full flex items-center gap-3 px-2 py-1.5 rounded-md text-start text-white bg-transparent hover:bg-white/10 focus-visible:bg-white/10 cursor-pointer"
                        data-testid="character-picker-item"
                        onclick={() => choose(candidate)}
                    >
                        <RaisedHandAvatar pictureStore={candidate.pictureStore} name={candidate.name} />
                        <span class="truncate">
                            {candidate.isSelf ? $LL.woka.picker.self({ name: candidate.name }) : candidate.name}
                        </span>
                    </button>
                </li>
            {/each}
        </ul>
    </div>
{/if}
