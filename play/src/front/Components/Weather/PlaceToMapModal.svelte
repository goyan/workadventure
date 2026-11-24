<script lang="ts">
    import Popup from "../Modal/Popup.svelte";
    import Button from "../UI/Button.svelte";
    import InputCheckbox from "../Input/InputCheckbox.svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import type { WorldPlace } from "../../Phaser/Game/Night/WorldDaylight";
    import { applyPlaceToMap } from "./placeToMapActions";
    import { modals } from "@wa-modals";

    interface Props {
        isOpen: boolean;
        /** The place this player follows, the map is to follow. */
        place: WorldPlace;
        /** The name of the place the map follows now. */
        mapPlace: string;
        /** The weather of the map now when it is not real (it then goes real), named for the player. */
        mapWeather: string | undefined;
        /** Whether the conditions of the room are set by hand (Disaster, Weather): they would stay first. */
        manual: boolean;
    }

    let { isOpen, place, mapPlace, mapWeather, manual }: Props = $props();
    let leaveManual = $state(true);
    let sending = $state(false);
    let failed = $state(false);

    function confirm(): void {
        if (!isOpen || sending) return;
        sending = true;
        failed = false;
        applyPlaceToMap(place, { leaveManual: manual && leaveManual })
            .then(() => modals.close())
            .catch((error: unknown) => {
                console.error("The weather of the map could not follow the place", error);
                failed = true;
            })
            .finally(() => {
                sending = false;
            });
    }
</script>

<svelte:window
    onkeydown={(event) => {
        if (isOpen && event.key === "Escape") modals.close();
    }}
/>

<Popup {isOpen}>
    {#snippet title()}
        <h1>{$LL.actionbar.placeToMap.title()}</h1>
    {/snippet}
    {#snippet content()}
        <div class="flex flex-col gap-2 text-start" data-testid="place-to-map-modal">
            <p class="m-0">
                {$LL.actionbar.placeToMap.confirm({ place: place.longName ?? place.name, mapPlace })}
            </p>
            {#if mapWeather}
                <p class="m-0" data-testid="place-to-map-real">
                    {$LL.actionbar.placeToMap.goesReal({ weather: mapWeather })}
                </p>
            {/if}
            {#if manual}
                <InputCheckbox
                    bind:value={leaveManual}
                    label={$LL.actionbar.placeToMap.leaveManual()}
                    dataTestId="place-to-map-leave-manual"
                />
            {/if}
            <p class="m-0" data-testid="place-to-map-server-time">{$LL.actionbar.placeToMap.serverTime()}</p>
            {#if failed}
                <p class="m-0 text-danger-400" role="alert" data-testid="place-to-map-error">
                    {$LL.actionbar.placeToMap.error()}
                </p>
            {/if}
        </div>
    {/snippet}
    {#snippet action()}
        <Button class="flex-1" onclick={() => modals.close()}>{$LL.actionbar.cancel()}</Button>
        <Button variant="secondary" class="flex-1" disabled={sending} onclick={confirm}
            >{$LL.actionbar.placeToMap.action()}</Button
        >
    {/snippet}
</Popup>
