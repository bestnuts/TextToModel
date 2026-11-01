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
layout(location = 4) flat out int ttmActive;
layout(location = 5) out vec2 ttmLocal;
layout(location = 6) flat out mat3 ttmRotation;

// 모델 공간에서 화면 공간으로 가는 회전. M2 에서는 6초에 한 바퀴로 고정한다.
mat3 ttmModelRotation() {
    float yaw = fract(GameTime * 200.0) * 6.2831853;
    float pitch = radians(25.0);
    float cy = cos(yaw);
    float sy = sin(yaw);
    float cp = cos(pitch);
    float sp = sin(pitch);
    mat3 rotateY = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
    mat3 rotateX = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
    return rotateX * rotateY;
}
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
#endif

#ifndef IS_GRAYSCALE
    ivec2 ttmOrigin;
    ivec2 ttmSize;
    int ttmVertex;
    if (ttmDetect(UV0, ttmOrigin, ttmSize, ttmVertex)) {
#ifdef IS_GUI
        // 기본 그림자는 RGB 가 0.25 배로 들어온다.
        if (max(Color.r, max(Color.g, Color.b)) >= 0.26) {
            ttmActive = 1;
            ttmLocal = TTM_CORNER_LOCAL[ttmVertex];
            ttmRotation = ttmModelRotation();
        } else {
            gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
        }
#else
        gl_Position = vec4(-2.0, -2.0, 0.0, 1.0);
#endif
    }
#endif
}
