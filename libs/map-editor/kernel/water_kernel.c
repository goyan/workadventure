/*
 * The passes of a move of the water with inertia, compiled to WebAssembly: the very passes of
 * src/Terrain/WaterKernel.ts, which stays the reference. Every figure is computed the same way, to the bit:
 *
 * - each value read from an array of floats is widened to a double at once, every sum, product and division is
 *   done in doubles, in the order the TypeScript writes them, and narrowed to a float only when it is stored
 *   (what a Float32Array does);
 * - Math.max, Math.min and Math.abs are the f64.max, f64.min and f64.abs of WebAssembly, which treat a NaN and
 *   the two zeros as JavaScript does (the C fmax and fmin do not);
 * - nothing is computed here that a library would (no power, no root): the table of powers comes from the
 *   TypeScript;
 * - built without -ffast-math and with -ffp-contract=off: the compiler neither reorders nor fuses anything.
 *
 * No state is kept here: everything a pass reads comes in the Move it is given, so several threads may run
 * passes over their own rows of the same memory.
 *
 * Built by build.sh into src/Terrain/WaterKernelWasm.generated.ts. Change one side, change the other, and run
 * tests/WaterKernelWasm.test.ts: it steps both and compares every bit.
 */

#define DRY_PX 0.01
#define BREAKING_CALM 0.1

typedef unsigned char u8;

/* What the passes read and write: InertiaMove in WaterKernel.ts, laid out as WaterKernelWasm.ts writes it. */
typedef struct {
    int width;
    int height;
    /* The last index of `powers`. */
    int lastPower;
    float *depth;
    float *ground;
    float *spill;
    u8 *closed;
    u8 *hollow;
    float *rough;
    float *powers;
    float *east;
    float *south;
    float *afford;
    float *speedEast;
    float *speedSouth;
    float *nextSpeedEast;
    float *nextSpeedSouth;
    double dt;
    double swiftest;
    double pull;
    double pulled;
    double edgeShare;
    double top;
    double roughness;
    double damping;
    double breaking;
    double carried;
    /* The pressure of the air as a height of water, read only when `pressed` is 1 (InertiaMove.head). */
    float *head;
    int pressed;
    /* How hard the wind pushes the water over each cell, east and south, read only when `pressed` is 1. */
    float *windEast;
    float *windSouth;
} Move;

_Static_assert(__builtin_offsetof(Move, dt) == 72, "the layout WaterKernelWasm.ts writes");
_Static_assert(__builtin_offsetof(Move, head) == 152, "the layout WaterKernelWasm.ts writes");
_Static_assert(__builtin_offsetof(Move, windEast) == 160, "the layout WaterKernelWasm.ts writes");
_Static_assert(sizeof(Move) == 168, "the layout WaterKernelWasm.ts writes");

#define MAX(a, b) __builtin_wasm_max_f64((a), (b))
#define MIN(a, b) __builtin_wasm_min_f64((a), (b))
#define ABS(a) __builtin_fabs(a)
/* A float of an array, as a double. */
#define F(array, index) ((double)(array)[index])

/* The flows pick up and slow down, over the rows from `rowFrom` to `rowTo` (left out). */
__attribute__((export_name("flux"))) void flux(const Move *move, int rowFrom, int rowTo) {
    const int width = move->width, height = move->height, lastPower = move->lastPower;
    const float *depth = move->depth, *ground = move->ground, *rough = move->rough, *powers = move->powers;
    const u8 *closed = move->closed, *hollow = move->hollow;
    float *east = move->east, *south = move->south;
    const float *speedEast = move->speedEast, *speedSouth = move->speedSouth;
    float *nextSpeedEast = move->nextSpeedEast, *nextSpeedSouth = move->nextSpeedSouth;
    const double dt = move->dt, swiftest = move->swiftest, pull = move->pull, pulled = move->pulled;
    const double roughness = move->roughness, damping = move->damping, breaking = move->breaking;
    const double carried = move->carried;
    const float *head = move->head, *windEast = move->windEast, *windSouth = move->windSouth;
    const int pressed = move->pressed == 1;
    for (int row = rowFrom; row < rowTo; row++) {
        for (int column = 0; column < width; column++) {
            const int index = row * width + column;
            const double held = F(depth, index);
            const double bed = F(ground, index);
            const double surface = bed + held;
            if (column + 1 < width) {
                const int other = index + 1;
                const double otherHeld = F(depth, other);
                nextSpeedEast[index] = 0;
                if ((held <= 0 && otherHeld <= 0) || (closed[index] & 1)) east[index] = 0;
                else {
                    const double otherBed = F(ground, other);
                    const double otherSurface = otherBed + otherHeld;
                    const double passing = MAX(surface, otherSurface) - MAX(bed, otherBed);
                    if (passing <= DRY_PX) east[index] = 0;
                    else {
                        const double drop = surface - otherSurface;
                        const int inWater = hollow[index] == 1 && hollow[other] == 1;
                        const double drive = pressed ? drop + (F(head, index) - F(head, other)) : drop;
                        double flow = F(east, index) + pull * MIN(passing, pulled) * drive;
                        if (pressed) flow += dt * 0.5 * (F(windEast, index) + F(windEast, other));
                        if (carried > 0 && inWater) {
                            const double along = F(speedEast, index);
                            const double alongChange =
                                along > 0 ? along - (column > 0 ? F(speedEast, index - 1) : 0)
                                          : (column + 2 < width ? F(speedEast, other) : 0) - along;
                            const double across =
                                0.25 * (F(speedSouth, index) + F(speedSouth, other) +
                                        (row > 0 ? F(speedSouth, index - width) + F(speedSouth, other - width) : 0));
                            const double acrossChange =
                                across > 0 ? along - (row > 0 ? F(speedEast, index - width) : along)
                                           : (row + 1 < height ? F(speedEast, index + width) : along) - along;
                            flow -= carried * dt * passing * (along * alongChange + across * acrossChange);
                        }
                        const double speed = ABS(flow) / passing;
                        const int eighths = (int)(passing * 8);
                        double rate = damping + roughness * 0.5 * (F(rough, index) + F(rough, other)) * speed *
                                                    F(powers, eighths > lastPower ? lastPower : eighths);
                        if (breaking > 0 && inWater) rate += breaking * MAX(ABS(drop) / passing - BREAKING_CALM, 0);
                        flow /= 1 + dt * rate;
                        if (flow > swiftest * passing) flow = swiftest * passing;
                        else if (flow < -swiftest * passing) flow = -swiftest * passing;
                        east[index] = (float)flow;
                        if (passing > 0.05) nextSpeedEast[index] = (float)(flow / passing);
                    }
                }
            }
            if (row + 1 < height) {
                const int other = index + width;
                const double otherHeld = F(depth, other);
                nextSpeedSouth[index] = 0;
                if ((held <= 0 && otherHeld <= 0) || (closed[index] & 4)) south[index] = 0;
                else {
                    const double otherBed = F(ground, other);
                    const double otherSurface = otherBed + otherHeld;
                    const double passing = MAX(surface, otherSurface) - MAX(bed, otherBed);
                    if (passing <= DRY_PX) south[index] = 0;
                    else {
                        const double drop = surface - otherSurface;
                        const int inWater = hollow[index] == 1 && hollow[other] == 1;
                        const double drive = pressed ? drop + (F(head, index) - F(head, other)) : drop;
                        double flow = F(south, index) + pull * MIN(passing, pulled) * drive;
                        if (pressed) flow += dt * 0.5 * (F(windSouth, index) + F(windSouth, other));
                        if (carried > 0 && inWater) {
                            const double along = F(speedSouth, index);
                            const double alongChange =
                                along > 0 ? along - (row > 0 ? F(speedSouth, index - width) : 0)
                                          : (row + 2 < height ? F(speedSouth, other) : 0) - along;
                            const double across =
                                0.25 * (F(speedEast, index) + F(speedEast, other) +
                                        (column > 0 ? F(speedEast, index - 1) + F(speedEast, other - 1) : 0));
                            const double acrossChange =
                                across > 0 ? along - (column > 0 ? F(speedSouth, index - 1) : along)
                                           : (column + 1 < width ? F(speedSouth, index + 1) : along) - along;
                            flow -= carried * dt * passing * (along * alongChange + across * acrossChange);
                        }
                        const double speed = ABS(flow) / passing;
                        const int eighths = (int)(passing * 8);
                        double rate = damping + roughness * 0.5 * (F(rough, index) + F(rough, other)) * speed *
                                                    F(powers, eighths > lastPower ? lastPower : eighths);
                        if (breaking > 0 && inWater) rate += breaking * MAX(ABS(drop) / passing - BREAKING_CALM, 0);
                        flow /= 1 + dt * rate;
                        if (flow > swiftest * passing) flow = swiftest * passing;
                        else if (flow < -swiftest * passing) flow = -swiftest * passing;
                        south[index] = (float)flow;
                        if (passing > 0.05) nextSpeedSouth[index] = (float)(flow / passing);
                    }
                }
            }
        }
    }
}

/* A cell never gives more than it holds: what it gives is cut down, by all its sides alike. */
__attribute__((export_name("afford"))) void afford(const Move *move, int rowFrom, int rowTo) {
    const int width = move->width, height = move->height;
    const float *depth = move->depth, *east = move->east, *south = move->south;
    float *can = move->afford;
    const double dt = move->dt;
    for (int row = rowFrom; row < rowTo; row++) {
        for (int column = 0; column < width; column++) {
            const int index = row * width + column;
            double out = 0;
            if (column + 1 < width) out += MAX(F(east, index), 0);
            if (column > 0) out += MAX(-F(east, index - 1), 0);
            if (row + 1 < height) out += MAX(F(south, index), 0);
            if (row > 0) out += MAX(-F(south, index - width), 0);
            can[index] = out * dt > F(depth, index) ? (float)(F(depth, index) / (out * dt)) : 1;
        }
    }
}

/* The flows are cut down to what the cells can afford. Returns whether any still moves water. */
__attribute__((export_name("scale"))) int scale(const Move *move, int rowFrom, int rowTo) {
    const int width = move->width, height = move->height;
    float *east = move->east, *south = move->south;
    const float *can = move->afford;
    const double dt = move->dt;
    int moved = 0;
    for (int row = rowFrom; row < rowTo; row++) {
        for (int column = 0; column < width; column++) {
            const int index = row * width + column;
            if (column + 1 < width && east[index] != 0) {
                const float cut = (float)(F(east, index) * (east[index] > 0 ? F(can, index) : F(can, index + 1)));
                east[index] = cut;
                if ((double)cut * dt > DRY_PX / 4 || (double)cut * dt < -DRY_PX / 4) moved = 1;
            }
            if (row + 1 < height && south[index] != 0) {
                const float cut = (float)(F(south, index) * (south[index] > 0 ? F(can, index) : F(can, index + width)));
                south[index] = cut;
                if ((double)cut * dt > DRY_PX / 4 || (double)cut * dt < -DRY_PX / 4) moved = 1;
            }
        }
    }
    return moved;
}

/*
 * The depths follow the flows. What each row loses is written in `rowLost`, a sum for each row of the grid, from
 * nothing: who calls adds the rows up in their order, so the water lost is the same sum whoever computes which
 * rows. `*moved` is set when any loss moved the water (left alone otherwise).
 */
__attribute__((export_name("depths"))) void depths(const Move *move, int rowFrom, int rowTo, double *rowLost, int *moved) {
    const int width = move->width, height = move->height;
    float *depth = move->depth;
    const float *ground = move->ground, *spill = move->spill, *east = move->east, *south = move->south;
    const double dt = move->dt, edgeShare = move->edgeShare, top = move->top;
    for (int row = rowFrom; row < rowTo; row++) {
        double lost = 0;
        for (int column = 0; column < width; column++) {
            const int index = row * width + column;
            double net = 0;
            int outside = 0;
            if (column + 1 < width) net -= F(east, index);
            else outside++;
            if (column > 0) net += F(east, index - 1);
            else outside++;
            if (row + 1 < height) net -= F(south, index);
            else outside++;
            if (row > 0) net += F(south, index - width);
            else outside++;
            double held = F(depth, index) + net * dt;
            if (held < 0) held = 0;
            if (held > 0) {
                if (outside > 0 && held > DRY_PX) {
                    const double gone = MIN(held, held * edgeShare * outside);
                    held -= gone;
                    lost += gone;
                    if (gone > DRY_PX / 4) *moved = 1;
                }
                const double over = F(ground, index) + held - (F(spill, index) + top);
                if (over > 0) {
                    const double gone = MIN(over, held);
                    held -= gone;
                    lost += gone;
                    *moved = 1;
                }
            }
            depth[index] = (float)held;
        }
        rowLost[row] = lost;
    }
}

/*
 * The `moves` moves of a step over the whole grid, one after the other. The speeds of a move take the place of
 * those of the move before: the two pairs of arrays are swapped in `move` at each move, where who calls reads
 * which is which afterwards. Returns the water lost, the rows of each move added in their order to `lost`;
 * `*moved` as depths.
 */
__attribute__((export_name("step"))) double step(Move *move, int moves, double lost, double *rowLost, int *moved) {
    for (int at = 0; at < moves; at++) {
        flux(move, 0, move->height);
        float *wasEast = move->speedEast, *wasSouth = move->speedSouth;
        move->speedEast = move->nextSpeedEast;
        move->speedSouth = move->nextSpeedSouth;
        move->nextSpeedEast = wasEast;
        move->nextSpeedSouth = wasSouth;
        afford(move, 0, move->height);
        if (scale(move, 0, move->height)) *moved = 1;
        depths(move, 0, move->height, rowLost, moved);
        for (int row = 0; row < move->height; row++) lost += rowLost[row];
    }
    return lost;
}
