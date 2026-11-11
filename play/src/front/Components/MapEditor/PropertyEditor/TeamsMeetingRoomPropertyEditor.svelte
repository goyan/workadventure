<script lang="ts">
    import { LL } from "../../../../i18n/i18n-svelte";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";
    import { IconCalendar } from "@wa-icons";

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
            <IconCalendar font-size="18" class="mr-2" />
            {$LL.mapEditor.properties.teamsMeetingRoomPropertyData.label()}
        </span>
    {/snippet}
    {#snippet content()}
        <p class="m-0 text-sm opacity-80">{$LL.mapEditor.properties.teamsMeetingRoomPropertyData.description()}</p>
    {/snippet}
</PropertyEditorBase>
