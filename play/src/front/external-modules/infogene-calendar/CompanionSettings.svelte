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

    /** The value whose copy button last worked: its button says so for a moment. */
    let copied = $state<"token" | "command" | undefined>(undefined);
    let copiedTimer: ReturnType<typeof setTimeout> | undefined;
    onDestroy(() => clearTimeout(copiedTimer));
    const valueElements: Partial<Record<"token" | "command", HTMLElement>> = $state({});

    /** Selects the whole value: what the user copies by hand when the clipboard is refused. */
    function selectValue(which: "token" | "command"): void {
        const element = valueElements[which];
        const selection = window.getSelection();
        if (!element || !selection) return;
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    function copy(which: "token" | "command", value: string): void {
        navigator.clipboard
            .writeText(value)
            .then(() => {
                copied = which;
                clearTimeout(copiedTimer);
                copiedTimer = setTimeout(() => (copied = undefined), 2000);
            })
            .catch(() => selectValue(which));
    }

    function lastUse(token: CompanionToken): string {
        return token.lastUsedAt
            ? $LL.externalModule.companion.lastUsed({ date: new Date(token.lastUsedAt).toLocaleString() })
            : $LL.externalModule.companion.neverUsed();
    }
</script>

<!-- A value to copy: one click on it selects it all, its button copies it and says so. -->
{#snippet copyRow(which: "token" | "command", label: string, value: string)}
    <div class="flex flex-col gap-1">
        <span class="text-xxs font-bold uppercase tracking-wide text-contrast-200">{label}</span>
        <div class="flex items-stretch gap-1">
            <code
                bind:this={valueElements[which]}
                class="min-w-0 flex-1 select-all break-all rounded border border-solid border-white/20 bg-black/40 px-2 py-1 font-mono selection:bg-secondary/60"
                >{value}</code
            >
            <Button
                variant={copied === which ? "success" : "light"}
                appearance="border"
                size="xs"
                class="m-0 shrink-0"
                aria-label={`${$LL.externalModule.companion.copy()} ${label}`}
                onclick={() => copy(which, value)}
            >
                {copied === which ? $LL.externalModule.companion.copied() : $LL.externalModule.companion.copy()}
            </Button>
        </div>
    </div>
{/snippet}

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
                {@render copyRow("token", $LL.externalModule.companion.tokenLabel(), createdToken)}
                {@render copyRow(
                    "command",
                    $LL.externalModule.companion.commandLabel(),
                    companionInstallCommand(window.location.origin),
                )}
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
