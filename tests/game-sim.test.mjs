import test from 'node:test'
import assert from 'node:assert/strict'

import { MATCH_RULES } from '../shared/game-data.mjs'
import { buildRoomSnapshot, createRoomGameState, createSpawnPoint, initializePlayerGameState, selectUpgradeForPlayer, tickRoomGame } from '../shared/game-sim.mjs'

test('upgrade selection applies a blessing and appears in snapshots', () => {
  const room = {
    roomId: 'AB23',
    seed: 12345,
    createdAt: 0,
    tick: 0,
    players: new Map(),
    game: createRoomGameState(12345)
  }

  const player = {
    id: 'alpha',
    nickname: 'Alpha',
    color: '#ffffff',
    ready: false,
    lastSequence: 0
  }

  initializePlayerGameState(player, createSpawnPoint(0, 1))
  player.upgradeChoices = ['quickhands']
  room.players.set(player.id, player)
  room.game.phase = 'intermission'

  const changed = selectUpgradeForPlayer(room, 'alpha', 'quickhands')

  assert.equal(changed, true)
  assert.equal(player.level, 2)
  assert.equal(player.upgradeChoices.length, 0)
  assert.ok(player.stats.fireRateMs < 250)

  const snapshot = buildRoomSnapshot(room)

  assert.equal(snapshot.players[0].level, 2)
  assert.deepEqual(snapshot.players[0].upgrades, ['quickhands'])
})

test('runs enter intermission and auto-pick a blessing when time expires', () => {
  const room = {
    roomId: 'AB23',
    seed: 12345,
    createdAt: 0,
    tick: 0,
    players: new Map(),
    game: createRoomGameState(12345)
  }

  const player = {
    id: 'alpha',
    nickname: 'Alpha',
    color: '#ffffff',
    ready: true,
    lastSequence: 0
  }

  initializePlayerGameState(player, createSpawnPoint(0, 1))
  room.players.set(player.id, player)
  room.game.phase = 'playing'
  room.game.waveIndex = 0
  room.game.waveSpawnQueue = []

  tickRoomGame(room, MATCH_RULES.clearDelayMs + 50, () => 0)

  assert.equal(room.game.phase, 'intermission')
  assert.equal(player.upgradeChoices.length, 3)

  tickRoomGame(room, MATCH_RULES.intermissionMs + 50, () => 0)

  assert.equal(room.game.phase, 'playing')
  assert.equal(player.upgrades.length, 1)
  assert.equal(player.upgradeChoices.length, 0)
  assert.equal(room.game.waveIndex, 1)
})

test('deploying a Sun Spire adds a placeable defense to the snapshot', () => {
  const room = {
    roomId: 'AB23',
    seed: 12345,
    createdAt: 0,
    tick: 0,
    players: new Map(),
    game: createRoomGameState(12345)
  }

  const player = {
    id: 'alpha',
    nickname: 'Alpha',
    color: '#ffffff',
    ready: true,
    lastSequence: 0
  }

  initializePlayerGameState(player, createSpawnPoint(0, 1))
  player.input.deploy = true
  player.input.aim = { x: 1, y: 0 }
  room.players.set(player.id, player)
  room.game.phase = 'playing'
  room.game.waveIndex = 0

  tickRoomGame(room, 100, () => 0.5)

  const snapshot = buildRoomSnapshot(room)

  assert.equal(room.game.defenses.length, 1)
  assert.equal(snapshot.world.defenses.length, 1)
  assert.equal(snapshot.players[0].defenseCooldownMs > 0, true)
})
