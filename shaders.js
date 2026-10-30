/*
 * WebGL2 port of the two Figma shader fills used on the State Deck panel.
 *
 *   1. "Moving gradient" (animated 3D mesh gradient), 24% opacity
 *   2. "Moire" (static line interference), 4% opacity
 *
 * Settings are copied from the Figma file. Only the variant in use is ported:
 * material None, color method Height. Layered over the panel's solid surface
 * color, in the same order as the Figma fills.
 */
(() => {
  'use strict';

  const hero = document.querySelector('.hero');
  if (!hero) return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Settings from Figma ----------
  const GRADIENT = {
    detail: 1.78,
    intensity: 4.29,
    twist: 0.04,
    warp: 0.26,
    zoomPercent: 72,
    rotationSpeedPercent: 12,
    morphSpeed: 1.31,
    gradientBalance: 0,
    stops: [
      { p: 0.024038462, c: [0.909803927, 0.721568644, 0.294117659, 0.52] },
      { p: 0.221153846, c: [0.909803927, 0.721568644, 0.294117659, 0.05] },
      { p: 0.5,         c: [0.960784316, 0.949019611, 0.921568632, 1.0] },
      { p: 1.0,         c: [0.909803927, 0.278431386, 0.101960786, 0.51] },
    ],
  };
  const MOIRE = { lineCount: 120, zoom: 0.1, rgbSplit: 0.05, lineOffset: 0.38, warpOrigin: [-188.496, -228.836] };

  // ---------- Layers ----------
  const fx = document.createElement('div');
  fx.className = 'fx';
  fx.setAttribute('aria-hidden', 'true');
  const gradientCanvas = document.createElement('canvas');
  gradientCanvas.className = 'fx-gradient';
  const moireCanvas = document.createElement('canvas');
  moireCanvas.className = 'fx-moire';
  fx.append(gradientCanvas, moireCanvas);
  hero.prepend(fx);

  const fail = () => { hero.classList.add('no-gl'); fx.remove(); };

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
    }
    return sh;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(p) || 'program link failed');
    }
    return p;
  }

  // =====================================================================
  // 1. Moving gradient
  // =====================================================================
  const COMMON = `#version 300 es
precision highp float;
precision highp int;

uniform float uDetail;
uniform float uTime;
uniform float uAspect;
uniform float uStopCount;
uniform float uZoom;
uniform float uMorphSpeed;
uniform float uRotationSpeed;
uniform float uBalance;
uniform float uWarp;
uniform float uIntensity;
uniform float uTwist;
uniform vec4 uColors[8];
uniform float uStops[8];

vec3 hash33(vec3 p) {
  vec3 q = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(q) * 43758.5453) * 2.0 - 1.0;
}
vec3 smootherCurve(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float gradDot(vec3 cell, vec3 offset, vec3 local) { return dot(hash33(cell + offset), local - offset); }

float perlin3(vec3 p) {
  vec3 cell = floor(p);
  vec3 local = fract(p);
  vec3 w = smootherCurve(local);
  float n000 = gradDot(cell, vec3(0.0, 0.0, 0.0), local);
  float n100 = gradDot(cell, vec3(1.0, 0.0, 0.0), local);
  float n010 = gradDot(cell, vec3(0.0, 1.0, 0.0), local);
  float n110 = gradDot(cell, vec3(1.0, 1.0, 0.0), local);
  float n001 = gradDot(cell, vec3(0.0, 0.0, 1.0), local);
  float n101 = gradDot(cell, vec3(1.0, 0.0, 1.0), local);
  float n011 = gradDot(cell, vec3(0.0, 1.0, 1.0), local);
  float n111 = gradDot(cell, vec3(1.0, 1.0, 1.0), local);
  float nx00 = mix(n000, n100, w.x);
  float nx10 = mix(n010, n110, w.x);
  float nx01 = mix(n001, n101, w.x);
  float nx11 = mix(n011, n111, w.x);
  float nxy0 = mix(nx00, nx10, w.y);
  float nxy1 = mix(nx01, nx11, w.y);
  return mix(nxy0, nxy1, w.z) * 1.1547;
}

vec3 rotateOctave(vec3 p) {
  return vec3(
     0.00 * p.x + 0.80 * p.y + 0.60 * p.z,
    -0.80 * p.x + 0.36 * p.y - 0.48 * p.z,
    -0.60 * p.x - 0.48 * p.y + 0.64 * p.z
  );
}

float fbm(vec3 p) {
  vec3 q = p;
  float total = 0.0;
  float amplitude = 1.0;
  float weight = 0.0;
  for (int i = 0; i < 3; i++) {
    total += perlin3(q) * amplitude;
    weight += amplitude;
    q = rotateOctave(q) * 2.02 + vec3(3.7, 1.9, 6.3);
    amplitude *= 0.48;
  }
  return total / max(weight, 0.0001);
}

vec3 warpVector(vec3 p) {
  return vec3(
    perlin3(p),
    perlin3(p + vec3(5.2, 1.3, 2.8)),
    perlin3(p + vec3(1.7, 9.2, 4.4))
  );
}

float wrapPhase(float phase) {
  float tau = 6.28318530718;
  return phase - floor(phase / tau) * tau;
}

vec3 curvedDomainMotion(float morphTime, vec3 rates, vec3 phases) {
  return vec3(
    sin(wrapPhase(morphTime * rates.x + phases.x)),
    sin(wrapPhase(morphTime * rates.y + phases.y)),
    cos(wrapPhase(morphTime * rates.z + phases.z))
  );
}

vec3 primaryDomainMotion(float morphTime) {
  vec3 primaryDirection = normalize(vec3(0.73, -0.41, 0.55));
  vec3 secondaryDirection = normalize(vec3(-0.28, 0.91, 0.31));
  vec3 primaryDrift = primaryDirection * morphTime * 0.105;
  vec3 secondaryDrift = secondaryDirection * morphTime * 0.023;
  vec3 curve = curvedDomainMotion(morphTime, vec3(0.071, 0.043, 0.029), vec3(0.0, 1.73, 4.11)) * 0.16;
  return primaryDrift + secondaryDrift + curve;
}

vec3 warpDomainMotion(float morphTime) {
  vec3 primaryDirection = normalize(vec3(-0.46, 0.38, 0.80));
  vec3 secondaryDirection = normalize(vec3(0.84, 0.51, -0.18));
  vec3 primaryDrift = primaryDirection * morphTime * 0.137;
  vec3 secondaryDrift = secondaryDirection * morphTime * 0.031;
  vec3 curve = curvedDomainMotion(morphTime, vec3(0.089, 0.053, 0.034), vec3(2.21, 5.07, 0.83)) * 0.12;
  return primaryDrift + secondaryDrift + curve;
}

float heightField(vec3 direction, float detail) {
  float detailLevel = clamp(detail / 5.0, 0.0, 1.0);
  float frequency = mix(1.05, 3.4, detailLevel);
  float morphTime = uTime * max(uMorphSpeed, 0.0);
  vec3 primaryMotion = primaryDomainMotion(morphTime);
  vec3 warpMotion = warpDomainMotion(morphTime);
  vec3 p = direction * frequency + vec3(1.7, 3.1, 5.3) + primaryMotion;
  vec3 warp = warpVector(p * 0.55 + warpMotion * 0.42 + vec3(0.7, -1.1, 0.4)) * uWarp;
  return fbm(p + warp);
}

float displacementAmount(float detail) {
  float amount = clamp(detail, 0.0, 1.0);
  float eased = amount * amount * (3.0 - 2.0 * amount);
  return eased * 0.30 * clamp(uIntensity, 0.0, 5.0);
}

vec3 surfacePoint(vec3 direction, float detail) {
  float height = heightField(direction, detail);
  float displacedRadius = 1.0 + height * displacementAmount(detail);
  return direction * max(displacedRadius, 0.72);
}

vec3 rotateAroundAxis(vec3 p, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return p * c + cross(axis, p) * s + axis * dot(axis, p) * (1.0 - c);
}

vec3 twistAxis() { return normalize(vec3(-0.68, 0.54, 0.49)); }

float torsionAngle(vec3 direction) {
  float axial = clamp(dot(direction, twistAxis()), -1.0, 1.0);
  float smoothAxial = axial * (1.5 - 0.5 * axial * axial);
  return smoothAxial * clamp(uTwist, 0.0, 7.0);
}

vec3 twistedSurfacePoint(vec3 direction, float detail) {
  vec3 point = surfacePoint(direction, detail);
  return rotateAroundAxis(point, twistAxis(), torsionAngle(direction));
}

vec3 srgbToLinear(vec3 c) {
  vec3 v = max(c, vec3(0.0));
  vec3 cutoff = step(vec3(0.04045), v);
  return mix(v / 12.92, pow((v + 0.055) / 1.055, vec3(2.4)), cutoff);
}
vec3 linearToSrgb(vec3 c) {
  vec3 v = max(c, vec3(0.0));
  vec3 cutoff = step(vec3(0.0031308), v);
  return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, cutoff);
}
vec3 linearToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  float lc = pow(max(l, 0.0), 1.0 / 3.0);
  float mc = pow(max(m, 0.0), 1.0 / 3.0);
  float sc = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * lc + 0.7936177850 * mc - 0.0040720468 * sc,
    1.9779984951 * lc - 2.4285922050 * mc + 0.4505937099 * sc,
    0.0259040371 * lc + 0.7827717662 * mc - 0.8086757660 * sc
  );
}
vec3 oklabToLinear(vec3 c) {
  float lc = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float mc = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float sc = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = lc * lc * lc;
  float m = mc * mc * mc;
  float s = sc * sc * sc;
  return vec3(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec4 gradientAt(float t) {
  int count = clamp(int(uStopCount + 0.5), 1, 8);
  if (count == 1) return uColors[0];
  int lowIndex = 0;
  for (int i = 0; i < 7; i++) {
    if (i >= count - 1) break;
    if (t >= uStops[i]) lowIndex = i;
  }
  int highIndex = lowIndex + 1;
  float start = uStops[lowIndex];
  float end = uStops[highIndex];
  float amount = clamp((t - start) / max(end - start, 0.0001), 0.0, 1.0);
  amount = amount * amount * (3.0 - 2.0 * amount);
  vec4 a = uColors[lowIndex];
  vec4 b = uColors[highIndex];
  vec3 labA = linearToOklab(srgbToLinear(a.rgb));
  vec3 labB = linearToOklab(srgbToLinear(b.rgb));
  vec3 blended = linearToSrgb(oklabToLinear(mix(labA, labB, amount)));
  return vec4(blended, mix(a.a, b.a, amount));
}

float balanceRemap(float coordinate) {
  float balance = clamp(uBalance, -1.0, 1.0);
  float balanceExponent = pow(4.0, balance);
  return pow(clamp(coordinate, 0.0, 1.0), 1.0 / balanceExponent);
}
`;

  const MESH_VS = COMMON + `
in vec3 aPosition;
out vec3 vBaseDirection;

vec3 rotateX(vec3 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

vec3 animatedOrientation(vec3 p, float rotationTime) {
  vec3 axisA = normalize(vec3(0.36, 0.81, 0.46));
  vec3 axisB = normalize(vec3(-0.71, 0.29, 0.64));
  vec3 axisC = normalize(vec3(0.58, -0.69, 0.43));
  float angleA = wrapPhase(rotationTime * 0.287);
  float angleB = wrapPhase(rotationTime * 0.2236068);
  float angleC = wrapPhase(rotationTime * 0.1732051);
  vec3 oriented = rotateAroundAxis(p, axisA, angleA);
  oriented = rotateAroundAxis(oriented, axisB, angleB);
  oriented = rotateAroundAxis(oriented, axisC, angleC);
  return rotateX(oriented, -0.24);
}

float coverSphereScale(float aspect) {
  float safeRadius = 0.72;
  float cameraDistance = 3.0;
  float targetZoom = 4.0;
  float baseFocalLength = 1.73;
  float diagonal = sqrt(1.0 + aspect * aspect);
  float targetFocalLength = baseFocalLength * targetZoom;
  float requiredRadius = cameraDistance * diagonal /
    sqrt(targetFocalLength * targetFocalLength + diagonal * diagonal);
  return max(0.82, requiredRadius / safeRadius);
}

void main() {
  float detail = clamp(uDetail, 0.0, 5.0);
  float rotationTime = uTime * max(uRotationSpeed, 0.0);
  float aspect = max(uAspect, 0.001);
  float zoom = clamp(uZoom, 0.5, 10.0);

  vec3 baseDirection = normalize(aPosition);
  vec3 objectPosition = twistedSurfacePoint(baseDirection, detail);
  vec3 rotatedPosition = animatedOrientation(objectPosition, rotationTime);

  float sphereScale = coverSphereScale(aspect);
  vec3 worldPosition = rotatedPosition * sphereScale;
  vec3 viewPosition = worldPosition + vec3(0.0, 0.0, -3.0);

  float focalLength = 1.73 * zoom;
  float nearPlane = 0.1;
  float farPlane = 10.0;
  float depthA = farPlane / (nearPlane - farPlane);
  float depthB = nearPlane * farPlane / (nearPlane - farPlane);

  float zGpu = depthA * viewPosition.z + depthB;   // 0..1 depth range
  float w = -viewPosition.z;
  gl_Position = vec4(
    viewPosition.x * focalLength / aspect,
    viewPosition.y * focalLength,
    2.0 * zGpu - w,                                 // remap to GL -1..1
    w
  );
  vBaseDirection = baseDirection;
}
`;

  const MESH_FS = COMMON + `
in vec3 vBaseDirection;
out vec4 outColor;

float spreadCoordinate(float raw) {
  return clamp((raw - 0.5) * 3.0 + 0.5, 0.0, 1.0);
}

void main() {
  float detail = clamp(uDetail, 0.0, 5.0);
  vec3 direction = normalize(vBaseDirection);
  float field = heightField(direction, detail);
  float coordinate = spreadCoordinate(field * 0.5 + 0.5);
  vec4 c = gradientAt(balanceRemap(coordinate));
  outColor = vec4(c.rgb * c.a, c.a);                // premultiplied for the canvas
}
`;

  const BACKDROP_VS = COMMON + `
out vec2 vScreenUv;
void main() {
  vec2 positions[3] = vec2[3](vec2(-1.0, -3.0), vec2(-1.0, 1.0), vec2(3.0, 1.0));
  vec2 p = positions[gl_VertexID];
  gl_Position = vec4(p, 0.5, 1.0);
  vScreenUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
}
`;

  const BACKDROP_FS = COMMON + `
in vec2 vScreenUv;
out vec4 outColor;
void main() {
  float aspect = max(uAspect, 0.001);
  vec2 axis = normalize(vec2(0.62 * aspect, 0.78));
  vec2 centered = vec2((vScreenUv.x - 0.5) * aspect, vScreenUv.y - 0.5);
  float extent = abs(axis.x) * aspect * 0.5 + abs(axis.y) * 0.5;
  float raw = dot(centered, axis) / max(extent * 2.0, 0.0001) + 0.5;
  vec4 c = gradientAt(balanceRemap(raw));
  outColor = vec4(c.rgb * c.a, c.a);
}
`;

  // Cube-sphere mesh, same construction as the Figma shader (lower resolution for phones).
  function buildSphere(resolution) {
    const faces = [
      { right: [0, 0, -1], up: [0, 1, 0] },
      { right: [0, 0, 1], up: [0, 1, 0] },
      { right: [1, 0, 0], up: [0, 0, -1] },
      { right: [1, 0, 0], up: [0, 0, 1] },
      { right: [1, 0, 0], up: [0, 1, 0] },
      { right: [-1, 0, 0], up: [0, 1, 0] },
    ];
    const perFace = (resolution + 1) * (resolution + 1);
    const vertices = new Float32Array(faces.length * perFace * 3);
    const indices = new Uint32Array(faces.length * resolution * resolution * 6);
    let vo = 0, io = 0;
    for (const face of faces) {
      const r = face.right, u = face.up;
      const f = [
        r[1] * u[2] - r[2] * u[1],
        r[2] * u[0] - r[0] * u[2],
        r[0] * u[1] - r[1] * u[0],
      ];
      const base = vo / 3;
      for (let row = 0; row <= resolution; row++) {
        const v = (row / resolution) * 2 - 1;
        for (let col = 0; col <= resolution; col++) {
          const s = (col / resolution) * 2 - 1;
          const x = f[0] + r[0] * s + u[0] * v;
          const y = f[1] + r[1] * s + u[1] * v;
          const z = f[2] + r[2] * s + u[2] * v;
          const x2 = x * x, y2 = y * y, z2 = z * z;
          vertices[vo++] = x * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3);
          vertices[vo++] = y * Math.sqrt(1 - z2 / 2 - x2 / 2 + (z2 * x2) / 3);
          vertices[vo++] = z * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3);
        }
      }
      const rowSize = resolution + 1;
      for (let row = 0; row < resolution; row++) {
        for (let col = 0; col < resolution; col++) {
          const a = base + row * rowSize + col;
          const b = a + 1, c = a + rowSize + 1, d = a + rowSize;
          indices[io++] = a; indices[io++] = b; indices[io++] = c;
          indices[io++] = a; indices[io++] = c; indices[io++] = d;
        }
      }
    }
    return { vertices, indices };
  }

  function minimumZoom(aspect) {
    const diagonal = Math.sqrt(1 + aspect * aspect);
    const safeRadius = 0.72, cameraDistance = 3, baseFocal = 1.73, targetCover = 4;
    const targetFocal = baseFocal * targetCover;
    const requiredRadius = cameraDistance * diagonal / Math.sqrt(targetFocal * targetFocal + diagonal * diagonal);
    const sphereScale = Math.max(0.82, requiredRadius / safeRadius);
    const conservative = Math.min(cameraDistance - 0.001, sphereScale * safeRadius);
    const depth = Math.sqrt(Math.max(0.0001, cameraDistance * cameraDistance - conservative * conservative));
    const cover = Math.min(10, Math.max(0.5, (diagonal * depth / (baseFocal * conservative)) * 1.12));
    return Math.min(10, Math.max(0.5, cover * 0.65));
  }

  function setupGradient() {
    const gl = gradientCanvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: true });
    if (!gl) throw new Error('WebGL2 unavailable');

    const meshProg = program(gl, MESH_VS, MESH_FS);
    const backProg = program(gl, BACKDROP_VS, BACKDROP_FS);
    const { vertices, indices } = buildSphere(80);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(meshProg, 'aPosition');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    const emptyVao = gl.createVertexArray();

    const colors = new Float32Array(32);
    const stops = new Float32Array(8);
    GRADIENT.stops.forEach((s, i) => { colors.set(s.c, i * 4); stops[i] = s.p; });

    const maxZoom = 10;
    const rotationSpeed = Math.min(0.25, Math.max(0, (GRADIENT.rotationSpeedPercent / 100) * 0.25));

    function setUniforms(prog, time, aspect) {
      const minZ = minimumZoom(aspect);
      const zoom = Math.min(maxZoom, Math.max(minZ, minZ * Math.pow(maxZoom / minZ, GRADIENT.zoomPercent / 100)));
      const f = (n, v) => gl.uniform1f(gl.getUniformLocation(prog, n), v);
      f('uDetail', GRADIENT.detail);
      f('uTime', time);
      f('uAspect', aspect);
      f('uStopCount', GRADIENT.stops.length);
      f('uZoom', zoom);
      f('uMorphSpeed', GRADIENT.morphSpeed);
      f('uRotationSpeed', rotationSpeed);
      f('uBalance', GRADIENT.gradientBalance / 100);
      f('uWarp', GRADIENT.warp);
      f('uIntensity', GRADIENT.intensity);
      f('uTwist', GRADIENT.twist);
      gl.uniform4fv(gl.getUniformLocation(prog, 'uColors'), colors);
      gl.uniform1fv(gl.getUniformLocation(prog, 'uStops'), stops);
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = 0.5 * dpr; // the gradient is soft, half resolution is plenty
      const w = Math.max(2, Math.round(hero.clientWidth * scale));
      const h = Math.max(2, Math.round(hero.clientHeight * scale));
      if (gradientCanvas.width !== w || gradientCanvas.height !== h) {
        gradientCanvas.width = w;
        gradientCanvas.height = h;
      }
    }

    function draw(time) {
      const w = gradientCanvas.width, h = gradientCanvas.height;
      const aspect = w / Math.max(h, 1);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.disable(gl.BLEND);

      // Backdrop gradient
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(backProg);
      setUniforms(backProg, time, aspect);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Displaced, rotating sphere
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.frontFace(gl.CCW);
      gl.useProgram(meshProg);
      setUniforms(meshProg, time, aspect);
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_INT, 0);
    }

    return { resize, draw, gl };
  }

  // =====================================================================
  // 2. Moire (static)
  // =====================================================================
  const MOIRE_VS = `#version 300 es
precision highp float;
void main() {
  vec2 positions[3] = vec2[3](vec2(-1.0, -3.0), vec2(-1.0, 1.0), vec2(3.0, 1.0));
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

  const MOIRE_FS = `#version 300 es
precision highp float;
uniform vec2 uDims;
uniform float uLineCount;
uniform float uZoom;
uniform float uRgbSplit;
uniform float uLineOffset;
uniform vec2 uWarpOrigin;
out vec4 outColor;

const float PI = 3.14159265;

// Brightness of one color channel for a given (already shifted) uv.
float channel(vec2 uvC, vec2 origin, float aspect) {
  const float warpAmp = 0.04;
  const float warpFreq = 2.5;
  const float angleOffset = 0.1222;
  const float lineWidth = 0.25;
  float cosA = cos(angleOffset);
  float sinA = sin(angleOffset);

  vec2 delta = uvC - origin;
  float dist = length(delta * vec2(aspect, 1.0));
  float warp = warpAmp * sin(warpFreq * PI * 2.0 * dist);
  vec2 warpDir = dist < 0.001 ? vec2(0.0, 1.0) : normalize(delta * vec2(aspect, 1.0));
  vec2 warped1 = uvC + warpDir * warp;
  vec2 uvA = vec2(uvC.x * aspect, uvC.y);
  float rotY = -uvA.x * sinA + uvA.y * cosA;

  float phase1 = warped1.y * uLineCount + uLineOffset;
  float phase2 = (rotY + warp) * uLineCount + uLineOffset;
  float aa1 = max(length(vec2(dFdx(phase1), dFdy(phase1))), 1.5 / uLineCount);
  float aa2 = max(length(vec2(dFdx(phase2), dFdy(phase2))), 1.5 / uLineCount);
  float band1 = 1.0 - smoothstep(lineWidth - aa1, lineWidth + aa1, fract(phase1));
  float band2 = 1.0 - smoothstep(lineWidth - aa2, lineWidth + aa2, fract(phase2));
  return clamp(1.0 - (band1 + band2), 0.0, 1.0);
}

vec3 evalMoire(vec2 uvRaw, float aspect) {
  vec2 uv = (uvRaw - vec2(0.5)) / uZoom + vec2(0.5);
  vec2 origin = uWarpOrigin / 100.0;
  float s = uRgbSplit;
  vec2 uvR = uv + vec2(0.0, s);
  vec2 uvG = uv + vec2(-s * 0.866, -s * 0.5);
  vec2 uvB = uv + vec2( s * 0.866, -s * 0.5);
  return vec3(channel(uvR, origin, aspect), channel(uvG, origin, aspect), channel(uvB, origin, aspect));
}

void main() {
  vec2 dims = max(uDims, vec2(1.0));
  vec2 fragPx = vec2(gl_FragCoord.x, dims.y - gl_FragCoord.y); // top-left origin
  vec2 uvRaw = fragPx / dims;
  float aspect = dims.x / max(dims.y, 1.0);
  vec2 texel = vec2(1.0) / dims;

  vec3 sum = evalMoire(uvRaw + texel * vec2(-0.375,  0.375), aspect)
           + evalMoire(uvRaw + texel * vec2(-0.125,  0.125), aspect)
           + evalMoire(uvRaw + texel * vec2( 0.125, -0.125), aspect)
           + evalMoire(uvRaw + texel * vec2( 0.375, -0.375), aspect)
           + evalMoire(uvRaw + texel * vec2(-0.375, -0.125), aspect)
           + evalMoire(uvRaw + texel * vec2(-0.125, -0.375), aspect)
           + evalMoire(uvRaw + texel * vec2( 0.125,  0.375), aspect)
           + evalMoire(uvRaw + texel * vec2( 0.375,  0.125), aspect);
  outColor = vec4(sum * 0.125, 1.0);
}
`;

  function setupMoire() {
    const gl = moireCanvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const prog = program(gl, MOIRE_VS, MOIRE_FS);
    const vao = gl.createVertexArray();

    function draw() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(hero.clientWidth * dpr));
      const h = Math.max(2, Math.round(hero.clientHeight * dpr));
      moireCanvas.width = w;
      moireCanvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.uniform2f(gl.getUniformLocation(prog, 'uDims'), w, h);
      gl.uniform1f(gl.getUniformLocation(prog, 'uLineCount'), MOIRE.lineCount);
      gl.uniform1f(gl.getUniformLocation(prog, 'uZoom'), MOIRE.zoom);
      gl.uniform1f(gl.getUniformLocation(prog, 'uRgbSplit'), MOIRE.rgbSplit);
      gl.uniform1f(gl.getUniformLocation(prog, 'uLineOffset'), MOIRE.lineOffset);
      gl.uniform2f(gl.getUniformLocation(prog, 'uWarpOrigin'), MOIRE.warpOrigin[0], MOIRE.warpOrigin[1]);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    return { draw };
  }

  // =====================================================================
  // Run
  // =====================================================================
  let gradient, moire;
  try {
    gradient = setupGradient();
    moire = setupMoire();
  } catch (err) {
    console.warn('Shader fills unavailable, using CSS fallback.', err);
    fail();
    return;
  }

  const STILL_TIME = 6.0; // used when the viewer prefers reduced motion
  let raf = 0;
  let last = 0;
  let t0 = 0;

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    if (ts - last < 33) return; // cap at about 30 fps to save battery
    last = ts;
    if (!t0) t0 = ts;
    gradient.draw((ts - t0) * 0.001);
  }

  function layout() {
    if (!hero.clientWidth || !hero.clientHeight) return;
    gradient.resize();
    moire.draw();
    if (reduceMotion) gradient.draw(STILL_TIME);
  }

  function start() { if (!raf && !reduceMotion) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  gradientCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); fail(); });
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });

  let resizeTimer = 0;
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); }).observe(hero);

  layout();
  start();
})();
