import { PLAYER_RADIUS, WORLD_HEIGHT, WORLD_WIDTH } from './constants.mjs'
import { ENEMY_DEFS, MATCH_RULES, PLAYER_BASE_STATS, RELIC_STATE, UPGRADE_DEFS, UPGRADE_POOL, WAVE_DEFS } from './game-data.mjs'
import { normalizeInput, sanitizeNickname } from './protocol.mjs'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function distanceBetween(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1)
}

function normalizeVector(x, y, fallbackX = 1, fallbackY = 0) {
  const magnitude = Math.hypot(x, y)

  if (magnitude === 0) {
    return { x: fallbackX, y: fallbackY }
  }

  return {
    x: x / magnitude,
    y: y / magnitude
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function createWaveSpawnQueue(waveDef) {
  const queue = []

  for (const burst of waveDef.schedule) {
    for (let index = 0; index < burst.count; index += 1) {
      queue.push({
        timeMs: burst.startMs + index * burst.spacingMs,
        typeId: burst.typeId
      })
    }
  }

  return queue.sort((left, right) => left.timeMs - right.timeMs)
}

function issueEntityId(room, prefix) {
  const id = `${prefix}-${room.game.nextEntityId}`
  room.game.nextEntityId += 1
  return id
}

function angleToVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

function randomBetween(randomValue, min, max) {
  return lerp(min, max, randomValue())
}

function segmentDistanceToCircle(x1, y1, x2, y2, cx, cy) {
  const segmentX = x2 - x1
  const segmentY = y2 - y1
  const lengthSquared = segmentX * segmentX + segmentY * segmentY

  if (lengthSquared === 0) {
    return distanceBetween(x1, y1, cx, cy)
  }

  const t = clamp(((cx - x1) * segmentX + (cy - y1) * segmentY) / lengthSquared, 0, 1)
  const nearestX = x1 + segmentX * t
  const nearestY = y1 + segmentY * t
  return distanceBetween(nearestX, nearestY, cx, cy)
}

function defaultInput() {
  return {
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    fire: false,
    dash: false,
    beacon: false,
    nova: false,
    deploy: false
  }
}

export function createSpawnPoint(playerIndex, totalPlayers = 4) {
  const radius = 172
  const angle = (Math.PI * 2 * playerIndex) / Math.max(totalPlayers, 1)

  return {
    x: RELIC_STATE.x + Math.cos(angle) * radius,
    y: RELIC_STATE.y + Math.sin(angle) * radius
  }
}

export function createRoomGameState(seed = 0) {
  return {
    seed,
    phase: 'lobby',
    countdownMs: 0,
    intermissionMs: 0,
    clearDelayMs: 0,
    waveIndex: -1,
    waveElapsedMs: 0,
    waveSpawnQueue: [],
    relicHp: RELIC_STATE.maxHp,
    relicMaxHp: RELIC_STATE.maxHp,
    eventText: 'Ready up to begin the siege.',
    bannerMs: 0,
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    pickups: [],
    beacons: [],
    defenses: [],
    beams: [],
    totalKills: 0,
    totalMotes: 0,
    nextEntityId: 1
  }
}

export function initializePlayerGameState(player, spawn) {
  player.nickname = sanitizeNickname(player.nickname)
  player.input = defaultInput()
  player.actionsHeld = {
    dash: false,
    beacon: false,
    nova: false,
    deploy: false
  }
  player.aim = { x: 1, y: 0 }
  player.x = spawn.x
  player.y = spawn.y
  player.score = 0
  player.motes = 0
  player.level = 1
  player.upgrades = []
  player.upgradeChoices = []
  player.activeBeaconId = null
  player.activeDefenseIds = []
  player.stats = {
    ...PLAYER_BASE_STATS
  }
  player.hp = player.stats.maxHp
  player.alive = true
  player.respawnMs = 0
  player.fireCooldownMs = 0
  player.dashCooldownMs = 0
  player.novaCooldownMs = 0
  player.beaconCooldownMs = 0
  player.defenseCooldownMs = 0
  player.beamOverchargeMs = 0
}

function beginLobbyState(room, message) {
  room.game.phase = 'lobby'
  room.game.countdownMs = 0
  room.game.intermissionMs = 0
  room.game.clearDelayMs = 0
  room.game.waveIndex = -1
  room.game.waveElapsedMs = 0
  room.game.waveSpawnQueue = []
  room.game.eventText = message
  room.game.bannerMs = 0
  room.game.enemies = []
  room.game.projectiles = []
  room.game.enemyProjectiles = []
  room.game.pickups = []
  room.game.beacons = []
  room.game.defenses = []
  room.game.beams = []
  room.game.relicHp = room.game.relicMaxHp

  for (const player of room.players.values()) {
    player.activeBeaconId = null
    player.activeDefenseIds = []
  }
}

function respawnAllPlayers(room) {
  const players = [...room.players.values()]

  players.forEach((player, index) => {
    initializePlayerGameState(player, createSpawnPoint(index, players.length))
    player.ready = false
  })
}

function beginWave(room, waveIndex) {
  const wave = WAVE_DEFS[waveIndex]
  room.game.phase = 'playing'
  room.game.waveIndex = waveIndex
  room.game.waveElapsedMs = 0
  room.game.waveSpawnQueue = createWaveSpawnQueue(wave)
  room.game.clearDelayMs = 0
  room.game.eventText = wave.briefing
  room.game.bannerMs = 2200
  room.game.beams = []
}

function beginIntermission(room, randomValue) {
  const nextWave = WAVE_DEFS[room.game.waveIndex + 1]
  const currentWave = WAVE_DEFS[room.game.waveIndex]
  room.game.phase = 'intermission'
  room.game.intermissionMs = MATCH_RULES.intermissionMs
  room.game.eventText = nextWave
    ? `Wave cleared. Choose one blessing before ${nextWave.name}.`
    : 'The siege is over.'
  room.game.beams = []
  room.game.relicHp = clamp(room.game.relicHp + currentWave.relicRepair, 0, room.game.relicMaxHp)

  const players = [...room.players.values()]

  players.forEach((player, index) => {
    player.upgradeChoices = drawUpgradeChoices(player, randomValue)
    player.activeBeaconId = null
    player.alive = true
    player.respawnMs = 0
    player.hp = clamp(player.hp + 34, 0, player.stats.maxHp)
    const spawn = createSpawnPoint(index, players.length)
    player.x = spawn.x
    player.y = spawn.y
  })

  room.game.enemies = []
  room.game.enemyProjectiles = []
  room.game.projectiles = []
  room.game.pickups = []
  room.game.beacons = []

  for (const player of room.players.values()) {
    player.activeBeaconId = null
  }
}

function finishRun(room, phase, message) {
  room.game.phase = phase
  room.game.eventText = message
  room.game.bannerMs = 3600
  room.game.enemies = []
  room.game.projectiles = []
  room.game.enemyProjectiles = []
  room.game.pickups = []
  room.game.beacons = []
  room.game.defenses = []
  room.game.beams = []

  for (const player of room.players.values()) {
    player.ready = false
    player.upgradeChoices = []
    player.activeBeaconId = null
    player.activeDefenseIds = []
  }
}

function drawUpgradeChoices(player, randomValue) {
  const pool = [...UPGRADE_POOL]
  const picks = []

  while (pool.length > 0 && picks.length < 3) {
    const index = Math.floor(randomValue() * pool.length)
    const [picked] = pool.splice(index, 1)
    picks.push(picked)
  }

  return picks
}

function applyUpgrade(player, upgradeId, room) {
  const stats = player.stats
  player.upgrades.push(upgradeId)
  player.level = player.upgrades.length + 1

  switch (upgradeId) {
    case 'quickhands':
      stats.fireRateMs = Math.max(110, Math.round(stats.fireRateMs * 0.84))
      break
    case 'sunsteel':
      stats.boltDamage += 7
      stats.defenseDamage += 4
      stats.beamDps += 8
      break
    case 'heartbloom':
      stats.maxHp += 24
      player.hp = Math.min(stats.maxHp, player.hp + 34)
      break
    case 'longwatch':
      stats.boltSpeed += 110
      stats.beamWidth += 8
      stats.defenseRange += 40
      break
    case 'ashstep':
      stats.dashDistance += 34
      stats.dashCooldownMs = Math.max(1200, stats.dashCooldownMs - 520)
      stats.beamDps += 4
      break
    case 'lanternseed':
      stats.beaconDurationMs += 2200
      stats.beaconCooldownMs = Math.max(3600, stats.beaconCooldownMs - 1600)
      stats.defenseLifetimeMs += 9000
      stats.defenseFireRateMs = Math.max(420, stats.defenseFireRateMs - 140)
      break
    case 'starwake':
      stats.novaDamage += 16
      stats.novaRadius += 40
      stats.novaCooldownMs = Math.max(4200, stats.novaCooldownMs - 900)
      break
    case 'relicward':
      room.game.relicHp = clamp(room.game.relicHp + 110, 0, room.game.relicMaxHp)
      stats.beamWidth += 5
      stats.beamDps += 6
      stats.defenseMaxActive += 1
      break
    default:
      break
  }

  player.upgradeChoices = []
}

export function selectUpgradeForPlayer(room, playerId, upgradeId) {
  const player = room.players.get(playerId)

  if (!player || room.game.phase !== 'intermission') {
    return false
  }

  if (!player.upgradeChoices.includes(upgradeId)) {
    return false
  }

  applyUpgrade(player, upgradeId, room)
  return true
}

function autoPickMissingUpgrades(room) {
  for (const player of room.players.values()) {
    if (player.upgradeChoices.length > 0) {
      applyUpgrade(player, player.upgradeChoices[0], room)
    }
  }
}

function countLivingPlayers(room) {
  let living = 0

  for (const player of room.players.values()) {
    if (player.alive) {
      living += 1
    }
  }

  return living
}

function spawnEnemy(room, typeId, randomValue) {
  const def = ENEMY_DEFS[typeId]
  const angle = randomBetween(randomValue, 0, Math.PI * 2)
  const radius = randomBetween(randomValue, 330, 410)
  const enemy = {
    id: issueEntityId(room, 'enemy'),
    typeId,
    x: RELIC_STATE.x + Math.cos(angle) * radius,
    y: RELIC_STATE.y + Math.sin(angle) * radius,
    vx: 0,
    vy: 0,
    hp: def.hp,
    maxHp: def.hp,
    radius: def.radius,
    attackCooldownMs: randomBetween(randomValue, 250, def.attackCooldownMs ?? 900),
    contactCooldownMs: randomBetween(randomValue, 120, 560),
    burstCooldownMs: def.burstCooldownMs ?? 0,
    burstMs: 0,
    flashMs: 0
  }

  room.game.enemies.push(enemy)
}

function spawnPlayerBolt(room, player) {
  const aim = normalizeVector(player.input.aim.x, player.input.aim.y, player.aim.x, player.aim.y)
  player.aim = aim
  player.fireCooldownMs = player.stats.fireRateMs

  room.game.projectiles.push({
    id: issueEntityId(room, 'bolt'),
    ownerId: player.id,
    kind: 'player',
    x: player.x + aim.x * 22,
    y: player.y + aim.y * 22,
    vx: aim.x * player.stats.boltSpeed,
    vy: aim.y * player.stats.boltSpeed,
    radius: player.stats.boltRadius,
    damage: player.stats.boltDamage,
    ttlMs: 1500
  })
}

function spawnEnemyProjectile(room, enemy, targetX, targetY, speedMultiplier = 1) {
  const def = ENEMY_DEFS[enemy.typeId]
  const aim = normalizeVector(targetX - enemy.x, targetY - enemy.y)

  room.game.enemyProjectiles.push({
    id: issueEntityId(room, 'seed'),
    x: enemy.x + aim.x * (enemy.radius + 8),
    y: enemy.y + aim.y * (enemy.radius + 8),
    vx: aim.x * (def.projectileSpeed ?? 250) * speedMultiplier,
    vy: aim.y * (def.projectileSpeed ?? 250) * speedMultiplier,
    radius: enemy.typeId === 'boss' ? 11 : 8,
    damage: def.damage,
    ttlMs: 2600
  })
}

function spawnBossVolley(room, enemy) {
  for (let index = 0; index < 6; index += 1) {
    const direction = angleToVector((Math.PI * 2 * index) / 6)
    room.game.enemyProjectiles.push({
      id: issueEntityId(room, 'seed'),
      x: enemy.x + direction.x * (enemy.radius + 10),
      y: enemy.y + direction.y * (enemy.radius + 10),
      vx: direction.x * 240,
      vy: direction.y * 240,
      radius: 9,
      damage: 12,
      ttlMs: 2400
    })
  }
}

function knockEnemy(enemy, fromX, fromY, force) {
  const away = normalizeVector(enemy.x - fromX, enemy.y - fromY)
  enemy.x = clamp(enemy.x + away.x * force, enemy.radius, WORLD_WIDTH - enemy.radius)
  enemy.y = clamp(enemy.y + away.y * force, enemy.radius, WORLD_HEIGHT - enemy.radius)
}

function collectNearbyPickups(room, player, radius, relicHealPerPickup = 5) {
  let collected = 0

  room.game.pickups = room.game.pickups.filter((pickup) => {
    if (distanceBetween(player.x, player.y, pickup.x, pickup.y) <= radius) {
      collected += 1
      player.motes += pickup.value
      player.score += pickup.value * 3
      room.game.totalMotes += pickup.value
      room.game.relicHp = clamp(room.game.relicHp + relicHealPerPickup, 0, room.game.relicMaxHp)
      return false
    }

    return true
  })

  return collected
}

function castNova(room, player) {
  player.novaCooldownMs = player.stats.novaCooldownMs

  for (const enemy of room.game.enemies) {
    const distance = distanceBetween(player.x, player.y, enemy.x, enemy.y)

    if (distance <= player.stats.novaRadius + enemy.radius) {
      enemy.hp -= player.stats.novaDamage
      enemy.flashMs = 140
      knockEnemy(enemy, player.x, player.y, 42)
    }
  }

  collectNearbyPickups(room, player, player.stats.novaRadius + 30, 8)
}

function placeBeacon(room, player) {
  player.beaconCooldownMs = player.stats.beaconCooldownMs

  if (player.activeBeaconId) {
    room.game.beacons = room.game.beacons.filter((beacon) => beacon.id !== player.activeBeaconId)
    player.activeBeaconId = null
  }

  const beaconId = issueEntityId(room, 'beacon')
  player.activeBeaconId = beaconId
  room.game.beacons.push({
    id: beaconId,
    ownerId: player.id,
    x: player.x,
    y: player.y,
    radius: 22,
    ttlMs: player.stats.beaconDurationMs,
    pulseCooldownMs: 850
  })
}

function placeDefense(room, player) {
  player.defenseCooldownMs = player.stats.defenseCooldownMs

  const aim = normalizeVector(player.input.aim.x, player.input.aim.y, player.aim.x, player.aim.y)
  const defenseX = clamp(
    player.x + aim.x * player.stats.defensePlacementDistance,
    PLAYER_RADIUS,
    WORLD_WIDTH - PLAYER_RADIUS
  )
  const defenseY = clamp(
    player.y + aim.y * player.stats.defensePlacementDistance,
    PLAYER_RADIUS,
    WORLD_HEIGHT - PLAYER_RADIUS
  )

  if (player.activeDefenseIds.length >= player.stats.defenseMaxActive) {
    const retiredId = player.activeDefenseIds.shift()
    room.game.defenses = room.game.defenses.filter((defense) => defense.id !== retiredId)
  }

  const defenseId = issueEntityId(room, 'spire')
  player.activeDefenseIds.push(defenseId)
  room.game.defenses.push({
    id: defenseId,
    ownerId: player.id,
    x: defenseX,
    y: defenseY,
    radius: 20,
    ttlMs: player.stats.defenseLifetimeMs,
    fireCooldownMs: 220,
    flashMs: 0
  })
}

function dashPlayer(player) {
  player.dashCooldownMs = player.stats.dashCooldownMs
  player.beamOverchargeMs = 1500

  const direction = normalizeVector(player.input.move.x, player.input.move.y, player.aim.x, player.aim.y)
  player.x = clamp(player.x + direction.x * player.stats.dashDistance, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS)
  player.y = clamp(player.y + direction.y * player.stats.dashDistance, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS)
}

function damagePlayer(room, player, amount) {
  if (!player.alive) {
    return
  }

  player.hp -= amount

  if (player.hp > 0) {
    return
  }

  player.alive = false
  player.hp = 0
  player.respawnMs = MATCH_RULES.reviveMs
  room.game.relicHp = clamp(room.game.relicHp - 28, 0, room.game.relicMaxHp)
}

function damageRelic(room, amount) {
  room.game.relicHp = clamp(room.game.relicHp - amount, 0, room.game.relicMaxHp)

  if (room.game.relicHp <= 0) {
    finishRun(room, 'defeat', 'The Sunshard fell. Ready up to try again.')
  }
}

function getAlivePlayers(room) {
  return [...room.players.values()].filter((player) => player.alive)
}

function findThreatTarget(room, enemy) {
  const alivePlayers = getAlivePlayers(room)
  let bestPlayer = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const player of alivePlayers) {
    const distance = distanceBetween(enemy.x, enemy.y, player.x, player.y)

    if (distance < bestDistance) {
      bestDistance = distance
      bestPlayer = player
    }
  }

  if (!bestPlayer) {
    return {
      x: RELIC_STATE.x,
      y: RELIC_STATE.y,
      type: 'relic',
      ref: null,
      distance: distanceBetween(enemy.x, enemy.y, RELIC_STATE.x, RELIC_STATE.y)
    }
  }

  if (bestDistance < 180 || enemy.typeId === 'moth' || enemy.typeId === 'boss') {
    return {
      x: bestPlayer.x,
      y: bestPlayer.y,
      type: 'player',
      ref: bestPlayer,
      distance: bestDistance
    }
  }

  return {
    x: RELIC_STATE.x,
    y: RELIC_STATE.y,
    type: 'relic',
    ref: null,
    distance: distanceBetween(enemy.x, enemy.y, RELIC_STATE.x, RELIC_STATE.y)
  }
}

function handleEnemyContacts(room, enemy, target, deltaMs) {
  enemy.contactCooldownMs = Math.max(0, enemy.contactCooldownMs - deltaMs)
  const def = ENEMY_DEFS[enemy.typeId]

  if (target.type === 'player' && target.ref && target.distance <= enemy.radius + PLAYER_RADIUS + 8 && enemy.contactCooldownMs <= 0) {
    damagePlayer(room, target.ref, def.damage)
    enemy.contactCooldownMs = 900
    return
  }

  if (target.type === 'relic' && target.distance <= enemy.radius + RELIC_STATE.radius + 8 && enemy.contactCooldownMs <= 0) {
    damageRelic(room, def.damage)
    enemy.contactCooldownMs = enemy.typeId === 'boss' ? 600 : 900
  }
}

function tickEnemies(room, deltaMs, deltaSeconds, randomValue) {
  for (const enemy of room.game.enemies) {
    const def = ENEMY_DEFS[enemy.typeId]
    enemy.flashMs = Math.max(0, enemy.flashMs - deltaMs)
    const target = findThreatTarget(room, enemy)
    const direction = normalizeVector(target.x - enemy.x, target.y - enemy.y, 1, 0)
    let speed = def.speed

    if (enemy.typeId === 'moth') {
      enemy.burstCooldownMs = Math.max(0, enemy.burstCooldownMs - deltaMs)

      if (enemy.burstCooldownMs <= 0) {
        enemy.burstMs = 420
        enemy.burstCooldownMs = def.burstCooldownMs
      }

      if (enemy.burstMs > 0) {
        enemy.burstMs = Math.max(0, enemy.burstMs - deltaMs)
        speed += def.burstSpeed
      }
    }

    enemy.attackCooldownMs = Math.max(0, enemy.attackCooldownMs - deltaMs)

    if ((enemy.typeId === 'spitter' || enemy.typeId === 'boss') && target.distance <= (def.attackRange ?? 260)) {
      if (enemy.attackCooldownMs <= 0) {
        spawnEnemyProjectile(room, enemy, target.x, target.y, enemy.typeId === 'boss' ? 1.15 : 1)

        if (enemy.typeId === 'boss' && randomValue() > 0.55) {
          spawnBossVolley(room, enemy)
        }

        enemy.attackCooldownMs = def.attackCooldownMs
      }

      const retreat = target.distance < (def.attackRange ?? 260) * 0.58 ? -0.35 : 0.18
      enemy.x = clamp(enemy.x + direction.x * speed * retreat * deltaSeconds, enemy.radius, WORLD_WIDTH - enemy.radius)
      enemy.y = clamp(enemy.y + direction.y * speed * retreat * deltaSeconds, enemy.radius, WORLD_HEIGHT - enemy.radius)
    } else {
      enemy.x = clamp(enemy.x + direction.x * speed * deltaSeconds, enemy.radius, WORLD_WIDTH - enemy.radius)
      enemy.y = clamp(enemy.y + direction.y * speed * deltaSeconds, enemy.radius, WORLD_HEIGHT - enemy.radius)
    }

    handleEnemyContacts(room, enemy, target, deltaMs)
  }
}

function tickPlayerProjectiles(room, deltaMs, deltaSeconds) {
  const survivors = []

  for (const projectile of room.game.projectiles) {
    projectile.ttlMs -= deltaMs
    projectile.x += projectile.vx * deltaSeconds
    projectile.y += projectile.vy * deltaSeconds

    if (
      projectile.ttlMs <= 0 ||
      projectile.x < -40 ||
      projectile.x > WORLD_WIDTH + 40 ||
      projectile.y < -40 ||
      projectile.y > WORLD_HEIGHT + 40
    ) {
      continue
    }

    let spent = false

    for (const enemy of room.game.enemies) {
      if (distanceBetween(projectile.x, projectile.y, enemy.x, enemy.y) <= projectile.radius + enemy.radius) {
        enemy.hp -= projectile.damage
        enemy.flashMs = 120
        spent = true
        break
      }
    }

    if (!spent) {
      survivors.push(projectile)
    }
  }

  room.game.projectiles = survivors
}

function tickEnemyProjectiles(room, deltaMs, deltaSeconds) {
  const survivors = []

  outer: for (const projectile of room.game.enemyProjectiles) {
    projectile.ttlMs -= deltaMs
    projectile.x += projectile.vx * deltaSeconds
    projectile.y += projectile.vy * deltaSeconds

    if (
      projectile.ttlMs <= 0 ||
      projectile.x < -50 ||
      projectile.x > WORLD_WIDTH + 50 ||
      projectile.y < -50 ||
      projectile.y > WORLD_HEIGHT + 50
    ) {
      continue
    }

    for (const player of room.players.values()) {
      if (player.alive && distanceBetween(projectile.x, projectile.y, player.x, player.y) <= projectile.radius + PLAYER_RADIUS) {
        damagePlayer(room, player, projectile.damage)
        continue outer
      }
    }

    if (distanceBetween(projectile.x, projectile.y, RELIC_STATE.x, RELIC_STATE.y) <= projectile.radius + RELIC_STATE.radius) {
      damageRelic(room, projectile.damage)
      continue
    }

    survivors.push(projectile)
  }

  room.game.enemyProjectiles = survivors
}

function spawnDefenseProjectile(room, defense, owner, target) {
  const aim = normalizeVector(target.x - defense.x, target.y - defense.y, 1, 0)

  room.game.projectiles.push({
    id: issueEntityId(room, 'spire-bolt'),
    ownerId: owner.id,
    kind: 'defense',
    x: defense.x + aim.x * 18,
    y: defense.y + aim.y * 18,
    vx: aim.x * owner.stats.defenseBoltSpeed,
    vy: aim.y * owner.stats.defenseBoltSpeed,
    radius: 6,
    damage: owner.stats.defenseDamage,
    ttlMs: 1500
  })
}

function spawnPickup(room, x, y, value = 1) {
  room.game.pickups.push({
    id: issueEntityId(room, 'mote'),
    x,
    y,
    value,
    ttlMs: 18000
  })
}

function removeExpiredAndDead(room) {
  const playersById = new Map([...room.players.values()].map((player) => [player.id, player]))

  room.game.beacons = room.game.beacons.filter((beacon) => {
    const owner = playersById.get(beacon.ownerId)

    if (!owner || owner.activeBeaconId !== beacon.id || beacon.ttlMs <= 0) {
      if (owner?.activeBeaconId === beacon.id) {
        owner.activeBeaconId = null
      }

      return false
    }

    return true
  })

  room.game.defenses = room.game.defenses.filter((defense) => {
    const owner = playersById.get(defense.ownerId)

    if (!owner || !owner.activeDefenseIds.includes(defense.id) || defense.ttlMs <= 0) {
      if (owner) {
        owner.activeDefenseIds = owner.activeDefenseIds.filter((defenseId) => defenseId !== defense.id)
      }

      return false
    }

    return true
  })

  const defeatedEnemies = room.game.enemies.filter((enemy) => enemy.hp <= 0)

  for (const enemy of defeatedEnemies) {
    room.game.totalKills += 1
    spawnPickup(room, enemy.x, enemy.y, enemy.typeId === 'boss' ? 6 : enemy.typeId === 'brute' ? 2 : 1)
  }

  room.game.enemies = room.game.enemies.filter((enemy) => enemy.hp > 0)

  room.game.pickups = room.game.pickups.filter((pickup) => pickup.ttlMs > 0)
}

function tickPickups(room, deltaMs) {
  room.game.pickups = room.game.pickups.filter((pickup) => {
    pickup.ttlMs -= deltaMs
    return pickup.ttlMs > 0
  })
}

function tickBeacons(room, deltaMs) {
  for (const beacon of room.game.beacons) {
    beacon.ttlMs -= deltaMs
    beacon.pulseCooldownMs = Math.max(0, beacon.pulseCooldownMs - deltaMs)

    if (beacon.pulseCooldownMs <= 0) {
      beacon.pulseCooldownMs = 900

      for (const enemy of room.game.enemies) {
        if (distanceBetween(beacon.x, beacon.y, enemy.x, enemy.y) <= enemy.radius + beacon.radius + 28) {
          enemy.hp -= 10
          enemy.flashMs = 90
        }
      }
    }
  }

  for (const player of room.players.values()) {
    if (player.activeBeaconId) {
      const active = room.game.beacons.find((beacon) => beacon.id === player.activeBeaconId)

      if (!active || active.ttlMs <= 0) {
        player.activeBeaconId = null
      }
    }
  }

  room.game.beacons = room.game.beacons.filter((beacon) => beacon.ttlMs > 0)
}

function tickDefenses(room, deltaMs) {
  const playersById = new Map([...room.players.values()].map((player) => [player.id, player]))

  for (const defense of room.game.defenses) {
    defense.ttlMs -= deltaMs
    defense.fireCooldownMs = Math.max(0, defense.fireCooldownMs - deltaMs)
    defense.flashMs = Math.max(0, defense.flashMs - deltaMs)

    if (defense.ttlMs <= 0) {
      continue
    }

    const owner = playersById.get(defense.ownerId)

    if (!owner || defense.fireCooldownMs > 0) {
      continue
    }

    let target = null
    let bestDistance = owner.stats.defenseRange

    for (const enemy of room.game.enemies) {
      const distance = distanceBetween(defense.x, defense.y, enemy.x, enemy.y) - enemy.radius

      if (distance <= bestDistance) {
        bestDistance = distance
        target = enemy
      }
    }

    if (target) {
      spawnDefenseProjectile(room, defense, owner, target)
      defense.fireCooldownMs = owner.stats.defenseFireRateMs
      defense.flashMs = 140
    }
  }
}

function tickBeams(room, deltaSeconds) {
  room.game.beams = []

  for (const player of room.players.values()) {
    if (!player.alive) {
      continue
    }

    const anchor =
      room.game.beacons.find((beacon) => beacon.id === player.activeBeaconId) ?? {
        x: RELIC_STATE.x,
        y: RELIC_STATE.y
      }

    const overcharged = player.beamOverchargeMs > 0
    const beamWidth = player.stats.beamWidth + (overcharged ? 8 : 0)
    const beamDps = player.stats.beamDps * (overcharged ? 1.8 : 1)

    // The radiant tether is the run's signature mechanic: it turns positioning
    // into a shared hazard line instead of just direct aiming.
    room.game.beams.push({
      ownerId: player.id,
      x1: player.x,
      y1: player.y,
      x2: anchor.x,
      y2: anchor.y,
      width: beamWidth,
      overcharged
    })

    for (const enemy of room.game.enemies) {
      const distance = segmentDistanceToCircle(player.x, player.y, anchor.x, anchor.y, enemy.x, enemy.y)

      if (distance <= enemy.radius + beamWidth * 0.5) {
        enemy.hp -= beamDps * deltaSeconds
        enemy.flashMs = Math.max(enemy.flashMs, 60)
      }
    }
  }
}

function tickPlayers(room, deltaMs, deltaSeconds, randomValue) {
  for (const player of room.players.values()) {
    player.fireCooldownMs = Math.max(0, player.fireCooldownMs - deltaMs)
    player.dashCooldownMs = Math.max(0, player.dashCooldownMs - deltaMs)
    player.novaCooldownMs = Math.max(0, player.novaCooldownMs - deltaMs)
    player.beaconCooldownMs = Math.max(0, player.beaconCooldownMs - deltaMs)
    player.defenseCooldownMs = Math.max(0, player.defenseCooldownMs - deltaMs)
    player.beamOverchargeMs = Math.max(0, player.beamOverchargeMs - deltaMs)

    if (!player.alive) {
      player.respawnMs = Math.max(0, player.respawnMs - deltaMs)

      if (player.respawnMs <= 0 && room.game.phase === 'playing' && room.game.relicHp > 0) {
        player.alive = true
        player.hp = Math.round(player.stats.maxHp * 0.65)
        player.x = clamp(RELIC_STATE.x + randomBetween(randomValue, -70, 70), PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS)
        player.y = clamp(RELIC_STATE.y + randomBetween(randomValue, -70, 70), PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS)
      }

      continue
    }

    const move = normalizeInput(player.input.move)
    player.x = clamp(player.x + move.x * player.stats.moveSpeed * deltaSeconds, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS)
    player.y = clamp(player.y + move.y * player.stats.moveSpeed * deltaSeconds, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS)
    player.aim = normalizeVector(player.input.aim.x, player.input.aim.y, player.aim.x, player.aim.y)

    const dashTriggered = player.input.dash && !player.actionsHeld.dash
    const beaconTriggered = player.input.beacon && !player.actionsHeld.beacon
    const novaTriggered = player.input.nova && !player.actionsHeld.nova
    const deployTriggered = player.input.deploy && !player.actionsHeld.deploy

    player.actionsHeld.dash = player.input.dash
    player.actionsHeld.beacon = player.input.beacon
    player.actionsHeld.nova = player.input.nova
    player.actionsHeld.deploy = player.input.deploy

    if (dashTriggered && player.dashCooldownMs <= 0) {
      dashPlayer(player)
    }

    if (beaconTriggered && player.beaconCooldownMs <= 0) {
      placeBeacon(room, player)
    }

    if (novaTriggered && player.novaCooldownMs <= 0) {
      castNova(room, player)
    }

    if (deployTriggered && player.defenseCooldownMs <= 0) {
      placeDefense(room, player)
    }

    if (player.input.fire && player.fireCooldownMs <= 0) {
      spawnPlayerBolt(room, player)
    }

    collectNearbyPickups(room, player, player.stats.pickupRadius, 2)
  }
}

function tickWaveSpawns(room, randomValue) {
  while (room.game.waveSpawnQueue.length > 0 && room.game.waveSpawnQueue[0].timeMs <= room.game.waveElapsedMs) {
    const spawn = room.game.waveSpawnQueue.shift()
    spawnEnemy(room, spawn.typeId, randomValue)
  }
}

function waveFinished(room) {
  return (
    room.game.waveSpawnQueue.length === 0 &&
    room.game.enemies.length === 0 &&
    room.game.projectiles.length === 0 &&
    room.game.enemyProjectiles.length === 0
  )
}

function allBlessingsChosen(room) {
  for (const player of room.players.values()) {
    if (player.upgradeChoices.length > 0) {
      return false
    }
  }

  return true
}

function tickPlaying(room, deltaMs, randomValue) {
  const deltaSeconds = deltaMs / 1000
  room.game.waveElapsedMs += deltaMs
  room.game.bannerMs = Math.max(0, room.game.bannerMs - deltaMs)

  tickPlayers(room, deltaMs, deltaSeconds, randomValue)
  tickBeacons(room, deltaMs)
  tickDefenses(room, deltaMs)
  tickWaveSpawns(room, randomValue)
  tickBeams(room, deltaSeconds)
  tickEnemies(room, deltaMs, deltaSeconds, randomValue)
  tickPlayerProjectiles(room, deltaMs, deltaSeconds)
  tickEnemyProjectiles(room, deltaMs, deltaSeconds)
  tickPickups(room, deltaMs)
  removeExpiredAndDead(room)

  if (room.game.phase === 'defeat') {
    return
  }

  if (waveFinished(room)) {
    room.game.clearDelayMs += deltaMs

    if (room.game.clearDelayMs >= MATCH_RULES.clearDelayMs) {
      if (room.game.waveIndex >= WAVE_DEFS.length - 1) {
        finishRun(room, 'victory', 'The garden is clean. Ready up for another run.')
      } else {
        beginIntermission(room, randomValue)
      }
    }
  } else {
    room.game.clearDelayMs = 0
  }
}

function tickIntermission(room, deltaMs, randomValue) {
  room.game.bannerMs = Math.max(0, room.game.bannerMs - deltaMs)
  room.game.intermissionMs = Math.max(0, room.game.intermissionMs - deltaMs)

  if (allBlessingsChosen(room) || room.game.intermissionMs <= 0) {
    autoPickMissingUpgrades(room)
    beginWave(room, room.game.waveIndex + 1)
  } else {
    room.game.eventText = `Choose a blessing. ${Math.ceil(room.game.intermissionMs / 1000)}s until the next assault.`
  }

  void randomValue
}

function maybeStartCountdown(room) {
  if (room.players.size === 0) {
    beginLobbyState(room, 'Waiting for wardens to arrive.')
    return
  }

  const players = [...room.players.values()]
  const allReady = players.every((player) => player.ready)

  if (room.game.phase === 'countdown' && !allReady) {
    beginLobbyState(room, 'A warden lowered their guard. Ready up to begin the siege.')
    return
  }

  if (allReady && (room.game.phase === 'lobby' || room.game.phase === 'victory' || room.game.phase === 'defeat')) {
    room.game.phase = 'countdown'
    room.game.countdownMs = MATCH_RULES.countdownMs
    room.game.eventText = 'The shrine awakens...'
  }
}

function tickCountdown(room, deltaMs) {
  const players = [...room.players.values()]

  if (players.length === 0 || !players.every((player) => player.ready)) {
    beginLobbyState(room, 'A warden lowered their guard. Ready up to begin the siege.')
    return
  }

  room.game.countdownMs = Math.max(0, room.game.countdownMs - deltaMs)
  room.game.eventText = `The siege begins in ${Math.max(1, Math.ceil(room.game.countdownMs / 1000))}...`

  if (room.game.countdownMs <= 0) {
    room.game = createRoomGameState(room.game.seed)
    respawnAllPlayers(room)
    beginWave(room, 0)
  }
}

export function roomAllowsJoin(room) {
  return room.game.phase === 'lobby' || room.game.phase === 'victory' || room.game.phase === 'defeat'
}

export function tickRoomGame(room, deltaMs, randomValue = Math.random) {
  if (room.players.size === 0) {
    return
  }

  // Treat the room sim like a small state machine so lobby, countdown, run,
  // and intermission rules remain deterministic across every connected client.
  if (room.game.phase === 'lobby') {
    maybeStartCountdown(room)
    return
  }

  if (room.game.phase === 'countdown') {
    tickCountdown(room, deltaMs)
    return
  }

  if (room.game.phase === 'intermission') {
    tickIntermission(room, deltaMs, randomValue)
    return
  }

  if (room.game.phase === 'playing') {
    tickPlaying(room, deltaMs, randomValue)
    return
  }

  if (room.game.phase === 'victory' || room.game.phase === 'defeat') {
    maybeStartCountdown(room)
  }
}

function serializePlayer(player) {
  return {
    id: player.id,
    nickname: player.nickname,
    color: player.color,
    ready: player.ready,
    x: Number(player.x.toFixed(2)),
    y: Number(player.y.toFixed(2)),
    hp: player.hp,
    maxHp: player.stats.maxHp,
    alive: player.alive,
    respawnMs: Math.ceil(player.respawnMs),
    level: player.level,
    motes: player.motes,
    score: player.score,
    fireCooldownMs: Math.ceil(player.fireCooldownMs),
    dashCooldownMs: Math.ceil(player.dashCooldownMs),
    novaCooldownMs: Math.ceil(player.novaCooldownMs),
    beaconCooldownMs: Math.ceil(player.beaconCooldownMs),
    defenseCooldownMs: Math.ceil(player.defenseCooldownMs),
    beamOverchargeMs: Math.ceil(player.beamOverchargeMs),
    aim: {
      x: Number(player.aim.x.toFixed(3)),
      y: Number(player.aim.y.toFixed(3))
    },
    upgradeChoices: [...player.upgradeChoices],
    upgrades: [...player.upgrades],
    lastSequence: player.lastSequence
  }
}

export function buildRoomState(room) {
  return {
    roomId: room.roomId,
    createdAt: room.createdAt,
    seed: room.seed,
    tick: room.tick,
    maxPlayers: room.maxPlayers,
    phase: room.game.phase,
    waveIndex: room.game.waveIndex,
    playerCount: room.players.size,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      nickname: player.nickname,
      color: player.color,
      ready: player.ready,
      connected: true,
      level: player.level,
      alive: player.alive
    }))
  }
}

export function buildRoomSnapshot(room) {
  const waveDef = room.game.waveIndex >= 0 ? WAVE_DEFS[room.game.waveIndex] : null

  return {
    roomId: room.roomId,
    tick: room.tick,
    world: {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      playerRadius: PLAYER_RADIUS,
      seed: room.seed,
      phase: room.game.phase,
      eventText: room.game.eventText,
      bannerMs: room.game.bannerMs,
      countdownMs: Math.ceil(room.game.countdownMs),
      intermissionMs: Math.ceil(room.game.intermissionMs),
      relic: {
        ...RELIC_STATE,
        hp: room.game.relicHp,
        maxHp: room.game.relicMaxHp
      },
      wave: {
        index: room.game.waveIndex + 1,
        total: WAVE_DEFS.length,
        name: waveDef?.name ?? 'Sanctuary',
        briefing: waveDef?.briefing ?? 'Ready the shrine.',
        remainingSpawns: room.game.waveSpawnQueue.length
      },
      enemies: room.game.enemies.map((enemy) => ({
        id: enemy.id,
        typeId: enemy.typeId,
        x: Number(enemy.x.toFixed(2)),
        y: Number(enemy.y.toFixed(2)),
        hp: Number(enemy.hp.toFixed(2)),
        maxHp: enemy.maxHp,
        radius: enemy.radius,
        flashMs: Math.ceil(enemy.flashMs)
      })),
      projectiles: room.game.projectiles.map((projectile) => ({
        id: projectile.id,
        kind: projectile.kind ?? 'player',
        x: Number(projectile.x.toFixed(2)),
        y: Number(projectile.y.toFixed(2)),
        radius: projectile.radius
      })),
      enemyProjectiles: room.game.enemyProjectiles.map((projectile) => ({
        id: projectile.id,
        kind: 'enemy',
        x: Number(projectile.x.toFixed(2)),
        y: Number(projectile.y.toFixed(2)),
        radius: projectile.radius
      })),
      pickups: room.game.pickups.map((pickup) => ({
        id: pickup.id,
        x: Number(pickup.x.toFixed(2)),
        y: Number(pickup.y.toFixed(2)),
        value: pickup.value
      })),
      beacons: room.game.beacons.map((beacon) => ({
        id: beacon.id,
        ownerId: beacon.ownerId,
        x: Number(beacon.x.toFixed(2)),
        y: Number(beacon.y.toFixed(2)),
        radius: beacon.radius,
        ttlMs: Math.ceil(beacon.ttlMs)
      })),
      defenses: room.game.defenses.map((defense) => {
        const owner = room.players.get(defense.ownerId)

        return {
          id: defense.id,
          ownerId: defense.ownerId,
          x: Number(defense.x.toFixed(2)),
          y: Number(defense.y.toFixed(2)),
          radius: defense.radius,
          ttlMs: Math.ceil(defense.ttlMs),
          range: owner?.stats.defenseRange ?? PLAYER_BASE_STATS.defenseRange,
          flashMs: Math.ceil(defense.flashMs)
        }
      }),
      beams: room.game.beams.map((beam) => ({
        ownerId: beam.ownerId,
        x1: Number(beam.x1.toFixed(2)),
        y1: Number(beam.y1.toFixed(2)),
        x2: Number(beam.x2.toFixed(2)),
        y2: Number(beam.y2.toFixed(2)),
        width: beam.width,
        overcharged: beam.overcharged
      })),
      totals: {
        kills: room.game.totalKills,
        motes: room.game.totalMotes
      }
    },
    players: [...room.players.values()].map((player) => serializePlayer(player))
  }
}
