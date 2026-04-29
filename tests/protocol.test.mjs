import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeInput, parseClientMessage, sanitizeNickname } from '../shared/protocol.mjs'

test('sanitizeNickname trims and falls back to a default name', () => {
  assert.equal(sanitizeNickname('   Nova   Warden   '), 'Nova Warden')
  assert.equal(sanitizeNickname(''), 'Warden')
  assert.equal(sanitizeNickname(null), 'Warden')
})

test('normalizeInput keeps diagonal movement normalized', () => {
  const input = normalizeInput({ x: 1, y: 1 })

  assert.equal(Number(input.x.toFixed(3)), 0.707)
  assert.equal(Number(input.y.toFixed(3)), 0.707)
})

test('parseClientMessage validates room joins and input payloads', () => {
  const joinResult = parseClientMessage(
    JSON.stringify({
      type: 'lobby:join-room',
      roomId: 'ab23',
      nickname: 'Scout'
    })
  )

  assert.equal(joinResult.ok, true)
  assert.equal(joinResult.message.roomId, 'AB23')
  assert.equal(joinResult.message.nickname, 'Scout')

  const inputResult = parseClientMessage(
    JSON.stringify({
      type: 'player:input',
      sequence: 4,
      input: { x: 3, y: 0 },
      aim: { x: 0, y: -8 },
      fire: true,
      deploy: true
    })
  )

  assert.equal(inputResult.ok, true)
  assert.equal(inputResult.message.sequence, 4)
  assert.deepEqual(inputResult.message.input.move, { x: 1, y: 0 })
  assert.deepEqual(inputResult.message.input.aim, { x: 0, y: -1 })
  assert.equal(inputResult.message.input.fire, true)
  assert.equal(inputResult.message.input.deploy, true)

  const upgradeResult = parseClientMessage(
    JSON.stringify({
      type: 'player:upgrade',
      upgradeId: 'quickhands'
    })
  )

  assert.equal(upgradeResult.ok, true)
  assert.equal(upgradeResult.message.upgradeId, 'quickhands')
})
