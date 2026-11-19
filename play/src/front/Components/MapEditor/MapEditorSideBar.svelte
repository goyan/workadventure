<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    // import { createPopperActions } from "svelte-popperjs";
    import type { LocalizedString } from "typesafe-i18n";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { EditorToolName } from "../../Phaser/Game/MapEditor/MapEditorModeManager";
    import { editorToolShortcutDigit } from "../../Phaser/Game/MapEditor/EditorToolShortcuts";
    import { mapEditorSelectedToolStore, mapEditorVisibilityStore } from "../../Stores/MapEditorStore";
    import { analyticsClient } from "../../Administration/AnalyticsClient";
    import { mapEditorActivated, mapEditorActivatedForThematics } from "../../Stores/MenuStore";
    import { isMediaBreakpointUp } from "../../Utils/BreakpointsUtils";
    import ArrowBarRight from "../Icons/ArrowBarRight.svelte";
    import type { WorkAdventureComponent } from "../../../types/component";
    import { nightInEditorStore } from "../../Stores/NightStore";
    import {
        IconX,
        IconMapSearch,
        IconSunMoon,
        IconSettings,
        IconShovel,
        IconHammer,
        IconSofa,
        IconMarquee,
        IconSquareDashed,
        IconPaw,
    } from "@wa-icons";

    type SideBarTool = {
        toolName: EditorToolName;
        iconComponent: WorkAdventureComponent;
        tooltiptext: LocalizedString;
    };

    const direction = document.documentElement.getAttribute("dir") || "ltr";

    const exploreTheRoomTool = {
        toolName: EditorToolName.ExploreTheRoom,
        iconComponent: IconMapSearch,
        tooltiptext: $LL.mapEditor.sideBar.exploreTheRoom(),
    };

    const entityEditorTool = {
        toolName: EditorToolName.EntityEditor,
        iconComponent: IconSofa,
        tooltiptext: $LL.mapEditor.sideBar.entityEditor(),
    };
    const mapLayerEditorTool = {
        toolName: EditorToolName.MapLayerEditor,
        iconComponent: IconHammer,
        tooltiptext: $LL.mapEditor.sideBar.mapLayerEditor(),
    };
    const selectionEditorTool = {
        toolName: EditorToolName.SelectionEditor,
        iconComponent: IconMarquee,
        tooltiptext: $LL.mapEditor.sideBar.selectionEditor(),
    };

    let availableTools = $derived.by<SideBarTool[]>(() => {
        const tools: SideBarTool[] = [exploreTheRoomTool];

        if ($mapEditorActivatedForThematics && !$mapEditorActivated) {
            tools.push(entityEditorTool);
        }

        if ($mapEditorActivated && !isMobile) {
            tools.push({
                toolName: EditorToolName.AreaEditor,
                iconComponent: IconSquareDashed,
                tooltiptext: $LL.mapEditor.sideBar.areaEditor(),
            });
            tools.push(mapLayerEditorTool);
            tools.push(entityEditorTool);
            tools.push(selectionEditorTool);
            tools.push({
                toolName: EditorToolName.WAMSettingsEditor,
                iconComponent: IconSettings,
                tooltiptext: $LL.mapEditor.sideBar.configureMyRoom(),
            });
            // The relief of the ground: dug with a brush, its hollows fill with the rain.
            tools.push({
                toolName: EditorToolName.TerrainEditor,
                iconComponent: IconShovel,
                tooltiptext: $LL.mapEditor.sideBar.terrainEditor(),
            });
            // The life of that water: its figures and its settings.
            tools.push({
                toolName: EditorToolName.LifeEditor,
                iconComponent: IconPaw,
                tooltiptext: $LL.mapEditor.sideBar.lifeEditor(),
            });
        }

        return tools;
    });

    function switchTool(newTool: EditorToolName) {
        // The map sidebar is opened when the user clicks on the explorer for the first time.
        // If the user clicks on the Explorer again, we need to show the map sidebar.
        if (newTool === EditorToolName.ExploreTheRoom) {
            mapEditorVisibilityStore.set(!$mapEditorVisibilityStore);
        } else {
            mapEditorVisibilityStore.set(true);
        }
        analyticsClient.trackAdminEvent("map_editor.tool.opened", { name: newTool });
        gameManager.getCurrentGameScene().getMapEditorModeManager()?.equipTool(newTool);
    }

    function toggleMapEditor() {
        mapEditorVisibilityStore.set(!$mapEditorVisibilityStore);
    }

    let sectionSideBarContainer: HTMLElement;
    let isMobile = $state(isMediaBreakpointUp("md"));
    const resizeObserver = new ResizeObserver(() => {
        isMobile = isMediaBreakpointUp("md");
    });

    onMount(() => {
        resizeObserver.observe(sectionSideBarContainer);
    });

    onDestroy(() => {
        resizeObserver.unobserve(sectionSideBarContainer);
    });
</script>

<section
    bind:this={sectionSideBarContainer}
    class="side-bar-container z-[1999] pointer-events-auto"
    class:!right-20={!$mapEditorVisibilityStore}
>
    <!--put a section to avoid lower div to be affected by some css-->
    <div class="flex flex-col items-center gap-4 pt-24 side-bar">
        <div class="flex flex-col gap-1">
            <div class="close-window p-2 retro-theme rounded-2xl">
                <button
                    class="p-3 hover:bg-white/10 rounded aspect-square w-12 m-0"
                    data-testid="closeMapEditorButton"
                    onclick={(event) => {
                        event.preventDefault();
                        switchTool(EditorToolName.CloseMapEditor);
                    }}
                >
                    <IconX font-size="20" />
                </button>
            </div>
            <div class="close-window p-2 retro-theme rounded-2xl">
                <button
                    class="p-3 hover:bg-white/10 rounded aspect-square w-12 m-0"
                    data-testid="hideMapEditorButton"
                    onclick={(event) => {
                        event.preventDefault();
                        toggleMapEditor();
                    }}
                >
                    <ArrowBarRight
                        height="h-5"
                        width="w-5"
                        strokeColor="stroke-white"
                        fillColor="fill-transparent"
                        classList={`aspect-ratio transition-all ${direction === "rtl" ? "rotate-180" : ""} ${
                            $mapEditorVisibilityStore ? "" : "rotate-180"
                        }`}
                    />
                </button>
            </div>
        </div>
        <div class="p-2 retro-theme rounded-2xl flex flex-col gap-2">
            {#each availableTools as tool (tool.toolName)}
                {@const ToolIcon = tool.iconComponent}
                {@const shortcutDigit = editorToolShortcutDigit(tool.toolName)}
                <div class="tool-button relative">
                    <button
                        class="peer build-slot"
                        id={tool.toolName}
                        class:active={$mapEditorSelectedToolStore === tool.toolName}
                        aria-label={tool.tooltiptext}
                        onclick={(event) => {
                            event.preventDefault();
                            switchTool(tool.toolName);
                        }}
                        type="button"
                    >
                        <ToolIcon font-size="22" />
                        {#if shortcutDigit !== undefined}
                            <span class="build-key" aria-hidden="true">{shortcutDigit}</span>
                        {/if}
                    </button>
                    <div
                        class=" bg-contrast/90 backdrop-blur-xl text-white tooltip absolute text-nowrap p-2 invisible opacity-0 transition-all peer-hover:visible peer-hover:opacity-100 rounded top-1/2 -translate-y-1/2 right-[130%]"
                    >
                        {tool.tooltiptext}
                        {#if shortcutDigit !== undefined}
                            <span class="opacity-70" data-testid="mapEditorToolShortcut-{tool.toolName}">
                                · {$LL.mapEditor.sideBar.shortcut({ key: String(shortcutDigit) })}
                            </span>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
        <!-- Not a tool: shows in the editor the lighting of the game (night veil, bounced light), to set the lamps as
             they will look, or the plain daylight of the editor again. -->
        <div class="p-2 retro-theme rounded-2xl">
            <div class="tool-button relative">
                <button
                    class="peer build-slot"
                    data-testid="mapEditorNightToggle"
                    aria-pressed={$nightInEditorStore}
                    aria-label={$LL.mapEditor.sideBar.nightInEditor()}
                    onclick={(event) => {
                        event.preventDefault();
                        nightInEditorStore.set(!$nightInEditorStore);
                    }}
                    type="button"
                >
                    <IconSunMoon font-size="22" />
                </button>
                <div
                    class=" bg-contrast/90 backdrop-blur-xl text-white tooltip absolute text-nowrap p-2 invisible opacity-0 transition-all peer-hover:visible peer-hover:opacity-100 rounded top-1/2 -translate-y-1/2 right-[130%]"
                >
                    {$nightInEditorStore
                        ? $LL.mapEditor.sideBar.nightInEditorOn()
                        : $LL.mapEditor.sideBar.nightInEditorOff()}
                </div>
            </div>
        </div>
    </div>
</section>
