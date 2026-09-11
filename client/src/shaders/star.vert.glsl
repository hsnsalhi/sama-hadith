attribute float size;
attribute vec3 aColor;
attribute float aHi;
varying vec3 vColor;
varying float vIdx;
varying float vHi;
uniform float uTime;
uniform float uSelected;
uniform float uHovered;

void main() {
  vColor = aColor;
  float idx = float(gl_VertexID);
  vIdx = idx;
  vHi = aHi;
  float pulse = 1.0;
  if (idx == uHovered || idx == uSelected) {
    pulse = 1.0 + sin(uTime * 6.0) * 0.25;
  }
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = length(mv.xyz);
  float attn = clamp(300.0 / dist, 0.4, 4.0);
  float boost = idx == uSelected ? 2.2 : (idx == uHovered ? 1.8 : (aHi > 0.5 ? 1.9 : 1.0));
  float ps = size * pulse * attn * boost;
  gl_PointSize = min(ps, 40.0);
  gl_Position = projectionMatrix * mv;
}
