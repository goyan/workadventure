<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { executeUpdateWAMSettings } from "../../Phaser/Game/MapEditor/Commands/Facades";
    import InputSwitch from "../Input/InputSwitch.svelte";

    // Absent from a map that never set it: off.
    let energySaving = $state(
        gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam().settings?.lighting?.energySaving === true,
    );

    function save(): void {
        executeUpdateWAMSettings({
            $case: "updateLightingSettingMessage",
            updateLightingSettingMessage: { energySaving },
        }).catch((error: unknown) => console.error("The energy saving of the map could not be saved", error));
    }
</script>

<div class="px-5 pb-4" data-testid="map-energy-saving">
    <InputSwitch
        id="map-energy-saving"
        bind:value={energySaving}
        label={$LL.menu.settings.mapLighting.energySaving()}
        labelPosition="right"
        onchange={save}
    />
    <p class="m-0 mt-1 text-sm text-white/60">{$LL.menu.settings.mapLighting.energySavingHint()}</p>
</div>
