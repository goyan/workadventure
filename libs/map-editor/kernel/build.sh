#!/bin/sh
# Builds the kernel of the water (water_kernel.c) to WebAssembly and writes it, in base64, with the fingerprint of
# its source, to src/Terrain/WaterKernelWasm.generated.ts. Run it after any change to water_kernel.c:
#
#     libs/map-editor/kernel/build.sh
#
# It is built twice from the same source: for a memory of its own (a browser, a server whose steps are computed on
# one thread), and for a memory threads share (the bands of the water: a module is linked for the one or the other).
#
# The compiler runs in a container (Debian 13, clang 19 and lld from its packages), so nothing has to be installed
# but Docker, and everyone gets the same bytes. WATER_KERNEL_IMAGE sets another image of Debian 13; with
# WATER_KERNEL_CLANG=1 the clang of this machine is used instead (it has to know the target wasm32).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../src/Terrain/WaterKernelWasm.generated.ts"
flags="--target=wasm32 -O2 -nostdlib -ffp-contract=off -fno-builtin -mnontrapping-fptoint -Wall -Wextra -Werror"
link="-Wl,--no-entry -Wl,--import-memory -Wl,--strip-all -Wl,--export=__heap_base"
shared="-matomics -mbulk-memory -Wl,--shared-memory -Wl,--max-memory=2147483648"
if [ "${WATER_KERNEL_CLANG:-}" = "1" ]; then
    clang $flags $link -o "$here/water_kernel.wasm" "$here/water_kernel.c"
    clang $flags $shared $link -o "$here/water_kernel_shared.wasm" "$here/water_kernel.c"
else
    image=${WATER_KERNEL_IMAGE:-debian:13-slim}
    docker run --rm --user 0 -v "$here:/kernel" --entrypoint sh "$image" -c "
        set -eu
        command -v clang >/dev/null 2>&1 && command -v wasm-ld >/dev/null 2>&1 || {
            apt-get update -qq >/dev/null && apt-get install -y -qq --no-install-recommends clang lld >/dev/null
        }
        clang --version | head -1
        clang $flags $link -o /kernel/water_kernel.wasm /kernel/water_kernel.c
        clang $flags $shared $link -o /kernel/water_kernel_shared.wasm /kernel/water_kernel.c
        chmod a+rw /kernel/water_kernel.wasm /kernel/water_kernel_shared.wasm"
fi
node "$here/embed.mjs" "$here/water_kernel.c" "$here/water_kernel.wasm" "$here/water_kernel_shared.wasm" "$out"
rm -f "$here/water_kernel.wasm" "$here/water_kernel_shared.wasm"
