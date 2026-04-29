import { ENEMY_DEFS, GAME_META, RELIC_STATE } from '../shared/game-data.mjs'

function createRng(seed) {
  let state = (seed >>> 0) || 1

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function alphaColor(hex, alpha) {
  const normalized = hex.replace('#', '')
  const longHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => character + character)
          .join('')
      : normalized
  const red = Number.parseInt(longHex.slice(0, 2), 16)
  const green = Number.parseInt(longHex.slice(2, 4), 16)
  const blue = Number.parseInt(longHex.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function pointDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1)
}

export function createArenaRenderer(canvas) {
  const context = canvas.getContext('2d')
  const tracks = new Map()
  let worldView = {
    width: 1280,
    height: 720,
    scale: 1,
    offsetX: 0,
    offsetY: 0
  }
  let decorSeed = null
  let decor = {
    flowers: [],
    stones: [],
    bushes: []
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
  }

  function ensureDecor(seed, worldWidth, worldHeight) {
    if (decorSeed === seed) {
      return
    }

    decorSeed = seed
    const random = createRng(seed)
    const flowers = []
    const stones = []
    const bushes = []

    for (let index = 0; index < 52; index += 1) {
      const x = 60 + random() * (worldWidth - 120)
      const y = 60 + random() * (worldHeight - 120)

      if (pointDistance(x, y, RELIC_STATE.x, RELIC_STATE.y) < 120) {
        continue
      }

      flowers.push({
        x,
        y,
        size: 4 + random() * 7,
        hue: random() > 0.5 ? '#ffe39c' : '#f7b2d2'
      })
    }

    for (let index = 0; index < 16; index += 1) {
      const x = 40 + random() * (worldWidth - 80)
      const y = 40 + random() * (worldHeight - 80)
      stones.push({
        x,
        y,
        radius: 12 + random() * 20,
        tilt: random() * Math.PI
      })
    }

    for (let index = 0; index < 18; index += 1) {
      const x = 50 + random() * (worldWidth - 100)
      const y = 50 + random() * (worldHeight - 100)

      if (pointDistance(x, y, RELIC_STATE.x, RELIC_STATE.y) < 150) {
        continue
      }

      bushes.push({
        x,
        y,
        radius: 16 + random() * 18,
        tint: random() > 0.6 ? '#4f7c37' : '#6f9d49'
      })
    }

    decor = { flowers, stones, bushes }
  }

  function updateView(world) {
    const padding = 36
    worldView.width = world.width
    worldView.height = world.height
    worldView.scale = Math.min(
      (canvas.width - padding * 2) / world.width,
      (canvas.height - padding * 2) / world.height
    )
    worldView.offsetX = (canvas.width - world.width * worldView.scale) / 2
    worldView.offsetY = (canvas.height - world.height * worldView.scale) / 2
  }

  function toScreen(x, y) {
    return {
      x: worldView.offsetX + x * worldView.scale,
      y: worldView.offsetY + y * worldView.scale
    }
  }

  function worldToScreenRadius(radius) {
    return radius * worldView.scale
  }

  function smoothPoint(key, x, y, factor = 0.28) {
    const current = tracks.get(key) ?? { x, y }
    current.x += (x - current.x) * factor
    current.y += (y - current.y) * factor
    tracks.set(key, current)
    return current
  }

  function drawGround(world) {
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#f1f8ff')
    gradient.addColorStop(1, '#d5ecd4')
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)

    const bounds = toScreen(0, 0)
    const width = world.width * worldView.scale
    const height = world.height * worldView.scale

    const worldGradient = context.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + height)
    worldGradient.addColorStop(0, '#94c766')
    worldGradient.addColorStop(1, '#5e8d3e')

    context.save()
    context.fillStyle = worldGradient
    context.beginPath()
    context.roundRect(bounds.x, bounds.y, width, height, 28 * worldView.scale)
    context.fill()
    context.restore()

    const vignette = context.createRadialGradient(
      bounds.x + width * 0.5,
      bounds.y + height * 0.5,
      width * 0.2,
      bounds.x + width * 0.5,
      bounds.y + height * 0.5,
      width * 0.8
    )
    vignette.addColorStop(0, 'rgba(255,255,255,0)')
    vignette.addColorStop(1, 'rgba(35, 68, 34, 0.24)')
    context.fillStyle = vignette
    context.beginPath()
    context.roundRect(bounds.x, bounds.y, width, height, 28 * worldView.scale)
    context.fill()
  }

  function drawDecor() {
    for (const bush of decor.bushes) {
      const position = toScreen(bush.x, bush.y)
      const radius = worldToScreenRadius(bush.radius)
      context.fillStyle = alphaColor('#476c2f', 0.18)
      context.beginPath()
      context.ellipse(position.x, position.y + radius * 0.66, radius * 0.9, radius * 0.45, 0, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = bush.tint
      context.beginPath()
      context.arc(position.x, position.y, radius, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#7caf4e'
      context.beginPath()
      context.arc(position.x - radius * 0.22, position.y - radius * 0.2, radius * 0.52, 0, Math.PI * 2)
      context.fill()
    }

    for (const stone of decor.stones) {
      const position = toScreen(stone.x, stone.y)
      const radius = worldToScreenRadius(stone.radius)
      context.save()
      context.translate(position.x, position.y)
      context.rotate(stone.tilt)
      context.fillStyle = '#76847a'
      context.beginPath()
      context.ellipse(0, 0, radius, radius * 0.72, 0, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#aeb9af'
      context.beginPath()
      context.ellipse(-radius * 0.18, -radius * 0.14, radius * 0.46, radius * 0.24, 0, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }

    for (const flower of decor.flowers) {
      const position = toScreen(flower.x, flower.y)
      const radius = worldToScreenRadius(flower.size)
      context.fillStyle = flower.hue
      context.beginPath()
      context.arc(position.x, position.y, radius * 0.6, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#fef8d1'
      context.beginPath()
      context.arc(position.x, position.y, radius * 0.24, 0, Math.PI * 2)
      context.fill()
    }
  }

  function drawRelic(world) {
    const center = toScreen(world.relic.x, world.relic.y)
    const radius = worldToScreenRadius(world.relic.radius)
    const relicGlow = context.createRadialGradient(center.x, center.y, radius * 0.3, center.x, center.y, radius * 3.2)
    relicGlow.addColorStop(0, 'rgba(255, 236, 148, 0.42)')
    relicGlow.addColorStop(1, 'rgba(255, 236, 148, 0)')
    context.fillStyle = relicGlow
    context.beginPath()
    context.arc(center.x, center.y, radius * 3.4, 0, Math.PI * 2)
    context.fill()

    context.strokeStyle = 'rgba(255, 236, 179, 0.52)'
    context.lineWidth = radius * 0.22
    context.beginPath()
    context.arc(center.x, center.y, radius * 1.9, 0, Math.PI * 2)
    context.stroke()

    context.fillStyle = '#6f573f'
    context.beginPath()
    context.arc(center.x, center.y, radius * 1.05, 0, Math.PI * 2)
    context.fill()

    const orb = context.createRadialGradient(center.x, center.y - radius * 0.25, radius * 0.2, center.x, center.y, radius * 0.95)
    orb.addColorStop(0, '#fff6d2')
    orb.addColorStop(1, '#f4b03b')
    context.fillStyle = orb
    context.beginPath()
    context.arc(center.x, center.y - radius * 0.2, radius * 0.68, 0, Math.PI * 2)
    context.fill()
  }

  function drawBeam(beam, ownerColor) {
    const from = smoothPoint(`beam-a-${beam.ownerId}`, beam.x1, beam.y1, 0.35)
    const to = smoothPoint(`beam-b-${beam.ownerId}`, beam.x2, beam.y2, 0.35)
    const start = toScreen(from.x, from.y)
    const end = toScreen(to.x, to.y)
    const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y)
    gradient.addColorStop(0, alphaColor(ownerColor, beam.overcharged ? 0.92 : 0.68))
    gradient.addColorStop(1, beam.overcharged ? 'rgba(255, 239, 171, 0.92)' : 'rgba(255, 245, 214, 0.54)')
    context.strokeStyle = gradient
    context.lineWidth = worldToScreenRadius(beam.width * 0.22)
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(start.x, start.y)
    context.lineTo(end.x, end.y)
    context.stroke()
  }

  function drawBeacon(beacon) {
    const position = smoothPoint(`beacon-${beacon.id}`, beacon.x, beacon.y, 0.32)
    const screen = toScreen(position.x, position.y)
    const radius = worldToScreenRadius(beacon.radius)
    context.fillStyle = 'rgba(63, 75, 98, 0.35)'
    context.beginPath()
    context.ellipse(screen.x, screen.y + radius * 0.8, radius * 0.8, radius * 0.42, 0, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = '#5b4d77'
    context.beginPath()
    context.moveTo(screen.x, screen.y - radius * 1.1)
    context.lineTo(screen.x + radius * 0.8, screen.y + radius * 0.85)
    context.lineTo(screen.x - radius * 0.8, screen.y + radius * 0.85)
    context.closePath()
    context.fill()

    context.fillStyle = '#fff1b3'
    context.beginPath()
    context.arc(screen.x, screen.y - radius * 0.18, radius * 0.48, 0, Math.PI * 2)
    context.fill()
  }

  function drawDefense(defense, ownerColor) {
    const position = smoothPoint(`defense-${defense.id}`, defense.x, defense.y, 0.3)
    const screen = toScreen(position.x, position.y)
    const radius = worldToScreenRadius(defense.radius)

    context.fillStyle = 'rgba(41, 49, 33, 0.2)'
    context.beginPath()
    context.ellipse(screen.x, screen.y + radius * 0.92, radius * 0.96, radius * 0.42, 0, 0, Math.PI * 2)
    context.fill()

    context.strokeStyle = alphaColor(ownerColor, 0.12)
    context.lineWidth = 1.5
    context.beginPath()
    context.arc(screen.x, screen.y, worldToScreenRadius(defense.range), 0, Math.PI * 2)
    context.stroke()

    context.fillStyle = alphaColor(ownerColor, 0.18)
    context.beginPath()
    context.arc(screen.x, screen.y, worldToScreenRadius(defense.range * 0.28), 0, Math.PI * 2)
    context.fill()

    context.fillStyle = '#55634c'
    context.beginPath()
    context.moveTo(screen.x - radius * 0.88, screen.y + radius * 0.85)
    context.lineTo(screen.x + radius * 0.88, screen.y + radius * 0.85)
    context.lineTo(screen.x + radius * 0.38, screen.y + radius * 0.1)
    context.lineTo(screen.x - radius * 0.38, screen.y + radius * 0.1)
    context.closePath()
    context.fill()

    context.fillStyle = alphaColor(ownerColor, 0.85)
    context.beginPath()
    context.moveTo(screen.x, screen.y - radius * 1.15)
    context.lineTo(screen.x + radius * 0.7, screen.y - radius * 0.08)
    context.lineTo(screen.x, screen.y + radius * 0.22)
    context.lineTo(screen.x - radius * 0.7, screen.y - radius * 0.08)
    context.closePath()
    context.fill()

    context.fillStyle = defense.flashMs > 0 ? '#fff6cf' : '#ffe090'
    context.beginPath()
    context.arc(screen.x, screen.y - radius * 0.22, radius * 0.26, 0, Math.PI * 2)
    context.fill()
  }

  function drawPickup(pickup) {
    const position = smoothPoint(`pickup-${pickup.id}`, pickup.x, pickup.y, 0.26)
    const screen = toScreen(position.x, position.y)
    const radius = worldToScreenRadius(7 + pickup.value * 2)
    context.fillStyle = 'rgba(255, 231, 148, 0.2)'
    context.beginPath()
    context.arc(screen.x, screen.y, radius * 2.2, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#ffe38f'
    context.beginPath()
    context.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#fff7db'
    context.beginPath()
    context.arc(screen.x - radius * 0.18, screen.y - radius * 0.2, radius * 0.38, 0, Math.PI * 2)
    context.fill()
  }

  function drawProjectile(projectile, enemy = false) {
    const position = smoothPoint(`projectile-${projectile.id}`, projectile.x, projectile.y, 0.42)
    const screen = toScreen(position.x, position.y)
    const radius = worldToScreenRadius(projectile.radius)
    const isDefense = projectile.kind === 'defense'
    context.fillStyle = enemy ? '#6f59c2' : isDefense ? '#9de06f' : '#ffd36b'
    context.beginPath()
    context.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = enemy
      ? 'rgba(169, 145, 255, 0.2)'
      : isDefense
        ? 'rgba(157, 224, 111, 0.18)'
        : 'rgba(255, 218, 125, 0.18)'
    context.beginPath()
    context.arc(screen.x, screen.y, radius * 2.4, 0, Math.PI * 2)
    context.fill()
  }

  function drawEnemy(enemy) {
    const def = ENEMY_DEFS[enemy.typeId]
    const position = smoothPoint(`enemy-${enemy.id}`, enemy.x, enemy.y, 0.3)
    const screen = toScreen(position.x, position.y)
    const radius = worldToScreenRadius(enemy.radius)
    context.fillStyle = 'rgba(46, 32, 22, 0.22)'
    context.beginPath()
    context.ellipse(screen.x, screen.y + radius * 0.86, radius * 0.88, radius * 0.42, 0, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = def.color
    context.beginPath()
    context.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = def.role === 'boss' ? '#f7ccaf' : '#cfe9a8'
    context.beginPath()
    context.arc(screen.x - radius * 0.24, screen.y - radius * 0.18, radius * 0.38, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = '#1f1c1a'
    context.beginPath()
    context.arc(screen.x - radius * 0.24, screen.y - radius * 0.1, radius * 0.1, 0, Math.PI * 2)
    context.arc(screen.x + radius * 0.2, screen.y - radius * 0.1, radius * 0.1, 0, Math.PI * 2)
    context.fill()

    const healthRatio = clamp(enemy.hp / enemy.maxHp, 0, 1)
    context.fillStyle = 'rgba(28, 31, 24, 0.42)'
    context.fillRect(screen.x - radius, screen.y - radius - 12, radius * 2, 5)
    context.fillStyle = '#ffd36b'
    context.fillRect(screen.x - radius, screen.y - radius - 12, radius * 2 * healthRatio, 5)
  }

  function drawPlayer(player, isSelf) {
    const position = smoothPoint(`player-${player.id}`, player.x, player.y, isSelf ? 0.45 : 0.3)
    const screen = toScreen(position.x, position.y)
    const radius = worldToScreenRadius(18)
    const aimAngle = Math.atan2(player.aim.y, player.aim.x)

    context.fillStyle = 'rgba(28, 39, 19, 0.2)'
    context.beginPath()
    context.ellipse(screen.x, screen.y + radius * 0.94, radius * 0.92, radius * 0.4, 0, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.translate(screen.x, screen.y)
    context.rotate(aimAngle)
    context.fillStyle = player.color
    context.beginPath()
    context.moveTo(-radius * 0.9, radius * 0.88)
    context.lineTo(0, -radius * 1.05)
    context.lineTo(radius * 0.9, radius * 0.88)
    context.closePath()
    context.fill()

    context.fillStyle = '#f3dbbc'
    context.beginPath()
    context.arc(0, -radius * 0.12, radius * 0.42, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = '#ffe596'
    context.beginPath()
    context.arc(radius * 0.78, 0, radius * 0.24, 0, Math.PI * 2)
    context.fill()
    context.restore()

    if (isSelf) {
      context.strokeStyle = 'rgba(255, 244, 181, 0.84)'
      context.lineWidth = 2.5
      context.beginPath()
      context.arc(screen.x, screen.y, radius * 1.45, 0, Math.PI * 2)
      context.stroke()
    }

    const healthRatio = clamp(player.hp / player.maxHp, 0, 1)
    context.fillStyle = 'rgba(25, 28, 23, 0.5)'
    context.fillRect(screen.x - radius, screen.y - radius - 14, radius * 2, 6)
    context.fillStyle = '#ffdb7b'
    context.fillRect(screen.x - radius, screen.y - radius - 14, radius * 2 * healthRatio, 6)
  }

  function drawOverlay(world) {
    if (!world.eventText) {
      return
    }

    const alpha = world.bannerMs > 0 ? Math.min(1, 0.24 + world.bannerMs / 1800) : 0.72
    context.fillStyle = `rgba(32, 42, 54, ${alpha})`
    const width = Math.min(canvas.width * 0.66, 560)
    const height = 56
    const x = (canvas.width - width) / 2
    const y = 20
    context.beginPath()
    context.roundRect(x, y, width, height, 18)
    context.fill()
    context.fillStyle = '#fff5d4'
    context.font = `600 ${Math.max(16, canvas.width * 0.014)}px Avenir Next`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(world.eventText, canvas.width / 2, y + height / 2)
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const x = (clientX - rect.left) * dpr
    const y = (clientY - rect.top) * dpr

    return {
      x: clamp((x - worldView.offsetX) / worldView.scale, 0, worldView.width),
      y: clamp((y - worldView.offsetY) / worldView.scale, 0, worldView.height)
    }
  }

  function render(snapshot, options = {}) {
    const world = snapshot?.world

    if (!world) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#e5f3ff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#33465c'
      context.font = `700 ${Math.max(20, canvas.width * 0.018)}px Avenir Next`
      context.textAlign = 'center'
      context.fillText(GAME_META.title, canvas.width / 2, canvas.height / 2 - 12)
      context.font = `500 ${Math.max(14, canvas.width * 0.012)}px Avenir Next`
      context.fillStyle = '#60788c'
      context.fillText('Connect to the shrine to begin.', canvas.width / 2, canvas.height / 2 + 18)
      return
    }

    updateView(world)
    ensureDecor(world.seed, world.width, world.height)
    drawGround(world)
    drawDecor()
    drawRelic(world)

    for (const beam of world.beams) {
      const owner = snapshot.players.find((player) => player.id === beam.ownerId)
      drawBeam(beam, owner?.color ?? '#ffd36b')
    }

    for (const beacon of world.beacons) {
      drawBeacon(beacon)
    }

    for (const defense of [...(world.defenses ?? [])].sort((left, right) => left.y - right.y)) {
      const owner = snapshot.players.find((player) => player.id === defense.ownerId)
      drawDefense(defense, owner?.color ?? '#b2e26f')
    }

    for (const pickup of world.pickups) {
      drawPickup(pickup)
    }

    for (const projectile of world.projectiles) {
      drawProjectile(projectile, false)
    }

    for (const projectile of world.enemyProjectiles) {
      drawProjectile(projectile, true)
    }

    for (const enemy of [...world.enemies].sort((left, right) => left.y - right.y)) {
      drawEnemy(enemy)
    }

    for (const player of [...snapshot.players].sort((left, right) => left.y - right.y)) {
      drawPlayer(player, player.id === options.selfId)
    }

    drawOverlay(world)
  }

  return {
    resize,
    render,
    screenToWorld
  }
}
