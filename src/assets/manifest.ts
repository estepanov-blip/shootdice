/**
 * Single place that maps art keys to files (SHOOT DICE — Art Assets Only v1.0).
 * Swap a URL here when final art arrives; nothing else references file names.
 *
 * Status per the art pack manifest:
 *  - backgrounds, dice            -> prototype_ready
 *  - character idle + avatars     -> prototype_placeholder (idle used as fallback for all actions)
 *  - surface, logo, UI/VFX atlas, action sprites, audio -> MISSING (recreated in code/CSS)
 */
import theBlock from './art/backgrounds/the_block.webp'
import cornerStore from './art/backgrounds/corner_store.webp'
import underground from './art/backgrounds/underground.webp'
import killaIdle from './art/characters/killa_tee_idle.webp'
import rocIdle from './art/characters/big_roc_idle.webp'
import killaAvatar from './art/characters/killa_tee_avatar.webp'
import rocAvatar from './art/characters/big_roc_avatar.webp'
import red1 from './art/dice/red_1.png'
import red2 from './art/dice/red_2.png'
import red3 from './art/dice/red_3.png'
import red4 from './art/dice/red_4.png'
import red5 from './art/dice/red_5.png'
import red6 from './art/dice/red_6.png'
import ivory1 from './art/dice/ivory_1.png'
import ivory2 from './art/dice/ivory_2.png'
import ivory3 from './art/dice/ivory_3.png'
import ivory4 from './art/dice/ivory_4.png'
import ivory5 from './art/dice/ivory_5.png'
import ivory6 from './art/dice/ivory_6.png'

export interface ArtImage {
  key: string
  url: string
  w: number
  h: number
}

export const BACKGROUNDS = {
  /** Gameplay + main menu. */
  theBlock: { key: 'bg_the_block', url: theBlock, w: 540, h: 960 },
  /** Challenge / accept panels. */
  cornerStore: { key: 'bg_corner_store', url: cornerStore, w: 540, h: 960 },
  /** My games / chat champion. */
  underground: { key: 'bg_underground', url: underground, w: 540, h: 960 },
} satisfies Record<string, ArtImage>

export const ART = {
  background: BACKGROUNDS.theBlock,
  /** Full-body idle illustrations (transparent). Action poses are missing -> idle + tweens. */
  charPlayer: { key: 'char_killa_tee', url: killaIdle, w: 512, h: 768 },
  charBot: { key: 'char_big_roc', url: rocIdle, w: 512, h: 768 },
} satisfies Record<string, ArtImage>

/** Square avatars (no transparency) for HUD frames. The viewer is always KILLA TEE. */
export const PORTRAITS = { player: killaAvatar, bot: rocAvatar } as const

/** Dice faces 1..6. The file name encodes the face; never derive outcomes from art. */
export const DICE = {
  face: 256,
  red: [red1, red2, red3, red4, red5, red6],
  ivory: [ivory1, ivory2, ivory3, ivory4, ivory5, ivory6],
} as const

/** Fictional characters from the art pack. No real people, no brands. */
export const CHARACTERS = {
  player: { name: { en: 'KILLA TEE', ru: 'KILLA TEE' } },
  bot: { name: { en: 'BIG ROC', ru: 'BIG ROC' } },
} as const
