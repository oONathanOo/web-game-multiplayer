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
})

test('room manager applies authoritative movement on each tick', () => {
  const manager = createRoomManager({
    randomValue: () => 0.25,
    now: () => 1000
  })

  const created = manager.createRoomForPlayer({
    playerId: 'alpha',
    nickname: 'Alpha'
  })

  manager.updatePlayerInput('alpha', 2, { x: 1, y: 0 })
  manager.tick(100)

  const snapshot = manager.getRoomSnapshot(created.roomId)
  const player = snapshot.players.find((entry) => entry.id === 'alpha')

  assert.equal(snapshot.tick, 1)
  assert.equal(player.lastSequence, 2)
  assert.ok(player.x > 800)
})
