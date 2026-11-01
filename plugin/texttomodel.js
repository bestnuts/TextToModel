(function () {
    const RECORD_WIDTH = 19;
    const MIN_GLYPH_SIZE = 32;
    const MAX_GLYPH_SIZE = 256;
    const MAX_CUBES = 64;
    const MAX_UV = 16383 / 64;
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

    function quaternionFromEuler(degrees) {
        const axis = (index) => {
            const half = (degrees[index] * Math.PI) / 360;
            const q = [0, 0, 0, Math.cos(half)];
            q[index] = Math.sin(half);
            return q;
        };
        return multiplyQuaternions(multiplyQuaternions(axis(2), axis(1)), axis(0));
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

    function normalizeBoxes(boxes) {
        const corners = boxes.flatMap(boxCorners);
        const min = [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis])));
        const max = [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis])));
        const middle = min.map((value, i) => (value + max[i]) / 2);
        const radius = Math.max(...corners.map((corner) => Math.hypot(...corner.map((value, i) => value - middle[i]))));
        return boxes.map((box) => ({
            center: box.center.map((value, i) => (value - middle[i]) / radius),
            half: box.half.map((value) => value / radius),
            quat: box.quat,
        }));
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

    function encodeGlyph(cubes, texture, header) {
        if (cubes.length === 0) throw new Error('내보낼 큐브가 없습니다.');
        if (cubes.length > MAX_CUBES) throw new Error(`큐브는 최대 ${MAX_CUBES}개입니다. (현재 ${cubes.length}개)`);

        const size = Math.max(MIN_GLYPH_SIZE, RECORD_WIDTH + texture.width, Math.max(cubes.length, texture.height) + 2);
        if (size > MAX_GLYPH_SIZE) throw new Error(`글리프가 ${MAX_GLYPH_SIZE}을 넘습니다. 텍스처를 줄여 주세요. (현재 ${size})`);

        const pixels = new Uint8Array(size * size * 4);
        const put = (x, y, bytes) => pixels.set(bytes, (y * size + x) * 4);

        const corners = [[0, 0], [0, size - 1], [size - 1, size - 1], [size - 1, 0]];
        corners.forEach(([x, y], index) => put(x, y, [MARKER | index, size - 1, size - 1, 0]));

        put(1, 0, [0x54, 0x54, 0x4d, VERSION]);
        put(2, 0, [header.rotationMode, 0, header.lightMask, header.ambient]);
        put(3, 0, [header.offset[0] & 0xff, header.offset[1] & 0xff, header.offset[2] & 0xff, header.scale]);
        put(4, 0, [header.yaw, header.pitch, header.roll, header.spin]);
        put(5, 0, [cubes.length, 0, RECORD_WIDTH, 1]);
        put(6, 0, [texture.width, texture.height, 0, 0]);

        cubes.forEach((cube, index) => put(0, index + 1, cubeRecord(cube)));
        for (let y = 0; y < texture.height; y++) {
            const start = y * texture.width * 4;
            put(RECORD_WIDTH, y + 1, texture.pixels.subarray(start, start + texture.width * 4));
        }
        return { size, pixels };
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

    function adler32(bytes) {
        let a = 1;
        let b = 0;
        for (const byte of bytes) {
            a = (a + byte) % 65521;
            b = (b + a) % 65521;
        }
        return ((b << 16) | a) >>> 0;
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

    function zlibStored(bytes) {
        const chunks = [Uint8Array.of(0x78, 0x01)];
        for (let offset = 0; offset < bytes.length; offset += 0xffff) {
            const length = Math.min(0xffff, bytes.length - offset);
            const final = offset + length >= bytes.length ? 1 : 0;
            chunks.push(Uint8Array.of(final, length & 0xff, length >> 8, ~length & 0xff, (~length >> 8) & 0xff));
            chunks.push(bytes.subarray(offset, offset + length));
        }
        chunks.push(uint32(adler32(bytes)));
        return concatBytes(chunks);
    }

    // 캔버스 저장은 알파를 프리멀티플라이해 알파 0 텍셀의 RGB 를 지운다. 코너 마커가 그 RGB 에 들어 있다.
    function encodePng(size, pixels) {
        const stride = size * 4;
        const raw = new Uint8Array((stride + 1) * size);
        for (let y = 0; y < size; y++) {
            raw.set(pixels.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
        }
        const header = concatBytes([uint32(size), uint32(size), Uint8Array.of(8, 6, 0, 0, 0)]);
        return concatBytes([
            Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
            pngChunk('IHDR', header),
            pngChunk('IDAT', zlibStored(raw)),
            pngChunk('IEND', new Uint8Array(0)),
        ]);
    }

    function fontDefinition(name, codepoint, height, ascent) {
        return {
            providers: [
                {
                    type: 'bitmap',
                    file: `${FONT_NAMESPACE}:font/${name}.png`,
                    height,
                    ascent,
                    chars: [String.fromCodePoint(codepoint)],
                },
            ],
        };
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

    function usedTexture(cubes) {
        const textures = new Set();
        for (const cube of cubes) {
            for (const name of FACE_ORDER) {
                const texture = cube.faces[name].getTexture();
                if (texture) textures.add(texture);
            }
        }
        if (textures.size === 0) throw new Error('큐브 면에 적용된 텍스처가 없습니다.');
        if (textures.size > 1) throw new Error(`텍스처는 1장만 지원합니다. (현재 ${textures.size}장)`);
        return [...textures][0];
    }

    function readTexture(texture) {
        const width = texture.width;
        const height = texture.display_height;
        const image = texture.canvas.getContext('2d').getImageData(0, 0, width, height);
        return { width, height, pixels: new Uint8Array(image.data.buffer) };
    }

    function faceRecord(face, texture) {
        if (!face.getTexture()) return null;
        const scaleU = texture.width / texture.getUVWidth();
        const scaleV = texture.display_height / texture.getUVHeight();
        const [u0, v0, u1, v1] = [face.uv[0] * scaleU, face.uv[1] * scaleV, face.uv[2] * scaleU, face.uv[3] * scaleV];
        if (Math.min(u0, v0, u1, v1) < 0 || Math.max(u0, v0, u1, v1) > MAX_UV) {
            throw new Error('텍스처 범위를 벗어난 UV가 있습니다.');
        }
        return { u0, v0, u1, v1, rotation: Math.round((face.rotation || 0) / 90) & 3 };
    }

    function collectGlyph(form) {
        const cubes = Cube.all.filter((cube) => cube.export && cube.visibility);
        if (cubes.length === 0) throw new Error('내보낼 큐브가 없습니다.');

        const texture = usedTexture(cubes);
        const boxes = normalizeBoxes(cubes.map(worldBox));
        const records = boxes.map((box, index) => ({
            ...box,
            faces: FACE_ORDER.map((name) => faceRecord(cubes[index].faces[name], texture)),
        }));
        return encodeGlyph(records, readTexture(texture), headerFromForm(form));
    }

    function savedFileName(path) {
        return path.split(/[\\/]/).pop().replace(/\.png$/i, '');
    }

    function exportGlyph(form) {
        const name = (Project.name || 'model').toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
        const { size, pixels } = collectGlyph(form);
        const png = encodePng(size, pixels);
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
                const font = fontDefinition(savedName, parseInt(form.codepoint, 16), form.height, form.ascent);
                Blockbench.export({
                    resource_id: 'texttomodel',
                    type: 'TextToModel Font',
                    extensions: ['json'],
                    name: savedName,
                    content: JSON.stringify(font, null, 2),
                });
            }
        );
    }

    function openExportDialog() {
        new Dialog({
            id: 'texttomodel_export',
            title: 'TextToModel 내보내기',
            form: {
                codepoint: { label: '코드포인트 (16진수)', type: 'text', value: 'E000' },
                height: { label: '표시 높이', type: 'number', value: 64, min: 1, step: 1 },
                ascent: { label: 'Ascent', type: 'number', value: 48, step: 1 },
                rotation_mode: { label: '회전', type: 'select', value: 'spin', options: { fixed: '고정', spin: 'Y축 자동 회전' } },
                yaw: { label: 'Yaw (도)', type: 'number', value: 45 },
                pitch: { label: 'Pitch (도)', type: 'number', value: 22.5 },
                roll: { label: 'Roll (도)', type: 'number', value: 0 },
                spin_seconds: { label: '1회전 시간 (초)', type: 'number', value: 8, min: 1 },
                scale: { label: '스케일', type: 'number', value: 1, min: 0.01, step: 0.1 },
                ambient: { label: '주변광', type: 'number', value: 0.3, min: 0, max: 1, step: 0.05 },
            },
            onConfirm(form) {
                try {
                    exportGlyph(form);
                } catch (error) {
                    Blockbench.showMessageBox({ title: 'TextToModel', message: error.message, icon: 'error' });
                }
            },
        }).show();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { encodeGlyph, encodePng, normalizeBoxes, worldBox, quaternionFromEuler, rotateVector, savedFileName, fontDefinition };
    }

    if (typeof Plugin === 'undefined') return;

    let exportAction;

    Plugin.register('texttomodel', {
        title: 'TextToModel',
        author: 'bestnuts',
        description: 'Generic Model 큐브를 코어 셰이더용 텍스트 글리프로 내보냅니다.',
        icon: 'text_fields',
        version: '0.1.0',
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
