#ifndef TTM_RAYCAST_GLSL
#define TTM_RAYCAST_GLSL

#define TTM_RAY_EPSILON 1e-6

// 슬랩 테스트. 맞으면 진입 거리와 진입 면의 법선을 돌려준다.
bool ttmIntersectBox(vec3 origin, vec3 direction, vec3 halfSize, out float t, out vec3 normal) {
    vec3 safe = mix(direction, vec3(TTM_RAY_EPSILON), lessThan(abs(direction), vec3(TTM_RAY_EPSILON)));
    vec3 inverse = 1.0 / safe;
    vec3 t0 = (-halfSize - origin) * inverse;
    vec3 t1 = (halfSize - origin) * inverse;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);

    t = max(tMin.x, max(tMin.y, tMin.z));
    normal = vec3(0.0);
    if (t > min(tMax.x, min(tMax.y, tMax.z)) || t < 0.0) return false;

    if (t == tMin.x) {
        normal.x = -sign(safe.x);
    } else if (t == tMin.y) {
        normal.y = -sign(safe.y);
    } else {
        normal.z = -sign(safe.z);
    }
    return true;
}

// 마인크래프트 엔티티 면 밝기: 상 1.0, 하 0.5, 남북 0.8, 동서 0.6
float ttmShade(vec3 normal) {
    vec3 weight = normal * normal;
    return weight.x * 0.6 + weight.z * 0.8 + weight.y * (normal.y > 0.0 ? 1.0 : 0.5);
}

// M2 시험용 면 색. M3 에서 텍스처로 교체한다.
vec3 ttmDebugFaceColor(vec3 normal) {
    if (normal.x > 0.5) return vec3(0.84, 0.28, 0.28);
    if (normal.x < -0.5) return vec3(0.28, 0.71, 0.38);
    if (normal.y > 0.5) return vec3(0.93, 0.80, 0.33);
    if (normal.y < -0.5) return vec3(0.36, 0.30, 0.63);
    if (normal.z > 0.5) return vec3(0.27, 0.51, 0.86);
    return vec3(0.90, 0.55, 0.24);
}

#endif
