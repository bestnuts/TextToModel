#ifndef TTM_FORMAT_GLSL
#define TTM_FORMAT_GLSL

// TTM v1 글리프 포맷. 이 파일을 불러오기 전에 Sampler0 을 선언해야 한다.

#define TTM_PAGE_SIZE 256
#define TTM_MARKER 0x54
#define TTM_VERSION 1

ivec4 ttmWord(ivec2 position) {
    return ivec4(round(texelFetch(Sampler0, position, 0) * 255.0));
}

#endif
