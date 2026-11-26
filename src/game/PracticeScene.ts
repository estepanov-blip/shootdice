/**
 * Rendering + animation only. Never decides anything: it receives the controller's
 * view, animates `rolling.dice` (already determined) and reports back with onLanded().
 * Coordinates are device pixels (the game is sized at CSS size x DPR and zoomed back),
 * so layout is computed from the current scale size on every resize.
 */
import Phaser from 'phaser'
import { ART, DICE } from '../assets/manifest'
import type { PracticeView } from './PracticeController'
import type { Side } from './rules'

export const ROLL_ANIM_MS = 1000
const INK = 0x141513
const RED = 0xa23b36
const IVORY = 0xe9dcbc
const CREAM = 0xe3c58a

export interface SceneBridge {
  onLanded(rollId: number): void
  reducedMotion: boolean
}

type DieSprite = { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse; color: 'red' | 'ivory' }

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
}

export class PracticeScene extends Phaser.Scene {
  private bridge!: SceneBridge
  private view: PracticeView | null = null
  private animatedRollId = 0
  private lastMatchNo = 0
  private bg!: Phaser.GameObjects.Image
  private surface!: Phaser.GameObjects.Image
  private chars!: Record<Side, Phaser.GameObjects.Image>
  private glow!: Phaser.GameObjects.Ellipse
  private dice: DieSprite[] = []
  private ready = false
  private rolling: Phaser.Tweens.Tween[] = []
  private faceTimer: Phaser.Time.TimerEvent | null = null

  constructor() {
    super('practice')
  }

  init(data: { bridge: SceneBridge }) {
    this.bridge = data.bridge
  }

  preload() {
    const svg = (a: { key: string; url: string; w: number; h: number }) =>
      this.load.svg(a.key, a.url, { width: a.w, height: a.h })
    svg(ART.background)
    svg(ART.surface)
    svg(ART.charPlayer)
    svg(ART.charBot)
    if (DICE.atlasUrl) this.load.atlas('dice', DICE.atlasUrl)
  }

  create() {
    this.makeDiceTextures()
    this.bg = this.add.image(0, 0, ART.background.key).setOrigin(0.5)
    this.glow = this.add.ellipse(0, 0, 10, 10, CREAM, 0.18)
    this.chars = {
      bot: this.add.image(0, 0, ART.charBot.key).setOrigin(0.5, 1).setFlipX(true),
      player: this.add.image(0, 0, ART.charPlayer.key).setOrigin(0.5, 1),
    }
    this.surface = this.add.image(0, 0, ART.surface.key).setOrigin(0.5, 1)
    this.dice = (['red', 'ivory'] as const).map((color) => ({
      shadow: this.add.ellipse(0, 0, 10, 10, 0x000000, 0.35).setVisible(false),
      img: this.add.image(0, 0, `die_${color}_1`).setVisible(false),
      color,
    }))
    this.scale.on('resize', this.layout, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this))
    this.ready = true
    this.layout()
    if (this.view) this.apply(this.view)
  }

  setView(view: PracticeView) {
    this.view = view
    if (this.ready) this.apply(view)
  }

  // ---------- layout ----------

  private geo() {
    const W = this.scale.width
    const H = this.scale.height
    const surfW = Math.min(W * 0.96, H * 0.5)
    const surfH = (surfW * ART.surface.h) / ART.surface.w
    const surfBottom = H * 0.75
    const surfTop = surfBottom - surfH
    const charH = Math.min(H * 0.36, surfW * 0.72)
    const charW = (charH * ART.charBot.w) / ART.charBot.h
    const charBottom = surfTop + surfH * 0.14
    const dieSize = Math.round(Math.min(surfW * 0.17, H * 0.09))
    return { W, H, surfW, surfH, surfTop, surfBottom, charH, charW, charBottom, dieSize }
  }

  private layout() {
    if (!this.ready) return
    const g = this.geo()
    const s = Math.max(g.W / ART.background.w, g.H / ART.background.h)
    this.bg.setPosition(g.W / 2, g.H / 2).setScale(s)
    this.surface.setPosition(g.W / 2, g.surfBottom).setDisplaySize(g.surfW, g.surfH)
    this.chars.bot.setPosition(g.W / 2 + g.surfW * 0.26, g.charBottom).setDisplaySize(g.charW, g.charH)
    this.chars.player.setPosition(g.W / 2 - g.surfW * 0.26, g.charBottom).setDisplaySize(g.charW, g.charH)
    this.glow.setSize(g.charW * 1.3, g.charH * 0.5)
    for (const d of this.dice) {
      d.img.setDisplaySize(g.dieSize, g.dieSize)
      d.shadow.setSize(g.dieSize * 0.9, g.dieSize * 0.3)
    }
    if (this.view) this.highlight(this.view.match.shooter, true)
    if (this.view && !this.view.rolling) this.placeRestingDice()
  }

  private restSpot(i: number, rollId: number) {
    const g = this.geo()
    // cosmetic jitter derived from rollId so a re-layout shows the same spots
    const j = (n: number) => (((rollId * 9301 + n * 49297) % 233280) / 233280 - 0.5) * 2
    const cx = g.W / 2 + (i === 0 ? -1 : 1) * g.surfW * 0.12 + j(i + 1) * g.surfW * 0.05
    const cy = g.surfTop + g.surfH * 0.52 + j(i + 7) * g.surfH * 0.1
    return { x: cx, y: cy, rot: j(i + 3) * 0.5 }
  }

  // ---------- view sync ----------

  private apply(v: PracticeView) {
    if (v.matchNo !== this.lastMatchNo) {
      this.lastMatchNo = v.matchNo
      this.stopRolling()
      this.animatedRollId = 0
      for (const d of this.dice) {
        d.img.setVisible(false)
        d.shadow.setVisible(false)
      }
    }
    this.highlight(v.match.shooter)
    if (v.rolling && v.rolling.rollId !== this.animatedRollId) {
      this.animatedRollId = v.rolling.rollId
      this.throwDice(v.rolling.rollId, v.rolling.by, v.rolling.dice)
    } else if (!v.rolling && v.match.lastDice && this.rolling.length === 0) {
      this.placeRestingDice()
    }
  }

  private highlight(shooter: Side, instant = false) {
    const g = this.geo()
    for (const side of ['player', 'bot'] as Side[]) {
      const img = this.chars[side]
      const on = side === shooter
      img.setTint(on ? 0xffffff : 0x6d6a66)
      const base = g.charH / img.height
      const target = on ? base * 1.06 : base * 0.96
      this.tweens.killTweensOf(img)
      if (instant || this.bridge.reducedMotion) img.setScale(target)
      else this.tweens.add({ targets: img, scale: target, duration: 260, ease: 'Sine.easeOut' })
    }
    const c = this.chars[shooter]
    this.glow.setPosition(c.x, g.charBottom - g.charH * 0.15)
  }

  private placeRestingDice() {
    const m = this.view?.match
    if (!m?.lastDice || !m.lastRoll) return
    m.lastDice.forEach((face, i) => {
      const d = this.dice[i]
      const p = this.restSpot(i, m.lastRoll!.rollId)
      d.img.setTexture(`die_${d.color}_${face}`).setPosition(p.x, p.y).setRotation(p.rot).setVisible(true)
      d.shadow.setPosition(p.x + 4, p.y + this.geo().dieSize * 0.42).setVisible(true)
    })
  }

  private stopRolling() {
    for (const t of this.rolling) t.stop()
    this.rolling = []
    this.faceTimer?.remove()
    this.faceTimer = null
  }

  // ---------- the throw ----------

  private throwDice(rollId: number, by: Side, result: readonly [number, number]) {
    this.stopRolling()
    const g = this.geo()
    const from = this.chars[by]
    const startX = from.x + (by === 'player' ? g.charW * 0.25 : -g.charW * 0.25)
    const startY = g.charBottom - g.charH * 0.25
    const reduced = this.bridge.reducedMotion
    const dur = reduced ? 150 : 820

    let tick = 0
    if (!reduced) {
      this.faceTimer = this.time.addEvent({
        delay: 70,
        loop: true,
        callback: () => {
          tick++
          this.dice.forEach((d, i) => d.img.setTexture(`die_${d.color}_${((tick + i * 3) % 6) + 1}`))
        },
      })
    }

    let landed = 0
    this.dice.forEach((d, i) => {
      const end = this.restSpot(i, rollId)
      const sx = startX + (i ? 10 : -10)
      const peak = Math.min(startY, end.y) - g.H * 0.12
      d.img.setVisible(true).setPosition(reduced ? end.x : sx, reduced ? end.y : startY).setAlpha(reduced ? 0 : 1)
      d.shadow.setVisible(true)
      const spin = (i ? -1 : 1) * Math.PI * (3 + i)
      const tw = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: dur + i * 70,
        ease: reduced ? 'Linear' : 'Quad.easeOut',
        onUpdate: (t) => {
          const u = t.getValue() ?? 0
          if (reduced) {
            d.img.setAlpha(u)
          } else {
            const x = sx + (end.x - sx) * u
            const y = (1 - u) * (1 - u) * startY + 2 * (1 - u) * u * peak + u * u * end.y
            d.img.setPosition(x, y).setRotation(end.rot + spin * (1 - u))
          }
          d.shadow.setPosition(d.img.x + 4, end.y + g.dieSize * 0.42).setAlpha(0.15 + 0.25 * u)
        },
        onComplete: () => {
          d.img.setTexture(`die_${d.color}_${result[i]}`).setRotation(end.rot).setAlpha(1)
          if (!reduced) {
            this.tweens.add({
              targets: d.img,
              scaleY: d.img.scaleY * 0.86,
              scaleX: d.img.scaleX * 1.08,
              yoyo: true,
              duration: 70,
            })
            this.dust(end.x, end.y + g.dieSize * 0.35)
          }
          landed++
          if (landed === 2) {
            this.faceTimer?.remove()
            this.faceTimer = null
            this.rolling = []
            this.time.delayedCall(reduced ? 50 : 160, () => this.bridge.onLanded(rollId))
          }
        },
      })
      this.rolling.push(tw)
    })
  }

  private dust(x: number, y: number) {
    const g = this.geo()
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI * 2 * k) / 6
      const p = this.add.circle(x, y, g.dieSize * 0.08, CREAM, 0.5)
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * g.dieSize * 0.6,
        y: y + Math.sin(a) * g.dieSize * 0.2,
        alpha: 0,
        scale: 1.8,
        duration: 380,
        onComplete: () => p.destroy(),
      })
    }
  }

  // ---------- procedural dice faces (until the PNG atlas arrives) ----------

  private makeDiceTextures() {
    const S = DICE.face
    for (const color of ['red', 'ivory'] as const) {
      for (let f = 1; f <= 6; f++) {
        const key = `die_${color}_${f}`
        if (this.textures.exists(key)) continue
        const gfx = this.make.graphics({ x: 0, y: 0 }, false)
        const body = color === 'red' ? RED : IVORY
        const pip = color === 'red' ? IVORY : INK
        gfx.fillStyle(INK, 1).fillRoundedRect(0, 0, S, S, 26)
        gfx.fillStyle(body, 1).fillRoundedRect(6, 6, S - 12, S - 12, 22)
        gfx.fillStyle(0xffffff, 0.18).fillRoundedRect(12, 10, S - 30, 18, 9)
        gfx.fillStyle(0x000000, 0.18).fillRoundedRect(12, S - 26, S - 24, 14, 7)
        gfx.fillStyle(pip, 1)
        for (const [px, py] of PIPS[f]) gfx.fillCircle(S / 2 + px * 30, S / 2 + py * 30, 11)
        gfx.generateTexture(key, S, S)
        gfx.destroy()
      }
    }
  }
}
