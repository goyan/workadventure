<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import LL from "../../../i18n/i18n-svelte";
    import Button from "../../Components/UI/Button.svelte";
    import type { CompanionToken } from "../../../common/MacCompanion";
    import {
        companionInstallCommand,
        createCompanionToken,
        deleteCompanionToken,
        listCompanionTokens,
    } from "./CompanionApi";
    import { IconTrash } from "@wa-icons";

    let enabled = $state(false);
    let tokens = $state<CompanionToken[]>([]);
    /** The token just created: shown until the user says it is copied, then gone for good. */
    let createdToken = $state<string | undefined>(undefined);
    let busy = $state(false);
    let failed = $state(false);

    const abortController = new AbortController();
    onDestroy(() => abortController.abort());

    async function reload(): Promise<void> {
        const list = await listCompanionTokens(abortController.signal);
        if (list === "disabled") {
            enabled = false;
            return;
        }
        enabled = true;
        tokens = list.tokens;
    }

    function run(action: () => Promise<void>): void {
        if (busy) return;
        busy = true;
        failed = false;
        action()
            .then(() => reload())
            .catch(() => {
                if (!abortController.signal.aborted) failed = true;
            })
            .finally(() => {
                busy = false;
            });
    }

    onMount(() => {
        reload().catch(() => undefined);
    });

    function create(): void {
        run(async () => {
            const created = await createCompanionToken("Mac", abortController.signal);
            createdToken = created.token;
        });
    }

    function lastUse(token: CompanionToken): string {
        return token.lastUsedAt
            ? $LL.externalModule.companion.lastUsed({ date: new Date(token.lastUsedAt).toLocaleString() })
            : $LL.externalModule.companion.neverUsed();
    }
</script>

{#if enabled}
    <div class="flex flex-col gap-2 border-t border-white/10 pt-2">
        <h5 class="m-0 text-sm font-bold normal-case">{$LL.externalModule.companion.title()}</h5>
        <p class="m-0 text-xs text-contrast-200">{$LL.externalModule.companion.explain()}</p>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
            {#each tokens as token (token.id)}
                <li class="flex items-center justify-between gap-2">
                    <span class="min-w-0 truncate">
                        <strong>{token.label}</strong>
                        <span class="text-xs text-contrast-200">{lastUse(token)}</span>
                    </span>
                    <Button
                        variant="danger"
                        appearance="ghost"
                        size="xs"
                        square
                        disabled={busy}
                        aria-label={$LL.externalModule.companion.remove({ label: token.label })}
                        title={$LL.externalModule.companion.remove({ label: token.label })}
                        onclick={() => run(() => deleteCompanionToken(token.id, abortController.signal))}
                    >
                        {#snippet icon()}<IconTrash font-size={16} />{/snippet}
                    </Button>
                </li>
            {/each}
        </ul>
        {#if createdToken}
            <div class="flex flex-col gap-1 rounded bg-contrast/60 p-2 text-xs">
                <span>{$LL.externalModule.companion.copyHint()}</span>
                <code class="select-text break-all">{createdToken}</code>
                <code class="select-text break-all">{companionInstallCommand(window.location.origin)}</code>
                <Button variant="secondary" size="xs" onclick={() => (createdToken = undefined)}>
                    {$LL.externalModule.companion.done()}
                </Button>
            </div>
        {:else}
            <Button variant="secondary" size="sm" disabled={busy} onclick={create}>
                {$LL.externalModule.companion.create()}
            </Button>
        {/if}
        {#if failed}
            <p class="m-0 text-danger" role="alert">{$LL.externalModule.companion.error()}</p>
        {/if}
    </div>
{/if}
