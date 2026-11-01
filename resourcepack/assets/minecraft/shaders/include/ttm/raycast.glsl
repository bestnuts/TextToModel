#ifndef TTM_RAYCAST_GLSL
#define TTM_RAYCAST_GLSL

#include <minecraft:ttm/format.glsl>

// 이 파일을 불러오기 전에 ttmOrigin, ttmModel, ttmRotation, ttmAmbient 입력을 선언해야 한다.

#define TTM_RAY_EPSILON 1e-6
#define TTM_ALPHA_CUTOUT 0.1

struct TtmHit {
    float distance;
    vec4 color;
    vec3 normal;
};

float ttmSnorm16(int high, int low) {
    int value = (high << 8) | low;
    return float(value >= 32768 ? value - 65536 : value) / 32767.0;
}

float ttmUnorm16(int high, int low) {
    return float((high << 8) | low) / 65535.0;
}

vec3 ttmRotate(vec4 quaternion, vec3 point) {
    return point + 2.0 * cross(quaternion.xyz, cross(quaternion.xyz, point) + quaternion.w * point);
}

vec3 ttmAxisNormal(vec3 tValues, float t, vec3 signs) {
    if (t == tValues.x) return vec3(signs.x, 0.0, 0.0);
    if (t == tValues.y) return vec3(0.0, signs.y, 0.0);
    return vec3(0.0, 0.0, signs.z);
}

// 슬랩 테스트. 진입점과 진출점을 모두 돌려주어, 앞면이 비어 있으면 안쪽 면을 볼 수 있게 한다.
bool ttmIntersectBox(vec3 origin, vec3 direction, vec3 halfSize, out float tNear, out vec3 normalNear, out float tFar, out vec3 normalFar) {
    vec3 safe = mix(direction, vec3(TTM_RAY_EPSILON), lessThan(abs(direction), vec3(TTM_RAY_EPSILON)));
    vec3 inverse = 1.0 / safe;
    vec3 t0 = (-halfSize - origin) * inverse;
    vec3 t1 = (halfSize - origin) * inverse;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);

    tNear = max(tMin.x, max(tMin.y, tMin.z));
    tFar = min(tMax.x, min(tMax.y, tMax.z));
    normalNear = ttmAxisNormal(tMin, tNear, -sign(safe));
    normalFar = ttmAxisNormal(tMax, tFar, sign(safe));
    return tNear <= tFar && tFar >= 0.0;
}

// 면 순서: 동, 서, 상, 하, 남, 북
int ttmFaceIndex(vec3 normal) {
    if (abs(normal.x) > 0.5) return normal.x > 0.0 ? 0 : 1;
    if (abs(normal.y) > 0.5) return normal.y > 0.0 ? 2 : 3;
    return normal.z > 0.0 ? 4 : 5;
}

// 면 위의 점을 마인크래프트 UV 방향의 0~1 좌표로 바꾼다.
vec2 ttmFaceCoord(int face, vec3 point) {
    if (face == 0) return vec2(1.0 - point.z, 1.0 - point.y);
    if (face == 1) return vec2(point.z, 1.0 - point.y);
    if (face == 2) return vec2(point.x, point.z);
    if (face == 3) return vec2(point.x, 1.0 - point.z);
    if (face == 4) return vec2(point.x, 1.0 - point.y);
    return vec2(1.0 - point.x, 1.0 - point.y);
}

vec2 ttmRotateFaceCoord(vec2 coord, int rotation) {
    if (rotation == 1) return vec2(coord.y, 1.0 - coord.x);
    if (rotation == 2) return vec2(1.0) - coord;
    if (rotation == 3) return vec2(1.0 - coord.y, coord.x);
    return coord;
}

bool ttmSampleFace(ivec2 row, int faceMask, vec3 normal, vec3 point, vec3 halfSize, out vec4 color) {
    color = vec4(0.0);
    int face = ttmFaceIndex(normal);
    if ((faceMask & (1 << face)) == 0) return false;

    ivec4 first = ttmWord(row + ivec2(6 + face * 2, 0));
    ivec4 second = ttmWord(row + ivec2(7 + face * 2, 0));
    int rotation = first.r >> 6;
    vec2 uv0 = vec2((first.r & 0x3F) << 8 | first.g, (first.b & 0x3F) << 8 | first.a) / 64.0;
    vec2 uv1 = vec2((second.r & 0x3F) << 8 | second.g, (second.b & 0x3F) << 8 | second.a) / 64.0;

    vec2 coord = ttmFaceCoord(face, clamp(point / (halfSize * 2.0 + TTM_RAY_EPSILON) + 0.5, 0.0, 1.0));
    vec2 uv = mix(uv0, uv1, ttmRotateFaceCoord(coord, rotation));
    uv = clamp(uv, min(uv0, uv1), max(uv0, uv1) - 0.001);

    color = texelFetch(Sampler0, ttmOrigin + ttmModel.ba + ivec2(floor(uv)), 0);
    return color.a >= TTM_ALPHA_CUTOUT;
}

// 켠 방향은 바닐라 면 밝기(상 1.0, 하 0.5, 남북 0.8, 동서 0.6), 끈 방향은 주변광 밝기를 쓴다.
// 마스크 비트 순서: 동, 서, 남, 북, 상, 하
float ttmShade(vec3 normal) {
    int mask = ttmModel.g;
    float east = (mask & 1) != 0 ? 0.6 : ttmAmbient;
    float west = (mask & 2) != 0 ? 0.6 : ttmAmbient;
    float south = (mask & 4) != 0 ? 0.8 : ttmAmbient;
    float north = (mask & 8) != 0 ? 0.8 : ttmAmbient;
    float up = (mask & 16) != 0 ? 1.0 : ttmAmbient;
    float down = (mask & 32) != 0 ? 0.5 : ttmAmbient;

    vec3 weight = normal * normal;
    return weight.x * (normal.x > 0.0 ? east : west)
        + weight.z * (normal.z > 0.0 ? south : north)
        + weight.y * (normal.y > 0.0 ? up : down);
}

bool ttmTraceCube(int index, vec3 rayOrigin, vec3 rayDirection, inout TtmHit hit) {
    ivec2 row = ttmOrigin + ivec2(0, index + 1);
    ivec4 head = ttmWord(row);
    if (head.r != TTM_CUBE_TAG) return false;

    ivec4 a = ttmWord(row + ivec2(1, 0));
    ivec4 b = ttmWord(row + ivec2(2, 0));
    ivec4 c = ttmWord(row + ivec2(3, 0));
    vec3 center = vec3(ttmSnorm16(a.r, a.g), ttmSnorm16(a.b, a.a), ttmSnorm16(b.r, b.g));
    vec3 halfSize = vec3(ttmUnorm16(b.b, b.a), ttmUnorm16(c.r, c.g), ttmUnorm16(c.b, c.a));

    // 회전을 읽기 전에 경계 구로 먼저 걸러낸다.
    vec3 toCenter = center - rayOrigin;
    float along = dot(toCenter, rayDirection);
    if (dot(toCenter, toCenter) - along * along > dot(halfSize, halfSize) * 1.001) return false;

    ivec4 d = ttmWord(row + ivec2(4, 0));
    ivec4 e = ttmWord(row + ivec2(5, 0));
    vec4 quaternion = normalize(vec4(ttmSnorm16(d.r, d.g), ttmSnorm16(d.b, d.a), ttmSnorm16(e.r, e.g), ttmSnorm16(e.b, e.a)));
    vec4 inverse = vec4(-quaternion.xyz, quaternion.w);

    vec3 origin = ttmRotate(inverse, rayOrigin - center);
    vec3 direction = ttmRotate(inverse, rayDirection);

    float tNear;
    float tFar;
    vec3 normalNear;
    vec3 normalFar;
    if (!ttmIntersectBox(origin, direction, halfSize, tNear, normalNear, tFar, normalFar)) return false;
    if (tNear >= hit.distance) return false;

    vec4 color;
    if (ttmSampleFace(row, head.g, normalNear, origin + direction * tNear, halfSize, color)) {
        hit = TtmHit(tNear, color, ttmRotate(quaternion, normalNear));
        return true;
    }
    if (tFar < hit.distance && ttmSampleFace(row, head.g, normalFar, origin + direction * tFar, halfSize, color)) {
        hit = TtmHit(tFar, color, ttmRotate(quaternion, normalFar));
        return true;
    }
    return false;
}

// 직교 투영: 광선은 쿼드 앞에서 화면 안쪽으로 곧게 들어간다.
bool ttmTrace(vec2 local, out vec4 color) {
    color = vec4(0.0);
    mat3 toModel = transpose(ttmRotation);
    vec3 rayOrigin = toModel * ((vec3(local, 2.0) - ttmPlacement.xyz) / ttmPlacement.w);
    vec3 rayDirection = toModel * vec3(0.0, 0.0, -1.0);

    TtmHit hit = TtmHit(1e9, vec4(0.0), vec3(0.0));
    bool found = false;
    for (int i = 0; i < ttmModel.r; i++) {
        found = ttmTraceCube(i, rayOrigin, rayDirection, hit) || found;
    }
    if (!found) return false;

    color = vec4(hit.color.rgb * ttmShade(ttmRotation * hit.normal), hit.color.a);
    return true;
}

#endif
