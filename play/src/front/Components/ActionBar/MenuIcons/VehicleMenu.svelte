<script lang="ts">
    import { localUserStore, vehiclePreferencesStore } from "@wa/front/Connection/LocalUserStore";
    import { gameManager } from "@wa/front/Phaser/Game/GameManager";
    import { Vehicle, VehicleMedium, vehicleMedia } from "@wa/front/Phaser/Vehicle/Vehicle";
    import { bindingKeys, shortcutsStore } from "@wa/front/Stores/ShortcutsStore";
    import LL from "@wa/i18n/i18n-svelte";
    import VehicleIcon from "../../Woka/VehicleIcon.svelte";
    import { IconX, IconRoad, IconBeach, IconPlane } from "../../Icons";

    let { onchange }: { onchange: () => void } = $props();

    let preferences = $derived($vehiclePreferencesStore ?? localUserStore.getVehiclePreferences());
    $effect(() => {
        if (preferences) onchange();
    });
    const displayMedia = Object.values(VehicleMedium).flatMap((id) =>
        vehicleMedia.filter((medium) => medium.id === id),
    );
    const mediumIcons = {
        [VehicleMedium.Land]: IconRoad,
        [VehicleMedium.Water]: IconBeach,
        [VehicleMedium.Air]: IconPlane,
    };

    function choose(medium: VehicleMedium, value: Vehicle): void {
        gameManager.getCurrentGameScene().CurrentPlayer.chooseVehicle(medium, value);
    }
</script>

<div class="px-2 py-1 flex flex-col gap-2" data-testid="vehicle-menu" aria-describedby="vehicle-menu-hint">
    {#each displayMedia as medium (medium.id)}
        {@const MediumIcon = mediumIcons[medium.id]}
        <fieldset class="m-0 p-0 border-0 min-w-0" data-testid={`vehicle-choice-${medium.id}`}>
            <legend class="sr-only">{$LL.woka.vehicle.media[medium.id]()}</legend>
            <div style="display: grid; grid-template-columns: 24px 1fr; align-items: center; gap: 8px;">
                <span
                    title={medium.id === VehicleMedium.Air && $shortcutsStore.toggleAirVehicle
                        ? $LL.woka.vehicle.airHint({
                              key: bindingKeys(
                                  $shortcutsStore.toggleAirVehicle,
                                  $LL.menu.shortcuts.keyNames.shift(),
                              ).join("+"),
                          })
                        : $LL.woka.vehicle.media[medium.id]()}
                    aria-hidden="true"><MediumIcon font-size="20" /></span
                >
                <div class="build-tray" style="gap: 6px; padding: 5px; flex-wrap: nowrap;">
                    {#each medium.vehicles as vehicle (vehicle)}
                        <button
                            type="button"
                            class="build-slot sm"
                            aria-pressed={preferences[medium.id] === vehicle}
                            aria-label={$LL.woka.vehicle[vehicle]()}
                            title={$LL.woka.vehicle[vehicle]()}
                            onclick={() => choose(medium.id, vehicle)}
                            data-testid={`vehicle-choice-${medium.id}-${vehicle}`}
                        >
                            {#if vehicle === Vehicle.None}
                                <IconX font-size="18" />
                            {:else}
                                <VehicleIcon {vehicle} colors={localUserStore.getVehicleColors(vehicle)} size={30} />
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        </fieldset>
    {/each}
    <p id="vehicle-menu-hint" class="sr-only">{$LL.woka.vehicle.quickHint()}</p>
</div>
