# GDD v0.1
## Product
Vertical Telegram Mini App, 2.5D street graphic novel, short social dice sessions. Prototype: offline practice against bot, one location, two characters. MVP: authoritative online 1v1, then rooms of up to six and friend invites.
## Rules
Two independent fair six-sided dice. Come-out: 7/11 shooter wins; 2/3/12 loses; otherwise set point. Subsequent rolls: point wins, 7 loses, other totals continue. Opponent takes opposite side. Rotate shooter after resolved round. Prototype uses score only: winner +100, loser +0; no stake or loss of purchased value. A session is three resolved rounds; ties are draws. Scores reset per session. No paid random rewards. Practice bot rolls when it is shooter after 800ms. Other player waits. No input can change dice outcome.
## Flow
Home -> Practice -> round intro -> roll -> animation -> resolution or point -> next round -> results -> replay/home. Show both dice, sum, point, shooter, score and rules help. Pause/resume without reroll. MVP: lobby, ready, disconnect/rejoin, match results, profile, cosmetic inventory. Multi-player scoring rules deferred until 1v1 validated.
## Progression
MVP proposal: XP for completed matches, cosmetic unlocks, ranks Nobody/Rookie/Hustler/Big Shot/Street Legend. Cosmetics sold directly, separate from match score. No cash-out, player transfers or purchase of score. No leaderboard based on spending.
## Validation
Test comprehension, completion, replay intent, load time and crash rate. Proposed pilot: 20 testers, 80% complete first session without help, 50% voluntarily replay. These are hypotheses, not benchmarks.
