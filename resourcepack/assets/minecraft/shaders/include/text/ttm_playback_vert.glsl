#ifndef TTM_PLAYBACK_VERT_GLSL
#define TTM_PLAYBACK_VERT_GLSL

#include <minecraft:text/ttm_format_lib.glsl>

struct TtmPlayback {
    int frameA;
    int frameB;
    float blend;
    bool finished;
    bool usesColorParameter;
};

TtmPlayback ttmLoopPlayback(float progress, int frameCount) {
    float position = fract(progress) * float(frameCount);
    int frameA = int(position);
    return TtmPlayback(frameA, (frameA + 1) % frameCount, fract(position), false, false);
}

TtmPlayback ttmOneShotPlayback(float progress, int frameCount, int playMode) {
    int lastFrame = frameCount - 1;
    if (progress >= 1.0f) {
        return TtmPlayback(lastFrame, lastFrame, 0.0f, playMode == TTM_PLAY_ONCE, false);
    }
    float position = progress * float(lastFrame);
    int frameA = int(position);
    return TtmPlayback(frameA, min(frameA + 1, lastFrame), fract(position), false, false);
}

TtmPlayback ttmResolvePlayback(vec4 textColor, ivec4 animation, int playMode) {
    ivec3 color = ivec3(round(textColor.rgb * 255.0f));
    int parameter = (color.g << 8) | color.b;
    int frameCount = animation.g;
    int loopsPerCycle = (animation.b << 8) | animation.a;

    if (color.r == TTM_COLOR_PAUSE) {
        int frame = min(parameter, frameCount - 1);
        return TtmPlayback(frame, frame, 0.0f, false, true);
    }

    float nowTicks = GameTime * TTM_CYCLE_TICKS;
    if (color.r != TTM_COLOR_START) {
        return ttmLoopPlayback(nowTicks * float(loopsPerCycle) / TTM_CYCLE_TICKS, frameCount);
    }

    float elapsedTicks = mod(nowTicks - float(parameter), TTM_CYCLE_TICKS);
    float progress = elapsedTicks * float(loopsPerCycle) / TTM_CYCLE_TICKS;
    TtmPlayback playback = playMode == TTM_PLAY_LOOP ? ttmLoopPlayback(progress, frameCount) : ttmOneShotPlayback(progress, frameCount, playMode);
    playback.usesColorParameter = true;
    return playback;
}

#endif
