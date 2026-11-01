(function () {
    const RECORD_WIDTH = 19;
    const MIN_GLYPH_SIZE = 32;
    const MAX_GLYPH_SIZE = 256;
    const MAX_CUBES = 254;
    const TARGET_TILE_CUBES = 64;
    const GRID_PEAK_TOLERANCE = 1.25;
    const MAX_TILE_GRID = 16;
    const TILE_MARGIN = 0.002;
    const SPIN_SAMPLES = 64;
    const SPIN_ROTATION = 1;
    const PLUGIN_VERSION = '0.9.0';
    const ARC_BULGE = 0.25;
    const BONE_TEXELS = 4;
    const BONE_AFFINE_TEXELS = 6;
    const BONE_FORMAT_RIGID = 0;
    const BONE_FORMAT_AFFINE = 1;
    const BONE_POSITION_RANGE = 2;
    const BONE_LINEAR_RANGE = 8;
    const IDENTITY_LINEAR = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const CYCLE_SECONDS = 1200;
    const MAX_CLIP_FRAMES = 250;
    const MAX_CYCLE_LOOPS = 65535;
    const PLAY_MODES = { loop: 0, hold: 1, once: 2 };
    const POSE_EPSILON = 1e-5;
    const SCALE_EPSILON = 1e-3;
    const MAX_ATLAS_WIDTH = 255;
    const CUBE_TAG = 0xc1;
    const MARKER = 0x54;
    const VERSION = 1;
    const FACE_ORDER = ['east', 'west', 'up', 'down', 'south', 'north'];
    const FONT_NAMESPACE = 'texttomodel';
    const VALID_RESOURCE_NAME = /^[a-z0-9_.-]+$/;

    function rotateVector(q, v) {
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const inner = cross(q, v).map((value, i) => value + q[3] * v[i]);
        return cross(q, inner).map((value, i) => v[i] + 2 * value);
    }

    function multiplyQuaternions(a, b) {
        return [
            a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
            a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
            a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
        ];
    }

    function axisQuaternion(axis, degrees) {
        const half = (degrees * Math.PI) / 360;
        const q = [0, 0, 0, Math.cos(half)];
        q[axis] = Math.sin(half);
        return q;
    }

    function quaternionFromEuler(degrees) {
        const [x, y, z] = degrees.map((value, axis) => axisQuaternion(axis, value));
        return multiplyQuaternions(multiplyQuaternions(z, y), x);
    }

    function pivotTransform(node) {
        const q = quaternionFromEuler(node.rotation || [0, 0, 0]);
        const pivot = node.origin || [0, 0, 0];
        const rotated = rotateVector(q, pivot);
        return { q, t: pivot.map((value, i) => value - rotated[i]) };
    }

    function composeTransforms(parent, child) {
        const moved = rotateVector(parent.q, child.t);
        return { q: multiplyQuaternions(parent.q, child.q), t: moved.map((value, i) => value + parent.t[i]) };
    }

    function cubeTransform(cube) {
        let transform = pivotTransform(cube);
        for (let node = cube.parent; node && node !== 'root'; node = node.parent) {
            transform = composeTransforms(pivotTransform(node), transform);
        }
        return transform;
    }

    function worldBox(cube) {
        const transform = cubeTransform(cube);
        const inflate = cube.inflate || 0;
        const localCenter = cube.from.map((value, i) => (value + cube.to[i]) / 2);
        const half = cube.from.map((value, i) => Math.abs(cube.to[i] - value) / 2 + inflate);
        const center = rotateVector(transform.q, localCenter).map((value, i) => value + transform.t[i]);
        return { center, half, quat: transform.q };
    }

    function boxCorners(box) {
        const corners = [];
        for (const x of [-1, 1]) {
            for (const y of [-1, 1]) {
                for (const z of [-1, 1]) {
                    const offset = rotateVector(box.quat, [x * box.half[0], y * box.half[1], z * box.half[2]]);
                    corners.push(offset.map((value, i) => value + box.center[i]));
                }
            }
        }
        return corners;
    }

    function applyLinear(pose, vector) {
        if (!pose.linear) return rotateVector(pose.quat, vector);
        const [x, y, z] = vector;
        return [0, 1, 2].map((axis) => pose.linear[axis] * x + pose.linear[3 + axis] * y + pose.linear[6 + axis] * z);
    }

    function posedCorners(boxes, clip) {
        const corners = [];
        for (const box of boxes) {
            const rest = boxCorners(box);
            if (!box.bone) {
                corners.push(...rest);
                continue;
            }
            for (const frame of clip.frames) {
                const pose = frame[box.bone - 1];
                for (const corner of rest) {
                    corners.push(applyLinear(pose, corner).map((value, i) => value + pose.position[i]));
                }
            }
        }
        return corners;
    }

    function modelBounds(boxes, clip = null) {
        const corners = posedCorners(boxes, clip);
        const middle = [0, 1, 2].map((axis) => {
            let min = Infinity;
            let max = -Infinity;
            for (const corner of corners) {
                min = Math.min(min, corner[axis]);
                max = Math.max(max, corner[axis]);
            }
            return (min + max) / 2;
        });
        let radius = 0;
        for (const corner of corners) {
            radius = Math.max(radius, Math.hypot(...corner.map((value, i) => value - middle[i])));
        }
        return { middle, radius };
    }

    function normalizeBoxes(boxes, bounds = modelBounds(boxes)) {
        const { middle, radius } = bounds;
        return boxes.map((box) => ({
            ...box,
            center: box.center.map((value, i) => (value - middle[i]) / radius),
            half: box.half.map((value) => value / radius),
        }));
    }

    function normalizeClip(clip, { middle, radius }) {
        const normalizePose = (pose) => {
            const moved = applyLinear(pose, middle);
            return { ...pose, position: pose.position.map((value, i) => (moved[i] - middle[i] + value) / radius) };
        };
        return { ...clip, frames: clip.frames.map((frame) => frame.map(normalizePose)) };
    }

    function boneTable(clip) {
        const boneCount = clip.frames[0].length;
        const boneTexels = clip.scaled ? BONE_AFFINE_TEXELS : BONE_TEXELS;
        const width = boneCount * boneTexels;
        const height = clip.frames.length;
        if (width > MAX_ATLAS_WIDTH) throw new Error(`본은 최대 ${Math.floor(MAX_ATLAS_WIDTH / boneTexels)}개입니다. (현재 ${boneCount}개)`);

        const pixels = new Uint8Array(width * height * 4);
        clip.frames.forEach((frame, y) => {
            frame.forEach((pose, bone) => {
                const offset = (y * width + bone * boneTexels) * 4;
                const linearValues = clip.scaled ? pose.linear.map((value) => value / BONE_LINEAR_RANGE) : pose.quat;
                linearValues.forEach((value, i) => writeSnorm16(pixels, offset + i * 2, value));
                pose.position.forEach((value, i) => writeSnorm16(pixels, offset + (linearValues.length + i) * 2, value / BONE_POSITION_RANGE));
            });
        });
        return { width, height, pixels };
    }

    function clipTiming(length, fps, loopMode) {
        const frameCount = Math.max(2, Math.min(MAX_CLIP_FRAMES, Math.round(length * fps)));
        const divisions = loopMode === 'loop' ? frameCount : frameCount - 1;
        return {
            times: Array.from({ length: frameCount }, (_, frame) => (frame / divisions) * length),
            loopsPerCycle: Math.max(1, Math.min(MAX_CYCLE_LOOPS, Math.round(CYCLE_SECONDS / length))),
            playMode: PLAY_MODES[loopMode],
        };
    }

    function multiplyMatrices(a, b) {
        const result = new Array(16).fill(0);
        for (let column = 0; column < 4; column++) {
            for (let row = 0; row < 4; row++) {
                for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
            }
        }
        return result;
    }

    function invertRigid(m) {
        const position = [
            -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]),
            -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]),
            -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]),
        ];
        return [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, ...position, 1];
    }

    function rotationToQuaternion(x, y, z) {
        const trace = x[0] + y[1] + z[2];
        if (trace > 0) {
            const s = Math.sqrt(trace + 1) * 2;
            return [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4];
        }
        if (x[0] > y[1] && x[0] > z[2]) {
            const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2;
            return [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
        }
        if (y[1] > z[2]) {
            const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2;
            return [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
        }
        const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2;
        return [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s];
    }

    function poseDelta(current, rest) {
        const delta = multiplyMatrices(current, invertRigid(rest));
        const columns = [delta.slice(0, 3), delta.slice(4, 7), delta.slice(8, 11)];
        const scales = columns.map((column) => Math.hypot(...column));
        const [x, y, z] = columns.map((column, i) => column.map((value) => value / (scales[i] || 1)));
        return {
            quat: rotationToQuaternion(x, y, z),
            linear: columns.flat(),
            position: delta.slice(12, 15),
            scaled: scales.some((scale) => Math.abs(scale - 1) > SCALE_EPSILON),
        };
    }

    function isRestPose(pose) {
        const isIdentityLinear = pose.linear.every((value, i) => Math.abs(value - IDENTITY_LINEAR[i]) < POSE_EPSILON);
        return isIdentityLinear && pose.position.every((value) => Math.abs(value) < POSE_EPSILON);
    }

    function writeSnorm16(bytes, offset, value) {
        const scaled = Math.round(Math.max(-1, Math.min(1, value)) * 32767) & 0xffff;
        bytes[offset] = scaled >> 8;
        bytes[offset + 1] = scaled & 0xff;
    }

    function writeUnorm16(bytes, offset, value) {
        const scaled = Math.round(Math.max(0, Math.min(1, value)) * 65535);
        bytes[offset] = scaled >> 8;
        bytes[offset + 1] = scaled & 0xff;
    }

    function writeFacePixels(bytes, offset, u, v, rotation) {
        const fixedU = (rotation << 14) | Math.round(u * 64);
        const fixedV = Math.round(v * 64);
        bytes[offset] = fixedU >> 8;
        bytes[offset + 1] = fixedU & 0xff;
        bytes[offset + 2] = fixedV >> 8;
        bytes[offset + 3] = fixedV & 0xff;
    }

    function cubeRecord(cube) {
        const record = new Uint8Array(RECORD_WIDTH * 4);
        record[0] = CUBE_TAG;
        record[1] = cube.faces.reduce((mask, face, index) => (face ? mask | (1 << index) : mask), 0);
        record[2] = cube.bone || 0;

        writeSnorm16(record, 4, cube.center[0]);
        writeSnorm16(record, 6, cube.center[1]);
        writeSnorm16(record, 8, cube.center[2]);
        writeUnorm16(record, 10, cube.half[0]);
        writeUnorm16(record, 12, cube.half[1]);
        writeUnorm16(record, 14, cube.half[2]);
        cube.quat.forEach((value, i) => writeSnorm16(record, 16 + i * 2, value));

        cube.faces.forEach((face, index) => {
            if (!face) return;
            const offset = 24 + index * 8;
            writeFacePixels(record, offset, face.u0, face.v0, face.rotation);
            writeFacePixels(record, offset + 4, face.u1, face.v1, 0);
        });

        record.set([0xe0, 0x00, 0x00, 0xff], (RECORD_WIDTH - 1) * 4);
        return record;
    }

    function glyphSize(cubeCount, texture, tiled) {
        const width = RECORD_WIDTH + texture.width + (tiled ? 1 : 0);
        return Math.max(MIN_GLYPH_SIZE, width, Math.max(cubeCount, texture.height) + 2);
    }

    function encodeGlyph(cubes, texture, header, tile = null, size = glyphSize(cubes.length, texture, tile !== null)) {
        if (cubes.length === 0) throw new Error('내보낼 큐브가 없습니다.');
        if (cubes.length > MAX_CUBES) throw new Error(`큐브는 최대 ${MAX_CUBES}개입니다. (현재 ${cubes.length}개)`);
        if (size > MAX_GLYPH_SIZE) throw new Error(`글리프가 ${MAX_GLYPH_SIZE}을 넘습니다. 텍스처를 줄여 주세요. (현재 ${size})`);

        const pixels = new Uint8Array(size * size * 4);
        const put = (x, y, bytes) => pixels.set(bytes, (y * size + x) * 4);

        const corners = [[0, 0], [0, size - 1], [size - 1, size - 1], [size - 1, 0]];
        corners.forEach(([x, y], index) => put(x, y, [MARKER | index, size - 1, size - 1, 0]));

        put(1, 0, [0x54, 0x54, 0x4d, VERSION]);
        put(2, 0, [header.rotationMode, 0, header.lightMask, header.ambient]);
        put(3, 0, [header.offset[0] & 0xff, header.offset[1] & 0xff, header.offset[2] & 0xff, header.scale]);
        put(4, 0, [header.yaw, header.pitch, header.roll, header.spin]);
        const textureX = texture.x === undefined ? RECORD_WIDTH : texture.x;
        const textureY = texture.y === undefined ? 1 : texture.y;
        put(5, 0, [cubes.length, 0, textureX, textureY]);
        put(6, 0, [texture.width, texture.height, 0, 0]);
        if (header.animation) {
            const { boneCount, frameCount, loopsPerCycle, tableX, tableY, playMode, boneFormat } = header.animation;
            put(8, 0, [boneCount, frameCount, loopsPerCycle >> 8, loopsPerCycle & 0xff]);
            put(9, 0, [tableX, tableY, playMode, boneFormat]);
        }
        if (tile) {
            put(7, 0, tile);
            // 전진 폭은 오른쪽부터 알파가 있는 첫 열로 정해진다. 타일마다 폭이 달라지면 겹침이 어긋난다.
            put(size - 1, 1, [0, 0, 0, 255]);
        }

        cubes.forEach((cube, index) => put(0, index + 1, cubeRecord(cube)));
        for (let y = 0; y < texture.height; y++) {
            const start = y * texture.width * 4;
            put(textureX, textureY + y, texture.pixels.subarray(start, start + texture.width * 4));
        }
        return { size, pixels };
    }

    function viewQuaternion(header, spinDegrees = 0) {
        const degrees = (angle) => (angle / 256) * 360;
        const rollPitch = multiplyQuaternions(axisQuaternion(2, degrees(header.roll)), axisQuaternion(0, degrees(header.pitch)));
        return multiplyQuaternions(rollPitch, axisQuaternion(1, degrees(header.yaw) + spinDegrees));
    }

    function pointBounds(points, header, spinDegrees) {
        const rotation = viewQuaternion(header, spinDegrees);
        const scale = header.scale / 128;
        const viewPoints = points.map((point) =>
            rotateVector(rotation, point).map((value, axis) => value * scale + header.offset[axis] / 127)
        );
        const xs = viewPoints.map((point) => point[0]);
        const ys = viewPoints.map((point) => point[1]);
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }

    function viewBounds(cube, header, spinDegrees = 0) {
        return pointBounds(boxCorners(cube), header, spinDegrees);
    }

    function expandBounds(bounds, margin) {
        return {
            minX: bounds.minX - margin,
            maxX: bounds.maxX + margin,
            minY: bounds.minY - margin,
            maxY: bounds.maxY + margin,
        };
    }

    function posedCubeCorners(cube, pose) {
        const corners = boxCorners(cube);
        if (!pose) return corners;
        return corners.map((corner) => applyLinear(pose, corner).map((value, i) => value + pose.position[i]));
    }

    function largestDistance(points, others) {
        return Math.max(...points.map((point, index) => Math.hypot(...point.map((value, axis) => value - others[index][axis]))));
    }

    // 회전 궤적은 고리 모양이다. 하나의 사각형으로 묶으면 궤적이 지나지 않는 가운데 칸까지 차지한다.
    // 프레임 사이는 보간되므로 인접 프레임을 함께 묶고, 회전이 만드는 호의 불룩함만큼 여유를 둔다.
    function cubeFootprints(cube, header, clip = null) {
        const poses = clip && cube.bone ? clip.frames.map((frame) => frame[cube.bone - 1]) : [null];
        const frames = poses.map((pose) => posedCubeCorners(cube, pose));
        const wraps = !clip || clip.playMode === PLAY_MODES.loop;
        const scale = header.scale / 128;

        const isSpinning = header.rotationMode === SPIN_ROTATION;
        const spins = isSpinning ? Array.from({ length: SPIN_SAMPLES }, (_, step) => (step / SPIN_SAMPLES) * 360) : [0];
        const orbitRadius = isSpinning ? Math.max(...frames.flat().map((corner) => Math.hypot(corner[0], corner[2]))) : 0;
        const spinMargin = (Math.PI / SPIN_SAMPLES) * orbitRadius * scale;

        const footprints = [];
        frames.forEach((corners, index) => {
            const isLastFrame = index === frames.length - 1;
            const nextCorners = isLastFrame && !wraps ? corners : frames[(index + 1) % frames.length];
            const span = [...corners, ...nextCorners];
            const margin = spinMargin + ARC_BULGE * largestDistance(corners, nextCorners) * scale;
            for (const spin of spins) footprints.push(expandBounds(pointBounds(span, header, spin), margin));
        });
        return footprints;
    }

    function assignTiles(cubes, header, grid, footprints = cubes.map((cube) => cubeFootprints(cube, header))) {
        const tiles = [];
        for (let y = 0; y < grid; y++) {
            for (let x = 0; x < grid; x++) tiles.push({ x, y, cubes: [] });
        }
        const cell = (coord) => Math.max(0, Math.min(grid - 1, Math.floor(coord * grid)));

        cubes.forEach((cube, index) => {
            const covered = new Set();
            for (const bounds of footprints[index]) {
                if (bounds.maxX < -1 || bounds.minX > 1 || bounds.maxY < -1 || bounds.minY > 1) continue;
                const left = cell((bounds.minX - TILE_MARGIN) * 0.5 + 0.5);
                const right = cell((bounds.maxX + TILE_MARGIN) * 0.5 + 0.5);
                const top = cell((bounds.maxY + TILE_MARGIN) * -0.5 + 0.5);
                const bottom = cell((bounds.minY - TILE_MARGIN) * -0.5 + 0.5);
                for (let y = top; y <= bottom; y++) {
                    for (let x = left; x <= right; x++) covered.add(y * grid + x);
                }
            }
            covered.forEach((tileIndex) => tiles[tileIndex].cubes.push(cube));
        });
        return tiles;
    }

    function* rankTileGrids(cubes, header, footprints) {
        const overTarget = [];
        for (let grid = 1; grid <= MAX_TILE_GRID; grid++) {
            const tiles = assignTiles(cubes, header, grid, footprints);
            const peak = Math.max(...tiles.map((tile) => tile.cubes.length));
            if (peak <= TARGET_TILE_CUBES) yield grid;
            else if (peak <= MAX_CUBES) overTarget.push({ grid, peak });
        }
        if (overTarget.length === 0) return;

        const lowestPeak = Math.min(...overTarget.map((candidate) => candidate.peak));
        const acceptable = (candidate) => candidate.peak <= lowestPeak * GRID_PEAK_TOLERANCE;
        const preferred = overTarget.filter(acceptable);
        const remaining = overTarget.filter((candidate) => !acceptable(candidate)).sort((a, b) => a.peak - b.peak);
        for (const candidate of [...preferred, ...remaining]) yield candidate.grid;
    }

    function cubeLimitError(cubes, header) {
        const advice = header.rotationMode === SPIN_ROTATION ? ' 회전을 고정으로 바꿔 보세요.' : '';
        return new Error(`큐브 ${cubes.length}개는 ${MAX_TILE_GRID}×${MAX_TILE_GRID} 격자로도 칸당 ${MAX_CUBES}개를 넘습니다.${advice}`);
    }

    function chooseTileGrid(cubes, header, clip = null) {
        const footprints = cubes.map((cube) => cubeFootprints(cube, header, clip));
        const { value: grid } = rankTileGrids(cubes, header, footprints).next();
        if (grid === undefined) throw cubeLimitError(cubes, header);
        return grid;
    }

    function faceRect(face) {
        const x = Math.floor(Math.min(face.u0, face.u1));
        const y = Math.floor(Math.min(face.v0, face.v1));
        const right = Math.ceil(Math.max(face.u0, face.u1));
        const bottom = Math.ceil(Math.max(face.v0, face.v1));
        return { source: face.source, x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
    }

    function rectContains(outer, inner) {
        return (
            outer.source === inner.source &&
            outer.x <= inner.x &&
            outer.y <= inner.y &&
            outer.x + outer.width >= inner.x + inner.width &&
            outer.y + outer.height >= inner.y + inner.height
        );
    }

    function usedRects(cubes) {
        const unique = new Map();
        for (const cube of cubes) {
            for (const face of cube.faces) {
                if (!face) continue;
                const rect = faceRect(face);
                unique.set(`${rect.source},${rect.x},${rect.y},${rect.width},${rect.height}`, rect);
            }
        }
        const largestFirst = [...unique.values()].sort((a, b) => b.width * b.height - a.width * a.height);
        const kept = [];
        for (const rect of largestFirst) {
            if (!kept.some((outer) => rectContains(outer, rect))) kept.push(rect);
        }
        return kept;
    }

    function packShelves(rects, maxWidth, maxHeight) {
        const tallestFirst = [...rects].sort((a, b) => b.height - a.height);
        const placements = [];
        let x = 0;
        let y = 0;
        let shelfHeight = 0;
        let width = 0;
        for (const rect of tallestFirst) {
            if (rect.width > maxWidth) return null;
            if (x + rect.width > maxWidth) {
                x = 0;
                y += shelfHeight;
                shelfHeight = 0;
            }
            if (y + rect.height > maxHeight) return null;
            placements.push({ rect, x, y });
            x += rect.width;
            width = Math.max(width, x);
            shelfHeight = Math.max(shelfHeight, rect.height);
        }
        return { placements, width, height: y + shelfHeight };
    }

    function chooseAtlasLayout(rects, cubeCount) {
        const beside = packShelves(rects, MAX_GLYPH_SIZE - RECORD_WIDTH - 1, MAX_GLYPH_SIZE - 2);
        const below = packShelves(rects, MAX_ATLAS_WIDTH, MAX_GLYPH_SIZE - cubeCount - 2);
        const layouts = [];
        if (beside) {
            const size = Math.max(MIN_GLYPH_SIZE, RECORD_WIDTH + beside.width + 1, Math.max(cubeCount, beside.height) + 2);
            layouts.push({ ...beside, originX: RECORD_WIDTH, originY: 1, size });
        }
        if (below) {
            const size = Math.max(MIN_GLYPH_SIZE, below.width, cubeCount + below.height + 2);
            layouts.push({ ...below, originX: 0, originY: cubeCount + 1, size });
        }
        return layouts.sort((a, b) => a.size - b.size)[0] || null;
    }

    function copyRect(atlas, texture, rect, atlasX, atlasY) {
        for (let row = 0; row < rect.height; row++) {
            const start = ((rect.y + row) * texture.width + rect.x) * 4;
            const line = texture.pixels.subarray(start, start + rect.width * 4);
            atlas.set(line, ((atlasY + row) * atlas.stride + atlasX) * 4);
        }
    }

    // 다른 페이지의 글리프 텍셀은 읽을 수 없어서 타일마다 쓰는 영역을 직접 가져야 한다.
    function buildAtlas(cubes, textures, table = null) {
        const sources = table ? [...textures, table] : textures;
        const tableRect = table && { source: textures.length, x: 0, y: 0, width: table.width, height: table.height };
        const rects = table ? [...usedRects(cubes), tableRect] : usedRects(cubes);
        const layout = chooseAtlasLayout(rects, cubes.length);
        if (!layout) return null;

        const pixels = new Uint8Array(layout.width * layout.height * 4);
        pixels.stride = layout.width;
        for (const { rect, x, y } of layout.placements) copyRect(pixels, sources[rect.source], rect, x, y);

        const moveFace = (face) => {
            if (!face) return null;
            const rect = faceRect(face);
            const { rect: source, x, y } = layout.placements.find((placement) => rectContains(placement.rect, rect));
            const offsetX = x - source.x;
            const offsetY = y - source.y;
            return { ...face, u0: face.u0 + offsetX, v0: face.v0 + offsetY, u1: face.u1 + offsetX, v1: face.v1 + offsetY };
        };
        const tablePlacement = table && layout.placements.find((placement) => placement.rect === tableRect);
        return {
            cubes: cubes.map((cube) => ({ ...cube, faces: cube.faces.map(moveFace) })),
            texture: { x: layout.originX, y: layout.originY, width: layout.width, height: layout.height, pixels },
            size: layout.size,
            tableOrigin: table && [layout.originX + tablePlacement.x, layout.originY + tablePlacement.y],
        };
    }

    function layoutSheet(glyphs, size, baseCodepoint) {
        const columns = Math.ceil(Math.sqrt(glyphs.length));
        const rows = Math.ceil(glyphs.length / columns);
        const width = columns * size;
        const height = rows * size;
        const pixels = new Uint8Array(width * height * 4);
        glyphs.forEach((glyph, index) => {
            const cellX = (index % columns) * size;
            const cellY = Math.floor(index / columns) * size;
            for (let row = 0; row < size; row++) {
                const line = glyph.subarray(row * size * 4, (row + 1) * size * 4);
                pixels.set(line, ((cellY + row) * width + cellX) * 4);
            }
        });

        const chars = glyphs.map((_, index) => String.fromCodePoint(baseCodepoint + index));
        const charRows = [];
        for (let row = 0; row < rows; row++) {
            charRows.push(chars.slice(row * columns, (row + 1) * columns).join('').padEnd(columns, '\0'));
        }
        const spaceCodepoint = baseCodepoint + glyphs.length;
        return { width, height, pixels, charRows, spaceCodepoint, text: chars.join(String.fromCodePoint(spaceCodepoint)) };
    }

    function tileClip(cubes, clip) {
        const usedBones = [...new Set(cubes.map((cube) => cube.bone || 0))].filter(Boolean).sort((a, b) => a - b);
        const localBones = new Map(usedBones.map((bone, index) => [bone, index + 1]));
        return {
            cubes: cubes.map((cube) => (cube.bone ? { ...cube, bone: localBones.get(cube.bone) } : cube)),
            clip: { ...clip, frames: clip.frames.map((frame) => usedBones.map((bone) => frame[bone - 1])) },
        };
    }

    function prepareTile(tile, clip) {
        if (!clip) return { cubes: tile.cubes, clip: null, table: null };
        const local = tileClip(tile.cubes, clip);
        return { ...local, table: local.clip.frames[0].length > 0 ? boneTable(local.clip) : null };
    }

    function animationHeader(clip, atlas) {
        const [tableX, tableY] = atlas.tableOrigin || [0, 0];
        return {
            boneCount: clip.frames[0].length,
            frameCount: clip.frames.length,
            loopsPerCycle: clip.loopsPerCycle,
            playMode: clip.playMode,
            boneFormat: clip.scaled ? BONE_FORMAT_AFFINE : BONE_FORMAT_RIGID,
            tableX,
            tableY,
        };
    }

    function buildGridSheet(cubes, textures, header, baseCodepoint, grid, footprints, clip) {
        const tiles = grid === 1 ? [{ x: 0, y: 0, cubes }] : assignTiles(cubes, header, grid, footprints).filter((tile) => tile.cubes.length > 0);
        if (tiles.length === 0) throw new Error('화면 안에 들어오는 큐브가 없습니다.');

        const prepared = tiles.map((tile) => prepareTile(tile, clip));
        const atlases = prepared.map((tile) => buildAtlas(tile.cubes, textures, tile.table));
        if (atlases.includes(null)) return null;

        const size = Math.max(...atlases.map((atlas) => atlas.size));
        const peakCubes = Math.max(...tiles.map((tile) => tile.cubes.length));
        const tileInfo = (tile) => (grid === 1 ? null : [grid, grid, tile.x, tile.y]);
        const glyphs = atlases.map((atlas, index) => {
            const glyphHeader = clip ? { ...header, animation: animationHeader(prepared[index].clip, atlas) } : header;
            return encodeGlyph(atlas.cubes, atlas.texture, glyphHeader, tileInfo(tiles[index]), size).pixels;
        });
        if (grid > 1) return { ...layoutSheet(glyphs, size, baseCodepoint), grid, tileCount: tiles.length, peakCubes };

        const char = String.fromCodePoint(baseCodepoint);
        return { width: size, height: size, pixels: glyphs[0], charRows: [char], spaceCodepoint: null, text: char, grid, tileCount: 1, peakCubes };
    }

    function buildSheet(unsortedCubes, textures, header, baseCodepoint, clip = null) {
        const cubes = [...unsortedCubes].sort((a, b) => (a.bone || 0) - (b.bone || 0));
        const footprints = cubes.map((cube) => cubeFootprints(cube, header, clip));

        let triedGrid = false;
        for (const grid of rankTileGrids(cubes, header, footprints)) {
            triedGrid = true;
            const sheet = buildGridSheet(cubes, textures, header, baseCodepoint, grid, footprints, clip);
            if (sheet) return sheet;
        }
        if (!triedGrid) throw cubeLimitError(cubes, header);
        throw new Error(`${MAX_TILE_GRID}×${MAX_TILE_GRID} 격자로도 칸 하나에 필요한 텍스처가 글리프에 들어가지 않습니다. 큰 면의 UV를 줄이거나, 회전을 고정으로 바꾸거나, 샘플링 fps를 낮춰 보세요.`);
    }

    function crc32(bytes) {
        let crc = ~0;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) {
                crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
            }
        }
        return ~crc >>> 0;
    }

    function concatBytes(chunks) {
        const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }

    function uint32(value) {
        return Uint8Array.of(value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
    }

    function pngChunk(type, body) {
        const typed = concatBytes([new TextEncoder().encode(type), body]);
        return concatBytes([uint32(body.length), typed, uint32(crc32(typed))]);
    }

    async function zlibCompress(bytes) {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    // 캔버스 저장은 알파를 프리멀티플라이해 알파 0 텍셀의 RGB 를 지운다. 코너 마커가 그 RGB 에 들어 있다.
    async function encodePng(width, height, pixels) {
        const stride = width * 4;
        const raw = new Uint8Array((stride + 1) * height);
        for (let y = 0; y < height; y++) {
            raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
        }
        const header = concatBytes([uint32(width), uint32(height), Uint8Array.of(8, 6, 0, 0, 0)]);
        return concatBytes([
            Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
            pngChunk('IHDR', header),
            pngChunk('IDAT', await zlibCompress(raw)),
            pngChunk('IEND', new Uint8Array(0)),
        ]);
    }

    function fontDefinition(name, charRows, height, ascent, spaceCodepoint) {
        const providers = [{ type: 'bitmap', file: `${FONT_NAMESPACE}:font/${name}.png`, height, ascent, chars: charRows }];
        if (spaceCodepoint !== null) {
            providers.push({ type: 'space', advances: { [String.fromCodePoint(spaceCodepoint)]: -(height + 1) } });
        }
        return { providers };
    }

    function escapeText(text) {
        return Array.from(text, (char) => `\\u${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('');
    }

    function headerFromForm(form) {
        const angleByte = (degrees) => Math.round((((degrees % 360) + 360) % 360) / 360 * 256) & 0xff;
        return {
            rotationMode: form.rotation_mode === 'spin' ? 1 : 0,
            lightMask: 0b111111,
            ambient: Math.round(form.ambient * 255),
            offset: [0, 0, 0],
            scale: Math.min(255, Math.round(form.scale * 128)),
            yaw: angleByte(form.yaw),
            pitch: angleByte(form.pitch),
            roll: angleByte(form.roll),
            spin: Math.max(0, Math.min(255, Math.round(240 / form.spin_seconds))),
        };
    }

    function usedTextures(cubes) {
        const textures = new Set();
        for (const cube of cubes) {
            for (const name of FACE_ORDER) {
                const texture = cube.faces[name].getTexture();
                if (texture) textures.add(texture);
            }
        }
        if (textures.size === 0) throw new Error('큐브 면에 적용된 텍스처가 없습니다.');
        return [...textures];
    }

    function readTexture(texture) {
        const width = texture.width;
        const height = texture.display_height;
        const image = texture.canvas.getContext('2d').getImageData(0, 0, width, height);
        return { width, height, pixels: new Uint8Array(image.data.buffer) };
    }

    function faceRecord(face, sources) {
        const texture = face.getTexture();
        if (!texture) return null;
        const scaleU = texture.width / texture.getUVWidth();
        const scaleV = texture.display_height / texture.getUVHeight();
        const [u0, v0, u1, v1] = [face.uv[0] * scaleU, face.uv[1] * scaleV, face.uv[2] * scaleU, face.uv[3] * scaleV];
        if (Math.min(u0, v0, u1, v1) < 0 || Math.max(u0, u1) > texture.width || Math.max(v0, v1) > texture.display_height) {
            throw new Error('텍스처 범위를 벗어난 UV가 있습니다.');
        }
        return { source: sources.indexOf(texture), u0, v0, u1, v1, rotation: Math.round((face.rotation || 0) / 90) & 3 };
    }

    function samplePoses(groups, animation, times) {
        const worldMatrix = (group) => [...group.mesh.matrixWorld.elements];
        const timelineTime = Timeline.time;
        try {
            Animator.showDefaultPose();
            const rest = new Map(groups.map((group) => [group, worldMatrix(group)]));
            return times.map((time) => {
                Timeline.time = time;
                Animator.showDefaultPose(true);
                Animator.stackAnimations([animation], false);
                Canvas.scene.updateMatrixWorld();
                return groups.map((group) => poseDelta(worldMatrix(group), rest.get(group)));
            });
        } finally {
            Timeline.time = timelineTime;
            if (Modes.animate) Animator.preview();
            else Animator.showDefaultPose();
        }
    }

    function sampleClip(animation, fps) {
        const timing = clipTiming(animation.length, fps, animation.loop);
        const sampled = samplePoses(Group.all, animation, timing.times);
        const movedIndices = Group.all.map((_, index) => index).filter((index) => sampled.some((frame) => !isRestPose(frame[index])));
        return {
            groups: movedIndices.map((index) => Group.all[index]),
            frames: sampled.map((frame) => movedIndices.map((index) => frame[index])),
            loopsPerCycle: timing.loopsPerCycle,
            playMode: timing.playMode,
            scaled: sampled.some((frame) => movedIndices.some((index) => frame[index].scaled)),
        };
    }

    function collectClip(form) {
        const animation = Animation.all.find((candidate) => candidate.uuid === form.clip);
        if (!animation) return null;
        if (animation.length <= 0) throw new Error('애니메이션 길이가 0입니다.');
        const clip = sampleClip(animation, form.fps);
        return clip.groups.length > 0 ? clip : null;
    }

    function collectSheet(form) {
        const cubes = Cube.all.filter((cube) => cube.export && cube.visibility);
        if (cubes.length === 0) throw new Error('내보낼 큐브가 없습니다.');

        const sources = usedTextures(cubes);
        const clip = collectClip(form);
        const boneOf = (cube) => (clip ? clip.groups.indexOf(cube.parent) + 1 : 0);
        const rawBoxes = cubes.map((cube) => ({ ...worldBox(cube), bone: boneOf(cube) }));
        const bounds = modelBounds(rawBoxes, clip);
        const boxes = normalizeBoxes(rawBoxes, bounds);
        const records = boxes.map((box, index) => ({
            ...box,
            faces: FACE_ORDER.map((name) => faceRecord(cubes[index].faces[name], sources)),
        }));
        const sheet = buildSheet(records, sources.map(readTexture), headerFromForm(form), parseInt(form.codepoint, 16), clip && normalizeClip(clip, bounds));
        return { ...sheet, clip };
    }

    function savedFileName(path) {
        return path.split(/[\\/]/).pop().replace(/\.png$/i, '');
    }

    function exportSummary(sheet) {
        const lines = [`${sheet.grid}×${sheet.grid} 격자, 글리프 ${sheet.tileCount}개`, escapeText(sheet.text)];
        if (sheet.clip) lines.push(`본 ${sheet.clip.groups.length}개, ${sheet.clip.frames.length}프레임`);
        if (sheet.peakCubes > TARGET_TILE_CUBES) {
            lines.push(`칸당 큐브가 최대 ${sheet.peakCubes}개로 권장치 ${TARGET_TILE_CUBES}개를 넘어 프레임이 떨어질 수 있습니다.`);
        }
        return lines;
    }

    function showExportResult(sheet) {
        new Dialog({
            id: 'texttomodel_result',
            title: 'TextToModel 내보내기 완료',
            lines: exportSummary(sheet),
            buttons: ['글리프 복사', '닫기'],
            confirmIndex: 0,
            cancelIndex: 1,
            onButton(index) {
                if (index === 0) Clipbench.setText(sheet.text);
            },
        }).show();
    }

    async function exportGlyph(form) {
        const name = (Project.name || 'model').toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
        const sheet = collectSheet(form);
        const png = await encodePng(sheet.width, sheet.height, sheet.pixels);
        const binary = Array.from(png, (byte) => String.fromCharCode(byte)).join('');

        Blockbench.export(
            {
                resource_id: 'texttomodel',
                type: 'TextToModel Glyph',
                extensions: ['png'],
                name,
                savetype: 'image',
                content: `data:image/png;base64,${btoa(binary)}`,
            },
            (path) => {
                const savedName = savedFileName(path);
                if (!VALID_RESOURCE_NAME.test(savedName)) {
                    Blockbench.showMessageBox({
                        title: 'TextToModel',
                        message: `'${savedName}'은 마인크래프트 리소스 이름으로 쓸 수 없습니다. 영문 소문자, 숫자, _ . - 만 사용해 주세요.`,
                        icon: 'warning',
                    });
                }
                const font = fontDefinition(savedName, sheet.charRows, form.height, form.ascent, sheet.spaceCodepoint);
                Blockbench.export(
                    {
                        resource_id: 'texttomodel',
                        type: 'TextToModel Font',
                        extensions: ['json'],
                        name: savedName,
                        content: JSON.stringify(font, null, 2),
                    },
                    () => showExportResult(sheet)
                );
            }
        );
    }

    function clipOptions() {
        const options = { none: '없음' };
        for (const animation of Animation.all) options[animation.uuid] = animation.name;
        return options;
    }

    function openExportDialog() {
        const selectedClip = Animation.selected || Animation.all[0];
        new Dialog({
            id: 'texttomodel_export',
            title: `TextToModel 내보내기 (v${PLUGIN_VERSION})`,
            form: {
                codepoint: { label: '코드포인트 (16진수)', type: 'text', value: 'E000' },
                height: { label: '표시 높이', type: 'number', value: 64, min: 1, step: 1 },
                ascent: { label: 'Ascent', type: 'number', value: 48, step: 1 },
                clip: { label: '애니메이션', type: 'select', value: selectedClip ? selectedClip.uuid : 'none', options: clipOptions() },
                fps: { label: '샘플링 fps', type: 'number', value: 20, min: 1, max: 60, step: 1 },
                rotation_mode: { label: '회전', type: 'select', value: selectedClip ? 'fixed' : 'spin', options: { fixed: '고정', spin: 'Y축 자동 회전' } },
                yaw: { label: 'Yaw (도)', type: 'number', value: 45 },
                pitch: { label: 'Pitch (도)', type: 'number', value: 22.5 },
                roll: { label: 'Roll (도)', type: 'number', value: 0 },
                spin_seconds: { label: '1회전 시간 (초)', type: 'number', value: 8, min: 1 },
                scale: { label: '스케일', type: 'number', value: 1, min: 0.01, step: 0.1 },
                ambient: { label: '주변광', type: 'number', value: 0.3, min: 0, max: 1, step: 0.05 },
            },
            onConfirm(form) {
                exportGlyph(form).catch((error) => {
                    Blockbench.showMessageBox({ title: 'TextToModel', message: error.message, icon: 'error' });
                });
            },
        }).show();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            assignTiles,
            boneTable,
            applyLinear,
            clipTiming,
            cubeFootprints,
            modelBounds,
            normalizeClip,
            poseDelta,
            buildSheet,
            chooseTileGrid,
            encodeGlyph,
            encodePng,
            escapeText,
            exportSummary,
            faceRecord,
            fontDefinition,
            buildAtlas,
            layoutSheet,
            normalizeBoxes,
            quaternionFromEuler,
            rotateVector,
            savedFileName,
            viewBounds,
            viewQuaternion,
            worldBox,
        };
    }

    if (typeof Plugin === 'undefined') return;

    let exportAction;

    Plugin.register('texttomodel', {
        title: 'TextToModel',
        author: 'bestnuts',
        description: 'Generic Model 큐브를 코어 셰이더용 텍스트 글리프로 내보냅니다.',
        icon: 'text_fields',
        version: PLUGIN_VERSION,
        variant: 'desktop',
        min_version: '5.2.0',
        onload() {
            exportAction = new Action('export_texttomodel', {
                name: 'TextToModel 글리프 내보내기',
                icon: 'text_fields',
                condition: () => Format && Format.id === 'free',
                click: openExportDialog,
            });
            MenuBar.addAction(exportAction, 'file.export');
        },
        onunload() {
            exportAction.delete();
        },
    });
})();
