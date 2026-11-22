<script lang="ts">
    import { FAST_WATER_TIMES } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { fastWaterRightsStore, fastWaterStore, requestFastWater } from "../../Stores/FastWaterStore";
    import ActionBarButton from "./ActionBarButton.svelte";
    import { IconPlayerTrackNext } from "@wa-icons";

    const labels = $derived($LL.actionbar.fastWater);
    const times = FAST_WATER_TIMES;
    const rights = $derived($fastWaterRightsStore);
    const on = $derived($fastWaterStore !== undefined);
    const desc = $derived(
        rights.mapFaster
            ? labels.mapFaster({ times: rights.mapTimes })
            : !rights.allowed
              ? labels.forbidden({ times })
              : on
                ? labels.on({ times })
                : labels.off({ times }),
    );

    function toggle(): void {
        if (!rights.allowed || rights.mapFaster) return;
        requestFastWater(!on);
    }
</script>

<!-- Next to « Basique », but not of the same kind: Basique is for this person only, the fast water is that of the
     server, for the whole room, while it is on. -->
<ActionBarButton
    onclick={toggle}
    tooltipTitle={labels.label({ times })}
    {desc}
    state={!rights.allowed || rights.mapFaster ? "disabled" : on ? "active" : "normal"}
    dataTestId="fast-water-button"
>
    <IconPlayerTrackNext width="20" height="20" />
</ActionBarButton>
