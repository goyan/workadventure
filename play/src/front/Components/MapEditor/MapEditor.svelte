<script lang="ts">
    import { fly } from "svelte/transition";
    import { onMount } from "svelte";
    import LL from "../../../i18n/i18n-svelte";
    import { entityPlacementBlockerStore } from "../../Stores/MapEditorStore";
    import { EditorToolName } from "../../Phaser/Game/MapEditor/MapEditorModeManager";
    import { mapEditorSelectedToolStore, mapEditorVisibilityStore } from "../../Stores/MapEditorStore";
    import Explorer from "../Exploration/Explorer.svelte";

    import { windowSize } from "../../Stores/CoWebsiteStore";

    import { blocker } from "../../Utils/screenBlocker";
    import PixelSkyline from "../UI/PixelSkyline.svelte";
    import RetroPaletteSwitcher from "./RetroPaletteSwitcher.svelte";
    import AreaEditor from "./AreaEditor/AreaEditor.svelte";
    import EntityEditor from "./EntityEditor/EntityEditor.svelte";
    import MapEditorSideBar from "./MapEditorSideBar.svelte";
    import MapLayerEditor from "./MapLayerEditor.svelte";
    import SelectionEditor from "./SelectionEditor.svelte";
    import ConfigureMyRoom from "./WAMSettingsEditor.svelte";
    import MapEditorResizeHandle from "./MapEditorResizeHandle.svelte";
    import { mapEditorSideBarWidthStore } from "./MapEditorSideBarWidthStore";

    let mapEditor: HTMLElement;

    let mapEditorSideBarWidth = $derived(
        $mapEditorVisibilityStore && $mapEditorSelectedToolStore !== EditorToolName.WAMSettingsEditor
            ? $mapEditorSideBarWidthStore
            : 0,
    );

    function onResize(width: number) {
        mapEditorSideBarWidthStore.set(width);
    }

    $effect(() => {
        mapEditor.style.width = `${mapEditorSideBarWidth}px`;
    });

    onMount(() => {
        const width = Math.min($windowSize.width / 2, Math.max(200, $mapEditorSideBarWidthStore));
        mapEditor.style.width = `${width}px`;
    });
</script>

{#if $mapEditorSelectedToolStore === EditorToolName.WAMSettingsEditor}
    <ConfigureMyRoom />
{/if}
<div
    id="map-editor-container"
    class="z-[500] flex flex-row items-start justify-end gap-4 absolute h-full max-w-full md:max-w-[calc(100%-18px)] top-0 end-0 pointer-events-none"
>
    <div
        in:fly={{ x: 100, duration: 250, delay: 300 }}
        out:fly={{ x: 100, duration: 200, delay: 100 }}
        class="hidden md:block"
        class:!block={$mapEditorVisibilityStore == false}
    >
        <MapEditorSideBar />
    </div>
    <div
        id="map-editor-right"
        bind:this={mapEditor}
        {@attach blocker}
        class={`map-editor relative h-dvh max-w-full md:max-w-[calc(100%-64px)] pointer-events-auto ${$mapEditorSelectedToolStore}`}
    >
        {#if $mapEditorVisibilityStore && $mapEditorSelectedToolStore !== EditorToolName.WAMSettingsEditor}
            <div class="absolute h-dvh -start-0.5 top-0 flex flex-col z-[2000]">
                <MapEditorResizeHandle
                    minWidth={200}
                    maxWidth={$windowSize.width / 1.5}
                    currentWidth={$mapEditorSideBarWidthStore}
                    onResize={(width) => onResize(width)}
                />
            </div>
            <div
                class="sidebar retro-theme relative h-dvh p-2 md:p-4"
                in:fly={{ x: 100, duration: 200, delay: 200 }}
                out:fly={{ x: 100, duration: 200 }}
            >
                <RetroPaletteSwitcher />
                {#if $mapEditorSelectedToolStore === EditorToolName.EntityEditor}
                    <EntityEditor />
                {/if}
                {#if $mapEditorSelectedToolStore === EditorToolName.AreaEditor}
                    <AreaEditor />
                {/if}
                {#if $mapEditorSelectedToolStore === EditorToolName.ExploreTheRoom}
                    <Explorer />
                {/if}
                {#if $mapEditorSelectedToolStore === EditorToolName.MapLayerEditor}
                    <MapLayerEditor />
                {/if}
                {#if $mapEditorSelectedToolStore === EditorToolName.SelectionEditor}
                    <SelectionEditor />
                {/if}
                {#if $entityPlacementBlockerStore && $mapEditorSelectedToolStore === EditorToolName.EntityEditor}
                    <!-- Why the object is red: shown while it is being placed or moved. -->
                    <div class="retro-card shrink-0" role="status" data-testid="placementBlocker">
                        <span class="retro-title retro-title-red">{$LL.mapEditor.placement.title()}</span>
                        <p class="retro-hint">{$LL.mapEditor.placement[$entityPlacementBlockerStore]()}</p>
                    </div>
                {/if}
                <div class="mt-auto -mx-2 -mb-2 md:-mx-4 md:-mb-4 opacity-80 shrink-0">
                    <PixelSkyline />
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .map-editor {
        top: 0;
        inset-inline-end: 0;
        width: fit-content;
        z-index: 1999;
        pointer-events: auto;
        color: whitesmoke;

        &.WAMSettingsEditor {
            width: 80% !important;
            inset-inline-start: 10%;
            height: 0 !important;
        }

        .sidebar {
            position: relative !important;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
    }
</style>
