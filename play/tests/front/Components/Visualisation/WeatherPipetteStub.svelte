<script lang="ts">
    // A stand-in for the weather pipette, whose sentences have their own suite: it says whether it has a cell.
    let { cell }: { cell: unknown } = $props();
</script>

<div data-testid="weather-pipette" data-cell={cell === undefined ? "none" : "read"}></div>
