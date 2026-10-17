// Rule (mask) wipe transition: `rule(mask, ms)` (plan §5.1, §8.5, rfcs/0002).
//
// Used as an SDL_GPURenderState fragment shader. The texture being drawn is the
// incoming scene; the old scene is already in the target underneath. The rule
// mask is a grayscale image: dark pixels reveal the new scene first.
//
// Resource layout required by SDL_CreateGPUShader for fragment shaders:
//   DXIL:  t[n]/s[n] in space2 (sampled textures), b[n] in space3 (uniforms)
//   SPIR-V: set 2 = combined image samplers, set 3 = uniform buffers
// The SDL GPU renderer binds the drawn texture to slot 0; the render state's
// extra sampler (the mask) goes to slot 1.

[[vk::combinedImageSampler]] [[vk::binding(0, 2)]]
Texture2D u_texture : register(t0, space2);
[[vk::combinedImageSampler]] [[vk::binding(0, 2)]]
SamplerState u_sampler : register(s0, space2);

[[vk::combinedImageSampler]] [[vk::binding(1, 2)]]
Texture2D u_rule : register(t1, space2);
[[vk::combinedImageSampler]] [[vk::binding(1, 2)]]
SamplerState u_rule_sampler : register(s1, space2);

[[vk::binding(0, 3)]]
cbuffer RuleWipe : register(b0, space3)
{
    float progress; // 0 = old scene only, 1 = new scene only
    float vague;    // edge softness in mask units, > 0
    float invert;   // 1 = bright pixels reveal first
    float padding;
};

// Input semantics must be TEXCOORD0 (color) and TEXCOORD1 (uv), NOT the
// COLOR0/TEXCOORD0 that SDL's HLSL sources show: SDL's shaders are built with
// SDL_shadercross, whose SPIR-V round-trip renames every varying to TEXCOORDn.
// D3D12 matches vertex outputs to pixel inputs by semantic name, so COLOR0 makes
// pipeline creation fail (E_INVALIDARG) and the draw is silently skipped.
// Vulkan matches by location (0, 1), which this declaration order also gives.
struct PSInput {
    float4 v_color : TEXCOORD0;
    float2 v_uv : TEXCOORD1;
};

float4 main(PSInput input) : SV_Target
{
    float m = u_rule.Sample(u_rule_sampler, input.v_uv).r;
    m = lerp(m, 1.0 - m, invert);

    // Ramp so that progress 0 shows nothing and progress 1 shows everything,
    // with a soft edge `vague` wide (Ren'Py ImageDissolve-style).
    float a = saturate((progress * (1.0 + vague) - m) / vague);

    float4 c = u_texture.Sample(u_sampler, input.v_uv) * input.v_color;
    c.a *= a;
    return c;
}
