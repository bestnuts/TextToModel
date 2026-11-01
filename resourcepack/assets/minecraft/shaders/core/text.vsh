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
layout(location = 4) flat out int ttmActive;
layout(location = 5) out vec2 ttmLocal;
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
#endif

#ifndef IS_GRAYSCALE
    int ttmVertex = gl_VertexIndex % 4;
    ivec2 ttmOrigin;
    ivec2 ttmSize;
    if (ttmDetect(UV0, ttmVertex, ttmOrigin, ttmSize)) {
#ifdef IS_GUI
        // 기본 그림자는 RGB 가 0.25 배로 들어온다.
        if (max(Color.r, max(Color.g, Color.b)) >= 0.26) {
            ttmActive = 1;
            ttmLocal = TTM_CORNER_LOCAL[ttmVertex];
        } else {
            gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        }
#else
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
#endif
    }
#endif
}
