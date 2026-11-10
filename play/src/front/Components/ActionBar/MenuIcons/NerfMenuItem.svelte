<script lang="ts">
    import { LL } from "../../../../i18n/i18n-svelte";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { openedMenuStore } from "../../../Stores/MenuStore";
    import { nerfEquippedStore } from "../../../Stores/NerfStore";
    import ActionBarButton from "../ActionBarButton.svelte";
    import PixelIcon from "../../ActionsMenu/PixelIcon.svelte";

    function toggleEquipment(): void {
        gameManager.getCurrentGameScene().nerfManager?.toggleEquipment();
        openedMenuStore.closeAll();
    }
</script>

<ActionBarButton
    dataTestId="nerf-equipment-button"
    label={$nerfEquippedStore ? $LL.actionbar.nerf.unequip() : $LL.actionbar.nerf.equip()}
    tooltipTitle={$LL.actionbar.nerf.help()}
    state={$nerfEquippedStore ? "active" : "normal"}
    onclick={toggleEquipment}
>
    <PixelIcon name="nerf" size={24} />
</ActionBarButton>
