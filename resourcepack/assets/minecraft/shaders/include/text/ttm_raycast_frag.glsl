#ifndef TTM_RAYCAST_FRAG_GLSL
#define TTM_RAYCAST_FRAG_GLSL

#include <minecraft:text/ttm_format_lib.glsl>

struct TtmHit {
    float rayLength;
    vec4 color;
    vec3 ws_normal;
};

vec3 ttmRotate(vec4 quaternion, vec3 point) {
    return point + 2.0f * cross(quaternion.xyz, cross(quaternion.xyz, point) + quaternion.w * point);
}

vec3 ttmAxisNormal(vec3 tValues, float t, vec3 signs) {
    if (t == tValues.x) return vec3(signs.x, 0.0f, 0.0f);
    if (t == tValues.y) return vec3(0.0f, signs.y, 0.0f);
    return vec3(0.0f, 0.0f, signs.z);
}

bool ttmIntersectBox(vec3 ls_origin, vec3 ls_direction, vec3 halfSize, out float tNear, out vec3 ls_normalNear, out float tFar, out vec3 ls_normalFar) {
    vec3 safeDirection = mix(ls_direction, vec3(TTM_RAY_EPSILON), lessThan(abs(ls_direction), vec3(TTM_RAY_EPSILON)));
    vec3 inverseDirection = 1.0f / safeDirection;
    vec3 t0 = (-halfSize - ls_origin) * inverseDirection;
    vec3 t1 = (halfSize - ls_origin) * inverseDirection;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);

    tNear = max(tMin.x, max(tMin.y, tMin.z));
    tFar = min(tMax.x, min(tMax.y, tMax.z));
    ls_normalNear = ttmAxisNormal(tMin, tNear, -sign(safeDirection));
    ls_normalFar = ttmAxisNormal(tMax, tFar, sign(safeDirection));
    return tNear <= tFar && tFar >= 0.0f;
}

int ttmFaceIndex(vec3 ls_normal) {
    if (abs(ls_normal.x) > 0.5f) return ls_normal.x > 0.0f ? 0 : 1;
    if (abs(ls_normal.y) > 0.5f) return ls_normal.y > 0.0f ? 2 : 3;
    return ls_normal.z > 0.0f ? 4 : 5;
}

vec2 ttmFaceCoord(int face, vec3 boxCoord) {
    if (face == 0) return vec2(1.0f - boxCoord.z, 1.0f - boxCoord.y);
    if (face == 1) return vec2(boxCoord.z, 1.0f - boxCoord.y);
    if (face == 2) return vec2(boxCoord.x, boxCoord.z);
    if (face == 3) return vec2(boxCoord.x, 1.0f - boxCoord.z);
    if (face == 4) return vec2(boxCoord.x, 1.0f - boxCoord.y);
    return vec2(1.0f - boxCoord.x, 1.0f - boxCoord.y);
}

vec2 ttmRotateFaceCoord(vec2 coord, int rotation) {
    if (rotation == 1) return vec2(coord.y, 1.0f - coord.x);
    if (rotation == 2) return vec2(1.0f) - coord;
    if (rotation == 3) return vec2(1.0f - coord.y, coord.x);
    return coord;
}

vec2 ttmDecodeFacePixels(ivec4 word) {
    return vec2((word.r & 0x3F) << 8 | word.g, (word.b & 0x3F) << 8 | word.a) / 64.0f;
}

bool ttmSampleFace(ivec2 texelRow, int faceMask, vec3 ls_normal, vec3 ls_point, vec3 halfSize, out vec4 color) {
    color = vec4(0.0f);
    int face = ttmFaceIndex(ls_normal);
    if ((faceMask & (1 << face)) == 0) return false;

    ivec4 firstWord = formatWord(texelRow + ivec2(6 + face * 2, 0));
    ivec4 secondWord = formatWord(texelRow + ivec2(7 + face * 2, 0));
    int rotation = firstWord.r >> 6;
    vec2 pixelStart = ttmDecodeFacePixels(firstWord);
    vec2 pixelEnd = ttmDecodeFacePixels(secondWord);

    vec3 boxCoord = clamp(ls_point / (halfSize * 2.0f + TTM_RAY_EPSILON) + 0.5f, 0.0f, 1.0f);
    vec2 coord = ttmRotateFaceCoord(ttmFaceCoord(face, boxCoord), rotation);
    vec2 pixel = clamp(mix(pixelStart, pixelEnd, coord), min(pixelStart, pixelEnd), max(pixelStart, pixelEnd) - 0.001f);

    color = texelFetch(Sampler0, ttmTexelOrigin + ttmModel.ba + ivec2(floor(pixel)), 0);
    return color.a >= TTM_ALPHA_CUTOUT;
}

float ttmShade(vec3 vs_normal) {
    int mask = ttmModel.g;
    float east = (mask & 1) != 0 ? 0.6f : ttmAmbient;
    float west = (mask & 2) != 0 ? 0.6f : ttmAmbient;
    float south = (mask & 4) != 0 ? 0.8f : ttmAmbient;
    float north = (mask & 8) != 0 ? 0.8f : ttmAmbient;
    float up = (mask & 16) != 0 ? 1.0f : ttmAmbient;
    float down = (mask & 32) != 0 ? 0.5f : ttmAmbient;

    vec3 weight = vs_normal * vs_normal;
    return weight.x * (vs_normal.x > 0.0f ? east : west)
        + weight.z * (vs_normal.z > 0.0f ? south : north)
        + weight.y * (vs_normal.y > 0.0f ? up : down);
}

bool ttmTraceCube(int index, vec3 ws_rayOrigin, vec3 ws_rayDirection, inout TtmHit hit) {
    ivec2 texelRow = ttmTexelOrigin + ivec2(0, index + 1);
    ivec4 head = formatWord(texelRow);
    if (head.r != TTM_CUBE_TAG) return false;

    ivec4 a = formatWord(texelRow + ivec2(1, 0));
    ivec4 b = formatWord(texelRow + ivec2(2, 0));
    ivec4 c = formatWord(texelRow + ivec2(3, 0));
    vec3 ws_center = vec3(formatSnorm16(a.r, a.g), formatSnorm16(a.b, a.a), formatSnorm16(b.r, b.g));
    vec3 halfSize = vec3(formatUnorm16(b.b, b.a), formatUnorm16(c.r, c.g), formatUnorm16(c.b, c.a));

    vec3 ws_toCenter = ws_center - ws_rayOrigin;
    float along = dot(ws_toCenter, ws_rayDirection);
    if (dot(ws_toCenter, ws_toCenter) - along * along > dot(halfSize, halfSize) * 1.001f) return false;

    ivec4 d = formatWord(texelRow + ivec2(4, 0));
    ivec4 e = formatWord(texelRow + ivec2(5, 0));
    vec4 quaternion = normalize(vec4(formatSnorm16(d.r, d.g), formatSnorm16(d.b, d.a), formatSnorm16(e.r, e.g), formatSnorm16(e.b, e.a)));
    vec4 conjugate = vec4(-quaternion.xyz, quaternion.w);

    vec3 ls_origin = ttmRotate(conjugate, ws_rayOrigin - ws_center);
    vec3 ls_direction = ttmRotate(conjugate, ws_rayDirection);

    float tNear;
    float tFar;
    vec3 ls_normalNear;
    vec3 ls_normalFar;
    if (!ttmIntersectBox(ls_origin, ls_direction, halfSize, tNear, ls_normalNear, tFar, ls_normalFar)) return false;
    if (tNear >= hit.rayLength) return false;

    vec4 color;
    if (ttmSampleFace(texelRow, head.g, ls_normalNear, ls_origin + ls_direction * tNear, halfSize, color)) {
        hit = TtmHit(tNear, color, ttmRotate(quaternion, ls_normalNear));
        return true;
    }
    if (tFar < hit.rayLength && ttmSampleFace(texelRow, head.g, ls_normalFar, ls_origin + ls_direction * tFar, halfSize, color)) {
        hit = TtmHit(tFar, color, ttmRotate(quaternion, ls_normalFar));
        return true;
    }
    return false;
}

bool ttmIsTileOwner(vec2 vs_quad) {
    if (ttmTile.r == 0 || ttmTile.g == 0) return true;

    vec2 coord = vs_quad * vec2(0.5f, -0.5f) + 0.5f;
    ivec2 tile = ivec2(floor(coord * vec2(ttmTile.rg)));
    return formatIsEqual(clamp(tile, ivec2(0), ttmTile.rg - 1), ttmTile.ba);
}

bool ttmTrace(vec2 vs_quad, out vec4 color) {
    color = vec4(0.0f);
    if (!ttmIsTileOwner(vs_quad)) return false;

    mat3 viewToWorld = transpose(ttmWorldToView);
    vec3 ws_rayOrigin = viewToWorld * ((vec3(vs_quad, 2.0f) - ttmPlacement.xyz) / ttmPlacement.w);
    vec3 ws_rayDirection = viewToWorld * vec3(0.0f, 0.0f, -1.0f);

    TtmHit hit = TtmHit(TTM_FAR_DISTANCE, vec4(0.0f), vec3(0.0f));
    bool found = false;
    for (int i = 0; i < ttmModel.r; i++) {
        found = ttmTraceCube(i, ws_rayOrigin, ws_rayDirection, hit) || found;
    }
    if (!found) return false;

    color = vec4(hit.color.rgb * ttmShade(ttmWorldToView * hit.ws_normal), hit.color.a);
    return true;
}

#endif
