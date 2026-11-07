<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import type { VehicleColors } from "@wa/front/Phaser/Vehicle/Vehicle";
    import { SelectCharacterSceneName } from "@wa/front/Phaser/Login/SelectCharacterScene";
    import { areCharacterTexturesValid } from "@wa/front/Connection/LocalUserUtils";
    import { analyticsClient } from "@wa/front/Administration/AnalyticsClient";
    import { gameManager } from "@wa/front/Phaser/Game/GameManager";
    import { connectionManager } from "@wa/front/Connection/ConnectionManager";
    import { selectCharacterSceneVisibleStore } from "@wa/front/Stores/SelectCharacterStore";
    import { localUserStore } from "@wa/front/Connection/LocalUserStore";
    import type { Vehicle } from "@wa/front/Phaser/Vehicle/Vehicle";
    import type { Swimwear } from "@wa/front/Phaser/Entity/Swimwear";
    import WokaSelectScene from "./WokaSelectScene.svelte";
    import WokaCustomizeScene from "./WokaCustomizeScene.svelte";

    let buildOwnWoka = $state(false);
    let error: string | null = $state(null);

    async function saveAndContinue(
        texturesId: string[],
        swimwear?: Swimwear,
        swimwearColor?: string,
        vehicle?: Vehicle,
        vehicleColors?: VehicleColors,
    ): Promise<void> {
        error = null; // Reset error message
        try {
            if (!areCharacterTexturesValid(texturesId)) {
                error = "Invalid character textures";
                return;
            }

            analyticsClient.trackAdminEvent("onboarding.woka_validated", { scene: "SelectWoka" });
            gameManager.setCharacterTextureIds(texturesId);
            await connectionManager.saveTextures(texturesId);
            if (swimwear !== undefined) {
                localUserStore.setSwimwear(swimwear);
                localUserStore.setSwimwearColor(swimwearColor);
            }
            if (vehicle !== undefined) {
                localUserStore.setVehicle(vehicle);
                localUserStore.setVehicleColors(vehicleColors);
            }
            selectCharacterSceneVisibleStore.set(false);
            gameManager.tryToStopScene(SelectCharacterSceneName);
            gameManager.goToNextScene(SelectCharacterSceneName);
        } catch (err) {
            console.error("Error saving textures:", err);
            error = "Failed to save character customization";
        }
    }

    // Function to handle keyboard navigation
    function useKeyboardNavigation(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            buildOwnWoka = false; // Go back to the selection scene
        }
    }

    let mounted = $state(false);

    onMount(() => {
        mounted = true;
        // Get the current textures
        const currentTextures = gameManager.getCharacterTextureIds();
        if (currentTextures && currentTextures.length > 1) {
            buildOwnWoka = true; // If there are textures, we assume the user wants to customize their Woka
        }
        // Add keyboard navigation listener
        window.addEventListener("keydown", useKeyboardNavigation);
    });

    onDestroy(() => {
        mounted = false;
        // Clean up the scene visibility store when the component is destroyed
        selectCharacterSceneVisibleStore.set(false);
        // Remove keyboard navigation listener
        window.removeEventListener("keydown", useKeyboardNavigation);
    });
</script>

{#if mounted}
    {#if buildOwnWoka}
        <WokaCustomizeScene back={() => (buildOwnWoka = false)} {saveAndContinue} />
    {:else}
        <WokaSelectScene customize={() => (buildOwnWoka = true)} {saveAndContinue} />
    {/if}
{/if}

{#if error}
    <p class="text-center text-danger-800 p-0 m-0">{error}</p>
{/if}
