export type ExternalModuleFactory = () => Promise<unknown>;

const externalModuleFactories: Record<string, ExternalModuleFactory> = import.meta.glob(
    "@wa/front/external-modules/*/index.ts",
);

/**
 * Returns the lazy loader of the external module stored in `external-modules/<moduleName>/index.ts`.
 *
 * Vite builds the glob keys from the pattern: an aliased pattern yields root-relative keys
 * ("/src/front/external-modules/..."), a relative one yields relative keys. Matching on the folder
 * suffix keeps the lookup valid whatever form the pattern takes.
 */
export function findExternalModuleFactory(
    moduleName: string,
    factories: Record<string, ExternalModuleFactory> = externalModuleFactories,
): ExternalModuleFactory | undefined {
    const suffix = `/external-modules/${moduleName}/index.ts`;
    const key = Object.keys(factories).find((candidate) => candidate.endsWith(suffix));
    return key === undefined ? undefined : factories[key];
}
