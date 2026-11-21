import wordmark from "../../../../brand/wordmark-paths.json";

/**
 * The Riptide logo building itself:
 *   1. the sun rises from behind the water,
 *   2. the wave draws in from the left and curls,
 *   3. the wordmark letters surface one by one.
 * One SVG string, used by the Studio splash and by the README.
 * Final state is the resting logo, so reduced-motion users just see the logo.
 */
export function animatedLogoSvg({ ink = "#F4E9DC", id = "rt", scale = 1, delay = 0 } = {}): string {
  const s = 0.112; // wordmark font units -> px (112px type)
  const baseline = 100;
  const textX = 152;
  const width = Math.ceil(textX + wordmark.width * s + 8);
  const d = (t: number) => `${(t + delay).toFixed(2)}s`;

  const letters = wordmark.glyphs
    .map(
      (g, i) =>
        `<g class="${id}-l" style="animation-delay:${d(1.0 + i * 0.055)}"><path fill="${ink}" transform="translate(${(textX + g.x * s).toFixed(2)} ${baseline}) scale(${s} -${s})" d="${g.d}"/></g>`,
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 140" width="${Math.round(width * scale)}" height="${Math.round(140 * scale)}" role="img" aria-label="Riptide">
<style>
.${id}-sun{animation:${id}-rise 1.15s cubic-bezier(.2,.8,.2,1) ${d(0.1)} both}
.${id}-wave{stroke-dasharray:1;stroke-dashoffset:0;animation:${id}-draw 1.05s cubic-bezier(.65,0,.35,1) ${d(0.45)} both}
.${id}-glow{animation:${id}-glow 1.6s ease-out ${d(0.2)} both}
.${id}-l{animation:${id}-up .7s cubic-bezier(.34,1.45,.64,1) both}
@keyframes ${id}-rise{from{transform:translateY(30px)}}
@keyframes ${id}-draw{0%{stroke-dashoffset:1;opacity:0}6%{opacity:1}100%{stroke-dashoffset:0}}
@keyframes ${id}-glow{0%{opacity:0}45%{opacity:.9}100%{opacity:0}}
@keyframes ${id}-up{from{opacity:0;transform:translateY(16px)}}
@media (prefers-reduced-motion:reduce){.${id}-sun,.${id}-wave,.${id}-glow,.${id}-l{animation:none}}
</style>
<defs>
<linearGradient id="${id}-g" x1="32" y1="4" x2="32" y2="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB36B"/><stop offset=".55" stop-color="#FF6F7D"/><stop offset="1" stop-color="#FF3D9A"/></linearGradient>
<radialGradient id="${id}-r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FF6F7D" stop-opacity=".55"/><stop offset="1" stop-color="#FF6F7D" stop-opacity="0"/></radialGradient>
<clipPath id="${id}-c"><path d="M0 0H64V28.5C57 28.5 53.5 29 49.5 30.5C42 33.5 39 42.5 27 42.5C18 42.5 13 39.5 0 39.5Z"/></clipPath>
</defs>
<g transform="translate(4 6) scale(2)">
<circle class="${id}-glow" cx="31" cy="30" r="30" fill="url(#${id}-r)" opacity="0"/>
<g clip-path="url(#${id}-c)"><circle class="${id}-sun" cx="31" cy="27" r="23" fill="url(#${id}-g)"/></g>
<path class="${id}-wave" pathLength="1" d="M5 46C13 46 18 49.5 27 49.5C40 49.5 42.5 36.5 51.5 36.5C57.8 36.5 60.6 42.6 57 46.4C53.9 49.6 48.6 47.6 49.3 43.6" fill="none" stroke="#3DF2D0" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/>
</g>
${letters}
</svg>`;
}
