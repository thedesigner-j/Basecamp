// Built-in starting points. Each only lists what differs from the defaults.
export const BUILTIN_PRESETS = {
  Liquid: {},
  Spotlight: { radius: 150, softness: 0.75, hold: 0, fade: 0.3, fadeCurve: 'quick', smoothing: 0.25, edgeNoise: 0.1, ripple: 0.15 },
  'Paint trail': { radius: 110, softness: 0.45, hold: 2, fade: 1.5, smoothing: 0.15, speedGrow: 0.5, edgeNoise: 0.3 },
  'Slow tide': { radius: 220, softness: 0.7, hold: 1, fade: 4, fadeCurve: 'linger', smoothing: 0.65, edgeNoise: 0.55, noiseScale: 2.2, noiseSpeed: 0.12, ripple: 0.45 },
  'Glow burst': { radius: 180, softness: 0.55, hold: 0.3, fade: 0.9, glow: 0.5, rim: 0.35, rimColor: '#ffc38a', edgeNoise: 0.4, ripple: 0.35 },
};
