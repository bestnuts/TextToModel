#ifndef TTM_FORMAT_LIB_GLSL
#define TTM_FORMAT_LIB_GLSL

#include <minecraft:text/ttm_conf.glsl>

ivec4 formatWord(ivec2 texel) {
    return ivec4(round(texelFetch(Sampler0, texel, 0) * 255.0f));
}

bool formatIsEqual(ivec2 a, ivec2 b) {
    return all(equal(a, b));
}

bool formatIsEqual(ivec4 a, ivec4 b) {
    return all(equal(a, b));
}

float formatSnorm8(int value) {
    return float(value > 127 ? value - 256 : value) / 127.0f;
}

float formatSnorm16(int high, int low) {
    int value = (high << 8) | low;
    return float(value >= 32768 ? value - 65536 : value) / 32767.0f;
}

float formatUnorm16(int high, int low) {
    return float((high << 8) | low) / 65535.0f;
}

#endif
