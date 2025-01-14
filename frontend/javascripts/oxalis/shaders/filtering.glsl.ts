import type { ShaderModule } from "./shader_module_system";
import { getColorForCoords } from "./texture_access.glsl";
export const getBilinearColorFor: ShaderModule = {
  requirements: [getColorForCoords],
  code: `
    vec4 getBilinearColorFor(
      sampler2D lookUpTexture,
      float layerIndex,
      float d_texture_width,
      float packingDegree,
      vec3 coordsUVW
    ) {
      coordsUVW = coordsUVW + vec3(-0.5, -0.5, 0.0);
      vec2 bifilteringParams = (coordsUVW - floor(coordsUVW)).xy;
      coordsUVW = floor(coordsUVW);

      vec4 a = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW);
      vec4 b = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(1, 0, 0));
      vec4 c = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(0, 1, 0));
      vec4 d = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(1, 1, 0));
      if (a.a < 0.0 || b.a < 0.0 || c.a < 0.0 || d.a < 0.0) {
        // We need to check all four colors for a negative parts, because there will be black
        // lines at the borders otherwise (black gets mixed with data)
        return vec4(0.0, 0.0, 0.0, -1.0);
      }

      vec4 ab = mix(a, b, bifilteringParams.x);
      vec4 cd = mix(c, d, bifilteringParams.x);

      return mix(ab, cd, bifilteringParams.y);
    }
  `,
};
export const getTrilinearColorFor: ShaderModule = {
  requirements: [getColorForCoords],
  code: `
    vec4 getTrilinearColorFor(
      sampler2D lookUpTexture,
      float layerIndex,
      float d_texture_width,
      float packingDegree,
      vec3 coordsUVW
    ) {
      coordsUVW = coordsUVW + vec3(-0.5, -0.5, 0.0);
      vec3 bifilteringParams = (coordsUVW - floor(coordsUVW)).xyz;
      coordsUVW = floor(coordsUVW);

      vec4 a = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW);
      vec4 b = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(1, 0, 0));
      vec4 c = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(0, 1, 0));
      vec4 d = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(1, 1, 0));

      vec4 a2 = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(0, 0, 1));
      vec4 b2 = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(1, 0, 1));
      vec4 c2 = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(0, 1, 1));
      vec4 d2 = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, coordsUVW + vec3(1, 1, 1));

      if (a.a < 0.0 || b.a < 0.0 || c.a < 0.0 || d.a < 0.0 ||
        a2.a < 0.0 || b2.a < 0.0 || c2.a < 0.0 || d2.a < 0.0) {
        // We need to check all four colors for a negative parts, because there will be black
        // lines at the borders otherwise (black gets mixed with data)
        return vec4(0.0, 0.0, 0.0, -1.0);
      }

      vec4 ab = mix(a, b, bifilteringParams.x);
      vec4 cd = mix(c, d, bifilteringParams.x);
      vec4 abcd = mix(ab, cd, bifilteringParams.y);

      vec4 ab2 = mix(a2, b2, bifilteringParams.x);
      vec4 cd2 = mix(c2, d2, bifilteringParams.x);

      vec4 abcd2 = mix(ab2, cd2, bifilteringParams.y);

      return mix(abcd, abcd2, bifilteringParams.z);
    }
  `,
};
const getMaybeFilteredColor: ShaderModule = {
  requirements: [getColorForCoords, getBilinearColorFor, getTrilinearColorFor],
  code: `
    vec4 getMaybeFilteredColor(
      sampler2D lookUpTexture,
      float layerIndex,
      float d_texture_width,
      float packingDegree,
      vec3 worldPositionUVW,
      bool suppressBilinearFiltering
    ) {
      vec4 color;
      if (!suppressBilinearFiltering && useBilinearFiltering) {
        <% if (isOrthogonal) { %>
          color = getBilinearColorFor(lookUpTexture, layerIndex, d_texture_width, packingDegree, worldPositionUVW);
        <% } else { %>
          color = getTrilinearColorFor(lookUpTexture, layerIndex, d_texture_width, packingDegree, worldPositionUVW);
        <% } %>
      } else {
        color = getColorForCoords(lookUpTexture, layerIndex, d_texture_width, packingDegree, worldPositionUVW);
      }
      return color;
    }
  `,
};
export const getMaybeFilteredColorOrFallback: ShaderModule = {
  requirements: [getMaybeFilteredColor],
  code: `
    vec4 getMaybeFilteredColorOrFallback(
      sampler2D lookUpTexture,
      float layerIndex,
      float d_texture_width,
      float packingDegree,
      vec3 worldPositionUVW,
      bool suppressBilinearFiltering,
      vec4 fallbackColor
    ) {
      vec4 color = getMaybeFilteredColor(lookUpTexture, layerIndex, d_texture_width, packingDegree, worldPositionUVW, suppressBilinearFiltering);

      if (color.a < 0.0) {
        // Render gray for not-yet-existing data
        color = fallbackColor;
      }

      return color;
    }

    vec4[2] getSegmentIdOrFallback(
      sampler2D lookUpTexture,
      float layerIndex,
      float d_texture_width,
      float packingDegree,
      vec3 worldPositionUVW,
      vec4 fallbackColor
    ) {
      vec4[2] color = getColorForCoords64(lookUpTexture, layerIndex, d_texture_width, packingDegree, worldPositionUVW);

      if (color[1].a < 0.0) {
        // Render gray for not-yet-existing data
        color[1] = fallbackColor;
      }

      return color;
    }
  `,
};
