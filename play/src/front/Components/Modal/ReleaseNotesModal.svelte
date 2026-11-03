<script lang="ts">
    import { onMount } from "svelte";
    import type { ReleaseNote } from "../../../common/ReleaseNotes";
    import { formatReleaseNoteTime, groupReleaseNotesByDay, releaseNotes } from "../../../common/ReleaseNotes";
    import LL, { locale } from "../../../i18n/i18n-svelte";
    import { releaseNotesVisibleStore } from "../../Stores/ReleaseNotesStore";
    import Popup from "./Popup.svelte";
    import { IconSparkles, IconTool } from "@wa-icons";

    interface Props {
        isOpen: boolean;
        notes?: ReleaseNote[];
    }

    let { isOpen, notes = releaseNotes }: Props = $props();

    let days = $derived(groupReleaseNotesByDay(notes, { locale: $locale }));

    // Commit subjects start in lower case: shown as sentences.
    function sentence(text: string): string {
        return text.charAt(0).toLocaleUpperCase($locale) + text.slice(1);
    }

    onMount(() => {
        releaseNotesVisibleStore.set(true);
        return () => releaseNotesVisibleStore.set(false);
    });
</script>

<Popup {isOpen} withAction={false}>
    {#snippet title()}
        <h1 class="m-0 text-2xl font-bold">{$LL.refreshPrompt.whatsNew()}</h1>
    {/snippet}
    {#snippet content()}
        <div class="w-full text-start" data-testid="release-notes">
            {#if notes.length === 0}
                <p>{$LL.refreshPrompt.noChanges()}</p>
            {:else}
                {#each days as day (day.label)}
                    <section class="mb-6 last:mb-0">
                        <h2
                            class="sticky top-0 z-10 m-0 mb-2 py-1 text-sm font-semibold normal-case text-white/60 bg-contrast/95 backdrop-blur-sm"
                        >
                            {sentence(day.label)}
                        </h2>
                        <ol class="list-none m-0 p-0 flex flex-col gap-1">
                            {#each day.notes as note (note.id)}
                                <li class="flex gap-3 items-start rounded-lg px-2 py-2 hover:bg-white/5">
                                    <span
                                        class="mt-0.5 shrink-0 flex items-center justify-center w-7 h-7 rounded-full {note.type ===
                                        'feat'
                                            ? 'bg-secondary/20 text-secondary'
                                            : 'bg-warning/20 text-warning'}"
                                        title={note.type === "feat"
                                            ? $LL.refreshPrompt.feature()
                                            : $LL.refreshPrompt.fix()}
                                    >
                                        {#if note.type === "feat"}
                                            <IconSparkles font-size="16" />
                                        {:else}
                                            <IconTool font-size="16" />
                                        {/if}
                                    </span>
                                    <div class="min-w-0">
                                        <p class="m-0 break-words leading-snug">{sentence(note.description)}</p>
                                        <p class="m-0 mt-0.5 text-xs text-white/50">
                                            {note.author},
                                            <time datetime={note.date}>{formatReleaseNoteTime(note.date, $locale)}</time
                                            >
                                        </p>
                                    </div>
                                </li>
                            {/each}
                        </ol>
                    </section>
                {/each}
            {/if}
        </div>
    {/snippet}
</Popup>
