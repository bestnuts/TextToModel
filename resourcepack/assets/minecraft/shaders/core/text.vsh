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
#include <minecraft:ttm/detect.glsl>
#endif

#if defined(IS_GUI) && !defined(IS_GRAYSCALE)
#include <minecraft:globals.glsl>
#include <minecraft:ttm/model.glsl>
layout(location = 4) flat out int ttmActive;
layout(location = 5) out vec2 ttmLocal;
layout(location = 6) flat out mat3 ttmRotation;
layout(location = 9) flat out ivec2 ttmOrigin;
layout(location = 10) flat out ivec4 ttmModel;
layout(location = 11) flat out vec4 ttmPlacement;
layout(location = 12) flat out float ttmAmbient;
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
    ttmLocal = vec2(0.0);
    ttmRotation = mat3(1.0);
    ttmOrigin = ivec2(0);
    ttmModel = ivec4(0);
    ttmPlacement = vec4(0.0, 0.0, 0.0, 1.0);
    ttmAmbient = 0.0;
#endif

#ifndef IS_GRAYSCALE
    ivec2 ttmGlyphOrigin;
    ivec2 ttmGlyphSize;
    int ttmVertex;
    if (ttmDetect(UV0, ttmGlyphOrigin, ttmGlyphSize, ttmVertex)) {
#ifdef IS_GUI
        if (max(Color.r, max(Color.g, Color.b)) >= TTM_SHADOW_BRIGHTNESS) {
            ivec4 display = ttmWord(ttmGlyphOrigin + ivec2(TTM_HEADER_DISPLAY, 0));
            ivec4 offset = ttmWord(ttmGlyphOrigin + ivec2(TTM_HEADER_OFFSET, 0));
            ivec4 rotation = ttmWord(ttmGlyphOrigin + ivec2(TTM_HEADER_ROTATION, 0));
            ivec4 counts = ttmWord(ttmGlyphOrigin + ivec2(TTM_HEADER_COUNTS, 0));

            ttmActive = 1;
            ttmLocal = TTM_CORNER_LOCAL[ttmVertex];
            ttmRotation = ttmModelRotation(display, rotation);
            ttmOrigin = ttmGlyphOrigin;
            ttmModel = ivec4(counts.r, display.b, counts.b, counts.a);
            ttmPlacement = vec4(ttmSnorm8(offset.r), ttmSnorm8(offset.g), ttmSnorm8(offset.b), float(offset.a) / 128.0);
            ttmAmbient = float(display.a) / 255.0;
        } else {
            gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        }
#else
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
#endif
    }
#endif
}
