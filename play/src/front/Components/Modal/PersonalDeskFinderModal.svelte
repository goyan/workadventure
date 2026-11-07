<script lang="ts">
    import type { AreaData } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { localUserStore } from "../../Connection/LocalUserStore";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { canClaimPersonalDesk } from "../../Stores/PersonalDeskStore";
    import { mapEditorModeStore } from "../../Stores/MapEditorStore";
    import { warningMessageStore } from "../../Stores/ErrorStore";
    import Button from "../UI/Button.svelte";
    import LoginMenuItem from "../ActionBar/MenuIcons/LoginMenuItem.svelte";
    import Popup from "./Popup.svelte";
    import { modals } from "@wa-modals";

    let { isOpen }: { isOpen: boolean } = $props();
    const scene = gameManager.getCurrentGameScene();
    const loggedIn = localUserStore.isLogged();
    const desks = availableDesks();

    function availableDesks(): AreaData[] {
        return (scene.getGameMapFrontWrapper().areasManager?.getAreasByPropertyType("personalAreaPropertyData") ?? [])
            .map((area) => area.areaData)
            .filter((area) =>
                canClaimPersonalDesk(area, localUserStore.isLogged(), (tag) => scene.connection?.hasTag(tag) ?? false),
            );
    }

    function visit(deskId: string): void {
        // Recheck ownership and permission: the list may have changed since the dialog opened.
        const desk = availableDesks().find((desk) => desk.id === deskId);
        if (!desk) {
            warningMessageStore.addWarningMessage($LL.actionbar.personalDesk.noAvailable(), { closable: true });
            return;
        }
        modals.close();
        mapEditorModeStore.switchMode(false);
        scene.getCameraManager().resumePlayerFollow();
        scene.moveTo({ x: desk.x + desk.width / 2, y: desk.y + desk.height / 2 }, true).catch(() => {
            warningMessageStore.addWarningMessage($LL.actionbar.personalDesk.errorMoving(), { closable: true });
        });
        // Entering the area opens the existing claim confirmation; walking never assigns ownership.
    }
</script>

<Popup {isOpen} withAction={false}>
    {#snippet title()}<h1>{$LL.actionbar.personalDesk.find()}</h1>{/snippet}
    {#snippet content()}
        <div class="w-full flex flex-col gap-3" data-testid="personal-desk-finder">
            {#if !loggedIn}
                <p>{$LL.actionbar.personalDesk.loginToClaim()}</p>
                <LoginMenuItem />
            {:else if desks.length === 0}
                <p>{$LL.actionbar.personalDesk.noAvailable()}</p>
            {:else}
                <p>{$LL.actionbar.personalDesk.findDescription()}</p>
                {#each desks as desk (desk.id)}
                    <div class="flex items-center justify-between gap-3 rounded bg-white/10 p-3">
                        <span>{desk.name}</span>
                        <Button variant="secondary" onclick={() => visit(desk.id)}
                            >{$LL.actionbar.personalDesk.visit()}</Button
                        >
                    </div>
                {/each}
            {/if}
        </div>
    {/snippet}
</Popup>
