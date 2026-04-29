import test from 'node:test'
import assert from 'node:assert/strict'

import { createRoomManager } from '../server/room-manager.mjs'

test('room manager creates rooms, joins players, and updates summaries', () => {
  const manager = createRoomManager({
    randomValue: () => 0.15,
    now: () => 1000
  })

  const created = manager.createRoomForPlayer({
    playerId: 'alpha',
    nickname: 'Alpha'
  })

  assert.equal(created.ok, true)
  assert.equal(created.roomId.length, 4)
  assert.equal(manager.getRoomSummaries().length, 1)

  const joined = manager.joinRoom({
    playerId: 'beta',
    nickname: 'Beta',
    roomId: created.roomId
  })

  assert.equal(joined.ok, true)
  assert.equal(manager.getRoomState(created.roomId).playerCount, 2)
  assert.equal(manager.getRoomState(created.roomId).phase, 'lobby')
})

test('room manager starts a run after ready and applies authoritative movement', () => {
  const manager = createRoomManager({
    randomValue: () => 0.25,
    now: () => 1000
  })

  const created = manager.createRoomForPlayer({
    playerId: 'alpha',
    nickname: 'Alpha'
  })

  manager.setPlayerReady('alpha', true)

  for (let index = 0; index < 10; index += 1) {
    manager.tick(250)
  }

  let snapshot = manager.getRoomSnapshot(created.roomId)
  const startingX = snapshot.players.find((entry) => entry.id === 'alpha').x

  assert.equal(snapshot.world.phase, 'playing')

  manager.updatePlayerInput('alpha', 2, {
    move: { x: 1, y: 0 },
    aim: { x: 1, y: 0 },
    fire: false,
    dash: false,
    beacon: false,
    nova: false
  })
  manager.tick(100)

  snapshot = manager.getRoomSnapshot(created.roomId)
  const player = snapshot.players.find((entry) => entry.id === 'alpha')

  assert.equal(snapshot.tick, 11)
  assert.equal(player.lastSequence, 2)
  assert.ok(player.x > startingX)
})

test('room manager blocks late joins once a run has started', () => {
  const manager = createRoomManager({
    randomValue: () => 0.2,
    now: () => 1000
  })

  const created = manager.createRoomForPlayer({
    playerId: 'alpha',
    nickname: 'Alpha'
  })

  manager.setPlayerReady('alpha', true)

  for (let index = 0; index < 10; index += 1) {
    manager.tick(250)
  }

  const joined = manager.joinRoom({
    playerId: 'beta',
    nickname: 'Beta',
    roomId: created.roomId
  })

  assert.equal(joined.ok, false)
  assert.equal(joined.code, 'match_in_progress')
})
