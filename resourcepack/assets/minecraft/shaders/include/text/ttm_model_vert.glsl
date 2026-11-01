#ifndef TTM_MODEL_VERT_GLSL
#define TTM_MODEL_VERT_GLSL

#include <minecraft:text/ttm_format_lib.glsl>

mat3 ttmRotateX(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(1.0f, 0.0f, 0.0f, 0.0f, c, s, 0.0f, -s, c);
}

mat3 ttmRotateY(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(c, 0.0f, -s, 0.0f, 1.0f, 0.0f, s, 0.0f, c);
}

mat3 ttmRotateZ(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(c, s, 0.0f, -s, c, 0.0f, 0.0f, 0.0f, 1.0f);
}

// GameTime 은 20분마다 0 으로 돌아오므로, 그 안에서 정수 바퀴를 돌아야 이음매가 없다.
mat3 ttmWorldToViewRotation(ivec4 display, ivec4 rotation) {
    float yaw = float(rotation.r) / 256.0f * TTM_TAU;
    if (display.r == TTM_ROTATE_SPIN) {
        yaw += fract(GameTime * float(rotation.a * 5)) * TTM_TAU;
    }
    float pitch = float(rotation.g) / 256.0f * TTM_TAU;
    float roll = float(rotation.b) / 256.0f * TTM_TAU;
    return ttmRotateZ(roll) * ttmRotateX(pitch) * ttmRotateY(yaw);
}

#endif
