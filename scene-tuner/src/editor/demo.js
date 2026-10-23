// Stand-in renders so the tool works before your Redshift renders exist:
// dark water with a logo — "glass" for the top layer, "glow" for the bottom.

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function water(ctx, w, h, lit) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, lit ? '#0d2a33' : '#081a22');
  g.addColorStop(1, lit ? '#04151c' : '#020b10');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // caustic-ish streaks
  const r = rng(7);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260; i++) {
    const y0 = r() * h;
    const amp = 6 + r() * 26;
    const freq = 0.004 + r() * 0.01;
    const ph = r() * 10;
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 16) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.7 + ph * 1.3) * amp * 0.3;
      x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    const a = 0.025 + r() * 0.05;
    ctx.strokeStyle = lit ? `rgba(255,170,90,${a})` : `rgba(140,220,255,${a})`;
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function logoPath(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.arc(cx, cy, s, 0, Math.PI * 2);
  ctx.moveTo(cx + s * 0.62, cy);
  ctx.arc(cx, cy, s * 0.62, 0, Math.PI * 2);
}

function waveMark(ctx, cx, cy, s) {
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = cx - s * 0.5 + t * s;
    const y = cy + Math.sin(t * Math.PI * 2) * s * 0.14;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
}

export function makeDemo(kind, w = 1600, h = 900) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const glow = kind === 'glow';
  water(ctx, w, h, glow);
  const cx = w / 2, cy = h / 2, s = h * 0.2;

  if (glow) {
    const halo = ctx.createRadialGradient(cx, cy, s * 0.2, cx, cy, s * 3);
    halo.addColorStop(0, 'rgba(255,150,60,0.55)');
    halo.addColorStop(0.4, 'rgba(255,110,40,0.18)');
    halo.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.shadowColor = '#ffb066';
    ctx.shadowBlur = 60;
    ctx.fillStyle = '#ffd7a8';
    logoPath(ctx, cx, cy, s);
    ctx.fill('evenodd');
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#fff3e0';
    ctx.lineWidth = s * 0.09;
    ctx.lineCap = 'round';
    waveMark(ctx, cx, cy, s * 0.9);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    const fill = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
    fill.addColorStop(0, 'rgba(200,240,255,0.28)');
    fill.addColorStop(0.5, 'rgba(120,190,220,0.08)');
    fill.addColorStop(1, 'rgba(200,240,255,0.22)');
    ctx.fillStyle = fill;
    logoPath(ctx, cx, cy, s);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(220,250,255,0.55)';
    ctx.lineWidth = 2;
    logoPath(ctx, cx, cy, s);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,250,255,0.6)';
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = 'round';
    waveMark(ctx, cx, cy, s * 0.9);
    ctx.stroke();
    // specular glint
    const sp = ctx.createRadialGradient(cx - s * 0.5, cy - s * 0.6, 0, cx - s * 0.5, cy - s * 0.6, s * 0.5);
    sp.addColorStop(0, 'rgba(255,255,255,0.55)');
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sp;
    ctx.fillRect(cx - s * 1.1, cy - s * 1.2, s * 1.2, s * 1.2);
    ctx.restore();
  }

  ctx.fillStyle = glow ? 'rgba(255,220,190,0.75)' : 'rgba(210,235,245,0.5)';
  ctx.font = `600 ${Math.round(h * 0.022)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(glow ? 'DEMO · BOTTOM (GLOW)' : 'DEMO · TOP (GLASS)', cx, h - h * 0.07);
  return c;
}
