import Phaser from 'phaser'
import { useEffect, useRef } from 'react'
import type { PracticeController } from '../game/PracticeController'
import { PracticeScene } from '../game/PracticeScene'

/**
 * Hosts the Phaser game. Rendered at CSS size x DPR (capped at 2) and zoomed back
 * so art stays crisp on phones. Destroyed on unmount.
 */
export function GameCanvas({ ctrl, reducedMotion }: { ctrl: PracticeController; reducedMotion: boolean }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, el.clientWidth)
    const h = Math.max(1, el.clientHeight)
    const scene = new PracticeScene()
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      backgroundColor: '#171916',
      banner: false,
      audio: { noAudio: true },
      scale: { mode: Phaser.Scale.NONE, width: w * dpr, height: h * dpr, zoom: 1 / dpr },
      render: { antialias: true, roundPixels: false },
      fps: { target: 60, min: 30 },
    })
    game.scene.add('practice', scene, true, {
      bridge: { onLanded: (id: number) => ctrl.finishRoll(id), reducedMotion },
    })
    scene.setView(ctrl.getView())
    const unsub = ctrl.subscribe((v) => scene.setView(v))

    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      if (!cw || !ch) return
      game.scale.resize(cw * dpr, ch * dpr)
      game.scale.setZoom(1 / dpr)
    })
    ro.observe(el)

    return () => {
      unsub()
      ro.disconnect()
      game.destroy(true)
    }
  }, [ctrl, reducedMotion])

  return <div ref={host} className="game-canvas" aria-hidden="true" />
}
