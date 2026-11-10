<script lang="ts">
    import { LL } from "../../../../i18n/i18n-svelte";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { openedMenuStore } from "../../../Stores/MenuStore";
    import { nerfEquippedStore } from "../../../Stores/NerfStore";
    import ActionBarButton from "../ActionBarButton.svelte";

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
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M2 7h15v8H9v7H4v-7H2z" fill="#198bd1" />
        <path d="M17 8h6v6h-6zM6 5h7v2H6z" fill="#ff8d24" />
        <path d="M4 9h9v2H4z" fill="#b9e8f4" />
    </svg>
</ActionBarButton>
