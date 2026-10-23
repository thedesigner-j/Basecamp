/*
 * SceneReveal — cursor reveal between two layers (images and/or videos).
 *
 * The top layer is drawn over the bottom layer. Moving the cursor paints a
 * mask that reveals the bottom layer; after `hold` seconds the mask fades
 * back over `fade` seconds. No dependencies, WebGL2.
 *
 *   const fx = new SceneReveal(element, {
 *     layers: { top: { src: 'glass.mp4' }, bottom: { src: 'glow.mp4' } },
 *     settings: { radius: 160, hold: 0.5, fade: 1.2 },
 *   });
 */

export const DEFAULT_SETTINGS = {
  // Brush
  radius: 160, // CSS px
  softness: 0.6, // 0 = hard edge, 1 = fully feathered
  opacity: 1, // how far the reveal goes (0..1)
  scaleWithWidth: false, // radius is relative to a 1440px-wide container
  // Timing
  hold: 0.4, // seconds a revealed spot stays fully open
  fade: 1.2, // seconds to return to the top layer
  fadeCurve: 'smooth', // 'linear' | 'smooth' | 'quick' | 'linger'
  // Cursor
  smoothing: 0.35, // 0 = snaps to cursor, 0.95 = very lazy follow
  paintWhenStill: true, // keep the spot open while the cursor rests
  speedGrow: 0, // extra size from cursor speed (0..1)
  speedMax: 1.8, // max size multiplier from speed
  // Edge
  edgeNoise: 0.35, // wobble of the reveal edge
  noiseScale: 3, // size of the wobble pattern
  noiseSpeed: 0.25, // how fast the wobble moves
  ripple: 0.3, // refraction / lens push at the edge
  rim: 0, // brightness of a ring along the edge
  rimColor: '#9fe8ff',
  // Look
  glow: 0, // extra brightness on the revealed layer
  // Idle / mobile
  idleWander: false, // auto-reveal along a drifting path when nobody interacts
  idleDelay: 3, // seconds before wandering starts
  wanderSpeed: 0.2,
  touch: true,
  // Quality
  maskScale: 0.5, // mask resolution relative to the element
  maxDpr: 2,
  fit: 'cover', // 'cover' | 'contain'
  // Video
  syncVideos: true, // keep separate top/bottom videos in sync
  // Debug
  showMask: false,
};

const CURVES = { linear: 0, smooth: 1, quick: 2, linger: 3 };

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const MASK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uPrev;
uniform vec2 uView;
uniform vec2 uA;
uniform vec2 uB;
uniform float uRadius;
uniform float uSoft;
uniform float uOpacity;
uniform float uActive;
uniform float uHoldStep;
uniform float uFadeStep;
uniform float uDither;
uniform float uSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  vec4 m = texture(uPrev, vUv);
  float r = m.r;
  float h = m.g;
  float d = (hash(vUv * 917.0) - 0.5) * uDither;
  if (h > 0.0) h = max(h - uHoldStep - d, 0.0);
  else r = max(r - uFadeStep - d, 0.0);
  float dist = segDist(vUv * uView, uA, uB);
  float inner = uRadius * (1.0 - uSoft);
  float s = (1.0 - smoothstep(inner, uRadius + 0.001, dist)) * uActive;
  r = max(r, s * uOpacity);
  h = max(h, s);
  o = vec4(r, h, 0.0, 1.0);
}`;

const COMP_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTop;
uniform sampler2D uBot;
uniform sampler2D uMask;
uniform vec4 uTopCrop;
uniform vec4 uBotCrop;
uniform vec2 uTopScale;
uniform vec2 uBotScale;
uniform vec2 uView;
uniform vec2 uMaskTexel;
uniform float uTime;
uniform float uNoise;
uniform float uNoiseScale;
uniform float uRipple;
uniform float uRim;
uniform vec3 uRimColor;
uniform float uGlow;
uniform int uCurve;
uniform float uShowMask;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1, 0)), f - vec2(1, 0)), u.x),
             mix(dot(hash2(i + vec2(0, 1)), f - vec2(0, 1)), dot(hash2(i + vec2(1, 1)), f - vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
float curve(float r) {
  if (uCurve == 1) return r * r * (3.0 - 2.0 * r);
  if (uCurve == 2) return r * r;
  if (uCurve == 3) return 1.0 - (1.0 - r) * (1.0 - r);
  return r;
}
vec4 sampleLayer(sampler2D t, vec4 crop, vec2 scale, vec2 uv) {
  vec2 m = (uv - 0.5) * scale + 0.5;
  m.y = 1.0 - m.y;
  if (m.x < 0.0 || m.x > 1.0 || m.y < 0.0 || m.y > 1.0) return vec4(0.0);
  return texture(t, crop.xy + m * crop.zw);
}
float maskAt(vec2 uv) { return curve(texture(uMask, uv).r); }

void main() {
  float aspect = uView.x / max(uView.y, 1.0);
  vec2 np = vec2(vUv.x * aspect, vUv.y) * uNoiseScale;
  float n = 0.0;
  if (uNoise > 0.0 || uRipple > 0.0) n = fbm(np + vec2(uTime * 0.7, -uTime * 0.5)) + 0.5 * fbm(np * 2.3 - uTime);

  float m0 = maskAt(vUv);
  float edge = 4.0 * m0 * (1.0 - m0);
  float m = clamp(m0 + n * uNoise * 1.6 * edge, 0.0, 1.0);
  m = smoothstep(0.02, 0.98, m);

  // gradient of the mask for refraction at the edge
  vec2 o4 = uMaskTexel * 4.0;
  float gx = maskAt(vUv + vec2(o4.x, 0.0)) - maskAt(vUv - vec2(o4.x, 0.0));
  float gy = maskAt(vUv + vec2(0.0, o4.y)) - maskAt(vUv - vec2(0.0, o4.y));
  vec2 push = vec2(gx, gy) * uRipple * 0.04 + vec2(n) * uRipple * 0.004 * edge;

  vec4 top = sampleLayer(uTop, uTopCrop, uTopScale, vUv + push);
  vec4 bot = sampleLayer(uBot, uBotCrop, uBotScale, vUv - push);
  bot.rgb *= 1.0 + uGlow * m;

  vec4 col = mix(top, bot, m);
  float ring = 4.0 * m * (1.0 - m);
  col.rgb += uRimColor * ring * uRim;

  if (uShowMask > 0.5) col = vec4(mix(col.rgb * 0.35, vec3(m, texture(uMask, vUv).g, 0.2), 0.75), 1.0);
  o = col;
}`;

function hexToRgb(hex) {
  const h = String(hex || '#ffffff').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
}

function isVideoSrc(src, type) {
  if (type) return type === 'video';
  if (typeof src !== 'string') return src instanceof HTMLVideoElement;
  return /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(src) || src.startsWith('data:video');
}

const CROPS = {
  full: [0, 0, 1, 1],
  'top-half': [0, 0, 1, 0.5],
  'bottom-half': [0, 0.5, 1, 0.5],
  'left-half': [0, 0, 0.5, 1],
  'right-half': [0.5, 0, 0.5, 1],
};
function resolveCrop(crop) {
  if (!crop) return CROPS.full;
  if (typeof crop === 'string') return CROPS[crop] || CROPS.full;
  return crop;
}

class Media {
  constructor(gl, src, type, onReady) {
    this.gl = gl;
    this.src = src;
    this.ready = false;
    this.isVideo = false;
    this.w = 1;
    this.h = 1;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.onReady = onReady;

    if (src instanceof HTMLCanvasElement || src instanceof HTMLImageElement || src instanceof HTMLVideoElement) {
      this.el = src;
      this.isVideo = src instanceof HTMLVideoElement;
      this.owned = false;
      if (this.isVideo) this._watchVideo();
      else if (src instanceof HTMLImageElement && !src.complete) src.addEventListener('load', () => this._markReady(), { once: true });
      else this._markReady();
      return;
    }

    this.owned = true;
    if (isVideoSrc(src, type)) {
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.autoplay = true;
      v.preload = 'auto';
      v.src = src;
      this.el = v;
      this.isVideo = true;
      this._watchVideo();
      const tryPlay = () => v.play().catch(() => {});
      tryPlay();
      // iOS low-power mode blocks autoplay until the first interaction
      const kick = () => { tryPlay(); window.removeEventListener('pointerdown', kick); window.removeEventListener('touchstart', kick); };
      window.addEventListener('pointerdown', kick, { passive: true });
      window.addEventListener('touchstart', kick, { passive: true });
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => this._markReady();
      img.onerror = () => console.warn('[SceneReveal] could not load image', src);
      img.src = src;
      this.el = img;
    }
  }

  _watchVideo() {
    const v = this.el;
    const ok = () => { if (v.videoWidth) this._markReady(); };
    if (v.readyState >= 2) ok();
    v.addEventListener('loadeddata', ok);
    v.addEventListener('error', () => console.warn('[SceneReveal] could not load video', this.src));
    this.frameDirty = true;
    if ('requestVideoFrameCallback' in v) {
      const tick = () => { this.frameDirty = true; this._rvfc = v.requestVideoFrameCallback(tick); };
      this._rvfc = v.requestVideoFrameCallback(tick);
      this.useRvfc = true;
    }
  }

  _markReady() {
    const el = this.el;
    this.w = el.videoWidth || el.naturalWidth || el.width || 1;
    this.h = el.videoHeight || el.naturalHeight || el.height || 1;
    this.ready = true;
    this.uploaded = false;
    this.upload(true);
    this.onReady && this.onReady(this);
  }

  // Re-read a canvas/image source (editor uses this for live demo canvases)
  refresh() { this.uploaded = false; this.w = this.el.width || this.w; this.h = this.el.height || this.h; }

  upload(force) {
    if (!this.ready) return;
    const gl = this.gl;
    if (this.isVideo) {
      if (this.el.readyState < 2) return;
      if (!force && this.useRvfc && !this.frameDirty) return;
      this.frameDirty = false;
    } else if (this.uploaded && !force) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.el);
      this.uploaded = true;
    } catch (e) {
      if (!this._warned) { console.warn('[SceneReveal] texture upload failed (CORS?)', this.src, e); this._warned = true; }
    }
  }

  destroy() {
    if (this.isVideo && this._rvfc && this.el.cancelVideoFrameCallback) this.el.cancelVideoFrameCallback(this._rvfc);
    if (this.owned && this.isVideo) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
    this.gl.deleteTexture(this.tex);
  }
}

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class SceneReveal {
  constructor(container, config = {}) {
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) throw new Error('[SceneReveal] container not found');
    this.el = container;
    this.settings = { ...DEFAULT_SETTINGS, ...(config.settings || {}) };
    this.layerCfg = { top: null, bottom: null };
    this.media = new Map();
    this.time = 0;
    this.stats = { fps: 0 };
    this._fpsAcc = 0;
    this._fpsN = 0;

    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    container.prepend(canvas);
    this.canvas = canvas;

    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: !!config.preserveDrawingBuffer });
    if (!gl) { this._fallback(config.layers); return; }
    this.gl = gl;

    try {
      this.maskProg = compile(gl, VERT, MASK_FRAG);
      this.compProg = compile(gl, VERT, COMP_FRAG);
    } catch (e) {
      console.warn('[SceneReveal] shader error', e);
      this._fallback(config.layers);
      return;
    }
    this.vao = gl.createVertexArray();
    this.floatMask = !!gl.getExtension('EXT_color_buffer_float');

    this.pointer = { x: 0, y: 0, inside: false, lastMove: -1e9, moved: false };
    this.brush = { x: 0, y: 0, px: 0, py: 0, init: false, speedMul: 1 };
    this._bind();
    if (config.layers) this.setLayers(config.layers);
    this._resize();
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  // ---------- public API ----------
  set(partial) {
    const prevScale = this.settings.maskScale;
    Object.assign(this.settings, partial);
    if (partial.maskScale !== undefined && partial.maskScale !== prevScale) this._resize(true);
  }

  setLayers(layers) {
    for (const key of ['top', 'bottom']) if (layers[key] !== undefined) this.setLayer(key, layers[key]);
  }

  setLayer(which, cfg) {
    if (!this.gl) return;
    if (!cfg) { this.layerCfg[which] = null; this._gcMedia(); return; }
    const src = cfg.src;
    let m = this.media.get(src);
    if (!m) {
      m = new Media(this.gl, src, cfg.type, () => this.onMediaReady && this.onMediaReady(which, m));
      this.media.set(src, m);
    }
    this.layerCfg[which] = { media: m, crop: resolveCrop(cfg.crop) };
    this._gcMedia();
  }

  getVideos() { return [...this.media.values()].filter((m) => m.isVideo).map((m) => m.el); }

  refreshMedia() { for (const m of this.media.values()) if (!m.isVideo) m.refresh(); }

  clearMask() { this._clearMask = true; }

  destroy() {
    cancelAnimationFrame(this._raf);
    this._unbind && this._unbind();
    for (const m of this.media.values()) m.destroy();
    this.media.clear();
    this.canvas.remove();
    if (this._fallbackEl) this._fallbackEl.remove();
  }

  // ---------- internals ----------
  _gcMedia() {
    const used = new Set([this.layerCfg.top?.media, this.layerCfg.bottom?.media]);
    for (const [k, m] of this.media) if (!used.has(m)) { m.destroy(); this.media.delete(k); }
  }

  _fallback(layers) {
    const top = layers && layers.top;
    if (!top) return;
    const src = top.src;
    const el = isVideoSrc(src, top.type) ? document.createElement('video') : document.createElement('img');
    if (el.tagName === 'VIDEO') { el.muted = true; el.loop = true; el.autoplay = true; el.playsInline = true; }
    el.src = src;
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    this.el.prepend(el);
    this._fallbackEl = el;
    if (this.canvas) this.canvas.style.display = 'none';
  }

  _bind() {
    const onMove = (x, y, kind) => {
      const r = this.canvas.getBoundingClientRect();
      const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      if (kind === 'touch' && !this.settings.touch) return;
      this.pointer.x = x - r.left;
      this.pointer.y = y - r.top;
      this.pointer.inside = inside;
      if (inside) { this.pointer.lastMove = this.time; this.pointer.moved = true; }
    };
    const pm = (e) => onMove(e.clientX, e.clientY, e.pointerType);
    const tm = (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY, 'touch'); };
    const leave = () => { this.pointer.inside = false; };
    const tend = () => { if (this.settings.touch) this.pointer.inside = false; };
    window.addEventListener('pointermove', pm, { passive: true });
    window.addEventListener('pointerdown', pm, { passive: true });
    window.addEventListener('touchstart', tm, { passive: true });
    window.addEventListener('touchmove', tm, { passive: true });
    window.addEventListener('touchend', tend, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    // Keep the pointer position correct while the page scrolls under a resting cursor
    const scroll = () => { this.pointer.inside = false; };
    window.addEventListener('scroll', scroll, { passive: true });

    const ro = new ResizeObserver(() => this._resize());
    ro.observe(this.el);
    let io;
    this.visible = true;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; });
      io.observe(this.el);
    }
    this.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._unbind = () => {
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerdown', pm);
      window.removeEventListener('touchstart', tm);
      window.removeEventListener('touchmove', tm);
      window.removeEventListener('touchend', tend);
      window.removeEventListener('scroll', scroll);
      document.documentElement.removeEventListener('pointerleave', leave);
      ro.disconnect();
      io && io.disconnect();
    };
  }

  _resize(forceMask) {
    const gl = this.gl;
    if (!gl) return;
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.maxDpr);
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const mw = Math.max(8, Math.round(w * this.settings.maskScale));
    const mh = Math.max(8, Math.round(h * this.settings.maskScale));
    if (forceMask || !this.mask || this.mask.w !== mw || this.mask.h !== mh) this._makeMask(mw, mh);
  }

  _makeMask(w, h) {
    const gl = this.gl;
    if (this.mask) for (const t of this.mask.targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    const mk = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (this.floatMask) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fb };
    };
    this.mask = { w, h, targets: [mk(), mk()], i: 0 };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _brushTarget(t) {
    const p = this.pointer;
    const s = this.settings;
    const idle = t - p.lastMove;
    if (p.inside && (s.paintWhenStill || idle < 0.08)) return { x: p.x, y: p.y, active: 1 };
    if (s.idleWander && !this.reducedMotion && idle > s.idleDelay) {
      const k = t * s.wanderSpeed;
      return {
        x: this.cssW * (0.5 + 0.36 * Math.sin(k * 1.3) * Math.cos(k * 0.37)),
        y: this.cssH * (0.5 + 0.32 * Math.sin(k * 0.9 + 1.7)),
        active: 1,
        wander: true,
      };
    }
    return null;
  }

  _loop(now) {
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.25, Math.max(0.0001, (now - this._last) / 1000));
    this._last = now;
    this.time += dt;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.stats.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; }
    if (!this.visible || document.hidden) return;
    this._syncVideos();
    this._step(dt);
  }

  _syncVideos() {
    if (!this.settings.syncVideos) return;
    const a = this.layerCfg.top?.media, b = this.layerCfg.bottom?.media;
    if (!a || !b || a === b || !a.isVideo || !b.isVideo) return;
    const va = a.el, vb = b.el;
    if (va.readyState < 2 || vb.readyState < 2 || !va.duration || !vb.duration) return;
    if (Math.abs(va.currentTime - vb.currentTime) > 0.08 && Math.abs(va.duration - vb.duration) < 0.1) vb.currentTime = va.currentTime;
    if (va.paused !== vb.paused) va.paused ? vb.pause() : vb.play().catch(() => {});
  }

  _step(dt) {
    const gl = this.gl;
    const s = this.settings;
    const t = this.time;

    for (const m of this.media.values()) m.upload();

    // --- brush ---
    const target = this._brushTarget(t);
    const b = this.brush;
    let active = 0;
    if (target) {
      if (!b.init || b.wasWander !== !!target.wander) { b.x = b.px = target.x; b.y = b.py = target.y; b.init = true; }
      b.wasWander = !!target.wander;
      b.px = b.x; b.py = b.y;
      const k = 1 - Math.pow(Math.min(s.smoothing, 0.98), dt * 60);
      b.x += (target.x - b.x) * k;
      b.y += (target.y - b.y) * k;
      const speed = Math.hypot(b.x - b.px, b.y - b.py) / dt;
      const want = 1 + Math.min(s.speedMax - 1, (speed / 1500) * s.speedGrow * 4);
      b.speedMul += (want - b.speedMul) * (1 - Math.pow(0.85, dt * 60));
      active = 1;
    } else {
      b.init = false;
      b.speedMul += (1 - b.speedMul) * 0.1;
    }
    const widthScale = s.scaleWithWidth ? this.cssW / 1440 : 1;
    const radius = s.radius * widthScale * b.speedMul;

    // --- mask pass ---
    const M = this.mask;
    const src = M.targets[M.i];
    const dst = M.targets[1 - M.i];
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, M.w, M.h);
    if (this._clearMask) {
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, src.fb); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      this._clearMask = false;
    }
    const mp = this.maskProg;
    gl.useProgram(mp.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(mp.u.uPrev, 0);
    gl.uniform2f(mp.u.uView, this.cssW, this.cssH);
    gl.uniform2f(mp.u.uA, b.px, this.cssH - b.py);
    gl.uniform2f(mp.u.uB, b.x, this.cssH - b.y);
    gl.uniform1f(mp.u.uRadius, radius);
    gl.uniform1f(mp.u.uSoft, Math.min(Math.max(s.softness, 0), 1));
    gl.uniform1f(mp.u.uOpacity, s.opacity);
    gl.uniform1f(mp.u.uActive, active);
    gl.uniform1f(mp.u.uHoldStep, s.hold > 0 ? dt / s.hold : 1);
    gl.uniform1f(mp.u.uFadeStep, s.fade > 0 ? dt / s.fade : 1);
    gl.uniform1f(mp.u.uDither, this.floatMask ? 0 : 1 / 255);
    gl.uniform1f(mp.u.uSeed, (t * 7.13) % 100);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    M.i = 1 - M.i;

    // --- composite ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const cp = this.compProg;
    gl.useProgram(cp.p);
    const bindLayer = (key, unit, texU, cropU, scaleU) => {
      const L = this.layerCfg[key];
      gl.activeTexture(gl.TEXTURE0 + unit);
      if (!L || !L.media.ready) {
        gl.bindTexture(gl.TEXTURE_2D, (L && L.media.tex) || null);
        gl.uniform4f(cropU, 0, 0, 1, 1);
        gl.uniform2f(scaleU, 1, 1);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, L.media.tex);
        const c = L.crop;
        gl.uniform4f(cropU, c[0], c[1], c[2], c[3]);
        const ma = (L.media.w * c[2]) / Math.max(1, L.media.h * c[3]);
        const va = this.cssW / this.cssH;
        const cover = s.fit !== 'contain';
        let sx = 1, sy = 1;
        if (cover) { if (va > ma) sy = ma / va; else sx = va / ma; }
        else { if (va > ma) sx = va / ma; else sy = ma / va; }
        gl.uniform2f(scaleU, sx, sy);
      }
      gl.uniform1i(texU, unit);
    };
    bindLayer('top', 0, cp.u.uTop, cp.u.uTopCrop, cp.u.uTopScale);
    bindLayer('bottom', 1, cp.u.uBot, cp.u.uBotCrop, cp.u.uBotScale);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, M.targets[M.i].tex);
    gl.uniform1i(cp.u.uMask, 2);
    gl.uniform2f(cp.u.uView, this.cssW, this.cssH);
    gl.uniform2f(cp.u.uMaskTexel, 1 / M.w, 1 / M.h);
    gl.uniform1f(cp.u.uTime, this.reducedMotion ? 0 : t * s.noiseSpeed);
    gl.uniform1f(cp.u.uNoise, s.edgeNoise);
    gl.uniform1f(cp.u.uNoiseScale, s.noiseScale);
    gl.uniform1f(cp.u.uRipple, s.ripple);
    gl.uniform1f(cp.u.uRim, s.rim);
    gl.uniform3fv(cp.u.uRimColor, hexToRgb(s.rimColor));
    gl.uniform1f(cp.u.uGlow, s.glow);
    gl.uniform1i(cp.u.uCurve, CURVES[s.fadeCurve] ?? 1);
    gl.uniform1f(cp.u.uShowMask, s.showMask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

// ---------- auto-init for Webflow / plain HTML ----------
async function readConfig(el) {
  const inline = el.querySelector('script[type="application/json"]');
  if (inline) return JSON.parse(inline.textContent);
  const url = el.getAttribute('data-config');
  if (url) return (await fetch(url)).json();
  return {};
}

export function autoInit(root = document) {
  const els = root.querySelectorAll('[data-scene-reveal]:not([data-scene-reveal-ready])');
  els.forEach(async (el) => {
    el.setAttribute('data-scene-reveal-ready', '');
    try {
      const cfg = await readConfig(el);
      el.sceneReveal = new SceneReveal(el, cfg);
    } catch (e) {
      console.warn('[SceneReveal] init failed', e);
    }
  });
}
