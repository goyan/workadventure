<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { LL } from "@wa/i18n/i18n-svelte";
    import { gameManager } from "@wa/front/Phaser/Game/GameManager";
    import { ABSOLUTE_PUSHER_URL } from "@wa/front/Enum/ComputedConst";
    import { areCharacterTexturesValid } from "@wa/front/Connection/LocalUserUtils";
    import { analyticsClient } from "@wa/front/Administration/AnalyticsClient";
    import BodyIcon from "@wa/front/Components/Icons/BodyIcon.svelte";
    import EyesIcon from "@wa/front/Components/Icons/EyesIcon.svelte";
    import HairIcon from "@wa/front/Components/Icons/HairIcon.svelte";
    import HangerIcon from "@wa/front/Components/Icons/HangerIcon.svelte";
    import HatIcon from "@wa/front/Components/Icons/HatIcon.svelte";
    import SwordIcon from "@wa/front/Components/Icons/SwordIcon.svelte";
    import ShuffleIcon from "@wa/front/Components/Icons/ShuffleIcon.svelte";
    import Button from "@wa/front/Components/UI/Button.svelte";
    import { Vehicle, type VehicleColors } from "@wa/front/Phaser/Vehicle/Vehicle";
    import { Swimwear } from "@wa/front/Phaser/Entity/Swimwear";
    import { localUserStore } from "@wa/front/Connection/LocalUserStore";
    import WokaPreview from "./WokaPreview.svelte";
    import type { WokaBodyPart, WokaData, WokaTexture } from "./WokaTypes";
    import { getItemsPerRow } from "./ItemsPerRow";
    import WokaImage from "./WokaImage.svelte";

    interface Props {
        back: () => void;
        saveAndContinue: (
            texturesId: string[],
            swimwear: Swimwear,
            swimwearColor?: string,
            vehicle?: Vehicle,
            vehicleColors?: VehicleColors,
        ) => void;
    }

    let { back, saveAndContinue }: Props = $props();

    let wokaData: WokaData | null = $state(null);
    let selectedBodyPart: WokaBodyPart = $state("body");
    let selectedTextures: Record<WokaBodyPart, string> = $state({
        body: "",
        eyes: "",
        hair: "",
        clothes: "",
        hat: "",
        accessory: "",
    });
    let isLoading = $state(true);
    let error = $state("");
    let assetsDirection: number = $state(0);
    let showBath = $state(false);
    let showVehicle = $state(false);
    let selectedVehicle = $state(localUserStore.getVehicle());
    let selectedVehicleColors = $state(localUserStore.getVehicleColors());
    let selectedSwimwear = $state(localUserStore.getSwimwear() ?? Swimwear.Auto);
    let selectedSwimwearColor = $state(localUserStore.getSwimwearColor());
    const swimwearStyles = Object.values(Swimwear);

    const bodyPartOrder: WokaBodyPart[] = ["body", "eyes", "hair", "clothes", "hat", "accessory"];

    async function loadWokaData() {
        try {
            isLoading = true;
            wokaData = await gameManager.loadWokaData();

            loadSavedTextures();
        } catch (err) {
            console.error("Error loading Woka data:", err);
            error = "Failed to load Woka customization data";
        } finally {
            isLoading = false;
        }
    }

    function loadSavedTextures() {
        try {
            const savedTextureIds = gameManager.getCharacterTextureIds();
            // Check that textures exist in the Woka data
            if (!wokaData) {
                throw new Error("Woka data is not loaded");
            }

            // Check if current textures is in the collections list
            const hasCustomizeTexture = [
                ...wokaData.body.collections,
                ...wokaData.eyes.collections,
                ...wokaData.hair.collections,
                ...wokaData.clothes.collections,
                ...wokaData.hat.collections,
                ...wokaData.accessory.collections,
            ].find((collection) =>
                collection.textures.find((texture) => savedTextureIds != null && savedTextureIds.includes(texture.id)),
            );

            // Initialize textures of customize Woka scene
            if (hasCustomizeTexture && savedTextureIds && savedTextureIds.length > 0) {
                bodyPartOrder.forEach((bodyPart, index) => {
                    if (savedTextureIds[index]) {
                        selectedTextures[bodyPart] = savedTextureIds[index];
                    }
                });
            } else {
                bodyPartOrder.forEach((bodyPart) => {
                    if (wokaData?.[bodyPart]?.collections?.[0]?.textures?.[0]) {
                        selectedTextures[bodyPart] = wokaData[bodyPart].collections[0].textures[0].id;
                    }
                });
            }
            // Trigger reactivity
            selectedTextures = { ...selectedTextures };
        } catch (err) {
            console.warn("Cannot load previous WOKA textures:", err);
        }
    }

    function selectTexture(bodyPart: WokaBodyPart, textureId: string) {
        selectedTextures[bodyPart] = textureId;
        selectedTextures = { ...selectedTextures };
    }

    function randomizeOutfit() {
        bodyPartOrder.forEach((bodyPart) => {
            if (wokaData?.[bodyPart]?.collections?.[0]?.textures) {
                const textures = wokaData[bodyPart].collections[0].textures;
                const randomIndex = Math.floor(Math.random() * textures.length);
                selectedTextures[bodyPart] = textures[randomIndex].id;
            }
        });
        selectedTextures = { ...selectedTextures }; // Trigger reactivity
    }

    function handlerSaveAndContinue() {
        try {
            const textureIds = bodyPartOrder.map((bodyPart) => selectedTextures[bodyPart]).filter(Boolean);
            if (!areCharacterTexturesValid(textureIds)) {
                error = "Invalid character textures";
                return;
            }

            analyticsClient.trackAdminEvent("onboarding.custom_woka_selected");
            saveAndContinue(
                textureIds,
                selectedSwimwear,
                selectedSwimwearColor,
                selectedVehicle,
                selectedVehicleColors,
            );
        } catch (err) {
            console.error("Error saving textures:", err);
            error = "Failed to save character customization";
        }
    }

    function getAvailableTextures(collectionIndex: number, bodyPart: WokaBodyPart): WokaTexture[] {
        const textures = wokaData?.[bodyPart]?.collections?.[collectionIndex]?.textures || [];
        // If no body texture is selected, return the first texture by default
        /*if (bodyPart === "body" && !textures.map((texture) => texture.id).includes(selectedTextures[bodyPart])) {
            selectTexture("body", textures[0].id);
        }*/

        return textures;
    }

    function getTextureUrl(relativeUrl: string): string {
        if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
            return relativeUrl;
        }

        return `${ABSOLUTE_PUSHER_URL}${relativeUrl}`;
    }

    function getBodyPartIcon(bodyPart: WokaBodyPart) {
        switch (bodyPart) {
            case "body":
                return BodyIcon;
            case "eyes":
                return EyesIcon;
            case "hair":
                return HairIcon;
            case "clothes":
                return HangerIcon;
            case "hat":
                return HatIcon;
            case "accessory":
                return SwordIcon;
            default:
                return null;
        }
    }

    let timeOutToScroll: ReturnType<typeof setTimeout> | null = null;
    function selectBodyPart(bodyPart: WokaBodyPart) {
        showBath = false;
        showVehicle = false;
        selectedBodyPart = bodyPart;

        // Clear previous timeout if it exists
        if (timeOutToScroll) clearTimeout(timeOutToScroll);
        timeOutToScroll = setTimeout(() => {
            timeOutToScroll = null; // Reset timeout variable
            // Check if texture to the body part selected is empty
            if (selectedTextures[selectedBodyPart] === "") return;
            // Get element by body part and texture id
            let element = document.getElementById(`texture-${selectedBodyPart}-${selectedTextures[selectedBodyPart]}`);
            // If element is not found, do nothing
            if (!element) {
                // Get the first texture of the body part element
                element = document.querySelector(
                    `#texture-${selectedBodyPart}-${wokaData?.[selectedBodyPart]?.collections?.[0]?.textures?.[0]?.id}`,
                );
                if (!element) return; // If still not found, exit
            }
            // Scroll to the element
            element.scrollIntoView({ behavior: "smooth", block: "end", inline: "end" });
        }, 100); // Delay to ensure the DOM is updated
    }

    let enterPressed = false;

    // Function to handle keyboard navigation
    function useKeyBoardNavigation(event: KeyboardEvent) {
        if (!wokaData) return;
        if (showVehicle && event.key.startsWith("Arrow")) {
            event.preventDefault();
            const vehicles = Object.values(Vehicle);
            const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
            selectedVehicle = vehicles[(vehicles.indexOf(selectedVehicle) + step + vehicles.length) % vehicles.length];
            return;
        }
        if (showBath && event.key.startsWith("Arrow")) {
            event.preventDefault();
            const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
            selectedSwimwear =
                swimwearStyles[
                    (swimwearStyles.indexOf(selectedSwimwear) + step + swimwearStyles.length) % swimwearStyles.length
                ];
            return;
        }
        if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight" ||
            event.key === "ArrowUp" ||
            event.key === "ArrowDown"
        ) {
            event.preventDefault();
            const textures = [];
            if (wokaData[selectedBodyPart]) {
                textures.push(...wokaData[selectedBodyPart].collections.flatMap((collection) => collection.textures));
            }
            const currentIndex = textures.findIndex((texture) => texture.id === selectedTextures[selectedBodyPart]);
            let newIndex = currentIndex;
            if (event.key === "ArrowLeft") {
                newIndex = Math.max(currentIndex - 1, 0);
            } else if (event.key === "ArrowRight") {
                newIndex = Math.min(currentIndex + 1, textures.length - 1);
            } else if (event.key === "ArrowUp") {
                const itemsPerRow = getItemsPerRow(document.getElementById(`woka-line-0`));
                newIndex = Math.max(currentIndex - itemsPerRow, 0);
            } else if (event.key === "ArrowDown") {
                const itemsPerRow = getItemsPerRow(document.getElementById(`woka-line-0`));
                newIndex = Math.min(currentIndex + itemsPerRow, textures.length - 1);
            }
            if (newIndex !== currentIndex) {
                selectTexture(selectedBodyPart, textures[newIndex].id);
                // Scroll to the newly selected texture
                const element = document.getElementById(`texture-${selectedBodyPart}-${textures[newIndex].id}`);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
                }
            }
        } else if (event.key === "Enter") {
            enterPressed = true;
        }
    }

    function useKeyBoardNavigationUp(event: KeyboardEvent) {
        if (!wokaData) return;
        if (event.key === "Enter" && enterPressed) {
            enterPressed = false;
            if (showVehicle || showBath || selectedBodyPart === "accessory") {
                // If it's the last body part, save and continue
                handlerSaveAndContinue();
            } else {
                selectNextBodyPart();
            }
        }
    }

    function selectNextBodyPart() {
        const currentIndex = bodyPartOrder.indexOf(selectedBodyPart);
        const nextIndex = (currentIndex + 1) % bodyPartOrder.length;
        selectedBodyPart = bodyPartOrder[nextIndex];
    }

    onMount(async () => {
        await loadWokaData();
        selectedBodyPart = bodyPartOrder[0];
        // Document event listener for keyboard navigation
        document.addEventListener("keydown", useKeyBoardNavigation);
        document.addEventListener("keyup", useKeyBoardNavigationUp);
    });

    onDestroy(() => {
        // Remove keyboard navigation listener
        document.removeEventListener("keydown", useKeyBoardNavigation);
        document.removeEventListener("keyup", useKeyBoardNavigationUp);
    });
</script>

<div class="mobile-webkit bg-contrast w-screen md:!mt-[15vh] h-full md:!h-[70vh] flex items-center justify-center">
    <div
        class="mobile-webkit rounded-lg flex flex-col max-w-4xl w-full h-full m-4 relative bg-white/10 backdrop-blur-md"
    >
        {#if isLoading}
            <div class="flex items-center justify-center h-64">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        {:else if error}
            <div class="text-center text-red-600 mb-4">
                <p>{error}</p>
                <button
                    type="button"
                    class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    onclick={loadWokaData}
                >
                    Retry
                </button>
            </div>
        {:else}
            <div class="flex-1 flex flex-col sm:flex-row items-start gap-6 min-h-0 p-6">
                <div class="flex flex-row gap-4 w-full sm:w-fit">
                    <div class="flex flex-col gap-2">
                        <WokaPreview
                            {selectedTextures}
                            {wokaData}
                            {getTextureUrl}
                            swimwear={showBath ? selectedSwimwear : undefined}
                            swimwearColor={selectedSwimwearColor}
                            vehicle={showVehicle ? selectedVehicle : undefined}
                            vehicleColors={selectedVehicleColors}
                            onrotate={(direction) => {
                                assetsDirection = direction;
                            }}
                        />

                        <div class="mt-4 space-y-2">
                            <Button
                                size="sm"
                                variant="light"
                                appearance="border"
                                class="w-full px-4 py-2 bg-white/10 text-white rounded hover:bg-white/10 flex flex-row items-center gap-2"
                                onclick={randomizeOutfit}
                            >
                                {#snippet icon()}
                                    <ShuffleIcon fillColor="white" width="w-4" height="h-4" />
                                {/snippet}
                                <span>{$LL.woka.customWoka.randomize()}</span>
                            </Button>
                        </div>
                    </div>
                </div>

                <div class="flex flex-col flex-1 h-full min-h-0 min-w-0 w-full sm:w-auto">
                    <div class="woka-tabs">
                        {#each bodyPartOrder as bodyPart (bodyPart)}
                            {@const BodyPartIcon = getBodyPartIcon(bodyPart)}
                            <button
                                type="button"
                                class="border-b-2 {selectedBodyPart === bodyPart && !showBath && !showVehicle
                                    ? 'text-white border-white'
                                    : 'text-white/50 border-white/10'}"
                                onclick={() => selectBodyPart(bodyPart)}
                                style="border-bottom-style: solid;"
                            >
                                <BodyPartIcon
                                    height="h-4"
                                    width="w-4"
                                    strokeColor={selectedBodyPart === bodyPart && !showBath && !showVehicle
                                        ? "stroke-white "
                                        : "stroke-white/50"}
                                    fillColor={selectedBodyPart === bodyPart && !showBath && !showVehicle
                                        ? "fill-white "
                                        : "fill-white/50"}
                                />
                                {$LL.woka.customWoka.parts[bodyPart]()}
                            </button>
                        {/each}
                        <button
                            type="button"
                            class="border-b-2 {showBath ? 'text-white border-white' : 'text-white/50 border-white/10'}"
                            style="border-bottom-style: solid;"
                            onclick={() => {
                                showBath = true;
                                showVehicle = false;
                            }}
                            data-testid="woka-bath-tab"
                        >
                            <span aria-hidden="true">🩱</span>
                            {$LL.woka.customWoka.bath()}
                        </button>
                        <button
                            type="button"
                            class="border-b-2 {showVehicle
                                ? 'text-white border-white'
                                : 'text-white/50 border-white/10'}"
                            style="border-bottom-style: solid;"
                            onclick={() => {
                                showVehicle = true;
                                showBath = false;
                            }}
                            data-testid="woka-vehicle-tab"
                        >
                            <span aria-hidden="true">🛹</span>
                            {$LL.woka.vehicle.title()}
                        </button>
                    </div>

                    <div class="rounded-lg flex flex-col flex-1 min-h-0 min-w-0">
                        {#if showVehicle}
                            <h3 class="text-lg font-semibold">{$LL.woka.vehicle.title()}</h3>
                            <p class="text-sm text-white/70">{$LL.woka.vehicle.hint()}</p>
                            <div class="grid grid-cols-2 gap-3 py-4" role="group" aria-label={$LL.woka.vehicle.title()}>
                                {#each Object.values(Vehicle) as vehicle (vehicle)}
                                    <button
                                        type="button"
                                        class="relative rounded-lg border-2 border-solid p-3 flex flex-col items-center gap-2 min-w-0 {selectedVehicle ===
                                        vehicle
                                            ? 'bg-white/20 border-white'
                                            : 'bg-white/5 hover:bg-white/10 border-white/20'}"
                                        aria-pressed={selectedVehicle === vehicle}
                                        onclick={() => (selectedVehicle = vehicle)}
                                        data-testid={`woka-vehicle-${vehicle}`}
                                    >
                                        {#if selectedVehicle === vehicle}
                                            <span class="absolute top-2 right-2 text-sm" aria-hidden="true">✓</span>
                                        {/if}
                                        <div class="flex h-24 w-24 items-center justify-center">
                                            <WokaImage
                                                {selectedTextures}
                                                {wokaData}
                                                {getTextureUrl}
                                                canvasSize={90}
                                                {vehicle}
                                                vehicleColors={selectedVehicleColors}
                                                direction={assetsDirection}
                                            />
                                        </div>
                                        <span class="text-xs">{$LL.woka.vehicle[vehicle]()}</span>
                                    </button>
                                {/each}
                            </div>
                            {#if selectedVehicle !== Vehicle.None}
                                <div class="vehicle-colors">
                                    <label>
                                        <span>{$LL.woka.vehicle.centerColor()}</span>
                                        <input
                                            type="color"
                                            bind:value={selectedVehicleColors.color}
                                            data-testid="woka-vehicle-color"
                                        />
                                    </label>
                                    <label>
                                        <span>{$LL.woka.vehicle.edgeColor()}</span>
                                        <input
                                            type="color"
                                            bind:value={selectedVehicleColors.edgeColor}
                                            data-testid="woka-vehicle-edge-color"
                                        />
                                    </label>
                                    <label>
                                        <span>{$LL.woka.vehicle.wheelsColor()}</span>
                                        <input
                                            type="color"
                                            bind:value={selectedVehicleColors.wheelsColor}
                                            data-testid="woka-vehicle-wheels-color"
                                        />
                                    </label>
                                </div>
                            {/if}
                        {:else if showBath}
                            <h3 class="text-lg font-semibold">{$LL.woka.menu.swimwear()}</h3>
                            <p class="text-sm text-white/70">{$LL.woka.customWoka.bathHint()}</p>
                            <div class="flex items-center flex-wrap gap-3 py-2">
                                <label class="flex items-center gap-2 text-sm">
                                    {$LL.woka.customWoka.color()}
                                    <input
                                        type="color"
                                        value={selectedSwimwearColor ??
                                            (selectedSwimwear === Swimwear.TwoPiece ? "#df6691" : "#4792cc")}
                                        onchange={(event) => (selectedSwimwearColor = event.currentTarget.value)}
                                        class="h-9 w-12 cursor-pointer rounded border border-white/30 bg-transparent"
                                        data-testid="woka-swimwear-color"
                                    />
                                </label>
                                <button
                                    type="button"
                                    class="text-sm underline"
                                    onclick={() => (selectedSwimwearColor = undefined)}
                                >
                                    {$LL.woka.customWoka.defaultColor()}
                                </button>
                            </div>
                            <div
                                class="flex flex-wrap gap-3 overflow-y-auto py-4"
                                role="group"
                                aria-label={$LL.woka.menu.swimwear()}
                            >
                                {#each swimwearStyles as style (style)}
                                    <button
                                        type="button"
                                        class="rounded border border-solid p-2 flex flex-col items-center gap-2 {selectedSwimwear ===
                                        style
                                            ? 'bg-white/30 border-white'
                                            : 'bg-white/10 hover:bg-white/20 border-transparent'}"
                                        aria-pressed={selectedSwimwear === style}
                                        onclick={() => (selectedSwimwear = style)}
                                        data-testid={`woka-swimwear-${style}`}
                                    >
                                        <WokaImage
                                            {selectedTextures}
                                            {wokaData}
                                            {getTextureUrl}
                                            direction={assetsDirection}
                                            swimwear={style}
                                            swimwearColor={selectedSwimwearColor}
                                            vehicle={showVehicle ? selectedVehicle : undefined}
                                            vehicleColors={selectedVehicleColors}
                                        />
                                        <span class="text-sm">{$LL.woka.swimwear[style]()}</span>
                                    </button>
                                {/each}
                            </div>
                        {:else}
                            <h3 class="text-lg font-semibold capitalize">
                                {$LL.woka.customWoka.parts[selectedBodyPart]()}
                            </h3>
                            <div
                                class="flex-none lg:flex-1 flex flex-col items-start gap-0 min-h-0 min-w-0 max-h-full overflow-y-scroll overflow-x-auto scroll-mask py-[20px]"
                            >
                                {#each wokaData?.[selectedBodyPart]?.collections || [] as collection, collectionIndex (collection.name)}
                                    <p class="text-sm text-gray-500 mb-1 mt-4 p-0">{collection.name}</p>
                                    <div
                                        class="w-full flex flex-row flex-wrap items-start justify-start gap-3"
                                        id={`woka-line-${collectionIndex}`}
                                    >
                                        {#each getAvailableTextures(collectionIndex, selectedBodyPart) as texture (texture.id)}
                                            <button
                                                type="button"
                                                class="rounded border border-solid box-border p-0 h-fit {selectedTextures[
                                                    selectedBodyPart
                                                ] === texture.id
                                                    ? 'bg-white/50 border-white'
                                                    : 'bg-white/10 hover:bg-white/20 border-transparent'}"
                                                onclick={() => selectTexture(selectedBodyPart, texture.id)}
                                                id={`texture-${selectedBodyPart}-${texture.id}`}
                                            >
                                                <WokaImage
                                                    selectedTextures={{ [selectedBodyPart]: texture.id }}
                                                    {wokaData}
                                                    {getTextureUrl}
                                                    classList="p-2"
                                                    direction={assetsDirection}
                                                />
                                            </button>
                                        {/each}
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
            <div
                class="w-full p-3 flex flex-row items-center gap-2 border-t-2 border-t-white/10"
                style="border-top-style: solid;"
            >
                <button
                    type="button"
                    class="w-full px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded"
                    onclick={back}
                >
                    {$LL.woka.customWoka.navigation.backToDefaultWoka()}
                </button>
                <button
                    type="button"
                    class="selectCharacterSceneFormSubmit w-full px-4 py-3 bg-secondary text-white rounded hover:bg-secondary-600"
                    onclick={handlerSaveAndContinue}
                >
                    {$LL.woka.customWoka.navigation.finish()}
                </button>
            </div>
        {/if}
    </div>
</div>

<style>
    .vehicle-colors {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.75rem;
        padding: 0.75rem;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 0.5rem;
        background: rgba(255, 255, 255, 0.05);
    }
    .vehicle-colors label {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        font-size: 0.7rem;
    }
    .vehicle-colors input {
        width: 100%;
        height: 2.5rem;
        padding: 0.2rem;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 0.4rem;
        background: transparent;
    }

    .woka-tabs {
        display: flex;
        flex-wrap: nowrap;
        flex-shrink: 0;
        margin-bottom: 1rem;
        overflow-x: auto;
    }
    .woka-tabs button {
        flex: 1 0 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        padding: 0.5rem 0.4rem;
        white-space: nowrap;
        font-size: 0.65rem;
    }
    .mobile-webkit {
        max-height: -webkit-fill-available !important;
    }
    .scroll-mask {
        mask-image: linear-gradient(to bottom, transparent 0px, black 40px, black calc(100% - 40px), transparent 100%);
        -webkit-mask-image: linear-gradient(
            to bottom,
            transparent 0px,
            black 40px,
            black calc(100% - 40px),
            transparent 100%
        );
    }
</style>
