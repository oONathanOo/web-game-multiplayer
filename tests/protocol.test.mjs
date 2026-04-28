import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeInput, parseClientMessage, sanitizeNickname } from '../shared/protocol.mjs'

test('sanitizeNickname trims and falls back to a default name', () => {
  assert.equal(sanitizeNickname('   Nova   Pilot   '), 'Nova Pilot')
  assert.equal(sanitizeNickname(''), 'Pilot')
  assert.equal(sanitizeNickname(null), 'Pilot')
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
      input: { x: 3, y: 0 }
    })
  )

  assert.equal(inputResult.ok, true)
  assert.equal(inputResult.message.sequence, 4)
  assert.deepEqual(inputResult.message.input, { x: 1, y: 0 })
})
