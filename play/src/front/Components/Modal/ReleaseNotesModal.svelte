<script lang="ts">
    import { onMount } from "svelte";
    import type { ReleaseNote } from "../../../common/ReleaseNotes";
    import { releaseNotes } from "../../../common/ReleaseNotes";
    import LL, { locale } from "../../../i18n/i18n-svelte";
    import { releaseNotesVisibleStore } from "../../Stores/ReleaseNotesStore";
    import Popup from "./Popup.svelte";

    interface Props {
        isOpen: boolean;
        notes?: ReleaseNote[];
    }

    let { isOpen, notes = releaseNotes }: Props = $props();
    let dateFormatter = $derived(new Intl.DateTimeFormat($locale, { dateStyle: "long" }));

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
        <div class="w-full" data-testid="release-notes">
            {#if notes.length === 0}
                <p>{$LL.refreshPrompt.noChanges()}</p>
            {:else}
                <ol class="list-none m-0 p-0 divide-y divide-white/20">
                    {#each notes as note (note.id)}
                        <li class="py-4">
                            <div class="flex flex-wrap gap-2 items-center text-sm">
                                <span class="font-semibold text-secondary">
                                    {note.type === "feat" ? $LL.refreshPrompt.feature() : $LL.refreshPrompt.fix()}
                                </span>
                                <time datetime={note.date}>{dateFormatter.format(new Date(note.date))}</time>
                                <span>· {note.author}</span>
                            </div>
                            <p class="mt-2 mb-0 break-words">{note.description}</p>
                        </li>
                    {/each}
                </ol>
            {/if}
        </div>
    {/snippet}
</Popup>
