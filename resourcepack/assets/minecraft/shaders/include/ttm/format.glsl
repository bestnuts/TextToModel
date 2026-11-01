#ifndef TTM_FORMAT_GLSL
#define TTM_FORMAT_GLSL

#define TTM_PAGE_SIZE 256
#define TTM_MARKER 0x54
#define TTM_VERSION 1
#define TTM_TAU 6.2831853

#define TTM_HEADER_DISPLAY 2
#define TTM_HEADER_OFFSET 3
#define TTM_HEADER_ROTATION 4
#define TTM_HEADER_COUNTS 5

#define TTM_CUBE_TAG 0xC1
#define TTM_SHADOW_BRIGHTNESS 0.26

ivec4 ttmWord(ivec2 position) {
    return ivec4(round(texelFetch(Sampler0, position, 0) * 255.0));
}

#endif
