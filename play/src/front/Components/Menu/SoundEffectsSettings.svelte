<script lang="ts">
    import type { Writable } from "svelte/store";
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import RangeSlider from "../Input/RangeSlider.svelte";
    import PixelIcon from "../ActionsMenu/PixelIcon.svelte";
    import type { PixelIconName } from "../ActionsMenu/PixelIcons";
    import {
        doorVolumeStore,
        footstepVolumeStore,
        mapSoundsVolumeStore,
        notificationSoundVolumeStore,
        skateboardVolumeStore,
        weatherVolumeStore,
    } from "../../Stores/SoundEffectsStore";
    import { createSoundPreview, type PreviewedSoundFamily } from "./SoundPreview";

    interface Props {
        /** Plays an example of a family (injected by the tests). */
        preview?: { play: (family: PreviewedSoundFamily, volume: number) => void; stop: () => void };
    }

    let { preview = createSoundPreview() }: Props = $props();

    type Row = {
        id: string;
        label: string;
        icon: PixelIconName;
        store: Writable<number>;
        value: number;
        /** Undefined for the map's own sounds: each map has its own, there is no typical one to listen to. */
        family?: PreviewedSoundFamily;
        hint?: string;
    };

    // One slider per family of sounds, in three groups: what I make while moving, what is around me, what calls me.
    const groups = $derived<{ title: string; rows: Row[] }[]>([
        {
            title: $LL.menu.settings.soundEffects.movement(),
            rows: [
                {
                    id: "footstep-volume",
                    label: $LL.menu.settings.soundEffects.footsteps(),
                    icon: "footsteps",
                    store: footstepVolumeStore,
                    value: $footstepVolumeStore,
                    family: "footsteps",
                },
                {
                    id: "skateboard-volume",
                    label: $LL.menu.settings.soundEffects.skateboard(),
                    icon: "skateboard",
                    store: skateboardVolumeStore,
                    value: $skateboardVolumeStore,
                    family: "skateboard",
                },
            ],
        },
        {
            title: $LL.menu.settings.soundEffects.aroundMe(),
            rows: [
                {
                    id: "weather-volume",
                    label: $LL.menu.settings.soundEffects.weather(),
                    icon: "weather",
                    store: weatherVolumeStore,
                    value: $weatherVolumeStore,
                    family: "weather",
                },
                {
                    id: "door-volume",
                    label: $LL.menu.settings.soundEffects.doors(),
                    icon: "door",
                    store: doorVolumeStore,
                    value: $doorVolumeStore,
                    family: "doors",
                },
                {
                    id: "map-sounds-volume",
                    label: $LL.menu.settings.soundEffects.mapSounds(),
                    icon: "dance",
                    store: mapSoundsVolumeStore,
                    value: $mapSoundsVolumeStore,
                },
            ],
        },
        {
            title: $LL.menu.settings.soundEffects.notificationsGroup(),
            rows: [
                {
                    id: "notification-sound-volume",
                    label: $LL.menu.settings.soundEffects.notifications(),
                    icon: "bell",
                    store: notificationSoundVolumeStore,
                    value: $notificationSoundVolumeStore,
                    family: "notifications",
                    hint: $LL.menu.settings.soundEffects.notificationsHint(),
                },
            ],
        },
    ]);

    const format = (value: number): string =>
        // The unit is in the text: "Muted" has none.
        value === 0 ? $LL.menu.settings.soundEffects.muted() : `${Math.round(value * 100)} %`;

    onDestroy(() => preview.stop());
</script>

<div class="flex flex-col gap-4">
    {#each groups as group (group.title)}
        <div class="flex flex-col gap-2" data-testid="sound-effects-group">
            <p class="m-0 text-xs font-bold uppercase tracking-wide opacity-70">{group.title}</p>
            {#each group.rows as row (row.id)}
                <div class="flex items-center gap-3">
                    <PixelIcon name={row.icon} size={24} />
                    <div class="min-w-0 flex-1">
                        <RangeSlider
                            id={row.id}
                            label={row.label}
                            min={0}
                            max={1}
                            step={0.01}
                            value={row.value}
                            onchange={(value) => row.store.set(value)}
                            valueFormatter={format}
                            unit=""
                        />
                        {#if row.hint}<p class="m-0 text-xs opacity-60">{row.hint}</p>{/if}
                    </div>
                    {#if row.family}
                        {@const family = row.family}
                        <button
                            type="button"
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 hover:bg-white/20"
                            title={$LL.menu.settings.soundEffects.listen()}
                            aria-label={`${$LL.menu.settings.soundEffects.listen()} : ${row.label}`}
                            data-testid={`listen-${family}`}
                            onclick={() => preview.play(family, row.value)}>▶</button
                        >
                    {:else}
                        <span class="h-8 w-8 shrink-0" aria-hidden="true"></span>
                    {/if}
                </div>
            {/each}
        </div>
    {/each}
</div>
