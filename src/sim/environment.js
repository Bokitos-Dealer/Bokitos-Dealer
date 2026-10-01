// Sky, sun, weather, wind, rain, fog and night lighting.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise1, damp, DEG } from '../util/math.js';
import { setWetness } from '../city/materials.js';

const LAT = 52.37 * DEG, LON = 4.9;

export const WEATHER_PRESETS = {
  sunny: { label: 'Sunny', cloud: 0.12, rain: 0, wind: 3.0, fog: 0, temp: 18 },
  cloudy: { label: 'Cloudy', cloud: 0.75, rain: 0, wind: 5.0, fog: 0, temp: 14 },
  drizzle: { label: 'Drizzle (motregen)', cloud: 0.95, rain: 0.22, wind: 4.5, fog: 0.2, temp: 12 },
  rain: { label: 'Rain', cloud: 1, rain: 0.62, wind: 7.5, fog: 0.25, temp: 11 },
  storm: { label: 'Storm', cloud: 0.92, rain: 0.42, wind: 14, fog: 0.15, temp: 11 },
  fog: { label: 'Mist', cloud: 0.8, rain: 0, wind: 1.2, fog: 1, temp: 9 },
};

// --- sun position -----------------------------------------------------------
export function amsterdamOffsetHours(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const h = +parts.find((p) => p.type === 'hour').value, m = +parts.find((p) => p.type === 'minute').value;
    let off = h + m / 60 - (date.getUTCHours() + date.getUTCMinutes() / 60);
    if (off > 12) off -= 24;
    if (off < -12) off += 24;
    return Math.round(off);
  } catch {
    return 2;
  }
}
export function amsterdamNowHours() {
  const d = new Date();
  const off = amsterdamOffsetHours(d);
  return (((d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + off) % 24) + 24) % 24;
}

export function sunDirection(localHours, dayOfYear, offsetHours) {
  const decl = -23.44 * DEG * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const B = ((2 * Math.PI) / 365) * (dayOfYear - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const utc = localHours - offsetHours;
  const solar = utc + LON / 15 + eot / 60;
  const H = (solar - 12) * 15 * DEG;
  const sinEl = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(sinEl);
  const x = -Math.sin(H) * Math.cos(decl);
  const y = Math.sin(decl) * Math.cos(LAT) - Math.cos(decl) * Math.cos(H) * Math.sin(LAT);
  const az = Math.atan2(x, y);
  return { dir: new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)), elevation: el / DEG, azimuth: az / DEG };
}

// --- sky shader ---------------------------------------------------------------
const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform vec3 sunDir;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 groundCol;
uniform vec3 sunCol;
uniform vec3 cloudLit;
uniform vec3 cloudDark;
uniform float cloud;
uniform float stars;
uniform float time;
uniform vec2 windOff;
uniform float haze;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  if (h < 0.0) col = mix(horizon, groundCol, clamp(-h * 6.0, 0.0, 1.0));
  float sd = max(dot(d, sunDir), 0.0);
  float sunVis = smoothstep(-0.05, 0.02, sunDir.y);
  vec3 sunAdd = sunCol * (pow(sd, 900.0) * 18.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.12) * sunVis;
  // stars
  if (stars > 0.0 && h > 0.0) {
    vec2 sp = floor(d.xz / (h + 0.3) * 260.0);
    float s = step(0.9975, hash(sp)) * stars * smoothstep(0.0, 0.25, h);
    col += vec3(s);
  }
  // clouds on a plane
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 0.9 + windOff;
    float n = fbm(uv * 1.3 + vec2(time * 0.002, 0.0));
    float cov = mix(0.75, 0.32, cloud);
    float c = smoothstep(cov, cov + 0.22, n) * smoothstep(0.0, 0.12, h);
    float overcast = smoothstep(0.75, 1.0, cloud);
    c = max(c, overcast * 0.92 * smoothstep(0.0, 0.08, h));
    float shade = fbm(uv * 2.6 + 3.0);
    vec3 cc = mix(cloudDark, cloudLit, clamp(shade * 1.3 - 0.1 + pow(sd, 6.0) * 0.6, 0.0, 1.0));
    col = mix(col + sunAdd * (1.0 - cloud * 0.9), cc, c);
    sunAdd *= (1.0 - c);
  } else {
    sunAdd *= 0.0;
  }
  col += sunAdd * (1.0 - cloud * 0.85);
  // haze towards the horizon matches the fog
  col = mix(col, horizon, haze * (1.0 - smoothstep(0.0, 0.35, abs(h))));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// keyframes by sun elevation (degrees): [elev, zenith, horizon]
const KEYS = [
  [-18, '#02040b', '#0a0f1c'],
  [-8, '#060c1f', '#1b2236'],
  [-3, '#1b2b52', '#7a5568'],
  [1, '#3a5a92', '#e59a6a'],
  [6, '#4a78b8', '#f0c08e'],
  [15, '#3f7dce', '#b9d3ec'],
  [40, '#2f6fc4', '#aac8e6'],
];
function skyColorsAt(el) {
  const c1 = new THREE.Color(), c2 = new THREE.Color();
  if (el <= KEYS[0][0]) return [c1.set(KEYS[0][1]), c2.set(KEYS[0][2])];
  for (let i = 0; i + 1 < KEYS.length; i++) {
    const [e0, z0, h0] = KEYS[i], [e1, z1, h1] = KEYS[i + 1];
    if (el <= e1) {
      const t = (el - e0) / (e1 - e0);
      return [c1.set(z0).lerp(new THREE.Color(z1), t), c2.set(h0).lerp(new THREE.Color(h1), t)];
    }
  }
  const k = KEYS[KEYS.length - 1];
  return [c1.set(k[1]), c2.set(k[2])];
}

export class Environment {
  constructor(renderer, scene, mats, quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.mats = mats;
    this.quality = quality;
    this.hours = 14;
    this.timeScale = 1;
    const now = new Date();
    this.dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    this.offset = amsterdamOffsetHours(now);
    this.weather = { ...WEATHER_PRESETS.cloudy };
    this.target = { ...this.weather };
    this.windDir = 225 * DEG; // from the south-west, the usual Dutch wind
    this.wind = { x: 0, z: 0, speed: 0 };
    this.wet = 0;
    this.t = 0;
    this.dynamic = false;
    this.nextChange = 600;

    // sky dome
    this.skyUniforms = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      zenith: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      groundCol: { value: new THREE.Color(0x2a2a2c) },
      sunCol: { value: new THREE.Color(1, 0.95, 0.85) },
      cloudLit: { value: new THREE.Color() },
      cloudDark: { value: new THREE.Color() },
      cloud: { value: 0.5 },
      stars: { value: 0 },
      time: { value: 0 },
      windOff: { value: new THREE.Vector2() },
      haze: { value: 0.3 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    // environment map from the sky only
    this.skyScene = new THREE.Scene();
    this.skyClone = new THREE.Mesh(this.sky.geometry, skyMat);
    this.skyScene.add(this.skyClone);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;
    this.lastEnvKey = '';

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = quality.shadows;
    const sm = quality.shadowSize;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd4ee, 0x4a3f38, 0.6);
    scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0xb9c6d2, 0.002);
    scene.fog = this.fog;

    // rain
    this.rain = this.makeRain(quality.rainDrops);
    scene.add(this.rain);

    // street lamp light pool
    this.lampLights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 22, 1.6);
      scene.add(l);
      this.lampLights.push(l);
    }
    this.lampTimer = 0;
  }

  makeRain(n) {
    const pos = new Float32Array(n * 2 * 3);
    const seed = new Float32Array(n * 2 * 3);
    const end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 60, y = Math.random() * 32, z = Math.random() * 60;
      for (let k = 0; k < 2; k++) {
        seed.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('endp', new THREE.BufferAttribute(end, 1));
    this.rainUniforms = { time: { value: 0 }, cam: { value: new THREE.Vector3() }, vel: { value: new THREE.Vector3(0, -9, 0) }, alpha: { value: 0 }, tint: { value: new THREE.Color(0.75, 0.78, 0.82) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 seed; attribute float endp;
        uniform float time; uniform vec3 cam; uniform vec3 vel;
        varying float vA;
        void main() {
          vec3 box = vec3(60.0, 32.0, 60.0);
          vec3 p = mod(seed + vel * time - cam + box * 0.5, box) - box * 0.5 + cam;
          p += vel * 0.045 * endp;
          vA = 1.0 - endp * 0.6;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float alpha; uniform vec3 tint; varying float vA;
        void main() { gl_FragColor = vec4(tint, alpha * vA); }`,
    });
    const lines = new THREE.LineSegments(g, mat);
    lines.frustumCulled = false;
    return lines;
  }

  setPreset(name) {
    const p = WEATHER_PRESETS[name] || WEATHER_PRESETS.cloudy;
    this.target = { ...p };
    this.presetName = name;
  }
  applyImmediately() {
    this.weather = { ...this.target };
    this.wet = this.weather.rain > 0.1 ? 0.8 : 0;
  }

  /** Try to fetch the real current weather in Amsterdam (Open-Meteo, no key needed). */
  async fetchLive() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=52.37&longitude=4.89&current=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=ms';
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      const j = await r.json();
      const c = j.current;
      const rain = clamp((c.precipitation || 0) / 3.5, 0, 1);
      const code = c.weather_code;
      this.target = {
        label: 'Live: ' + describeCode(code),
        cloud: clamp((c.cloud_cover ?? 60) / 100, 0, 1),
        rain: rain > 0 ? Math.max(0.18, rain) : 0,
        wind: c.wind_speed_10m ?? 4,
        fog: code === 45 || code === 48 ? 1 : 0,
        temp: c.temperature_2m ?? 12,
      };
      this.windDir = (c.wind_direction_10m ?? 225) * DEG;
      this.presetName = 'live';
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(to);
    }
  }

  get darkness() {
    return this._dark || 0;
  }

  update(dt, camera, focus, lamps) {
    this.t += dt;
    this.hours = (this.hours + (dt * this.timeScale) / 3600) % 24;
    // weather blending
    const w = this.weather, tg = this.target;
    const k = 1 - Math.exp(-dt / 20);
    for (const key of ['cloud', 'rain', 'wind', 'fog', 'temp']) w[key] = lerp(w[key], tg[key], k);
    w.label = tg.label;
    if (this.dynamic) {
      this.nextChange -= dt * Math.max(1, this.timeScale / 6);
      if (this.nextChange <= 0) {
        const names = ['sunny', 'cloudy', 'cloudy', 'drizzle', 'rain', 'sunny', 'storm'];
        this.target = { ...WEATHER_PRESETS[names[Math.floor(Math.random() * names.length)]] };
        this.nextChange = 300 + Math.random() * 600;
      }
    }
    // wind with gusts
    const gust = 0.75 + noise1(this.t * 0.35) * 0.45 + (noise1(this.t * 1.7 + 9) - 0.5) * 0.25 * Math.min(1, w.wind / 8);
    const spd = w.wind * gust;
    const dirJitter = (noise1(this.t * 0.05 + 3) - 0.5) * 0.4;
    const D = this.windDir + dirJitter;
    this.wind.x = -Math.sin(D) * spd;
    this.wind.z = Math.cos(D) * spd;
    this.wind.speed = spd;
    // wetness
    if (w.rain > 0.05) this.wet = clamp(this.wet + dt * w.rain * 0.02, 0, 1);
    else this.wet = clamp(this.wet - dt * 0.0012 * (1 + (1 - w.cloud) * 2), 0, 1);
    setWetness(this.mats, this.wet);

    // sun & sky
    const sun = sunDirection(this.hours, this.dayOfYear, this.offset);
    this.sunInfo = sun;
    const el = sun.elevation;
    const [zen, hor] = skyColorsAt(el);
    const grey = new THREE.Color().setRGB(0.6, 0.63, 0.67).multiplyScalar(clamp(0.15 + smoothstep(-8, 20, el) * 0.95, 0, 1));
    const overcast = smoothstep(0.45, 1, w.cloud) * 0.85 + w.fog * 0.3;
    zen.lerp(grey, clamp(overcast, 0, 1));
    hor.lerp(grey.clone().multiplyScalar(1.08), clamp(overcast * 0.9 + w.rain * 0.2, 0, 1));
    const U = this.skyUniforms;
    U.sunDir.value.copy(sun.dir);
    U.zenith.value.copy(zen);
    U.horizon.value.copy(hor);
    U.cloud.value = w.cloud;
    U.time.value = this.t;
    U.windOff.value.x += (this.wind.x * dt) / 3000;
    U.windOff.value.y += (this.wind.z * dt) / 3000;
    const dayL = smoothstep(-6, 12, el);
    U.cloudLit.value.setRGB(0.95, 0.94, 0.92).multiplyScalar(0.15 + dayL * 0.85).lerp(new THREE.Color(1, 0.62, 0.42), smoothstep(12, 1, el) * smoothstep(-5, 1, el) * 0.7);
    U.cloudDark.value.setRGB(0.45, 0.48, 0.53).multiplyScalar(0.08 + dayL * 0.8);
    U.sunCol.value.setRGB(1, 0.92, 0.8).lerp(new THREE.Color(1, 0.5, 0.25), smoothstep(15, 0, el));
    const dark = 1 - smoothstep(-7, 4, el);
    this._dark = clamp(dark + overcast * 0.12 * (1 - dark) + w.rain * 0.1, 0, 1);
    U.stars.value = smoothstep(-6, -12, el) * (1 - w.cloud);
    U.haze.value = 0.25 + w.fog * 0.6 + w.rain * 0.3;
    this.sky.position.copy(camera.position);

    // fog
    const fogDensity = (0.0013 + w.cloud * 0.0007 + w.rain * 0.0045 + w.fog * 0.012) * (1 + this._dark * 0.4);
    this.fog.density = fogDensity;
    this.fog.color.copy(hor).multiplyScalar(0.92);
    if (this.renderer.toneMappingExposure !== undefined) this.renderer.toneMappingExposure = 0.95 + this._dark * 0.25;

    // lights
    const sunUp = el > -2;
    const lightDir = sunUp ? sun.dir : sun.dir.clone().negate().setY(Math.abs(sun.dir.y) + 0.3).normalize(); // moon
    const sunI = sunUp ? smoothstep(-2, 10, el) * (2.8 - w.cloud * 2.1) : 0.12 * (1 - w.cloud * 0.7);
    this.sun.intensity = Math.max(0, sunI);
    this.sun.color.copy(sunUp ? U.sunCol.value : new THREE.Color(0.6, 0.7, 1));
    this.sun.position.set(focus.x + lightDir.x * 150, focus.y + lightDir.y * 150, focus.z + lightDir.z * 150);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    this.sun.castShadow = this.quality.shadows && sunUp && w.cloud < 0.9 && el > 2;
    this.hemi.color.copy(zen).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.setRGB(0.3, 0.26, 0.22).multiplyScalar(0.3 + dayL * 0.7);
    this.hemi.intensity = 0.25 + dayL * 0.55 + overcast * 0.25;
    // city glow at night: warm light bouncing off the streets
    const nightGlow = smoothstep(0.4, 1, this._dark);
    if (nightGlow > 0) {
      this.hemi.color.lerp(new THREE.Color(0.55, 0.5, 0.62), nightGlow);
      this.hemi.groundColor.lerp(new THREE.Color(0.42, 0.3, 0.18), nightGlow);
      this.hemi.intensity += nightGlow * 0.35;
    }

    // environment map (reflections) — refreshed when the sky changes enough
    const key = `${Math.round(el)}|${Math.round(w.cloud * 10)}|${Math.round(w.fog * 5)}`;
    if (key !== this.lastEnvKey) {
      this.lastEnvKey = key;
      this.skyClone.position.set(0, 0, 0);
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.skyScene, 0, 0.1, 3000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.35 + dayL * 0.35;
    }

    // rain
    const ru = this.rainUniforms;
    ru.time.value = this.t;
    ru.cam.value.copy(camera.position);
    ru.vel.value.set(this.wind.x * 0.8, -8.5 - w.rain * 3, this.wind.z * 0.8);
    ru.alpha.value = clamp(w.rain * 0.55, 0, 0.5) * (1 - this._dark * 0.4);
    ru.tint.value.setRGB(0.72, 0.76, 0.82).multiplyScalar(0.5 + dayL * 0.5);
    this.rain.visible = w.rain > 0.02;

    // water ripples
    const wm = this.mats.m.water;
    wm.normalMap.offset.x += dt * (0.002 + this.wind.x * 0.0004);
    wm.normalMap.offset.y += dt * (0.0015 + this.wind.z * 0.0004);
    const ns = 0.25 + Math.min(1, spd / 12) * 0.5 + w.rain * 0.4;
    wm.normalScale.set(ns, ns);
    wm.color.setRGB(0.07, 0.11, 0.1).multiplyScalar(0.4 + dayL * 0.6);

    // night lighting
    const night = this._dark;
    const winI = smoothstep(0.25, 0.85, night) * 0.85;
    for (const f of this.mats.m.facades) f.emissiveIntensity = winI;
    this.mats.m.lampGlass.emissiveIntensity = smoothstep(0.3, 0.6, night) * 3.5;
    if (lamps) {
      this.lampTimer -= dt;
      if (this.lampTimer <= 0) {
        this.lampTimer = 0.4;
        const on = night > 0.45;
        if (on) {
          const cx = camera.position.x, cz = camera.position.z;
          let near = [];
          for (const l of lamps) {
            const d = (l.x - cx) ** 2 + (l.z - cz) ** 2;
            if (d < 70 * 70) near.push([d, l]);
          }
          near.sort((a, b) => a[0] - b[0]);
          near = near.slice(0, this.lampLights.length);
          this.lampLights.forEach((pl, i) => {
            const n = near[i];
            if (n) {
              pl.position.set(n[1].x, n[1].y + 4.5, n[1].z);
              pl.intensity = 22 * smoothstep(0.45, 0.8, night);
            } else pl.intensity = 0;
          });
        } else for (const pl of this.lampLights) pl.intensity = 0;
      }
    }
    if (this.glowPoints) {
      this.glowPoints.material.opacity = smoothstep(0.35, 0.7, night) * 0.9;
      this.glowPoints.visible = night > 0.35;
    }
  }

  /** Soft glows over all street lamps (one draw call). */
  makeLampGlows(lamps, glowTex) {
    const pos = new Float32Array(lamps.length * 3);
    lamps.forEach((l, i) => pos.set([l.x, l.y + 4.65, l.z], i * 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: glowTex, size: 3.2, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffcf8a, fog: true });
    this.glowPoints = new THREE.Points(g, m);
    this.glowPoints.frustumCulled = false;
    this.scene.add(this.glowPoints);
  }

  describe() {
    const w = this.weather;
    const bft = beaufort(this.wind.speed);
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const from = dirs[Math.round((((this.windDir / DEG) % 360) + 360) % 360 / 45) % 8];
    return { label: w.label, temp: Math.round(w.temp + Math.sin(((this.hours - 9) / 24) * Math.PI * 2) * 2.5), bft, from };
  }
}

export function beaufort(ms) {
  const t = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  let b = 0;
  while (b < t.length && ms >= t[b]) b++;
  return b;
}

function describeCode(c) {
  if (c === 0) return 'Clear';
  if (c <= 2) return 'Partly cloudy';
  if (c === 3) return 'Overcast';
  if (c === 45 || c === 48) return 'Fog';
  if (c >= 51 && c <= 57) return 'Drizzle';
  if (c >= 61 && c <= 67) return 'Rain';
  if (c >= 71 && c <= 77) return 'Snow';
  if (c >= 80 && c <= 82) return 'Showers';
  if (c >= 95) return 'Thunderstorm';
  return 'Cloudy';
}

export { damp };
