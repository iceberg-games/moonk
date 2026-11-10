/**
 * Fur cosmetics are materials + optional vertex-color patterns applied to
 * the monkey's existing fur meshes. They add 0 triangles.
 */
export const FUR_SPECS = {
  fur_moonk_gray: { fur: 0x8d9099, skin: 0xc9ccd4, emissive: 0x000000, emissiveIntensity: 0, vertexPaint: null },
  fur_moonk_brown: {
    fur: 0x6b3f24,
    skin: 0xf3d7b0,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexPaint: null,
  },
  fur_banana: {
    fur: 0xf0c430,
    skin: 0xfff0c8,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexPaint: null,
  },
  fur_midnight: {
    fur: 0x1b2744,
    skin: 0xc5d0e4,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexPaint: null,
  },
  fur_lunar_white: {
    fur: 0xe8eef6,
    skin: 0xd5deea,
    emissive: 0x9bb7ff,
    emissiveIntensity: 0.12,
    vertexPaint: null,
  },
  fur_sunset_stripe: {
    fur: 0xff7a32,
    skin: 0xffc4a8,
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexPaint: 'sunset',
  },
  fur_nebula: {
    fur: 0x3a1a5c,
    skin: 0xe8b4d8,
    emissive: 0xc24cff,
    emissiveIntensity: 0.32,
    vertexPaint: 'nebula',
  },
  fur_aurora: {
    fur: 0x0e3b32,
    skin: 0xc8f0d8,
    emissive: 0x3effa8,
    emissiveIntensity: 0.38,
    vertexPaint: 'aurora',
  },
};

export function getFurSpec(id) {
  return FUR_SPECS[id] || FUR_SPECS.fur_moonk_gray;
}
