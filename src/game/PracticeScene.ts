/**
 * Rendering + animation only. Never decides anything: it receives the controller's
 * view, animates `rolling.dice` (already determined) and reports back with onLanded().
 * Coordinates are device pixels (the game is sized at CSS size x DPR and zoomed back),
 * so layout is computed from the current scale size on every resize.
 *
 * Visual style: "Animated Graphic Novel" (art pack v1.0). Characters are idle
 * illustrations; ready / throw / reaction / victory / defeat are tween poses on the idle
 * art until clean action sprites exist. The concrete slab is drawn in code (no asset yet).
 */
import Phaser from 'phaser'
import { ART, DICE } from '../assets/manifest'
import type { PracticeView } from './PracticeController'
import { lastRound, type Side } from './rules'

export const ROLL_ANIM_MS = 1000
const INK = 0x0f100e
const CHALK = 0xefe2c2
const GOLD = 0xf2c14e

export interface SceneBridge {
  onLanded(rollId: number): void
  reducedMotion: boolean
}

type DieColor = 'red' | 'ivory'
type DieSprite = { img: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse }

/** Pose offsets layered on top of the layout position (driven by tweens). */
interface Pose {
  dx: number // fraction of W
  dy: number // fraction of H
  rot: number // radians
  s: number // scale multiplier
  hl: number // 1 = shooter, 0 = waiting
  shake: number // px amplitude, decays
}

const dieKey = (c: DieColor, f: number) => `die_${c}_${f}`
const colorFor = (side: Side): DieColor => (side === 'player' ? 'red' : 'ivory')

export class PracticeScene extends Phaser.Scene {
  private bridge!: SceneBridge
  private view: PracticeView | null = null
  private animatedRollId = 0
  private reactedRollId = 0
  private lastMatchNo = 0
  private bg!: Phaser.GameObjects.Image
  private slab!: Phaser.GameObjects.Graphics
  private spot!: Phaser.GameObjects.Image
  private chars!: Record<Side, Phaser.GameObjects.Image>
  private pose: Record<Side, Pose> = {
    player: { dx: 0, dy: 0, rot: 0, s: 1, hl: 1, shake: 0 },
    bot: { dx: 0, dy: 0, rot: 0, s: 1, hl: 0, shake: 0 },
  }
  private dice: DieSprite[] = []
  private diceColor: DieColor = 'red'
  private ready = false
  private rolling: Phaser.Tweens.Tween[] = []
  private faceTimer: Phaser.Time.TimerEvent | null = null
  private trailTimer: Phaser.Time.TimerEvent | null = null

  constructor() {
    super('practice')
  }

  init(data: { bridge: SceneBridge }) {
    this.bridge = data.bridge
  }

  preload() {
    const img = (a: { key: string; url: string }) => this.load.image(a.key, a.url)
    img(ART.background)
    img(ART.charPlayer)
    img(ART.charBot)
    for (const c of ['red', 'ivory'] as const) DICE[c].forEach((url, i) => this.load.image(dieKey(c, i + 1), url))
  }

  create() {
    this.makeSpotTexture()
    this.bg = this.add.image(0, 0, ART.background.key).setOrigin(0.5)
    this.spot = this.add.image(0, 0, 'spot').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55)
    this.chars = {
      player: this.add.image(0, 0, ART.charPlayer.key).setOrigin(0.5, 1),
      bot: this.add.image(0, 0, ART.charBot.key).setOrigin(0.5, 1),
    }
    this.slab = this.add.graphics()
    this.dice = [0, 1].map(() => ({
      shadow: this.add.ellipse(0, 0, 10, 10, 0x000000, 0.4).setVisible(false),
      img: this.add.image(0, 0, dieKey('red', 1)).setVisible(false),
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
    // concrete slab: perspective trapezoid in the lower-middle
    const slabTop = H * 0.585
    const slabBottom = H * 0.79
    const slabTopW = Math.min(W * 0.78, H * 0.46)
    const slabBottomW = Math.min(W * 1.0, H * 0.6)
    const charH = Math.min(H * 0.62, W * 1.3)
    const charW = (charH * ART.charBot.w) / ART.charBot.h
    const charBottom = slabBottom + H * 0.012 // legs hidden behind the slab, feet never show
    const dieSize = Math.round(Math.min(W * 0.19, H * 0.1))
    return { W, H, slabTop, slabBottom, slabTopW, slabBottomW, charH, charW, charBottom, dieSize }
  }

  private baseX(side: Side) {
    const g = this.geo()
    return side === 'player' ? g.W * 0.26 : g.W * 0.75
  }

  private layout() {
    if (!this.ready) return
    const g = this.geo()
    const s = Math.max(g.W / ART.background.w, g.H / ART.background.h)
    this.bg.setPosition(g.W / 2, g.H / 2).setScale(s)
    this.drawSlab()
    for (const d of this.dice) {
      d.img.setDisplaySize(g.dieSize, g.dieSize)
      d.shadow.setSize(g.dieSize * 0.95, g.dieSize * 0.32)
    }
    if (this.view) this.highlight(this.view.match.shooter, true)
    if (this.view && !this.view.rolling) this.placeRestingDice()
  }

  /** Drawn every layout: concrete, cracks, chalk court (no surface asset in the pack). */
  private drawSlab() {
    const g = this.geo()
    const s = this.slab
    const cx = g.W / 2
    const lw = Math.max(2, g.W * 0.008)
    const tl = cx - g.slabTopW / 2
    const tr = cx + g.slabTopW / 2
    const bl = cx - g.slabBottomW / 2
    const br = cx + g.slabBottomW / 2
    const lip = g.H * 0.022
    s.clear()
    // front face (thickness)
    s.fillStyle(0x23211d, 1).fillPoints(
      [new Phaser.Math.Vector2(bl, g.slabBottom), new Phaser.Math.Vector2(br, g.slabBottom), new Phaser.Math.Vector2(br, g.slabBottom + lip), new Phaser.Math.Vector2(bl, g.slabBottom + lip)],
      true,
    )
    // top
    const top = [new Phaser.Math.Vector2(tl, g.slabTop), new Phaser.Math.Vector2(tr, g.slabTop), new Phaser.Math.Vector2(br, g.slabBottom), new Phaser.Math.Vector2(bl, g.slabBottom)]
    s.fillGradientStyle(0x4a463e, 0x4a463e, 0x2a2824, 0x2a2824, 0.97).fillPoints(top, true)
    // grit (deterministic speckles)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 260; i++) {
      const v = rnd()
      const y = g.slabTop + (g.slabBottom - g.slabTop) * rnd()
      const t = (y - g.slabTop) / (g.slabBottom - g.slabTop)
      const half = (g.slabTopW + (g.slabBottomW - g.slabTopW) * t) / 2
      const x = cx + (rnd() * 2 - 1) * half * 0.97
      s.fillStyle(v > 0.5 ? 0x000000 : CHALK, v > 0.5 ? 0.22 : 0.07).fillCircle(x, y, lw * (0.3 + rnd() * 0.7))
    }
    // cracks
    s.lineStyle(lw * 0.6, INK, 0.55)
    s.beginPath()
    s.moveTo(tl + g.slabTopW * 0.18, g.slabTop)
    s.lineTo(tl + g.slabTopW * 0.24, g.slabTop + (g.slabBottom - g.slabTop) * 0.3)
    s.lineTo(tl + g.slabTopW * 0.16, g.slabTop + (g.slabBottom - g.slabTop) * 0.55)
    s.moveTo(br - g.slabBottomW * 0.12, g.slabBottom)
    s.lineTo(br - g.slabBottomW * 0.2, g.slabBottom - (g.slabBottom - g.slabTop) * 0.35)
    s.lineTo(br - g.slabBottomW * 0.14, g.slabBottom - (g.slabBottom - g.slabTop) * 0.6)
    s.strokePath()
    // chalk court (rough double stroke)
    const inset = (t: number, k: number) => {
      const y = g.slabTop + (g.slabBottom - g.slabTop) * t
      const half = ((g.slabTopW + (g.slabBottomW - g.slabTopW) * t) / 2) * k
      return { y, l: cx - half, r: cx + half }
    }
    const a = inset(0.16, 0.8)
    const b = inset(0.86, 0.84)
    for (const [alpha, off] of [
      [0.75, 0],
      [0.3, lw * 0.9],
    ] as const) {
      s.lineStyle(lw * 0.9, CHALK, alpha)
      s.strokePoints(
        [
          new Phaser.Math.Vector2(a.l + off, a.y + off),
          new Phaser.Math.Vector2(a.r - off, a.y - off * 0.5),
          new Phaser.Math.Vector2(b.r + off * 0.5, b.y - off),
          new Phaser.Math.Vector2(b.l - off, b.y + off * 0.3),
        ],
        true,
      )
    }
    // lip highlight + ink outline
    s.lineStyle(lw * 1.4, 0x7a756a, 1).lineBetween(tl, g.slabTop, tr, g.slabTop)
    s.lineStyle(lw * 1.6, INK, 1).strokePoints(top, true)
    s.strokeRect(bl, g.slabBottom, g.slabBottomW, lip)
  }

  private restSpot(i: number, rollId: number) {
    const g = this.geo()
    const j = (n: number) => (((rollId * 9301 + n * 49297) % 233280) / 233280 - 0.5) * 2
    const midY = g.slabTop + (g.slabBottom - g.slabTop) * 0.5
    const cx = g.W / 2 + (i === 0 ? -1 : 1) * g.slabTopW * 0.15 + j(i + 1) * g.slabTopW * 0.06
    const cy = midY + j(i + 7) * (g.slabBottom - g.slabTop) * 0.14
    return { x: cx, y: cy, rot: j(i + 3) * 0.5 }
  }

  // ---------- per-frame: idle breathing + pose ----------

  update(time: number) {
    if (!this.ready) return
    const g = this.geo()
    const reduced = this.bridge.reducedMotion
    for (const side of ['player', 'bot'] as Side[]) {
      const img = this.chars[side]
      const p = this.pose[side]
      const phase = side === 'player' ? 0 : 1.7
      const breath = reduced ? 0 : Math.sin(time / 850 + phase)
      const base = g.charH / img.height
      const hlScale = 0.95 + 0.06 * p.hl
      const shake = p.shake > 0.2 ? (Math.random() - 0.5) * p.shake : 0
      p.shake *= 0.86
      img
        .setPosition(this.baseX(side) + p.dx * g.W + shake, g.charBottom + p.dy * g.H + breath * g.H * 0.002)
        .setRotation(p.rot)
        .setScale(base * hlScale * p.s, base * hlScale * p.s * (1 + breath * 0.006))
      const c = Math.round(0x70 + (0xff - 0x70) * p.hl)
      img.setTint(Phaser.Display.Color.GetColor(c, Math.round(c * 0.97), Math.round(c * 0.94)))
    }
    const shooter = this.view?.match.shooter ?? 'player'
    this.spot.setPosition(this.chars[shooter].x, g.charBottom - g.charH * 0.55).setDisplaySize(g.charW * 1.6, g.charH * 1.1)
  }

  // ---------- view sync ----------

  private apply(v: PracticeView) {
    if (v.matchNo !== this.lastMatchNo) {
      this.lastMatchNo = v.matchNo
      this.stopRolling()
      this.animatedRollId = 0
      this.reactedRollId = 0
      for (const d of this.dice) {
        d.img.setVisible(false)
        d.shadow.setVisible(false)
      }
      this.resetPose()
    }
    this.highlight(v.match.shooter)
    if (v.rolling && v.rolling.rollId !== this.animatedRollId) {
      this.animatedRollId = v.rolling.rollId
      this.throwDice(v.rolling.rollId, v.rolling.by, v.rolling.dice)
    } else if (!v.rolling && v.match.lastDice && this.rolling.length === 0) {
      this.placeRestingDice()
    }
    // round resolved -> victory / defeat reaction (once per roll)
    const m = v.match
    if (!v.rolling && (m.phase === 'roundEnd' || m.phase === 'matchEnd') && m.lastRoll && m.lastRoll.rollId !== this.reactedRollId) {
      this.reactedRollId = m.lastRoll.rollId
      const r = lastRound(m)
      if (r) this.react(r.winner, m.phase === 'matchEnd')
    }
  }

  private resetPose() {
    for (const side of ['player', 'bot'] as Side[]) {
      this.tweens.killTweensOf(this.pose[side])
      Object.assign(this.pose[side], { dx: 0, dy: 0, rot: 0, s: 1, shake: 0 })
    }
  }

  private highlight(shooter: Side, instant = false) {
    for (const side of ['player', 'bot'] as Side[]) {
      const target = side === shooter ? 1 : 0
      const p = this.pose[side]
      if (instant || this.bridge.reducedMotion) p.hl = target
      else if (p.hl !== target) this.tweens.add({ targets: p, hl: target, duration: 320, ease: 'Sine.easeOut' })
    }
  }

  private placeRestingDice() {
    const m = this.view?.match
    if (!m?.lastDice || !m.lastRoll) return
    const color = colorFor(m.lastRoll.shooter)
    m.lastDice.forEach((face, i) => {
      const d = this.dice[i]
      const p = this.restSpot(i, m.lastRoll!.rollId)
      d.img.setTexture(dieKey(color, face)).setPosition(p.x, p.y).setRotation(p.rot).setVisible(true).setAlpha(1)
      d.shadow.setPosition(p.x + 3, p.y + this.geo().dieSize * 0.45).setVisible(true).setAlpha(0.4)
    })
  }

  private stopRolling() {
    for (const t of this.rolling) t.stop()
    this.rolling = []
    this.faceTimer?.remove()
    this.faceTimer = null
    this.trailTimer?.remove()
    this.trailTimer = null
  }

  // ---------- poses (idle fallback for missing action sprites) ----------

  /** THROW: shooter lunges toward the slab, then settles back to READY. */
  private lunge(side: Side) {
    if (this.bridge.reducedMotion) return
    const p = this.pose[side]
    const dir = side === 'player' ? 1 : -1
    this.tweens.killTweensOf(p)
    this.tweens.chain({
      targets: p,
      tweens: [
        { dx: -0.015 * dir, rot: -0.03 * dir, duration: 110, ease: 'Sine.easeOut' }, // wind-up
        { dx: 0.05 * dir, dy: 0.012, rot: 0.07 * dir, s: 1.05, duration: 150, ease: 'Back.easeOut' }, // release
        { dx: 0, dy: 0, rot: 0, s: 1, duration: 420, ease: 'Sine.easeInOut', delay: 120 }, // back to ready
      ],
    })
  }

  /** REACTION -> VICTORY for the round winner, DEFEAT for the loser. */
  private react(winner: Side, big: boolean) {
    if (this.bridge.reducedMotion) return
    const loser: Side = winner === 'player' ? 'bot' : 'player'
    const w = this.pose[winner]
    const l = this.pose[loser]
    this.tweens.killTweensOf(w)
    this.tweens.killTweensOf(l)
    this.tweens.chain({
      targets: w,
      tweens: [
        { dy: -0.035, s: big ? 1.1 : 1.06, duration: 170, ease: 'Back.easeOut' },
        { dy: 0, duration: 160, ease: 'Bounce.easeOut' },
        { dy: -0.02, duration: 140, ease: 'Sine.easeOut' },
        { dy: 0, s: 1, duration: 360, ease: 'Sine.easeInOut', delay: big ? 500 : 250 },
      ],
    })
    l.shake = this.geo().W * 0.012
    this.tweens.chain({
      targets: l,
      tweens: [
        { dy: 0.025, rot: (loser === 'player' ? -1 : 1) * 0.04, s: 0.97, duration: 260, ease: 'Sine.easeOut' },
        { dy: 0, rot: 0, s: 1, duration: 500, ease: 'Sine.easeInOut', delay: big ? 700 : 400 },
      ],
    })
    this.burst(this.chars[winner].x, this.geo().charBottom - this.geo().charH * 0.62, big ? 2.2 : 1.7, GOLD, this.chars[winner])
  }

  // ---------- the throw ----------

  private throwDice(rollId: number, by: Side, result: readonly [number, number]) {
    this.stopRolling()
    const g = this.geo()
    this.diceColor = colorFor(by)
    const dir = by === 'player' ? 1 : -1
    const startX = this.baseX(by) + dir * g.charW * 0.3
    const startY = g.charBottom - g.charH * 0.45
    const reduced = this.bridge.reducedMotion
    const dur = reduced ? 150 : 800
    this.lunge(by)

    let tick = 0
    if (!reduced) {
      this.faceTimer = this.time.addEvent({
        delay: 70,
        loop: true,
        callback: () => {
          tick++
          this.dice.forEach((d, i) => d.img.setTexture(dieKey(this.diceColor, ((tick + i * 3) % 6) + 1)))
        },
      })
      // speed trail: fading ghosts behind each die (comic motion lines)
      this.trailTimer = this.time.addEvent({
        delay: 45,
        loop: true,
        callback: () => {
          for (const d of this.dice) {
            if (!d.img.visible) continue
            const ghost = this.add
              .image(d.img.x, d.img.y, d.img.texture.key)
              .setDisplaySize(g.dieSize * 0.9, g.dieSize * 0.9)
              .setRotation(d.img.rotation)
              .setAlpha(0.28)
            this.children.moveBelow(ghost as never, d.img as never)
            this.tweens.add({ targets: ghost, alpha: 0, scale: ghost.scale * 0.6, duration: 220, onComplete: () => ghost.destroy() })
          }
        },
      })
    }

    let landed = 0
    this.dice.forEach((d, i) => {
      const end = this.restSpot(i, rollId)
      const sx = startX + (i ? 12 : -12)
      const peak = Math.min(startY, end.y) - g.H * 0.1
      d.img
        .setTexture(dieKey(this.diceColor, 1))
        .setDisplaySize(g.dieSize, g.dieSize)
        .setVisible(true)
        .setPosition(reduced ? end.x : sx, reduced ? end.y : startY)
        .setAlpha(reduced ? 0 : 1)
      d.shadow.setVisible(true)
      const spin = (i ? -1 : 1) * Math.PI * (3 + i)
      const tw = this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: dur + i * 80,
        delay: reduced ? 0 : 160, // release frame of the lunge
        ease: reduced ? 'Linear' : 'Quad.easeOut',
        onUpdate: (t) => {
          const u = t.getValue() ?? 0
          if (reduced) {
            d.img.setAlpha(u)
          } else {
            const x = sx + (end.x - sx) * u
            const y = (1 - u) * (1 - u) * startY + 2 * (1 - u) * u * peak + u * u * end.y
            const sc = 1 + 0.25 * Math.sin(u * Math.PI) // closer to the camera mid-air
            d.img.setPosition(x, y).setRotation(end.rot + spin * (1 - u)).setDisplaySize(g.dieSize * sc, g.dieSize * sc)
          }
          d.shadow.setPosition(d.img.x + 3, end.y + g.dieSize * 0.45).setAlpha(0.12 + 0.28 * u)
        },
        onComplete: () => {
          d.img.setTexture(dieKey(this.diceColor, result[i])).setRotation(end.rot).setAlpha(1).setDisplaySize(g.dieSize, g.dieSize)
          if (!reduced) {
            this.tweens.add({ targets: d.img, scaleY: d.img.scaleY * 0.84, scaleX: d.img.scaleX * 1.1, yoyo: true, duration: 70 })
            this.dust(end.x, end.y + g.dieSize * 0.35)
            if (i === 1) {
              this.burst((this.dice[0].img.x + end.x) / 2, end.y, 0.8, CHALK)
              this.cameras.main.shake(140, 0.005)
            }
          }
          landed++
          if (landed === 2) {
            this.faceTimer?.remove()
            this.faceTimer = null
            this.trailTimer?.remove()
            this.trailTimer = null
            this.rolling = []
            this.time.delayedCall(reduced ? 50 : 180, () => this.bridge.onLanded(rollId))
          }
        },
      })
      this.rolling.push(tw)
    })
  }

  private dust(x: number, y: number) {
    const g = this.geo()
    for (let k = 0; k < 8; k++) {
      const a = (Math.PI * 2 * k) / 8
      const p = this.add.circle(x, y, g.dieSize * 0.09, 0xcfc4a8, 0.55)
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * g.dieSize * 0.75,
        y: y + Math.sin(a) * g.dieSize * 0.22,
        alpha: 0,
        scale: 2.2,
        duration: 420,
        onComplete: () => p.destroy(),
      })
    }
  }

  /** Comic impact star behind an event (dice landing, round win). */
  private burst(x: number, y: number, size: number, color: number, below?: Phaser.GameObjects.GameObject) {
    if (this.bridge.reducedMotion) return
    const g = this.geo()
    const r = g.dieSize * 1.3 * size
    const pts: Phaser.Math.Vector2[] = []
    for (let k = 0; k < 24; k++) {
      const rr = k % 2 ? r * 0.5 : r * (0.9 + ((k * 37) % 10) / 40)
      const a = (Math.PI * 2 * k) / 24
      pts.push(new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr * 0.6))
    }
    const star = this.add.graphics({ x, y })
    star.fillStyle(color, 0.85).fillPoints(pts, true)
    star.lineStyle(Math.max(2, g.W * 0.006), INK, 0.9).strokePoints(pts, true)
    star.setScale(0.2).setAlpha(1)
    // behind the given object (a character), otherwise just above the slab and under the dice
    if (below) this.children.moveBelow(star as never, below as never)
    else this.children.moveAbove(star as never, this.slab as never)
    this.tweens.add({ targets: star, scale: 1, duration: 140, ease: 'Back.easeOut' })
    this.tweens.add({ targets: star, alpha: 0, delay: 200, duration: 260, onComplete: () => star.destroy() })
  }

  private makeSpotTexture() {
    if (this.textures.exists('spot')) return
    const S = 256
    const tex = this.textures.createCanvas('spot', S, S)
    if (!tex) return
    const ctx = tex.getContext()
    const grd = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    grd.addColorStop(0, 'rgba(255,214,140,0.55)')
    grd.addColorStop(0.5, 'rgba(200,120,50,0.15)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, S, S)
    tex.refresh()
  }
}
