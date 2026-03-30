varying vec3 vColor;
varying float vIdx;
uniform float uSelected;
uniform float uHovered;
uniform float uTime;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  bool isSel = vIdx == uSelected;
  bool isHov = vIdx == uHovered;

  // Multi-layer bloom
  float core = 1.0 - smoothstep(0.0, 0.10, d);
  float mid = 1.0 - smoothstep(0.0, 0.28, d);
  float outer = 1.0 - smoothstep(0.0, 0.5, d);
  float bloom = pow(1.0 - d * 2.0, 3.0) * 0.5;

  // Diffraction spikes
  float spikeScale = isSel ? 24.0 : isHov ? 20.0 : 18.0;
  float spike = 0.0;
  float ax = abs(uv.x), ay = abs(uv.y);
  float diag1 = abs(uv.x - uv.y), diag2 = abs(uv.x + uv.y);
  spike += max(0.0, 1.0 - ax * spikeScale) * max(0.0, 1.0 - ay * 1.5) * 0.7;
  spike += max(0.0, 1.0 - ay * spikeScale) * max(0.0, 1.0 - ax * 1.5) * 0.7;
  spike += max(0.0, 1.0 - diag1 * (spikeScale * 1.4)) * max(0.0, 1.0 - diag2 * 1.5) * 0.4;
  spike += max(0.0, 1.0 - diag2 * (spikeScale * 1.4)) * max(0.0, 1.0 - diag1 * 1.5) * 0.4;

  // Pulsing ring when selected
  float ring = 0.0;
  if (isSel) {
    float rd = abs(d - 0.38);
    ring = max(0.0, 1.0 - rd * 30.0) * 0.5 * (0.7 + 0.3 * sin(uTime * 4.0));
  }

  vec3 white = vec3(1.0, 0.97, 0.9);
  vec3 col = mix(vColor, white, core * 0.9);
  col += vec3(0.05, 0.03, 0.0) * bloom * (isSel ? 2.0 : 1.0);

  float alpha = core + mid * 0.55 + outer * 0.2 + bloom * 0.4 + spike * 0.55 + ring;
  alpha = clamp(alpha, 0.0, 1.0);
  if (isSel || isHov) alpha = min(alpha * 1.5, 1.0);

  gl_FragColor = vec4(col, alpha);
}
