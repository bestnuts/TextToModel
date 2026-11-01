#ifndef TTM_DETECT_VERT_GLSL
#define TTM_DETECT_VERT_GLSL

#include <minecraft:text/ttm_format_lib.glsl>

const vec2 TTM_CORNER_QUAD[4] = vec2[](vec2(-1.0f, 1.0f), vec2(-1.0f, -1.0f), vec2(1.0f, -1.0f), vec2(1.0f, 1.0f));

// GUI 정점은 여러 draw 가 공유하는 버퍼에 쌓여 gl_VertexIndex 로는 모서리를 알 수 없다.
bool ttmDetect(vec2 uv, out ivec2 texelOrigin, out ivec2 texelSize, out int cornerIndex) {
    texelOrigin = ivec2(0);
    texelSize = ivec2(0);
    cornerIndex = 0;
    if (!formatIsEqual(textureSize(Sampler0, 0), ivec2(TTM_PAGE_SIZE))) return false;

    ivec2 cornerTexel = ivec2(floor(uv * float(TTM_PAGE_SIZE)));
    ivec4 marker = formatWord(cornerTexel);
    if ((marker.r & 0xFC) != TTM_MARKER || marker.a != 0) return false;

    ivec2 glyphSize = marker.gb + 1;
    ivec2 cornerOffsets[4] = ivec2[](ivec2(0), ivec2(0, glyphSize.y - 1), glyphSize - 1, ivec2(glyphSize.x - 1, 0));
    int vertexCorner = marker.r & 3;
    ivec2 glyphOrigin = cornerTexel - cornerOffsets[vertexCorner];
    if (any(lessThan(glyphOrigin, ivec2(0))) || any(greaterThan(glyphOrigin + glyphSize, ivec2(TTM_PAGE_SIZE)))) return false;

    for (int i = 0; i < 4; i++) {
        if (!formatIsEqual(formatWord(glyphOrigin + cornerOffsets[i]), ivec4(TTM_MARKER | i, marker.g, marker.b, 0))) return false;
    }
    if (!formatIsEqual(formatWord(glyphOrigin + ivec2(1, 0)), ivec4(0x54, 0x54, 0x4D, TTM_VERSION))) return false;

    texelOrigin = glyphOrigin;
    texelSize = glyphSize;
    cornerIndex = vertexCorner;
    return true;
}

#endif
