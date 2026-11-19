import type { Component } from "svelte";
import type { CategoryTag } from "../../../Stores/MapEditorStore";
import { findBaseCategory } from "../../../Utils/ObjectCategories";
import {
    IconArmchair,
    IconBath,
    IconBike,
    IconBook,
    IconBriefcase,
    IconBuildingCottage,
    IconChristmasTree,
    IconConfetti,
    IconFish,
    IconFlower,
    IconGamepad,
    IconMusic,
    IconPaw,
    IconPhoto,
    IconPumpkinScary,
    IconSnowflake,
    IconSofa,
    IconToolsKitchen,
    IconTrees,
    IconBed,
    IconBox,
    IconBulb,
    IconCategory,
    IconCoffee,
    IconDesk,
    IconDeviceDesktop,
    IconDots,
    IconIceSkating,
    IconPlant,
    IconRun,
    IconSparkles,
    IconStar,
    IconSwimming,
    IconTexture,
    IconToiletPaper,
    IconUserCircle,
} from "@wa-icons";

type IconComponent = Component<{ "font-size"?: string }>;

/** One picture per base category (ObjectCategories.BASE_CATEGORIES), by id. */
const BASE_ICONS: Record<string, IconComponent> = {
    seats: IconArmchair,
    pools: IconSwimming,
    rinks: IconIceSkating,
    beds: IconBed,
    toilets: IconToiletPaper,
    coffee: IconCoffee,
    sport: IconRun,
    rugs: IconTexture,
    lights: IconBulb,
    plants: IconPlant,
    tables: IconDesk,
    storage: IconBox,
    decoration: IconSparkles,
    electronics: IconDeviceDesktop,
    misc: IconDots,
};

const SPECIAL_ICONS: Record<Extract<CategoryTag, { kind: "special" }>["tag"], IconComponent> = {
    most_used: IconStar,
    custom: IconUserCircle,
    uncategorized: IconCategory,
};

/**
 * Categories a map created get their picture from their name, in French or English: the first word found wins, so
 * the more precise words come first ("neige" before "nature" for "Nature enneigée").
 */
const KEYWORD_ICONS: readonly [readonly string[], IconComponent][] = [
    [["neige", "snow", "hiver", "winter", "glace"], IconSnowflake],
    [["noel", "christmas", "xmas", "sapin"], IconChristmasTree],
    [["halloween", "citrouille", "pumpkin"], IconPumpkinScary],
    [["fete", "party", "disco", "anniversaire"], IconConfetti],
    [["animal", "animaux", "pet", "chien", "chat", "dog", "cat"], IconPaw],
    [["poisson", "fish", "aquarium", "eau", "water", "mer", "sea"], IconFish],
    [["fleur", "flower"], IconFlower],
    [["plante", "plant"], IconPlant],
    [["nature", "natural", "arbre", "tree", "jardin", "garden", "foret", "forest", "exterieur", "outdoor"], IconTrees],
    [["sol", "sols", "floor", "tapis", "rug", "carpet", "parquet"], IconTexture],
    [["mural", "wall", "mur", "murs", "tableau", "poster", "cadre", "frame", "art", "affiche"], IconPhoto],
    [["livre", "book", "biblio", "library"], IconBook],
    [["bain", "bath", "douche", "shower", "toilet", "wc", "lavabo"], IconBath],
    [["cuisine", "kitchen", "food", "repas", "frigo", "fridge"], IconToolsKitchen],
    [["cafe", "coffee", "the", "tea"], IconCoffee],
    [["musique", "music", "instrument", "guitare", "piano", "son"], IconMusic],
    [["jeu", "jeux", "game", "loisir", "fun", "arcade", "billard"], IconGamepad],
    [["sport", "gym", "fitness", "muscu"], IconRun],
    [["velo", "bike", "voiture", "car", "vehicule", "vehicle", "transport"], IconBike],
    [["electro", "informatique", "computer", "ordinateur", "ecran", "screen", "tech"], IconDeviceDesktop],
    [["lumiere", "light", "lampe", "lamp", "luminaire", "neon"], IconBulb],
    [["lit", "lits", "bed", "chambre", "bedroom"], IconBed],
    [["chaise", "chair", "siege", "seat", "canape", "sofa", "fauteuil"], IconArmchair],
    [["table", "bureau", "desk"], IconDesk],
    [["office", "travail", "work", "reunion", "meeting"], IconBriefcase],
    [["rangement", "storage", "etagere", "shelf", "armoire", "placard", "box", "caisse"], IconBox],
    [["maison", "house", "batiment", "building", "cabane"], IconBuildingCottage],
    [["meuble", "mobilier", "furniture"], IconSofa],
    [["deco", "ornement"], IconSparkles],
];

function words(name: string): string[] {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word !== "");
}

function iconFromName(name: string): IconComponent | undefined {
    const nameWords = words(name);
    // A keyword matches a whole word, or, from 4 letters, the start of one ("plantes"): a short keyword only matches
    // itself, so that "sol" is not "soleil" nor "car" "carton".
    const matches = (keyword: string, word: string): boolean =>
        word === keyword || (keyword.length >= 4 && word.startsWith(keyword));
    return KEYWORD_ICONS.find(([keywords]) =>
        keywords.some((keyword) => nameWords.some((word) => matches(keyword, word))),
    )?.[1];
}

/**
 * The picture of a category in the object library; undefined for a category a map created whose name
 * says nothing known, which shows its initial instead.
 */
export function categoryIcon(category: CategoryTag): IconComponent | undefined {
    if (category.kind === "special") return SPECIAL_ICONS[category.tag];
    const base = findBaseCategory(category.tag);
    return (base ? BASE_ICONS[base.id] : undefined) ?? iconFromName(category.tag);
}
