import type { PointNumber, RoundResult, Side } from '../game/rules'

export type Lang = 'en' | 'ru'

const en = {
  tagline: 'Street Dice Club',
  practice: 'Practice',
  practiceSub: 'You vs Big Lou · 3 rounds',
  online: 'Online 1v1',
  soon: 'soon',
  rules: 'Rules',
  location: 'The Block',
  disclaimer: 'Score only. No money, no bets, nothing to buy.',
  you: 'YOU',
  round: (n: number, total: number) => `Round ${n}/${total}`,
  roundIntro: (n: number, shooterIsYou: boolean, bot: string) =>
    shooterIsYou ? `Round ${n} · You shoot` : `Round ${n} · ${bot} shoots`,
  roll: 'Throw dice',
  rolling: 'Rolling…',
  waitBot: (bot: string) => `${bot} is throwing…`,
  nextRound: 'Next round',
  seeResults: 'Results',
  point: 'Point',
  pointSet: (p: PointNumber) => `Point set: ${p}`,
  needComeOut: '7 or 11 wins · 2, 3, 12 loses · anything else sets the point',
  needPoint: (p: PointNumber) => `Hit ${p} again before a 7`,
  botComeOut: (bot: string) => `${bot} needs 7 or 11. You win on 2, 3, 12.`,
  botPoint: (bot: string, p: PointNumber) => `${bot} needs ${p}. A 7 and the round is yours.`,
  noDecision: (t: number) => `${t} — no decision, roll again`,
  botNoDecision: (t: number) => `${t} — no decision`,
  outcome: (r: RoundResult, youWon: boolean) => {
    const how = {
      natural: 'Natural',
      craps: 'Craps',
      pointMade: `Point ${r.point} made`,
      sevenOut: 'Seven out',
    }[r.kind]
    return `${how}! ${youWon ? 'You take the round' : 'Big Lou takes the round'}`
  },
  kindBanner: (k: RoundResult['kind'], p: PointNumber | null) =>
    ({ natural: 'Natural!', craps: 'Craps!', pointMade: `Point ${p}!`, sevenOut: 'Seven out!' })[k],
  win: 'You win',
  lose: 'You lose',
  draw: 'Draw',
  playAgain: 'Play again',
  home: 'Home',
  paused: 'Paused',
  resume: 'Resume',
  close: 'Got it',
  roundsLog: 'Rounds',
  shooter: (s: Side, bot: string) => (s === 'player' ? 'You' : bot),
  rulesTitle: 'Street craps',
  rulesBody: [
    'Two fair dice. The shooter throws; the other player takes the opposite side.',
    'Come-out roll: 7 or 11 — shooter wins. 2, 3 or 12 — shooter loses.',
    'Any other total (4, 5, 6, 8, 9, 10) becomes the point.',
    'Then keep throwing: the point again — shooter wins. A 7 — shooter loses. Anything else — throw again.',
    'Round winner +100. Shooter switches every round. Three rounds per match.',
    'Practice only: score, no money, no bets. Dice are decided by a fair random generator before the animation.',
  ],
}

const ru: typeof en = {
  tagline: 'Уличный клуб костей',
  practice: 'Тренировка',
  practiceSub: 'Ты против Биг Лу · 3 раунда',
  online: 'Онлайн 1 на 1',
  soon: 'скоро',
  rules: 'Правила',
  location: 'Квартал',
  disclaimer: 'Только очки. Без денег, ставок и покупок.',
  you: 'ТЫ',
  round: (n, total) => `Раунд ${n}/${total}`,
  roundIntro: (n, you, bot) => (you ? `Раунд ${n} · Бросаешь ты` : `Раунд ${n} · Бросает ${bot}`),
  roll: 'Бросить',
  rolling: 'Летят…',
  waitBot: (bot) => `${bot} бросает…`,
  nextRound: 'Дальше',
  seeResults: 'Итоги',
  point: 'Пойнт',
  pointSet: (p) => `Пойнт: ${p}`,
  needComeOut: '7 или 11 — победа · 2, 3, 12 — проигрыш · иначе пойнт',
  needPoint: (p) => `Выбей ${p} раньше, чем 7`,
  botComeOut: (bot) => `${bot} нужно 7 или 11. Тебе — 2, 3 или 12.`,
  botPoint: (bot, p) => `${bot} нужно ${p}. Выпадет 7 — раунд твой.`,
  noDecision: (t) => `${t} — мимо, бросай ещё`,
  botNoDecision: (t) => `${t} — мимо`,
  outcome: (r, youWon) => {
    const how = {
      natural: 'Натурал',
      craps: 'Крэпс',
      pointMade: `Пойнт ${r.point} выбит`,
      sevenOut: 'Семёрка',
    }[r.kind]
    return `${how}! ${youWon ? 'Раунд твой' : 'Раунд за Биг Лу'}`
  },
  kindBanner: (k, p) => ({ natural: 'Натурал!', craps: 'Крэпс!', pointMade: `Пойнт ${p}!`, sevenOut: 'Семёрка!' })[k],
  win: 'Победа',
  lose: 'Поражение',
  draw: 'Ничья',
  playAgain: 'Ещё раз',
  home: 'В меню',
  paused: 'Пауза',
  resume: 'Продолжить',
  close: 'Понятно',
  roundsLog: 'Раунды',
  shooter: (s, bot) => (s === 'player' ? 'Ты' : bot),
  rulesTitle: 'Уличный крэпс',
  rulesBody: [
    'Два честных кубика. Бросает шутер, соперник играет на противоположный исход.',
    'Первый бросок: 7 или 11 — шутер выиграл. 2, 3 или 12 — проиграл.',
    'Любая другая сумма (4, 5, 6, 8, 9, 10) становится пойнтом.',
    'Дальше бросаем: снова пойнт — шутер выиграл. 7 — проиграл. Остальное — бросок ещё раз.',
    'Победителю раунда +100. Шутер меняется каждый раунд. В матче три раунда.',
    'Только тренировка: очки, без денег и ставок. Кубики определяет честный генератор до анимации.',
  ],
}

export const STRINGS = { en, ru }
export type Strings = typeof en

export function detectLang(tgLang?: string | null): Lang {
  const l = (tgLang || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en').toLowerCase()
  return l.startsWith('ru') || l.startsWith('uk') || l.startsWith('be') || l.startsWith('kk') ? 'ru' : 'en'
}
