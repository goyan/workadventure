import { get } from "svelte/store";
import LL from "../../i18n/i18n-svelte";
import { formatCategory } from "./EntityCategory";
import { findBaseCategory } from "./ObjectCategories";

/** The name of a category as shown: translated for a base category, as written for one a map created. */
export function categoryLabel(category: string): string {
    const base = findBaseCategory(category);
    if (!base) return formatCategory(category);
    const labels = get(LL).mapEditor.categories.base;
    return labels[base.id as keyof typeof labels]();
}
