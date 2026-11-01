#version 330
#extension GL_ARB_separate_shader_objects : require

#if !defined(IS_GUI) && !defined(IS_SEE_THROUGH)
#include <minecraft:fog.glsl>
#include <minecraft:sample_lightmap.glsl>
#endif

#include <minecraft:dynamictransforms.glsl>
#include <minecraft:projection.glsl>

layout(location = 0) in vec3 Position;
layout(location = 1) in vec4 Color;
layout(location = 2) in vec2 UV0;
#if !defined(IS_GUI) && !defined(IS_SEE_THROUGH)
layout(location = 3) in ivec2 UV2;
#endif

#if !defined(IS_GUI) && !defined(IS_SEE_THROUGH)
uniform sampler2D Sampler2;
layout(location = 0) out float sphericalVertexDistance;
layout(location = 1) out float cylindricalVertexDistance;
#endif

layout(location = 2) out vec4 vertexColor;
layout(location = 3) out vec2 texCoord0;

#ifndef IS_GRAYSCALE
uniform sampler2D Sampler0;
#include <minecraft:text/ttm_detect_vert.glsl>
#endif

#if defined(IS_GUI) && !defined(IS_GRAYSCALE)
#include <minecraft:globals.glsl>
#include <minecraft:text/ttm_model_vert.glsl>
#include <minecraft:text/ttm_playback_vert.glsl>
layout(location = 4) flat out int ttmActive;
layout(location = 5) out vec2 vs_ttmQuad;
layout(location = 6) flat out mat3 ttmWorldToView;
layout(location = 9) flat out ivec2 ttmTexelOrigin;
layout(location = 10) flat out ivec4 ttmModel;
layout(location = 11) flat out vec4 ttmPlacement;
layout(location = 12) flat out float ttmAmbient;
layout(location = 13) flat out ivec4 ttmTile;
layout(location = 14) flat out ivec4 ttmAnimation;
layout(location = 15) flat out float ttmFrameBlend;
#endif

void main() {
    gl_Position = ProjMat * ModelViewMat * vec4(Position, 1.0);

#if !defined(IS_GUI) && !defined(IS_SEE_THROUGH)
    sphericalVertexDistance = fog_spherical_distance(Position);
    cylindricalVertexDistance = fog_cylindrical_distance(Position);
    vertexColor = Color * sample_lightmap(Sampler2, UV2);
#else
    vertexColor = Color;
#endif
    texCoord0 = UV0;

#if defined(IS_GUI) && !defined(IS_GRAYSCALE)
    ttmActive = 0;
    vs_ttmQuad = vec2(0.0f);
    ttmWorldToView = mat3(1.0f);
    ttmTexelOrigin = ivec2(0);
    ttmModel = ivec4(0);
    ttmPlacement = vec4(0.0f, 0.0f, 0.0f, 1.0f);
    ttmAmbient = 0.0f;
    ttmTile = ivec4(0);
    ttmAnimation = ivec4(0);
    ttmFrameBlend = 0.0f;
#endif

#ifndef IS_GRAYSCALE
    ivec2 glyphOrigin;
    ivec2 glyphSize;
    int cornerIndex;
    if (ttmDetect(UV0, glyphOrigin, glyphSize, cornerIndex)) {
#ifdef IS_GUI
        if (max(Color.r, max(Color.g, Color.b)) >= TTM_SHADOW_BRIGHTNESS) {
            ivec4 display = formatWord(glyphOrigin + ivec2(TTM_HEADER_DISPLAY, 0));
            ivec4 offset = formatWord(glyphOrigin + ivec2(TTM_HEADER_OFFSET, 0));
            ivec4 rotation = formatWord(glyphOrigin + ivec2(TTM_HEADER_ROTATION, 0));
            ivec4 counts = formatWord(glyphOrigin + ivec2(TTM_HEADER_COUNTS, 0));

            ttmActive = 1;
            vs_ttmQuad = TTM_CORNER_QUAD[cornerIndex];
            ttmWorldToView = ttmWorldToViewRotation(display, rotation);
            ttmTexelOrigin = glyphOrigin;
            ttmModel = ivec4(counts.r, display.b, counts.b, counts.a);
            ttmPlacement = vec4(formatSnorm8(offset.r), formatSnorm8(offset.g), formatSnorm8(offset.b), float(offset.a) / 128.0f);
            ttmAmbient = float(display.a) / 255.0f;
            ttmTile = formatWord(glyphOrigin + ivec2(TTM_HEADER_TILE, 0));

            ivec4 animation = formatWord(glyphOrigin + ivec2(TTM_HEADER_ANIMATION, 0));
            if (animation.r > 0) {
                ivec4 boneTable = formatWord(glyphOrigin + ivec2(TTM_HEADER_BONES, 0));
                TtmPlayback playback = ttmResolvePlayback(Color, animation, boneTable.b);
                ttmAnimation = ivec4(playback.frameA, playback.frameB, boneTable.r, boneTable.g);
                ttmFrameBlend = playback.blend;
                if (playback.usesColorParameter) vertexColor = vec4(vec3(1.0f), Color.a);
                if (playback.finished) gl_Position = TTM_HIDDEN_POSITION;
            }
        } else {
            gl_Position = TTM_HIDDEN_POSITION;
        }
#else
        gl_Position = TTM_HIDDEN_POSITION;
#endif
    }
#endif
}
