<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { readTerrainMapSettings } from "../../Phaser/Game/Terrain/TerrainMapSettings";
    import LifeDashboard from "./LifeDashboard.svelte";
    import LifeSettings from "./LifeSettings.svelte";

    // What the map says now of its life; each change is written back to the map, for every editor.
    const saved = readTerrainMapSettings();
</script>

<div class="flex flex-col gap-3 p-3" data-testid="life-editor">
    <span class="retro-title">{$LL.mapEditor.life.title()}</span>
    <LifeDashboard />
    <LifeSettings initial={saved.life} />
</div>
