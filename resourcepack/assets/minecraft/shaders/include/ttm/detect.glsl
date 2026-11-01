#ifndef TTM_DETECT_GLSL
#define TTM_DETECT_GLSL

#include <minecraft:ttm/format.glsl>

const vec2 TTM_CORNER_LOCAL[4] = vec2[](vec2(-1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0));

// GUI 정점은 여러 draw 가 공유하는 버퍼에 쌓여 gl_VertexIndex 로는 모서리를 알 수 없다.
bool ttmDetect(vec2 uv, out ivec2 origin, out ivec2 size, out int vertex) {
    origin = ivec2(0);
    size = ivec2(0);
    vertex = 0;
    if (textureSize(Sampler0, 0) != ivec2(TTM_PAGE_SIZE)) return false;

    ivec2 corner = ivec2(floor(uv * float(TTM_PAGE_SIZE)));
    ivec4 marker = ttmWord(corner);
    if ((marker.r & 0xFC) != TTM_MARKER || marker.a != 0) return false;

    ivec2 glyphSize = marker.gb + 1;
    ivec2 offsets[4] = ivec2[](ivec2(0), ivec2(0, glyphSize.y - 1), glyphSize - 1, ivec2(glyphSize.x - 1, 0));
    int cornerIndex = marker.r & 3;
    ivec2 glyphOrigin = corner - offsets[cornerIndex];
    if (any(lessThan(glyphOrigin, ivec2(0))) || any(greaterThan(glyphOrigin + glyphSize, ivec2(TTM_PAGE_SIZE)))) return false;

    for (int i = 0; i < 4; i++) {
        if (ttmWord(glyphOrigin + offsets[i]) != ivec4(TTM_MARKER | i, marker.gb, 0)) return false;
    }
    if (ttmWord(glyphOrigin + ivec2(1, 0)) != ivec4(0x54, 0x54, 0x4D, TTM_VERSION)) return false;

    origin = glyphOrigin;
    size = glyphSize;
    vertex = cornerIndex;
    return true;
}

#endif
