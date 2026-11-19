<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { readTerrainMapSettings } from "../../Phaser/Game/Terrain/TerrainMapSettings";
    import LifeDashboard from "./LifeDashboard.svelte";
    import LifeSpeciesDashboard from "./LifeSpeciesDashboard.svelte";
    import LifeSettings from "./LifeSettings.svelte";

    // What the map says now of its life; each change is written back to the map, for every editor.
    const saved = readTerrainMapSettings();
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" data-testid="life-editor">
    <span class="retro-title">{$LL.mapEditor.life.title()}</span>
    <LifeDashboard />
    <LifeSpeciesDashboard />
    <LifeSettings initial={saved.life} />
</div>
