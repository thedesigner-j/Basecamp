// Browser bundle entry: exposes window.SceneReveal and auto-starts every
// element with a data-scene-reveal attribute.
import { SceneReveal, autoInit, DEFAULT_SETTINGS } from './scene-reveal.js';

SceneReveal.autoInit = autoInit;
SceneReveal.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
window.SceneReveal = SceneReveal;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoInit());
else autoInit();
