# Noyau de l'eau compilé en WebAssembly

`water_kernel.c` contient les quatre passes d'un mouvement de l'eau à inertie, les mêmes que
`../src/Terrain/WaterKernel.ts` (la référence), au bit près. Il est compilé en WebAssembly et commité, en base64, dans
`../src/Terrain/WaterKernelWasm.generated.ts` : ni l'image de `back` ni Vite n'ont d'étape de compilation.

Après toute modification de `water_kernel.c` :

```sh
libs/map-editor/kernel/build.sh
```

Il ne faut que Docker : le script lance `clang` 19 et `lld` dans un conteneur Debian 13 (`debian:13-slim`), pour que
tout le monde obtienne les mêmes octets. Variables : `WATER_KERNEL_IMAGE` (une autre image de Debian 13),
`WATER_KERNEL_CLANG=1` (le `clang` du poste, s'il connaît la cible `wasm32`).

Puis `npx vitest run tests/WaterKernelWasm.test.ts` (dans `libs/map-editor`) : il vérifie que le binaire commité vient
bien du source, et joue chaque scénario sur les deux noyaux en comparant tout, à chaque pas. Toute modification d'une
passe se fait des deux côtés, TypeScript et C.
