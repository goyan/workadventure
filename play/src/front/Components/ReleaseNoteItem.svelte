<script lang="ts">
    import type { ReleaseNote } from "../../common/ReleaseNotes";

    let { note }: { note: ReleaseNote } = $props();
    // Same public author name as the "What's new" window; nothing else from the commit.
    let author = $derived(note.author.trim());
</script>

<li class="break-words">
    {note.description}
    {#if author}<span class="opacity-70 whitespace-nowrap">— {author}</span>{/if}
</li>
