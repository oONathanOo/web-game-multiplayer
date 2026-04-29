import { PLAYER_SPEED, WORLD_HEIGHT, WORLD_WIDTH } from './constants.mjs'

export const GAME_META = {
  title: 'Sunshard Siege',
  genre: 'Co-op action roguelite defense',
  inspiration: 'Hades',
  inspirationWhy: 'Fast, readable top-down combat and short blessing-driven runs map perfectly to a room-based multiplayer game.'
}

export const RELIC_STATE = {
  x: WORLD_WIDTH / 2,
  y: WORLD_HEIGHT / 2,
  radius: 42,
  maxHp: 1000
}

export const MATCH_RULES = {
  countdownMs: 2200,
  intermissionMs: 18000,
  reviveMs: 3200,
  clearDelayMs: 1500,
  pickupPullRadius: 92
}

export const PLAYER_BASE_STATS = {
  maxHp: 120,
  moveSpeed: PLAYER_SPEED,
  fireRateMs: 250,
  boltDamage: 17,
  boltSpeed: 610,
  boltRadius: 8,
  dashDistance: 152,
  dashCooldownMs: 2400,
  novaDamage: 34,
  novaRadius: 118,
  novaCooldownMs: 7600,
  beaconDurationMs: 6400,
  beaconCooldownMs: 9200,
  defenseCooldownMs: 8600,
  defenseLifetimeMs: 28000,
  defenseRange: 210,
  defenseDamage: 13,
  defenseBoltSpeed: 440,
  defenseFireRateMs: 780,
  defensePlacementDistance: 96,
  defenseMaxActive: 2,
  beamDps: 26,
  beamWidth: 24,
  pickupRadius: 22
}

export const UPGRADE_DEFS = {
  quickhands: {
    id: 'quickhands',
    name: 'Quickhands Sigil',
    rarity: 'common',
    description: 'Fire bolts faster and tighten your attack rhythm.'
  },
  sunsteel: {
    id: 'sunsteel',
    name: 'Sunsteel Tips',
    rarity: 'common',
    description: 'Your bolts and tether burn harder.'
  },
  heartbloom: {
    id: 'heartbloom',
    name: 'Heartbloom',
    rarity: 'common',
    description: 'Gain max health and restore a chunk immediately.'
  },
  longwatch: {
    id: 'longwatch',
    name: 'Longwatch Prism',
    rarity: 'rare',
    description: 'Boost bolt speed and extend tether and Sun Spire reach.'
  },
  ashstep: {
    id: 'ashstep',
    name: 'Ashstep Boots',
    rarity: 'rare',
    description: 'Dash farther, recharge sooner, and supercharge the tether.'
  },
  lanternseed: {
    id: 'lanternseed',
    name: 'Lanternseed',
    rarity: 'rare',
    description: 'Beacons last longer and Sun Spires linger longer while firing faster.'
  },
  starwake: {
    id: 'starwake',
    name: 'Starwake Halo',
    rarity: 'epic',
    description: 'Nova grows larger, hits harder, and vacuum-pulls nearby motes.'
  },
  relicward: {
    id: 'relicward',
    name: 'Relic Ward',
    rarity: 'epic',
    description: 'Repair the relic and add one more Sun Spire slot while strengthening beam control.'
  }
}

export const UPGRADE_POOL = Object.keys(UPGRADE_DEFS)

export const ENEMY_DEFS = {
  skulk: {
    id: 'skulk',
    name: 'Skulk',
    radius: 18,
    hp: 40,
    speed: 88,
    damage: 10,
    reward: 7,
    color: '#4c7b36',
    role: 'runner'
  },
  brute: {
    id: 'brute',
    name: 'Brute',
    radius: 26,
    hp: 118,
    speed: 48,
    damage: 18,
    reward: 16,
    color: '#8a593a',
    role: 'tank'
  },
  spitter: {
    id: 'spitter',
    name: 'Spitter',
    radius: 20,
    hp: 56,
    speed: 38,
    damage: 13,
    reward: 12,
    color: '#6b5bb6',
    role: 'ranged',
    attackRange: 280,
    attackCooldownMs: 2200,
    projectileSpeed: 270
  },
  moth: {
    id: 'moth',
    name: 'Moth',
    radius: 16,
    hp: 46,
    speed: 102,
    damage: 11,
    reward: 10,
    color: '#c08a3a',
    role: 'dasher',
    burstCooldownMs: 2100,
    burstSpeed: 220
  },
  boss: {
    id: 'boss',
    name: 'Thorn Sovereign',
    radius: 36,
    hp: 920,
    speed: 42,
    damage: 24,
    reward: 140,
    color: '#b24b43',
    role: 'boss',
    attackRange: 320,
    attackCooldownMs: 1900,
    projectileSpeed: 310
  }
}

function burst(startMs, typeId, count, spacingMs) {
  return { startMs, typeId, count, spacingMs }
}

export const WAVE_DEFS = [
  {
    id: 'dawn-1',
    name: 'Bramble Bloom',
    briefing: 'Light scouts rush the shrine in loose packs.',
    relicRepair: 36,
    schedule: [
      burst(0, 'skulk', 6, 820),
      burst(5500, 'skulk', 8, 620),
      burst(12500, 'brute', 2, 1800),
      burst(18200, 'skulk', 10, 480)
    ]
  },
  {
    id: 'dawn-2',
    name: 'Split Roots',
    briefing: 'Bruisers arrive with pressure from the flanks.',
    relicRepair: 42,
    schedule: [
      burst(0, 'skulk', 8, 560),
      burst(3200, 'brute', 3, 1450),
      burst(9200, 'skulk', 10, 430),
      burst(14200, 'spitter', 3, 1800),
      burst(19600, 'brute', 4, 1250)
    ]
  },
  {
    id: 'dawn-3',
    name: 'Moonspore Flight',
    briefing: 'Moths dive past the front line while spitters test your angles.',
    relicRepair: 48,
    schedule: [
      burst(0, 'moth', 6, 760),
      burst(4200, 'skulk', 10, 420),
      burst(8800, 'spitter', 4, 1500),
      burst(14200, 'moth', 9, 520),
      burst(19800, 'brute', 4, 1100)
    ]
  },
  {
    id: 'dawn-4',
    name: 'Ashen Crossing',
    briefing: 'Everything comes at once. Dash lanes open and hold the middle.',
    relicRepair: 54,
    schedule: [
      burst(0, 'skulk', 12, 420),
      burst(2600, 'spitter', 4, 1100),
      burst(6200, 'moth', 10, 420),
      burst(10800, 'brute', 5, 980),
      burst(15800, 'spitter', 5, 980),
      burst(20400, 'moth', 12, 320)
    ]
  },
  {
    id: 'dawn-5',
    name: 'The Thorn Sovereign',
    briefing: 'The garden’s ruler enters with a storm of servants.',
    relicRepair: 0,
    schedule: [
      burst(0, 'boss', 1, 0),
      burst(4400, 'skulk', 8, 360),
      burst(7600, 'moth', 6, 450),
      burst(11800, 'spitter', 4, 920),
      burst(16400, 'brute', 3, 1300),
      burst(21200, 'skulk', 12, 320)
    ]
  }
]
