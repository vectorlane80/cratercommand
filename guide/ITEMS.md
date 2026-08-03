# Items

The other half of the shop: defence, mobility and guidance. Numbers come
straight from `GAME_CONFIG` (`src/game/types/GameTypes.ts`). The **Key**
column is the shop hotkey.

---

## Shields

Shields **absorb damage before your health does**, but only while **armed** —
press `X` in a match to arm your best one. An armed shield soaks hits until
its pool is spent, then breaks.

| Item | Key | Price | What it does |
|---|---|---|---|
| **Shield** | `S` | $20,000 / 3 | Absorbs 40 damage. The entry-level shield. |
| **Force Shield** | `F` | $25,000 / 3 | Absorbs 65. |
| **Heavy Shield** | `H` | $30,000 / 2 | Absorbs 90 — most of a full health bar. |
| **Super Mag** | `M` | $35,000 / 2 | Absorbs 100 **and** deflects incoming shots away while armed. The best defence in the game. |
| **Auto Defense** | `O` | $1,500 | A one-off purchase that arms your best shield automatically at the start of every round, so you never lose one to forgetting. |
| **Mag Deflector** | `G` | $10,000 / 2 | Pushes shells that come near you upward, without needing to be armed. Works alongside a shield. |

## Survival and mobility

| Item | Key | Price | What it does |
|---|---|---|---|
| **Parachute** | `P` | $10,000 / 8 | Auto-deploys when you would take fall damage and cancels it completely. One is included at the start of a match — after that, buy more. |
| **Battery** | `B` | $5,000 / 10 | **+10 HP** when used with `B`, and the fuel for energy weapons. Plasma Blast costs 1 per shot, the Laser costs 2 — without batteries they simply will not fire. |
| **Fuel Tank** | `U` | $10,000 / 10 | +10 movement each. You get a movement budget every turn; fuel extends it when you need to reposition badly. |
| **Contact Trigger** | `T` | $1,000 / 25 | Makes your warheads detonate on first contact while tunneling, instead of boring on through. |

## Guidance systems

Guidance is **consumed per shot** and applies to whatever you fire next.
Press `C` in a match to cycle which system is active. These are the most
expensive things in the shop for a reason — they turn a guess into a hit.

| Item | Key | Price | What it does |
|---|---|---|---|
| **Heat Guidance** | `J` | $10,000 / 6 | Shells steer toward the nearest tank once they get close. Forgiving of a near miss. |
| **Ballistic Guidance** | `K` | $10,000 / 2 | **Computes the firing solution for you** — angle and power — and fires it. The most direct way to hit someone, and priced for only two shots. |
| **Horizontal Guidance** | `L` | $15,000 / 5 | Once past the top of its arc, the shell levels off and flies flat at the target. Good over long, flat ground. |
| **Vertical Guidance** | `I` | $20,000 / 5 | When the shell gets roughly above the target it stops and **dives straight down** — reaches people tucked behind tall cover. |
| **Lazy Boy** | `Y` | $20,000 / 2 | Auto-aim **plus** homing: it solves the shot and then steers. The most reliable kill in the game, at two shots per purchase. |

---

## The economy

You earn money three ways: **$45 per point of damage** you deal, **$8,000**
for winning a round, and **$3,000** for surviving one. Savings earn **5%
interest** between rounds, so banking is a real strategy in a long match.

Prices move on a persistent free market — buying a lot of something pushes
its price up, and ignoring something lets it drift back down. One item goes
on sale each round.

Everyone shops between rounds, including the CPU, each personality with its
own priorities.

