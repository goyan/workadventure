<script lang="ts">
    import { LL } from "../../../../i18n/i18n-svelte";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";
    import { IconHeadphones } from "@wa-icons";

    interface Props {
        onclose?: () => void;
    }

    let { onclose }: Props = $props();
</script>

<PropertyEditorBase
    onclose={() => {
        onclose?.();
    }}
>
    {#snippet header()}
        <span class="flex justify-center items-center">
            <IconHeadphones font-size="18" class="mr-2" />
            {$LL.mapEditor.properties.listeningZonePropertyData.label()}
        </span>
    {/snippet}
    {#snippet content()}
        <p class="m-0 text-sm opacity-75">{$LL.mapEditor.properties.listeningZonePropertyData.description()}</p>
    {/snippet}
</PropertyEditorBase>
