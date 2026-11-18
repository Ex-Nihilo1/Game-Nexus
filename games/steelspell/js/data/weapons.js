// Tuning: weapons, their levels, and the merges of two weapons.

// A weapon arrives at level 1 and grows to MAX_WEAPON_LEVEL through cards. LEVEL_PLAN lists
// what levels 2, 3, ... add: 'a' and 'b' stand for the weapon's two own upgrades (`ups`), and
// a weapon can replace any other level with a field such as `lv4`.
//
// A step can add to what the weapon gets from stats: damage, size, haste, duration (shares)
// and count. These work even if the weapon does not list the stat in `scales`, and no soft
// cap touches them. It can also change the weapon's own numbers: `add`, `mul` and `set` take
// { field: value }, where a field may be nested ('crater.life'). What a step says on its card is
// in lang/en.json (weapons.<id>.ups, .lv4 and so on), and takes its numbers from the step; a
// plain stat step writes its own. The names and blurbs of weapons, evolutions and merges are
// there too, by id.
const LEVEL_PLAN = [{ damage: 0.2 }, 'a', { size: 0.2 }, { damage: 0.25 }, 'b', { haste: 0.2 }, { damage: 0.3 }];

// `scales` lists the passive stats a weapon reads: this list is what makes a build. Every
// weapon reads Crit chance and Crit damage: any of them can crit.
// `fire: true` marks a weapon that burns, for items that favor fire; `lasting: true` one
// whose attack stays for a while, for the Echo Stone.
// Weapons marked `defense` cannot be the first pick, as they barely attack.
const WEAPONS = [
  { id: 'fireball', fire: true, kind: 'magic', pen: 'red-pencil',
    scales: ['damage', 'haste', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 1.5, damage: 22, radius: 42, speed: 320, life: 1.8,
    ups: [{ count: 1 }, { mul: { radius: 1.25 } }] },
  { id: 'aura', halo: true, kind: 'magic', pen: 'violet',
    scales: ['damage', 'size', 'critChance', 'critDamage'],
    tick: 0.5, damage: 4.5, radius: 90,
    ups: [{ set: { tick: 0.4 } }, { mul: { radius: 1.2 } }],
    lv7: { damage: 0.25 } },
  { id: 'meteor', fire: true, kind: 'magic', pen: 'red-pencil',
    scales: ['haste', 'damage', 'size', 'duration', 'critChance', 'critDamage'],
    cooldown: 6, damage: 52, radius: 88, delay: 0.7, range: 420, meteors: 1,
    crater: { life: 5, tick: 0.5, damage: 6, share: 0.8 },
    ups: [{ add: { 'crater.life': 2 } }, { add: { meteors: 1 } }] },
  { id: 'chain', kind: 'magic', pen: 'highlighter',
    scales: ['damage', 'critChance', 'haste', 'critDamage'],
    cooldown: 1.6, damage: 44, range: 340, jumps: 4, jumpRange: 130, falloff: 0.85,
    ups: [{ add: { jumps: 1 } }, { add: { jumps: 1 }, set: { falloff: 0.9 } }],
    lv4: { mul: { range: 1.2, jumpRange: 1.2 } } },
  { id: 'icearrow', kind: 'magic', pen: 'ice',
    scales: ['haste', 'damage', 'size', 'critChance', 'critDamage'],
    cooldown: 2.4, damage: 42, speed: 440, life: 1.3, width: 11, widthGrowth: 3, length: 26, slow: 0.45, slowTime: 2.5,
    arrows: 1, fan: 0.22,
    ups: [{ add: { slow: 0.1 } }, { add: { arrows: 1 } }] },
  { id: 'phase', phases: true, kind: 'magic', pen: 'violet', defense: true,
    scales: ['haste', 'speed', 'damage', 'duration', 'critChance', 'critDamage'],
    cooldown: 14, duration: 1.6, damage: 18, tick: 0.25, radius: 72, moveBoost: 1.6, earlyCost: 2,
    ups: [{ add: { duration: 0.4 } }, { set: { earlyCost: 1 } }] },
  { id: 'laser', lasting: true, kind: 'magic', pen: 'red-pencil',
    scales: ['damage', 'haste', 'size', 'duration', 'count', 'critChance', 'critDamage'],
    cooldown: 4, life: 1.5, tick: 0.1, damage: 5, length: 380, width: 10, turn: 2.5,
    ups: [{ mul: { width: 1.4 } }, { count: 1 }],
    lv4: { duration: 0.2 } },
  { id: 'flamethrower', lasting: true, kind: 'phys', pen: 'red-pencil', fire: true,
    scales: ['damage', 'haste', 'size', 'duration', 'critChance', 'critDamage'],
    cooldown: 4, life: 2, tick: 0.15, damage: 4, length: 150, cone: 1.22, turn: 3, afterburn: 0, burnStacks: 1,
    ups: [{ add: { cone: 0.35 } }, { set: { afterburn: 1.5 } }],
    lv4: { duration: 0.2 } },
  { id: 'firetrail', kind: 'magic', pen: 'red-pencil', fire: true,
    scales: ['damage', 'size', 'duration', 'speed', 'critChance', 'critDamage'],
    every: 18, life: 2.5, tick: 0.5, damage: 4, radius: 22,
    ups: [{ mul: { radius: 1.3 } }, { add: { life: 1.5 } }],
    lv4: { duration: 0.2 }, lv7: { damage: 0.25 } },

  { id: 'spear', spear: true, kind: 'phys', pen: 'orange-pen',
    scales: ['speed', 'damage', 'size', 'critChance', 'critDamage'],
    tick: 0.35, damage: 15, length: 130, width: 30, turn: 10, push: 70, pushTime: 0.16,
    ups: [{ mul: { push: 1.4 } }, { mul: { width: 1.3 } }],
    lv7: { mul: { tick: 0.85 } } },
  { id: 'boomerang', kind: 'phys', pen: 'orange-pen',
    scales: ['haste', 'damage', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 2.4, damage: 21, speed: 340, range: 230, r: 14, spread: 0.45, returnBoost: 1.25,
    ups: [{ count: 1 }, { mul: { range: 1.25 } }] },
  { id: 'pistol', gun: true, kind: 'phys', pen: 'ink',
    scales: ['damage', 'critChance', 'haste', 'critDamage'],
    cooldown: 0.55, damage: 30, range: 420, pierce: 0, targets: 1,
    ups: [{ add: { pierce: 1 } }, { add: { targets: 1 } }],
    lv4: { damage: 0.2 } },
  { id: 'sword', kind: 'phys', pen: 'orange-pen',
    scales: ['damage', 'haste', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 1.4, damage: 30, reach: 92, arc: 2.4, swingGap: 0.14,
    ups: [{ count: 1 }, { mul: { arc: 1.3 } }] },
  { id: 'shield', kind: 'phys', pen: 'orange-pen', defense: true,
    scales: ['haste', 'damage', 'critChance', 'critDamage'],
    cooldown: 16, charges: 2, damage: 30, radius: 84,
    ups: [{ add: { charges: 1 } }, { mul: { radius: 1.3 } }] },
  { id: 'rocket', kind: 'phys', pen: 'orange-pen',
    scales: ['damage', 'haste', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 7, damage: 50, radius: 90, range: 520, speed: 220, accel: 700, turn: 8, life: 1.6, spread: 0.35,
    ups: [{ count: 1 }, { mul: { radius: 1.25 } }] },
  { id: 'drone', kind: 'phys', pen: 'orange-pen',
    scales: ['damage', 'haste', 'size', 'critChance', 'critDamage'],
    cooldown: 3.5, damage: 40, speed: 630, span: 620, r: 20, drones: 1,
    ups: [{ mul: { span: 1.3 } }, { add: { drones: 1 } }] },
  { id: 'hurricane', lasting: true, kind: 'magic', pen: 'violet',
    scales: ['damage', 'haste', 'size', 'duration', 'count', 'critChance', 'critDamage'],
    cooldown: 5, life: 4, tick: 0.25, damage: 8, radius: 50, range: 400, drift: 40, pull: 60,
    ups: [{ mul: { pull: 1.6 } }, { count: 1 }],
    lv4: { duration: 0.2 } },
  { id: 'shotgun', gun: true, kind: 'phys', pen: 'orange-pen',
    scales: ['damage', 'haste', 'count', 'critChance', 'critDamage'],
    cooldown: 1.6, damage: 11, pellets: 6, perCount: 2, cone: 0.42, range: 280, speed: 700, pierce: 1,
    ups: [{ add: { pellets: 2 } }, { add: { pierce: 1 } }],
    lv4: { damage: 0.2 } },
  { id: 'iceflash', kind: 'magic', pen: 'ice',
    scales: ['damage', 'haste', 'size', 'duration', 'critChance', 'critDamage'],
    cooldown: 3, damage: 10, radius: 110, slow: 0.4, slowTime: 1.5,
    ups: [{ add: { slow: 0.1 } }, { mul: { radius: 1.2 } }] },
  // A copy has the hero's max health times `hpShare` and lives `life` seconds; `copy` is how it
  // fights. Its damage grows with the hero's max health (see js/allies.js).
  { id: 'summon', kind: 'magic', pen: 'violet',
    scales: ['damage', 'haste', 'size', 'duration', 'critChance', 'critDamage'],
    cooldown: 12, life: 8, clones: 1, hpShare: 1, big: 1,
    copy: { tick: 0.3, damage: 14, reach: 45, width: 18, speed: 150, seek: 300 },
    ups: [{ add: { life: 3 } }, { mul: { 'copy.reach': 1.3, big: 1.3 } }] },
];

// At MAX_WEAPON_LEVEL a weapon evolves, and the player picks one of its two branches. A
// branch is a step like a level's; most `set` fields that only the weapon's code looks for.
// `reads` makes the weapon read one more passive stat. `ward: true` marks a branch that
// takes enemy shots out of the air. `inherit` is what the branch gives the weapon it merges
// into, by that weapon's id: a step of its own (its text is evolutions.<id>.inherit.<merge>).
// What the EMP Aura (and what it passes on) does: an enemy inside for `after` seconds in a row
// is stunned for `stun` seconds; an elite is slowed by `eliteSlow` instead.
const EMP = { after: 5, stun: 1, eliteSlow: 0.5 };

const EVOLUTIONS = {
  fireball: [
    { id: 'inferno', reads: ['duration'], set: { burn: { life: 3, tick: 0.5, damage: 3 } },
      inherit: { clusterrocket: { reads: ['duration'], set: { burn: { life: 3, tick: 0.5, damage: 6 } } } } },
    { id: 'scatter', set: { scatter: 3, scatterSize: 0.6, scatterDamage: 0.4, scatterLife: 0.3 },
      inherit: { clusterrocket: { add: { minis: 4 } } } },
  ],
  aura: [
    { id: 'emp', damage: 0.2, set: { emp: EMP },
      inherit: { fireshield: { set: { emp: EMP } },
        radiantlance: { set: { emp: EMP } },
        frosthalo: { set: { emp: EMP } } } },
    { id: 'sanctum', damage: -0.15, set: { ward: true },
      inherit: { frosthalo: { set: { ward: true } },
        fireshield: { set: { ward: true } },
        radiantlance: { set: { ward: true } } } },
  ],
  meteor: [
    { id: 'shower', add: { meteors: 2 }, mul: { radius: 0.85, damage: 0.9, 'crater.damage': 0.9 },
      inherit: { meteordrone: { mul: { radius: 0.85, damage: 0.9 }, set: { extraMeteors: 1 } } } },
    { id: 'cataclysm', damage: 0.9, mul: { radius: 1.6 }, set: { meteors: 1, 'crater.slow': 0.4 },
      inherit: { meteordrone: { mul: { radius: 1.6 }, set: { 'crater.slow': 0.4 } } } },
  ],
  chain: [
    { id: 'web', add: { jumps: 4 }, set: { falloff: 1 },
      inherit: { electrogun: { add: { jumps: 3 }, set: { falloff: 1 } } } },
    { id: 'overcharge', set: { fork: 0.5 },
      inherit: { electrogun: { set: { fork: 0.5 } } } },
  ],
  icearrow: [
    { id: 'glacier', damage: 0.2, set: { freeze: 0.5 },
      inherit: { iceboomerang: { set: { freeze: 0.5 } } } },
    { id: 'shatter', set: { shards: 3, shardDamage: 0.4 },
      inherit: { iceboomerang: { set: { shards: 3, shardDamage: 0.4 } } } },
  ],
  phase: [
    { id: 'blink', set: { burst: 80 },
      inherit: { emberstep: { set: { burst: 80 } } } },
    { id: 'shroud', mul: { duration: 1.5 }, set: { ward: true },
      inherit: { emberstep: { mul: { duration: 1.5 }, set: { ward: true } } } },
  ],
  spear: [
    { id: 'pike', set: { back: true },
      inherit: { phantomlancer: { set: { back: true } },
        radiantlance: { set: { back: true } } } },
    { id: 'javelin', set: { javelin: 4, javelinDamage: 2.5, javelinSpeed: 620, javelinLife: 1.1 },
      inherit: { phantomlancer: { set: { javelin: 4, javelinDamage: 2.5, javelinSpeed: 620, javelinLife: 1.1 } },
        radiantlance: { set: { javelin: 4, javelinDamage: 2.5, javelinSpeed: 620, javelinLife: 1.1, width: 30 } } } },
  ],
  boomerang: [
    { id: 'glaive', damage: 0.6, set: { bounces: 8, bounceRange: 260 },
      inherit: { iceboomerang: { damage: 0.3, set: { bounces: 6, bounceRange: 260 } } } },
    { id: 'orbit', reads: ['duration'], set: { orbit: 3, orbitRadius: 85, orbitTurn: 5 },
      inherit: { iceboomerang: { reads: ['duration'], set: { orbit: 3, orbitRadius: 85, orbitTurn: 5 } } } },
  ],
  pistol: [
    { id: 'revolver', set: { sixth: 4 },
      inherit: { railgun: { set: { sixth: 4 } },
        electrogun: { set: { sixth: 4 } } } },
    { id: 'dual', add: { targets: 1 }, set: { ward: true },
      inherit: { railgun: { add: { rays: 3 }, set: { ward: true } },
        electrogun: { set: { targets: 2, ward: true } } } },
  ],
  sword: [
    { id: 'great', size: 0.3, set: { knock: 60, knockEvery: 4 },
      inherit: { bastion: { size: 0.3, set: { knock: 60, knockEvery: 4 } } } },
    { id: 'parry', damage: 0.15, set: { parry: true },
      inherit: { bastion: { mul: { swingDamage: 1.15 }, set: { parry: true } } } },
  ],
  shield: [
    { id: 'bulwark', add: { charges: 2 },
      inherit: { bastion: { add: { charges: 2 } },
        fireshield: { add: { charges: 2 } } } },
    { id: 'spiked', mul: { damage: 1.5 }, set: { thorns: 15 },
      inherit: { bastion: { mul: { damage: 1.5 }, set: { thorns: 25 } },
        fireshield: { mul: { damage: 1.5 }, set: { thorns: 25 } } } },
  ],
  rocket: [
    { id: 'barrage', count: 2, damage: -0.2,
      inherit: { bomber: { mul: { dropEvery: 0.6 }, damage: -0.2 },
        clusterrocket: { count: 2, damage: -0.2 } } },
    { id: 'nuke', reads: ['duration'], mul: { radius: 1.5 },
      set: { single: true, fallout: { life: 4, tick: 0.5, damage: 8 } },
      inherit: { bomber: { reads: ['duration'], mul: { radius: 1.5 }, set: { fallout: { life: 3, tick: 0.5, damage: 10 } } },
        clusterrocket: { reads: ['duration'], mul: { radius: 1.5 }, set: { single: true, fallout: { life: 4, tick: 0.5, damage: 16 } } } } },
  ],
  laser: [
    { id: 'prism', set: { prism: 3, prismLength: 220, prismFan: 0.4 },
      inherit: { stormlance: { set: { beams: 3 } } } },
    { id: 'sweeper', damage: 0.3, mul: { width: 1.5 }, set: { sweep: 2.1 },
      inherit: { stormlance: { damage: 0.3, mul: { beamWidth: 1.5 } } } },
  ],
  flamethrower: [
    { id: 'dragon', mul: { length: 1.5 }, set: { scorch: { life: 2, tick: 0.5, damage: 5 } },
      inherit: { firetornado: { mul: { 'scorch.life': 2 }, set: { scorchWide: 0.8 } } } },
    { id: 'napalm', set: { afterburn: 3, burnStacks: 3 },
      inherit: { firetornado: { set: { afterburn: 3, burnStacks: 3 } } } },
  ],
  hurricane: [
    { id: 'twin', count: 1, damage: 0.15,
      inherit: { stormlance: { count: 1, damage: 0.15 },
        firetornado: { count: 1, damage: 0.15 } } },
    { id: 'eye', mul: { pull: 1.5 }, set: { eye: true, eyeRadius: 110, eyeTurn: 1.6 },
      inherit: { stormlance: { mul: { pull: 1.5 }, set: { eye: true, eyeRadius: 130, eyeTurn: 1.2 } },
        firetornado: { mul: { pull: 1.5 }, set: { eye: true, eyeRadius: 130, eyeTurn: 1.2 } } } },
  ],
  firetrail: [
    { id: 'wildfire', set: { afterburn: 2, spread: 45 },
      inherit: { emberstep: { set: { 'trail.afterburn': 2, 'trail.spread': 45 } },
        pyretwins: { set: { 'trail.afterburn': 2, 'trail.spread': 45 } } } },
    { id: 'comet', mul: { radius: 1.5 }, set: { cometGain: 2 },
      inherit: { emberstep: { mul: { 'trail.radius': 1.5 }, set: { 'trail.cometGain': 2 } },
        pyretwins: { mul: { 'trail.radius': 1.5 } } } },
  ],
  shotgun: [
    { id: 'double', set: { second: 0.2, knock: 50 },
      inherit: { railgun: { set: { second: 0.2, knock: 50 } } } },
    { id: 'sawnoff', mul: { cone: 2 },
      inherit: { railgun: { mul: { cone: 2 } } } },
  ],
  iceflash: [
    { id: 'darkice', set: { burn: 6, burnTime: 2, chillGrow: 0.05, chillMax: 0.2 },
      inherit: { frosthalo: { set: { burn: 8, burnTime: 2, chillGrow: 0.05, chillMax: 0.2 } } } },
    { id: 'permafrost', set: { frost: { life: 3, tick: 0.5, slow: 0.3 } },
      inherit: { frosthalo: { set: { frost: { life: 3, tick: 0.5, slow: 0.3 } } } } },
  ],
  summon: [
    { id: 'gunner', set: { gun: { cooldown: 0.55, damage: 30, range: 420 } },
      inherit: { pyretwins: { set: { gun: { cooldown: 0.55, damage: 30, range: 420 } } },
        phantomlancer: { set: { gun: { cooldown: 0.55, damage: 30, range: 420 } } } } },
    { id: 'twins', set: { clones: 2, hpShare: 0.75 },
      inherit: { pyretwins: { set: { clones: 2, hpShare: 0.75 } },
        phantomlancer: { set: { clones: 2, hpShare: 0.75 } } } },
  ],
  drone: [
    { id: 'squadron', add: { drones: 2 },
      inherit: { bomber: { add: { drones: 2 } },
        meteordrone: { add: { drones: 2 } } } },
    { id: 'guardian', reads: ['duration'], set: { guard: 3, guardRadius: 95, guardTurn: 3, guardHit: 1 },
      inherit: { bomber: { set: { ward: true } },
        meteordrone: { set: { ward: true } } } },
  ],
};

// Two weapons that are both at the last level and evolved can merge into one of these: a
// card offers it, both `needs` go, and a new weapon can be picked in the freed slot. A merged
// weapon arrives at full strength and has no levels: its numbers, and the `bonus` step it
// starts with, stand for the two evolved weapons it replaces, and a little more.
const SYNERGIES = [
  { id: 'electrogun', gun: true, kind: 'hybrid', pen: 'green-ink', needs: ['pistol', 'chain'],
    scales: ['damage', 'critChance', 'haste', 'critDamage'],
    cooldown: 0.45, damage: 140, range: 420, jumps: 6, jumpRange: 150, falloff: 0.9 },
  { id: 'iceboomerang', kind: 'hybrid', pen: 'ice', needs: ['boomerang', 'icearrow'],
    scales: ['haste', 'damage', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 2.4, damage: 70, speed: 340, range: 345, r: 15, spread: 0.45, returnBoost: 1.25, slow: 0.4, slowTime: 2,
    bonus: { count: 2, size: 0.3, haste: 0.2 } },
  { id: 'fireshield', halo: true, fire: true, kind: 'hybrid', pen: 'red-pencil', needs: ['shield', 'aura'],
    scales: ['haste', 'damage', 'size', 'critChance', 'critDamage'],
    cooldown: 12, charges: 3, damage: 160, radius: 130, tick: 0.4, auraDamage: 14 },
  { id: 'clusterrocket', fire: true, kind: 'hybrid', pen: 'red-pencil', needs: ['rocket', 'fireball'],
    scales: ['damage', 'haste', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 5, damage: 160, radius: 110, range: 520, speed: 220, accel: 700, turn: 8, life: 1.6, spread: 0.35,
    bonus: { count: 2 },
    minis: 8, miniDamage: 60, miniRadius: 50, miniRange: 300, miniSpeed: 200, miniAccel: 900, miniTurn: 12, miniLife: 0.9 },
  { id: 'meteordrone', fire: true, kind: 'hybrid', pen: 'red-pencil', needs: ['drone', 'meteor'],
    scales: ['damage', 'haste', 'size', 'critChance', 'critDamage'],
    cooldown: 4.5, damage: 200, passDamage: 110, speed: 490, span: 330, r: 22, radius: 88, delay: 0.7, drones: 2,
    bonus: { size: 0.3 },
    crater: { life: 5, tick: 0.5, damage: 20, share: 0.8 } },
  { id: 'radiantlance', kind: 'hybrid', pen: 'green-ink', needs: ['spear', 'aura'],
    scales: ['speed', 'damage', 'size', 'critChance', 'critDamage'],
    tick: 0.3, damage: 42, long: 150, wide: 80, shift: 78, length: 146, turn: 10, push: 70, pushTime: 0.16 },
  // It grows from `grow.from` by `perSecond`, half as fast past `slowAt`, up to `max`, and
  // every second of its age, up to `rampMax` of them, adds `ramp` to its damage. `scorch` is the ground it leaves burning.
  { id: 'firetornado', lasting: true, kind: 'hybrid', pen: 'red-pencil', fire: true, needs: ['hurricane', 'flamethrower'],
    scales: ['damage', 'haste', 'size', 'duration', 'count', 'critChance', 'critDamage'],
    cooldown: 6, life: 6, tick: 0.25, damage: 20, range: 400, drift: 45, pull: 80, ramp: 0.15, rampMax: 10,
    grow: { from: 40, perSecond: 14, slowAt: 160, max: 220 },
    scorch: { every: 0.6, life: 1.5, tick: 0.5, damage: 10 } },

  // Merges of two weapons of one kind keep that kind.
  // Bastion is a shield (`cooldown`, `charges`, `damage` of the blast) and a sword (`swing...`).
  { id: 'bastion', kind: 'phys', pen: 'orange-pen', needs: ['sword', 'shield'],
    scales: ['damage', 'haste', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 12, charges: 3, damage: 120, radius: 110,
    swingCooldown: 1.2, swingDamage: 75, reach: 105, arc: 3.1, swingGap: 0.14, recharge: 0.3, armorScale: 0.01,
    bonus: { count: 1, size: 0.2 } },
  { id: 'stormlance', lasting: true, kind: 'magic', pen: 'violet', needs: ['hurricane', 'laser'],
    scales: ['damage', 'haste', 'size', 'duration', 'count', 'critChance', 'critDamage'],
    cooldown: 5, life: 5, tick: 0.2, damage: 14, radius: 60, range: 400, drift: 40, pull: 60,
    beams: 1, beamLength: 260, beamWidth: 14, beamTurn: 1.57,
    bonus: { count: 1, duration: 0.2 } },
  // Ember Step is a Phase Dash (the top-level numbers) that walks a Fire Trail (`trail`) and
  // lights the four diagonals around the hero while the phase lasts (`ember`).
  { id: 'emberstep', phases: true, fire: true, kind: 'magic', pen: 'red-pencil', needs: ['firetrail', 'phase'],
    scales: ['haste', 'speed', 'damage', 'size', 'duration', 'critChance', 'critDamage'],
    cooldown: 10, duration: 2, damage: 30, tick: 0.25, radius: 80, moveBoost: 1.6, earlyCost: 1,
    trail: { every: 18, life: 4, tick: 0.5, damage: 8, radius: 30 },
    ember: { every: 0.25, distance: 50, life: 3, tick: 0.5, damage: 16, radius: 30 } },
  { id: 'railgun', gun: true, kind: 'phys', pen: 'ink', needs: ['pistol', 'shotgun'],
    scales: ['damage', 'haste', 'count', 'critChance', 'critDamage'],
    cooldown: 1.1, damage: 34, rays: 7, perCount: 2, cone: 0.42, range: 460, shred: 6, shredTime: 4 },
  { id: 'bomber', kind: 'phys', pen: 'orange-pen', needs: ['drone', 'rocket'],
    scales: ['damage', 'haste', 'size', 'count', 'critChance', 'critDamage'],
    cooldown: 3, damage: 70, speed: 630, span: 620, r: 22, drones: 2,
    dropEvery: 200, dropRange: 220, rocketDamage: 40, radius: 95,
    bonus: { size: 0.2 } },
  { id: 'frosthalo', halo: true, kind: 'magic', pen: 'ice', needs: ['aura', 'iceflash'],
    scales: ['damage', 'haste', 'size', 'duration', 'critChance', 'critDamage'],
    tick: 0.4, damage: 9, radius: 120, cooldown: 3, flashDamage: 40, slow: 0.6, slowTime: 1.5, wardShred: 30,
    bonus: { damage: 0.6, size: 0.3, haste: 0.3 } },
  { id: 'pyretwins', fire: true, kind: 'magic', pen: 'red-pencil', needs: ['summon', 'firetrail'],
    scales: ['damage', 'haste', 'size', 'duration', 'speed', 'critChance', 'critDamage'],
    cooldown: 10, life: 10, clones: 1, hpShare: 1, big: 1.2,
    copy: { tick: 0.3, damage: 24, reach: 55, width: 22, speed: 160, seek: 300 },
    trail: { every: 18, life: 4, tick: 0.5, damage: 8, radius: 30 } },
  // Phantom Lancer carries the Spear (the top-level numbers) and calls copies that carry one too.
  { id: 'phantomlancer', spear: true, kind: 'hybrid', pen: 'green-ink', needs: ['summon', 'spear'],
    scales: ['speed', 'damage', 'size', 'haste', 'duration', 'critChance', 'critDamage'],
    tick: 0.3, damage: 30, length: 150, width: 40, turn: 10, push: 100, pushTime: 0.16,
    cooldown: 10, life: 10, clones: 1, hpShare: 1, big: 1.2,
    copy: { tick: 0.3, damage: 26, reach: 150, width: 40, speed: 160, seek: 300 } },
];
const WEAPON_DEFS = [...WEAPONS, ...SYNERGIES];
