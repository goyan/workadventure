<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import type { KnockAnswer } from "../../Phaser/Game/Knock/KnockProtocol";
    import { knockRequestsStore } from "../../Stores/KnockStore";

    function answer(areaId: string, visitorUuid: string, knockAnswer: KnockAnswer) {
        gameManager.getCurrentGameScene().knockManager?.answer(areaId, visitorUuid, knockAnswer);
    }
</script>

<!-- One card per visitor knocking on the door of an area the local player is inside. -->
{#each $knockRequestsStore as request (`${request.areaId}:${request.visitorUuid}`)}
    <div
        class="rounded bg-contrast/90 backdrop-blur-md text-white p-3 max-w-sm shadow-xl pointer-events-auto flex flex-col gap-2"
        role="alert"
        data-testid="knockRequest"
    >
        <strong>{$LL.area.knock.request({ name: request.visitorName })}</strong>
        <div class="flex gap-2">
            <button
                type="button"
                class="rounded bg-success px-3 py-1"
                data-testid="knockRequestEnter"
                onclick={() => answer(request.areaId, request.visitorUuid, "enter")}
            >
                {$LL.area.knock.enter()}
            </button>
            <button
                type="button"
                class="rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                data-testid="knockRequestNotNow"
                onclick={() => answer(request.areaId, request.visitorUuid, "later")}
            >
                {$LL.area.knock.notNow()}
            </button>
        </div>
    </div>
{/each}
