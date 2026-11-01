#ifndef TTM_FORMAT_GLSL
#define TTM_FORMAT_GLSL

// TTM v1 글리프 포맷. 이 파일을 불러오기 전에 Sampler0 을 선언해야 한다.

#define TTM_PAGE_SIZE 256
#define TTM_MARKER 0x54
#define TTM_VERSION 1
#define TTM_TAU 6.2831853

#define TTM_HEADER_DISPLAY 2
#define TTM_HEADER_OFFSET 3
#define TTM_HEADER_ROTATION 4
#define TTM_HEADER_COUNTS 5

#define TTM_CUBE_TAG 0xC1
#define TTM_CUBE_FACES 6

ivec4 ttmWord(ivec2 position) {
    return ivec4(round(texelFetch(Sampler0, position, 0) * 255.0));
}

#endif
