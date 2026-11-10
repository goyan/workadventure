<script lang="ts">
    import { localUserStore } from "../../../Connection/LocalUserStore";
    import { warningMessageStore } from "../../../Stores/ErrorStore";
    import { isInsidePersonalAreaStore, personalAreaDataStore } from "../../../Stores/PersonalDeskStore";
    import { globalMessageVisibleStore, mapEditorMenuVisibleStore, openedMenuStore } from "../../../Stores/MenuStore";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { analyticsClient } from "../../../Administration/AnalyticsClient";
    import {
        modalIframeStore,
        modalVisibilityStore,
        showModalGlobalComminucationVisibilityStore,
    } from "../../../Stores/ModalStore";
    import { mapEditorModeStore, mapExplorationModeStore } from "../../../Stores/MapEditorStore";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { isTodoListVisibleStore } from "../../../Stores/TodoListStore";
    import { isCalendarVisibleStore } from "../../../Stores/CalendarStore";
    import { chatVisibilityStore } from "../../../Stores/ChatStore";
    import ActionBarButton from "../ActionBarButton.svelte";
    import { EditorToolName } from "../../../Phaser/Game/MapEditor/MapEditorModeManager";
    import ReleaseNotesModal from "../../Modal/ReleaseNotesModal.svelte";
    import UnclaimPersonalDeskModal from "./UnclaimPersonalDeskModal.svelte";
    import AdditionalMenuItems from "./AdditionalMenuItems.svelte";
    import NerfMenuItem from "./NerfMenuItem.svelte";
    import { modals } from "@wa-modals";
    import { IconDesk, IconDeskExit, IconSpeakerPhone, IconMapEditor, IconHistory } from "@wa-icons";

    function resetChatVisibility() {
        chatVisibilityStore.set(false);
    }

    function resetModalVisibility() {
        modalVisibilityStore.set(false);
        modalIframeStore.set(null);
        showModalGlobalComminucationVisibilityStore.set(false);
    }

    function toggleGlobalMessage() {
        if ($showModalGlobalComminucationVisibilityStore) {
            showModalGlobalComminucationVisibilityStore.set(false);
            return;
        }

        closeMapMenu();
        resetChatVisibility();
        resetModalVisibility();
        mapEditorModeStore.switchMode(false);
        showModalGlobalComminucationVisibilityStore.set(true);
    }

    function toggleMapEditorMode() {
        //if (isMobile) return;
        if ($mapEditorModeStore && !$mapExplorationModeStore) {
            analyticsClient.trackAdminEvent("map_editor.closed");
            mapEditorModeStore.switchMode(false);
            gameManager.getCurrentGameScene().getMapEditorModeManager()?.equipTool(undefined);
        } else {
            analyticsClient.trackAdminEvent("map_editor.opened");
            mapEditorModeStore.switchMode(true);
            gameManager.getCurrentGameScene().getMapEditorModeManager()?.equipTool(EditorToolName.EntityEditor);
        }
        isTodoListVisibleStore.set(false);
        isCalendarVisibleStore.set(false);
        closeMapMenu();
    }

    function closeMapMenu() {
        openedMenuStore.close("mapMenu");
    }

    async function goToPersonalDesk() {
        // Close the menu
        openedMenuStore.close("profileMenu");

        // Walk to the personal desk using the GameScene method
        try {
            await gameManager.getCurrentGameScene()?.walkToPersonalDesk();
        } catch (error) {
            console.error("Error while walking to personal desk", error);
            warningMessageStore.addWarningMessage($LL.actionbar.personalDesk.errorMoving(), { closable: true });
        }
    }

    const unclaimState = { inProgress: false };

    function unclaimPersonalDesk(): void {
        if (unclaimState.inProgress || modals.stack.some((modal) => modal.id === "unclaim-personal-desk")) return;
        const desk = $personalAreaDataStore;
        if (!desk) {
            warningMessageStore.addWarningMessage($LL.actionbar.personalDesk.errorNotFound(), { closable: true });
            return;
        }
        const gameScene = gameManager.getCurrentGameScene();
        const userUUID = localUserStore.getLocalUser()?.uuid;
        const deskId = desk.id;
        if (
            !userUUID ||
            desk.properties.find((property) => property.type === "personalAreaPropertyData")?.ownerId !== userUUID
        ) {
            warningMessageStore.addWarningMessage($LL.actionbar.personalDesk.errorUnclaiming(), { closable: true });
            return;
        }

        modals.open(
            UnclaimPersonalDeskModal,
            {
                deskName: desk.name,
                onConfirm: async (): Promise<void> => {
                    if (unclaimState.inProgress) return;
                    unclaimState.inProgress = true;
                    try {
                        const currentDesk = gameScene
                            .getGameMapFrontWrapper()
                            .areasManager?.getAreasByPropertyType("personalAreaPropertyData")
                            .find((area) => area.areaData.id === deskId)?.areaData;
                        const property = currentDesk?.properties.find(
                            (property) => property.type === "personalAreaPropertyData",
                        );
                        if (
                            gameManager.getCurrentGameScene() !== gameScene ||
                            !userUUID ||
                            localUserStore.getLocalUser()?.uuid !== userUUID ||
                            $personalAreaDataStore?.id !== deskId ||
                            !currentDesk ||
                            property?.ownerId !== userUUID
                        ) {
                            warningMessageStore.addWarningMessage($LL.actionbar.personalDesk.errorUnclaiming(), {
                                closable: true,
                            });
                            return;
                        }
                        const mapEditorModeManager = gameScene.getMapEditorModeManager();
                        if (!mapEditorModeManager) {
                            warningMessageStore.addWarningMessage($LL.actionbar.personalDesk.errorUnclaiming(), {
                                closable: true,
                            });
                            return;
                        }
                        await mapEditorModeManager.unclaimPersonalArea(currentDesk);
                        analyticsClient.trackAdminEvent("personal_desk.unclaimed");
                        openedMenuStore.close("profileMenu");
                    } catch (error) {
                        console.error("Error while unclaiming personal desk", error);
                        warningMessageStore.addWarningMessage($LL.actionbar.personalDesk.errorUnclaiming(), {
                            closable: true,
                        });
                    } finally {
                        Object.assign(unclaimState, { inProgress: false });
                    }
                },
            },
            { id: "unclaim-personal-desk" },
        );
    }
</script>

<ActionBarButton
    dataTestId="release-notes-button"
    label={$LL.refreshPrompt.whatsNew()}
    onclick={() => {
        openedMenuStore.closeAll();
        modals.open(ReleaseNotesModal);
    }}
>
    <IconHistory font-size="20" />
</ActionBarButton>

<NerfMenuItem />

{#if $mapEditorMenuVisibleStore}
    <ActionBarButton
        onclick={toggleMapEditorMode}
        label={$LL.actionbar.mapEditor()}
        state={$mapEditorModeStore && !$mapExplorationModeStore ? "active" : "normal"}
    >
        <IconMapEditor font-size="20" />
    </ActionBarButton>
{/if}
{#if $globalMessageVisibleStore}
    <ActionBarButton onclick={toggleGlobalMessage} label={$LL.actionbar.globalMessage()}>
        <IconSpeakerPhone font-size="20" />
    </ActionBarButton>
{/if}
{#if $personalAreaDataStore}
    <ActionBarButton
        dataTestId="go-to-personal-desk-button"
        label={$LL.actionbar.personalDesk.label()}
        onclick={goToPersonalDesk}
        state={$isInsidePersonalAreaStore ? "disabled" : "normal"}
        classList="group/btn-personal-desk"
    >
        <IconDesk font-size="20" />
    </ActionBarButton>
    <ActionBarButton
        dataTestId="unclaim-personal-desk-button"
        label={$LL.actionbar.personalDesk.unclaim()}
        onclick={unclaimPersonalDesk}
        classList="group/btn-personal-desk"
    >
        <IconDeskExit font-size="20" />
    </ActionBarButton>
{/if}

<AdditionalMenuItems menu="buildMenu" />
