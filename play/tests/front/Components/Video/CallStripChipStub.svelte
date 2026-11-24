<script lang="ts">
    let { videoBox }: { videoBox: { spaceUser: { name: string } } } = $props();
</script>

<li data-testid="call-strip-chip" aria-label={videoBox.spaceUser.name}></li>
