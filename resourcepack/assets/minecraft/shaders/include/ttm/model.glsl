#ifndef TTM_MODEL_GLSL
#define TTM_MODEL_GLSL

#include <minecraft:ttm/format.glsl>

#define TTM_ROTATE_SPIN 1

float ttmSnorm8(int value) {
    return float(value > 127 ? value - 256 : value) / 127.0;
}

mat3 ttmRotateX(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
}

mat3 ttmRotateY(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

mat3 ttmRotateZ(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

// 모델 공간에서 화면 공간으로 가는 회전.
// GameTime 은 20분마다 0 으로 돌아오므로, 그 안에서 정수 바퀴를 돌아야 이음매가 없다.
mat3 ttmModelRotation(ivec4 display, ivec4 rotation) {
    float yaw = float(rotation.r) / 256.0 * TTM_TAU;
    if (display.r == TTM_ROTATE_SPIN) {
        yaw += fract(GameTime * float(rotation.a * 5)) * TTM_TAU;
    }
    float pitch = float(rotation.g) / 256.0 * TTM_TAU;
    float roll = float(rotation.b) / 256.0 * TTM_TAU;
    return ttmRotateZ(roll) * ttmRotateX(pitch) * ttmRotateY(yaw);
}

#endif
