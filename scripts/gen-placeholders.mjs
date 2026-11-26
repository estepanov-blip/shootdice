// Generates ORIGINAL placeholder art (SVG) for the practice slice.
// These are stand-ins until production art from ART.md arrives; replace files in
// src/assets/placeholder/ or point src/assets/manifest.ts at the real WebP/PNG.
// Run: node scripts/gen-placeholders.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'placeholder')
mkdirSync(out, { recursive: true })

const INK = '#141513'
const CHAR = '#171916'
const RED = '#A23B36'
const CREAM = '#E3C58A'

// deterministic pseudo-random for layout
let seed = 1337
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

const halftone = (id, color, op, r = 2.2, step = 9) => `
  <pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <circle cx="${step / 2}" cy="${step / 2}" r="${r}" fill="${color}" fill-opacity="${op}"/>
  </pattern>`

function background() {
  const W = 1080
  const H = 1920
  let buildings = ''
  const blocks = [
    [380, 520, 190, 760],
    [560, 400, 170, 880],
    [720, 470, 210, 810],
    [905, 560, 200, 720],
  ]
  for (const [x, y, w, h] of blocks) {
    buildings += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1c201d" stroke="${INK}" stroke-width="6"/>`
    for (let wy = y + 30; wy < y + h - 40; wy += 52) {
      for (let wx = x + 18; wx < x + w - 30; wx += 40) {
        const lit = rnd() < 0.28
        buildings += `<rect x="${wx}" y="${wy}" width="20" height="28" fill="${lit ? CREAM : '#262b27'}" fill-opacity="${lit ? 0.55 + rnd() * 0.4 : 1}"/>`
      }
    }
  }
  let bricks = ''
  for (let row = 0; row * 38 < 1350; row++) {
    const off = row % 2 ? -45 : 0
    for (let x = off; x < 430; x += 90) {
      const shade = ['#5b2924', '#63302a', '#4e231f', '#6d362e'][Math.floor(rnd() * 4)]
      bricks += `<rect x="${x + 3}" y="${row * 38 + 3}" width="84" height="32" fill="${shade}"/>`
    }
  }
  // abstract original graffiti strokes (no letters, no logos)
  const tags = [
    `<path d="M40 420 C120 330, 210 520, 300 380 S 380 470, 410 360" stroke="${CREAM}" stroke-width="26" fill="none" stroke-linecap="round" opacity=".55"/>`,
    `<path d="M60 560 q60 -90 120 0 t120 0 t110 -20" stroke="${RED}" stroke-width="34" fill="none" stroke-linecap="round" opacity=".7"/>`,
    `<path d="M70 250 l60 -90 l40 70 l50 -80 l40 100" stroke="${CREAM}" stroke-width="14" fill="none" stroke-linejoin="round" opacity=".45"/>`,
    `<circle cx="330" cy="700" r="70" fill="none" stroke="${RED}" stroke-width="16" opacity=".5"/>`,
  ].join('')
  let fence = ''
  for (let x = 420; x < W + 300; x += 34) {
    fence += `<line x1="${x}" y1="760" x2="${x - 300}" y2="1290" />`
    fence += `<line x1="${x - 300}" y1="760" x2="${x}" y2="1290" />`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0b0d0c"/><stop offset=".55" stop-color="#1d2320"/><stop offset="1" stop-color="#2a2620"/>
  </linearGradient>
  <radialGradient id="lamp" cx="930" cy="560" r="520" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${CREAM}" stop-opacity=".55"/><stop offset=".35" stop-color="#c7862f" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#34302a"/><stop offset="1" stop-color="#121311"/>
  </linearGradient>
  <radialGradient id="vig" cx=".5" cy=".5" r=".75">
    <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/>
  </radialGradient>
  ${halftone('ht', CREAM, 0.06)}
  ${halftone('htd', '#000', 0.25, 2.6)}
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
${buildings}
<g stroke="#4b4f49" stroke-width="3" opacity=".7">${fence}</g>
<rect x="420" y="740" width="${W - 420}" height="12" fill="#55584f"/>
${[520, 760, 1000].map((x) => `<rect x="${x}" y="740" width="14" height="560" fill="#3d403a" stroke="${INK}" stroke-width="4"/>`).join('')}
<g>${bricks}</g>
<rect x="0" y="0" width="430" height="1350" fill="url(#htd)"/>
${tags}
<rect x="425" y="0" width="16" height="1350" fill="${INK}"/>
<rect x="0" y="1260" width="${W}" height="${H - 1260}" fill="url(#ground)"/>
<path d="M0 1262 H${W}" stroke="${INK}" stroke-width="10"/>
<g stroke="${INK}" stroke-width="5" opacity=".6" fill="none">
  <path d="M90 1500 l120 40 l60 -30 l140 70"/><path d="M700 1420 l80 60 l-20 80 l110 40"/><path d="M300 1800 l90 -50 l130 20"/>
</g>
<rect width="${W}" height="${H}" fill="url(#lamp)"/>
<rect x="918" y="530" width="18" height="760" fill="#2b2d29" stroke="${INK}" stroke-width="5"/>
<path d="M927 540 q -10 -60 -90 -60 h -40" stroke="#2b2d29" stroke-width="16" fill="none"/>
<ellipse cx="790" cy="490" rx="54" ry="20" fill="${CREAM}" stroke="${INK}" stroke-width="6"/>
<rect width="${W}" height="${H}" fill="url(#ht)"/>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>`
}

function surface() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="720" viewBox="0 0 1080 720">
<defs>
  <linearGradient id="slab" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5f5a50"/><stop offset="1" stop-color="#3a3731"/>
  </linearGradient>
  ${halftone('grit', '#000', 0.22, 1.8, 7)}
  ${halftone('grit2', CREAM, 0.07, 1.4, 11)}
</defs>
<path d="M120 40 H960 L1060 690 H20 Z" fill="url(#slab)" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>
<path d="M120 40 H960 L1060 690 H20 Z" fill="url(#grit)"/>
<path d="M120 40 H960 L1060 690 H20 Z" fill="url(#grit2)"/>
<path d="M210 140 H870 L930 590 H150 Z" fill="none" stroke="${CREAM}" stroke-opacity=".75" stroke-width="9" stroke-dasharray="60 14 20 14" stroke-linejoin="round"/>
<g stroke="${INK}" stroke-width="5" fill="none" opacity=".7">
  <path d="M300 60 l40 120 l-30 80 l60 90"/><path d="M780 700 l-30 -110 l50 -70"/><path d="M60 520 l120 -30 l70 40"/>
</g>
<path d="M120 40 H960" stroke="#7a756a" stroke-width="10"/>
</svg>`
}

/** Waist-up character in a 768x1024 box. `look` selects palette/props. */
function figure(look) {
  const L =
    look === 'ace'
      ? { skin: '#8d5b3d', skinD: '#6e4229', top: RED, topD: '#7a2925', trim: CREAM, tee: '#e8e0cc', hat: '#1f2a3a' }
      : { skin: '#5b3a27', skinD: '#432a1b', top: '#3a4037', topD: '#2a2e27', trim: '#8d8f84', tee: '#2c2c2a', hat: CHAR }
  const s = `stroke="${INK}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"`
  const torso = `
    <path d="M110 1024 C120 760, 190 650, 300 620 L468 620 C580 650, 650 760, 660 1024 Z" fill="${L.top}" ${s}/>
    <path d="M300 620 L384 760 L468 620" fill="${L.tee}" ${s}/>
    <path d="M384 760 V1024" ${s}/>
    <path d="M150 1024 C160 840, 200 760, 250 720" fill="none" stroke="${L.trim}" stroke-width="16"/>
    <path d="M620 1024 C610 840, 570 760, 520 720" fill="none" stroke="${L.trim}" stroke-width="16"/>
    <path d="M110 1024 C120 760, 190 650, 300 620 L300 1024 Z" fill="${L.topD}" opacity=".35"/>`
  const neck = `<path d="M334 520 L334 640 Q384 680 434 640 L434 520 Z" fill="${L.skinD}" ${s}/>`
  const head = `
    <path d="M384 250 C470 250, 520 320, 516 420 C512 520, 450 590, 384 592 C318 590, 256 520, 252 420 C248 320, 298 250, 384 250 Z" fill="${L.skin}" ${s}/>
    <path d="M300 470 C320 560, 360 590, 384 592 C420 590, 470 560, 490 470 C470 540, 420 560, 384 560 C350 560, 320 540, 300 470 Z" fill="${L.skinD}" opacity=".55"/>
    <ellipse cx="250" cy="430" rx="22" ry="40" fill="${L.skin}" ${s}/>
    <ellipse cx="518" cy="430" rx="22" ry="40" fill="${L.skin}" ${s}/>
    <path d="M318 410 q30 -18 56 0" ${s} fill="none"/>
    <path d="M396 410 q30 -18 56 0" ${s} fill="none"/>
    <path d="M384 420 l-12 70 h26" ${s} fill="none"/>
    <path d="M344 530 q40 16 80 0" ${s} fill="none"/>`
  const extras =
    look === 'ace'
      ? `
    <path d="M250 330 C250 210, 520 200, 524 330 Z" fill="${L.hat}" ${s}/>
    <path d="M250 330 C240 300, 180 300, 150 330 C190 350, 240 345, 250 330 Z" fill="${L.hat}" ${s}/>
    <path d="M300 640 Q384 760 468 640" fill="none" stroke="${CREAM}" stroke-width="12" stroke-dasharray="18 8"/>`
      : `
    <path d="M246 360 C230 190, 538 190, 522 360 Z" fill="${L.hat}" ${s}/>
    <rect x="246" y="330" width="276" height="40" rx="12" fill="${RED}" ${s}/>
    <path d="M300 470 C310 600, 458 600, 468 470 C440 540, 330 540, 300 470 Z" fill="#1d1712" ${s}/>
    <rect x="300" y="392" width="78" height="40" rx="12" fill="#101210" ${s}/>
    <rect x="392" y="392" width="78" height="40" rx="12" fill="#101210" ${s}/>
    <path d="M378 410 h14" ${s}/>`
  return `${torso}${neck}${head}${extras}`
}

function character(look) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
<defs>${halftone('h', '#000', 0.22, 2.4, 10)}</defs>
<g>${figure(look)}</g>
</svg>`
}

function portrait(look) {
  const bg = look === 'ace' ? RED : '#2f332d'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="134 160 500 500">
<rect x="134" y="160" width="500" height="500" fill="${bg}"/>
<g>${figure(look)}</g>
</svg>`
}

function logo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
<rect width="200" height="200" rx="40" fill="${CHAR}"/>
<g transform="rotate(-12 100 100)">
<rect x="36" y="52" width="80" height="80" rx="16" fill="${RED}" stroke="${INK}" stroke-width="6"/>
<circle cx="56" cy="72" r="8" fill="${CREAM}"/><circle cx="96" cy="112" r="8" fill="${CREAM}"/><circle cx="76" cy="92" r="8" fill="${CREAM}"/>
</g>
<g transform="rotate(14 130 120)">
<rect x="96" y="84" width="72" height="72" rx="14" fill="${CREAM}" stroke="${INK}" stroke-width="6"/>
<circle cx="114" cy="102" r="7" fill="${CHAR}"/><circle cx="150" cy="138" r="7" fill="${CHAR}"/>
</g>
</svg>`
}

const files = {
  'block_bg.svg': background(),
  'surface.svg': surface(),
  'char_ace.svg': character('ace'),
  'char_lou.svg': character('lou'),
  'portrait_ace.svg': portrait('ace'),
  'portrait_lou.svg': portrait('lou'),
  'icon.svg': logo(),
}
for (const [name, svg] of Object.entries(files)) writeFileSync(join(out, name), svg.trim() + '\n')
console.log('placeholders written:', Object.keys(files).join(', '))
