#ifndef TTM_DETECT_GLSL
#define TTM_DETECT_GLSL

#include <minecraft:ttm/format.glsl>

// 정점은 좌상, 좌하, 우하, 우상 순서로 들어온다.
const vec2 TTM_CORNER_LOCAL[4] = vec2[](vec2(-1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(1.0, 1.0));

// 모서리 텍셀만으로 글리프 크기와 원점을 복원한다. 일반 글리프가 우연히 통과하지 않도록 코너 4개와 매직을 모두 확인한다.
bool ttmDetect(vec2 uv, int vertex, out ivec2 origin, out ivec2 size) {
    origin = ivec2(0);
    size = ivec2(0);
    if (textureSize(Sampler0, 0) != ivec2(TTM_PAGE_SIZE)) return false;

    ivec2 corner = ivec2(floor(uv * float(TTM_PAGE_SIZE)));
    ivec4 marker = ttmWord(corner);
    if (marker.r != TTM_MARKER || marker.a != 0) return false;

    ivec2 glyphSize = marker.gb + 1;
    ivec2 offsets[4] = ivec2[](ivec2(0), ivec2(0, glyphSize.y - 1), glyphSize - 1, ivec2(glyphSize.x - 1, 0));
    ivec2 glyphOrigin = corner - offsets[vertex];
    if (any(lessThan(glyphOrigin, ivec2(0))) || any(greaterThan(glyphOrigin + glyphSize, ivec2(TTM_PAGE_SIZE)))) return false;

    for (int i = 0; i < 4; i++) {
        if (ttmWord(glyphOrigin + offsets[i]) != marker) return false;
    }
    if (ttmWord(glyphOrigin + ivec2(1, 0)) != ivec4(0x54, 0x54, 0x4D, TTM_VERSION)) return false;

    origin = glyphOrigin;
    size = glyphSize;
    return true;
}

#endif
