import type { BaseTranslation } from "../i18n-types";

const woka: BaseTranslation = {
    vehicle: {
        myVehicle: "My vehicles",
        airHint:
            "Air: press {key} to activate or deactivate your airplane. In flight, hold Space to climb and Ctrl to descend.",
        landingBlocked: "Cannot land here. Move to a clear spot.",
        airplane: "Airplane",
        media: { air: "Air", land: "Land", water: "Water" },
        quickHint:
            "Your canoe boards automatically in deep terrain water. Equip your land vehicle from the action wheel.",
        centerColor: "Center",
        edgeColor: "Edge",
        wheelsColor: "Wheels",
        title: "Vehicle",
        none: "None",
        skateboard: "Skateboard",
        electricUnicycle: "Electric unicycle",
        hint: "Tap a direction three times to sprint on your vehicle, or equip it from the action wheel.",
        mount: "Ride skateboard",
        mountElectricUnicycle: "Ride electric unicycle",
        shellColor: "Shell",
        sideColor: "Sides",
        pedalsColor: "Pedals",
        dismount: "Dismount",
        canoe: "Canoe",
        hullColor: "Hull",
        fuselageColor: "Fuselage",
        wingsColor: "Wings",
        canopyColor: "Canopy",
        rimColor: "Rim",
        paddleColor: "Paddle",
        canoeHint:
            "The canoe takes to the water by itself: where you would swim in the water of the relief, you paddle, at walking speed, and the current carries you half as much. On the ground, your land vehicle choice applies.",
    },
    perception: {
        basic: "Basic mode: sees neither the night nor the weather",
        place: "Follows the weather of another city",
    },
    customWoka: {
        color: "Color",
        defaultColor: "Default color",
        rotate: "Rotate avatar",
        parts: {
            body: "Body",
            eyes: "Eyes",
            hair: "Hair",
            clothes: "Clothes",
            hat: "Hat",
            accessory: "Accessories",
        },
        bath: "Swimwear",
        bathHint: "Your swimwear is worn in the water and within one tile of the pool.",
        title: "Build your WOKA",
        navigation: {
            finish: "Finish",
            backToDefaultWoka: "Back to default WOKA",
        },
        randomize: "Randomize",
    },
    selectWoka: {
        title: "Select your WOKA",
        continue: "Continue",
        customize: "Build your WOKA",
        randomize: "Select Randomly",
    },
    menu: {
        changeOutfit: "Change outfit",
        swimwear: "Swimsuit",
        swimwearDetail: "(shown near a pool)",
        actions: "My avatar actions",
        closeActions: "Close actions",
        profile: "Show profile",
        businessCard: "Business Card",
        releaseAnimals: "Let my animals go ({count:number})",
    },
    swimwear: {
        auto: "Based on avatar",
        shorts: "Swim shorts",
        twoPiece: "Two-piece swimsuit",
    },
    actions: {
        idle: "Stop",
        dance: "Dance",
        coffee: "Drink coffee",
        sleep: "Sleep",
        toilet: "Use the toilet",
        run: "Run",
    },
    picker: {
        title: "Who do you want to select?",
        self: "{name} (you)",
    },
};

export default woka;
