/**
 * Small art pieces recreated in code because the pack has no standalone logo or
 * UI atlas (see report: missing assets). Shapes are original, styled after the concepts.
 */
import { DICE } from '../assets/manifest'

export function Crown({ className = '' }: { className?: string }) {
  return (
    <svg className={`crown ${className}`} viewBox="0 0 64 40" aria-hidden="true">
      <path
        d="M4 34 L8 8 L22 22 L32 3 L42 22 L56 8 L60 34 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M6 37 H58" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ tagline, compact = false }: { tagline: string; compact?: boolean }) {
  return (
    <div className={`logo ${compact ? 'compact' : ''}`} aria-label="Shoot Dice">
      <Crown className="logo-crown" />
      <div className="logo-shoot">SHOOT</div>
      <div className="logo-dice">DICE</div>
      {!compact && (
        <div className="logo-dice-pair" aria-hidden="true">
          <img src={DICE.ivory[3]} alt="" />
          <img src={DICE.red[4]} alt="" />
        </div>
      )}
      <div className="logo-tag">{tagline}</div>
    </div>
  )
}

/** Small die face used as a button icon. */
export function DieIcon({ face = 5, color = 'ivory' }: { face?: number; color?: 'red' | 'ivory' }) {
  return <img className="die-icon" src={DICE[color][face - 1]} alt="" aria-hidden="true" />
}
