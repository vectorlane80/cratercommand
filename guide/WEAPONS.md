# Weapons

Every weapon in Crater Command, with the numbers straight out of
`GAME_CONFIG` (`src/game/types/GameTypes.ts`). Tanks have **125 HP**, so
"damage" tells you how many clean hits a kill takes.

**Blast** is the crater radius in pixels — it's both how much terrain the shot
removes and how close you have to land to hurt someone. **Price** is the base
shop price; a `/ n` suffix means one purchase gives you n shots. **Start** is
what you begin a match with.

Prices drift with the free market: buy a lot of something and it gets dearer,
ignore it and it drifts back down. Every round rolls a sale on one item.

---

## Missiles

Bread and butter: fly, hit, explode. No tricks.

| Weapon | Damage | Blast | Price | Start | What it does |
|---|---|---|---|---|---|
| **Small Missile** | 35 | 25 | free | unlimited | Your infinite fallback. Never runs out, so you always have a shot. |
| **Bullet** | 22 | 12 | $1,500 | 12 | Flies **70% faster** than everything else, so wind barely bends it. Small blast — you have to be accurate. |
| **Missile** | 45 | 30 | $1,875 / 5 | — | A straight upgrade on the small missile, sold in packs of five. |
| **Big Missile** | 55 | 38 | $3,500 | 8 | The reliable workhorse — three hits kill a full-health tank. |
| **Baby Nuke** | 70 | 46 | $10,000 / 3 | — | Heavy damage without the price of a full nuke. |
| **Huge Missile** | 90 | 60 | $18,000 | 3 | Enormous 60px crater — reshapes the battlefield as much as it hurts. |
| **Nuke** | 110 | 75 | $12,000 | — | The biggest single warhead: **110 damage** and a 75px crater. Nearly a one-shot kill. |
| **Plasma Blast** | 60 | 40 | $9,000 / 5 | — | Flies 15% faster and costs **1 battery** per shot. Buy batteries or it will not fire. |

## Splitters and cluster weapons

These break apart in flight or on impact and cover a wide area — good when
you know roughly where someone is but not exactly.

| Weapon | Damage | Blast | Price | Start | What it does |
|---|---|---|---|---|---|
| **Triple Missile** | 30 | 22 | $10,000 | 6 | Splits into **3** at the top of its arc, spread 18°. Damage is per fragment. |
| **MIRV** | 35 | 28 | $10,000 / 3 | — | Splits into **5** at apex, spread 24°. A wide net. |
| **Death's Head** | 60 | 44 | $20,000 | — | Splits into **9** at apex across a 40° fan, each doing 60. Devastating and priced like it. |
| **Funky Bomb** | 50 | 34 | $7,000 / 2 | — | Explodes, then throws **6** bomblets that explode in turn — a chain reaction across the impact zone. |
| **Leapfrog** | 40 | 26 | $10,000 / 2 | — | Explodes, then hops forward and explodes again, **3 times** total. Walks over a ridge into whatever hides behind it. |
| **Stream** | 18 | 14 | $13,000 | 4 | A machine-gun burst: **5 shots** leave the barrel 150ms apart and walk down your aim line. Later shots drift further in the wind. |
| **Bouncing Bomb** | 50 | 32 | $8,000 | 5 | Bounces **once** off the ground before detonating. Reaches over obstacles a direct shot cannot. |

## Rollers

Rollers land and then **roll downhill** until they hit something or run out
of slope. Made for enemies sitting in valleys — you do not need to hit them,
just land above them and let gravity do the aiming.

| Weapon | Damage | Blast | Price | Start | What it does |
|---|---|---|---|---|---|
| **Baby Roller** | 30 | 22 | $5,000 / 10 | — | Ten cheap rollers. Great value for probing a valley. |
| **Roller** | 45 | 32 | $6,750 / 5 | — | The standard roller. |
| **Heavy Roller** | 70 | 45 | $6,750 / 2 | — | 70 damage once it arrives. Land it uphill of someone dug in. |

## Tunnelers

These burrow **through** terrain instead of stopping at it. Use them on
someone buried inside a hill, where a normal shell just eats dirt.

Diggers and sandhogs tunnel identically — the difference is what happens when
they reach a tank.

| Weapon | Damage | Blast | Price | Start | What it does |
|---|---|---|---|---|---|
| **Baby Digger** | — | — | $3,000 / 10 | — | Bores 60px. **No damage** — it fizzles out on contact with a tank. Pure excavation. |
| **Digger** | — | — | $5,000 / 5 | — | Bores 100px through terrain. |
| **Heavy Digger** | — | — | $6,750 / 2 | — | Bores 150px with a wide 11px bore. |
| **Baby Sandhog** | 25 | 14 | $10,000 / 10 | — | Bores 60px and **detonates on the tank it reaches**. The armed version of a digger. |
| **Sandhog** | 40 | 18 | $16,750 / 5 | — | Bores 100px, 40 damage on arrival. |
| **Heavy Sandhog** | 60 | 24 | $25,000 / 2 | — | Bores 150px, 60 damage. The deepest reach in the game. |

## Riot weapons — dirt removal, no damage

Every riot weapon does **zero damage**. They exist to strip cover away, not to
hurt anyone: blow the hill off an entrenched enemy, then kill them with
something else next turn. A dead-on hit will do nothing at all, which surprises
people.

Riot charges and blasts throw their crater *forward* along the shot's path
rather than digging straight down.

| Weapon | Damage | Blast | Price | Start | What it does |
|---|---|---|---|---|---|
| **Riot Charge** | — | 36 | $2,000 / 10 | — | Cheap, forward-biased 36px cut. Ten per purchase. |
| **Riot Blast** | — | 60 | $5,000 / 5 | — | A wide 60px forward-biased cut. |
| **Riot Bomb** | — | 40 | $5,000 / 5 | — | A round 40px crater with no forward bias. |
| **Heavy Riot Bomb** | — | 60 | $8,750 / 2 | — | The largest dirt remover: a clean 60px bite. |

## Dirt weapons — building instead of digging

The opposite of riot weapons: these **add** terrain. Bury yourself for cover,
wall off an incoming line of fire, or fill the valley an enemy is hiding in.
All do zero damage.

| Weapon | Damage | Blast | Price | Start | What it does |
|---|---|---|---|---|---|
| **Dirt Clod** | — | — | $5,000 / 10 | — | A small 24px mound. |
| **Dirt Ball** | — | — | $5,000 / 5 | — | A 42px mound. |
| **Dirt Mover** | — | — | $5,000 | 4 | A 42px mound, available from the start of every match. |
| **Ton of Dirt** | — | — | $6,750 / 2 | — | A massive 70px mound — instant hill. |
| **Liquid Dirt** | — | — | $5,000 / 10 | — | Dirt that **flows**: it pours downhill and pools in low ground, filling valleys rather than stacking where it lands. |
| **Earth Disrupter** | — | — | $5,000 / 10 | — | **Settles** terrain within 80px — collapses overhangs and slumps steep ground flat. Can drop a tank that is standing on what it removes. |

## Fire and energy

| Weapon | Damage | Blast | Price | Start | What it does |
|---|---|---|---|---|---|
| **Napalm** | 45 | 20 | $10,000 / 10 | — | Scatters **7 flames** that flow downhill and pool in hollows, burning what they touch. |
| **Hot Napalm** | 70 | 26 | $20,000 / 5 | — | **10 flames** and 70 damage. Denies a whole basin. |
| **Laser** | 45 | — | $5,000 / 5 | — | Fires **instantly** in a straight line — no arc, no wind, no travel time. Costs **2 batteries** per shot and carves through terrain on its way. |

## Spotting rounds

Zero damage, near-zero price. Fire one to read the wind and check your arc
before committing a real shell.

| Weapon | Damage | Blast | Price | Start | What it does |
|---|---|---|---|---|---|
| **Tracer** | — | — | $10 / 20 | — | Practically free. Twenty per purchase. |
| **Smoke Tracer** | — | — | $500 / 10 | — | Leaves a more visible trail. |

---

## Reading the shot

Three things bend a shell between your barrel and the target:

- **Wind** re-rolls every turn and pushes the shell sideways the whole way
  down. The longer the shot hangs in the air, the more it drifts — which is
  why high lobs need much more wind correction than flat ones.
- **Gravity** is a match setting (five steps, Normal by default). Higher
  gravity means flatter, shorter arcs.
- **Air viscosity** (four steps, off by default) drags on the shell and
  shortens everything.

A **fast** weapon (Bullet at 1.7×, Plasma Blast at 1.15×) spends less time in
the air and so drifts less. The **Laser** ignores all three — it is the only
hitscan weapon in the game.

## Notes worth knowing

- Terrain is **fully destructible**, and craters persist for the rest of the
  round. The battlefield you finish on is not the one you started on.
- If **tanks fall** is on (the default), removing the ground under a tank
  drops it — and falling more than 18px hurts, up to 75 damage. That makes
  riot weapons and the Earth Disrupter indirectly lethal.
- A **parachute** auto-deploys on a damaging fall and cancels the damage
  entirely. One is included at the start of every match.
- **Contact Triggers** make your warheads detonate on first touch while
  tunneling, changing how diggers behave.
- Weapons with a **battery cost** simply will not fire without batteries in
  stock. Batteries double as a 10 HP heal.

