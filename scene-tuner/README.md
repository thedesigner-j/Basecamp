# Scene Tuner

A visual tool for building a **cursor-reveal effect** for your website:

- **Top layer**: render 1 (glass logo), shown by default.
- **Bottom layer**: render 2 (glowing logo), revealed wherever the cursor goes.
- After the cursor leaves, the reveal **holds** for a moment, then **fades** back to the top layer.

Either layer can be an image or a video. You tune everything with sliders while watching the result, then export a snippet to paste into Webflow.

This folder is self-contained, with its own `package.json` and no links to the rest of the repo. To move it to its own repo, see [Moving to its own repo](#moving-to-its-own-repo).

---

## Quick start (no install)

1. Open **`dist/scene-tuner.html`** in Chrome or Safari. It's one file and works offline; you can double-click it.
2. Demo renders load so you can try it immediately. Move the cursor over the preview.
3. Drop in your renders:
   - Drag two files onto the preview. They're sorted alphabetically: the first goes on top, the second on the bottom.
   - Or use **Choose…** on each slot.
   - Or load one stacked video with **Packed video…** (see below).
4. Tune with the sliders. Settings and loaded files are remembered when you reload.
5. Click **Export** and follow the three steps.

Shortcut: **M** shows or hides the mask, so you can see exactly what the brush is doing.

## Controls

| Group | Control | What it does |
|---|---|---|
| Reveal | Radius | Size of the reveal in px. Turn on *Scale w/ width* to make it relative to a 1440px-wide section. |
| | Edge softness | 0 = hard edge, 1 = fully feathered. |
| | Opacity | How far the bottom layer shows through (1 = fully). |
| Timing | Hold | Seconds a revealed spot stays open after the cursor leaves it. |
| | Fade back | Seconds to return to the top layer. |
| | Fade curve | Smooth / Linear / Quick drop / Linger. |
| Cursor | Follow lag | 0 = glued to the cursor. Higher = a lazy, liquid follow. |
| | Open when still | Keeps the spot open while the cursor rests. |
| | Grow w/ speed, Max growth | Fast cursor moves make the reveal bigger. |
| Edge | Wobble, size, speed | Animated, watery noise on the edge of the reveal. |
| | Refraction | Pushes the image at the edge, like looking through a lens of water. |
| | Rim light, color | A thin glowing ring along the edge. |
| Look | Glow boost | Brightens the revealed layer. |
| | Fit | Cover (fills the section and crops) or Contain. |
| Idle & mobile | Auto-wander | When nobody is interacting, the reveal drifts by itself. Good for phones. |
| | Touch reveals | Finger drags reveal on touch screens. |
| Quality | Mask res, Max pixel ratio | Lower these if a slow device stutters. |
| Video | Playing, Speed, Restart, Sync | Preview controls. *Sync* keeps two separate videos aligned. |

**Presets:** five built-in starting points (Liquid, Spotlight, Paint trail, Slow tide, Glow burst). You can save your own, then download or load them as JSON to move between computers.

---

## Making the renders (Cinema 4D + Redshift)

Both renders must be identical except for the logo material:

1. Set up the scene once: camera, water, lighting, frame range.
2. **Render 1:** the logo with the glass material.
3. **Render 2:** swap the logo material to the glowing one (emission). Change nothing else: same camera, frames and water noise seed.
   - Tip: use a Take for each version in C4D (**Take Manager**), so one render queue outputs both.
4. If the water moves, make the motion **loop**. Set the noise or displacement animation so the last frame matches the first, then render exactly that loop length (for example 5–8 seconds at 24 or 30 fps). Any loop works; a seamless loop just avoids a visible jump.
5. Resolution: 1920×1080 is plenty for a full-width hero. Render slightly wider than you need if you crop later.
6. Output an image sequence (PNG or EXR converted to PNG) or a ProRes MOV.

**Stills:** if the scene is static, export two PNG or JPG images and you're done.

### Packing two videos into one (recommended for video)

Two separate videos on a web page slowly drift out of sync. Stacking them into one file keeps them frame-perfect, and the tool reads the top half and bottom half separately.

```bash
# from this folder, needs ffmpeg
scripts/pack-videos.sh glass.mov glow.mov hero.mp4
# image sequences work too (FPS env var, default 30):
FPS=24 scripts/pack-videos.sh "renders/glass_%04d.png" "renders/glow_%04d.png" hero.mp4 1920 22
```

The arguments are `TOP BOTTOM OUT [WIDTH=1920] [CRF=22]`. A lower CRF gives better quality and a bigger file. The output is H.264 MP4 that plays in every browser.

In the tool, use **Packed video…**, or drop the file and pick *Packed*.

A stacked 1920×1080 pair makes a 1920×2160 video. That plays fine on modern phones; if older phones stutter, pack at `1280` width.

---

## Putting it on Webflow

> The Embed element and custom code need a paid Webflow site plan. Custom code doesn't run inside the Designer canvas, so test on the published or staging site (`*.webflow.io`).

### 1. Host the files

The renders need public URLs. **Videos must allow cross-origin access (CORS)**, or the browser won't let WebGL read them. If CORS is missing, the console shows a `[SceneReveal] texture upload failed (CORS?)` warning.

Options:

- **Images:** upload to Webflow Assets and copy each asset's URL. If the browser console shows the CORS warning, use one of the hosts below.
- **Videos:** a storage or CDN host where you can switch on CORS, such as Cloudflare R2, Bunny.net or AWS S3 with CloudFront. Allow `GET` from your site's domain, or `*`.
- **Small files:** a public GitHub repo plus jsDelivr (`https://cdn.jsdelivr.net/gh/USER/REPO@main/path/file.mp4`). jsDelivr sends CORS headers but limits file size, so keep videos small.

### 2. Export from the tool

Click **Export**, paste the file URLs, and choose:

- **Height:** for example `100vh` or `700px`, or `fill` to make it a background that fills its parent section. For `fill`, give the parent section `position: relative`.
- **Script:** *inline* pastes the whole effect (~18 KB) with nothing else to host. Or *URL* if you host `dist/scene-reveal.min.js` yourself.

### 3. Paste

- **A.** Add an **Embed** element where the effect goes and paste snippet A.
- **B.** Page settings → **Custom code** → *Before `</body>` tag*, paste snippet B. Use Site settings instead if the effect appears on several pages.

Text and buttons placed above the effect still work: the cursor drives the reveal even when it's over other elements.

If Webflow says the inline script is too long, switch to *URL* mode and host `scene-reveal.min.js` (any of the hosts above work).

### Behaviour on the live site

- Without WebGL2 (very old browsers), the top layer shows as a normal image or video.
- With *Reduce motion* on, auto-wander and edge animation are switched off, but the cursor reveal still works.
- The effect pauses when scrolled offscreen.

---

## Using the runtime in code (optional)

```html
<div id="hero" style="height:100vh"></div>
<script src="scene-reveal.min.js"></script>
<script>
  const fx = new SceneReveal('#hero', {
    layers: {
      top: { src: 'hero.mp4', crop: 'top-half' },
      bottom: { src: 'hero.mp4', crop: 'bottom-half' },
    },
    settings: { radius: 180, hold: 0.5, fade: 1.4 },
  });
  // fx.set({ radius: 240 })   fx.setLayer('top', { src: 'other.jpg' })   fx.destroy()
</script>
```

`crop` accepts `full`, `top-half`, `bottom-half`, `left-half`, `right-half`, or `[x, y, w, h]` in 0–1 units. `type: 'video' | 'image'` is detected from the file extension; set it when a URL has no extension.

Any element with `data-scene-reveal` starts automatically, reading its config from an inner `<script type="application/json">` or from a `data-config="settings.json"` URL.

---

## Development

```bash
npm install
npm run dev        # live editor at http://localhost:5173
npm run build      # rebuilds dist/scene-reveal.min.js and dist/scene-tuner.html
npm test           # headless browser checks (uses a local Chromium)
```

```
src/runtime/scene-reveal.js   the effect (WebGL2, no dependencies)
src/runtime/embed.js          browser bundle entry + auto-init
src/editor/                   the tuning UI (Tweakpane sliders)
scripts/pack-videos.sh        stacks two renders into one video
dist/                         built files (committed so you can use them without installing anything)
```

`npm test` needs a Chromium. Set `CHROMIUM=/path/to/chrome` if it isn't at `/opt/pw-browsers/chromium`.

## Moving to its own repo

Everything needed is in this folder. On your computer:

```bash
# 1. create an empty repo on GitHub, e.g. scene-tuner, then:
git clone https://github.com/thedesigner-j/basecamp.git
cd basecamp
git checkout ccr-e9de25d7-h2xnzz        # skip if this work is already merged into main
git subtree split --prefix=scene-tuner -b scene-tuner-only   # keeps this folder's history
cd ..
mkdir scene-tuner && cd scene-tuner && git init -b main
git pull ../basecamp scene-tuner-only
git remote add origin https://github.com/thedesigner-j/scene-tuner.git
git push -u origin main
```

Or simply copy the folder into a new repo; nothing outside it is referenced. Afterwards you can delete `scene-tuner/` from Basecamp.

## Roadmap ideas

- More effects on the same panel: tilt/parallax and a real 3D orbit for GLB scenes.
- Reveal shapes: blob, ripple rings, brush texture.
- A/B compare of two presets side by side.
