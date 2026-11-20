<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { mapEditorActivated } from "../../Stores/MenuStore";
    import MapLightingSettings from "./MapLightingSettings.svelte";
    import SettingsSection from "./SettingsSection.svelte";
</script>

<!-- The lighting everyone sees on this map, for people who may edit the map: the map is only read for them. -->
{#if $mapEditorActivated}
    <SettingsSection title={$LL.menu.settings.mapLighting.title()} dataTestId="map-lighting-settings">
        <MapLightingSettings />
    </SettingsSection>
{/if}
