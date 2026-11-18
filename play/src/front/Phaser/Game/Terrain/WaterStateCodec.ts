/** Unzips the bytes of a state of the water of the relief (gzip, as the server sends them). */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([Uint8Array.from(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
