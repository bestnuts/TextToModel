#version 330
#extension GL_ARB_separate_shader_objects : require

#if !defined(IS_GUI) && !defined(IS_SEE_THROUGH)
#include <minecraft:fog.glsl>
#endif

#include <minecraft:dynamictransforms.glsl>
#include <minecraft:oit.glsl>

uniform sampler2D Sampler0;

#if !defined(IS_GUI) && !defined(IS_SEE_THROUGH)
layout(location = 0) in float sphericalVertexDistance;
layout(location = 1) in float cylindricalVertexDistance;
#endif

layout(location = 2) in vec4 vertexColor;
layout(location = 3) in vec2 texCoord0;

#if defined(IS_GUI) && !defined(IS_GRAYSCALE)
layout(location = 4) flat in int ttmActive;
layout(location = 5) in vec2 ttmLocal;
layout(location = 6) flat in mat3 ttmRotation;
#include <minecraft:ttm/raycast.glsl>
#endif

#ifndef OIT_ALPHA_ONLY
layout(location = 0) out vec4 fragColor;
#endif

vec4 calculateFinalColor(vec4 color) {
    #ifdef OIT_ACCUMULATE
    color = sampleColorForAccumulation(color);
    #endif

    #if !defined(IS_SEE_THROUGH) && !defined(IS_GUI)

    #ifdef OIT_ACCUMULATE
    vec4 fogColor = vec4(FogColor.rgb * color.a, FogColor.a);
    #else
    vec4 fogColor = FogColor;
    #endif

    color = apply_fog(color, sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, fogColor);
    #endif

    return color;
}

void main() {
    #if defined(IS_GUI) && !defined(IS_GRAYSCALE)
    if (ttmActive == 1) {
        // 직교 투영: 광선은 쿼드 앞에서 화면 안쪽으로 곧게 들어간다.
        mat3 toModel = transpose(ttmRotation);
        vec3 rayOrigin = toModel * vec3(ttmLocal, 2.0);
        vec3 rayDirection = toModel * vec3(0.0, 0.0, -1.0);

        float hitDistance;
        vec3 hitNormal;
        if (!ttmIntersectBox(rayOrigin, rayDirection, vec3(0.5), hitDistance, hitNormal)) {
            discard;
        }

        vec3 shaded = ttmDebugFaceColor(hitNormal) * ttmShade(ttmRotation * hitNormal);
        fragColor = vec4(shaded, 1.0) * vertexColor * ColorModulator;
        return;
    }
    #endif

    #ifdef IS_GRAYSCALE
    vec4 texColor = texture(Sampler0, texCoord0).rrrr;
    #else
    vec4 texColor = texture(Sampler0, texCoord0);
    #endif

    vec4 color = texColor * vertexColor * ColorModulator;

    if (color.a < 0.1) {
        discard;
    }

    #ifdef OIT_ALPHA_ONLY
    executeAlphaOnlyPhase(gl_FragCoord.z, color.a);
    #else
    fragColor = calculateFinalColor(color);
    #endif
}
