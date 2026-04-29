import {
  DEFAULT_NICKNAME,
  MAX_MESSAGE_BYTES,
  NETWORK_VERSION,
  ROOM_ID_ALPHABET,
  ROOM_ID_LENGTH
} from './constants.mjs'

const ROOM_ID_PATTERN = new RegExp(`^[${ROOM_ID_ALPHABET}]{${ROOM_ID_LENGTH}}$`)

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function sanitizeNickname(value) {
  if (typeof value !== 'string') {
    return DEFAULT_NICKNAME
  }

  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, 18)
  return trimmed || DEFAULT_NICKNAME
}

export function normalizeRoomId(value) {
  if (typeof value !== 'string') {
    return null
  }

  const roomId = value.trim().toUpperCase()
  return ROOM_ID_PATTERN.test(roomId) ? roomId : null
}

export function normalizeInput(value) {
  const x = Number.isFinite(value?.x) ? value.x : 0
  const y = Number.isFinite(value?.y) ? value.y : 0
  const magnitude = Math.hypot(x, y)

  if (magnitude <= 1) {
    return {
      x: clamp(x, -1, 1),
      y: clamp(y, -1, 1)
    }
  }

  return {
    x: x / magnitude,
    y: y / magnitude
  }
}

export function normalizeAim(value) {
  const normalized = normalizeInput(value)

  if (normalized.x === 0 && normalized.y === 0) {
    return { x: 1, y: 0 }
  }

  return normalized
}

export function createRoomId(randomValue = Math.random) {
  let roomId = ''

  for (let index = 0; index < ROOM_ID_LENGTH; index += 1) {
    const randomIndex = Math.floor(randomValue() * ROOM_ID_ALPHABET.length)
    roomId += ROOM_ID_ALPHABET[randomIndex]
  }

  return roomId
}

export function stringifyMessage(message) {
  return JSON.stringify(message)
}

export function parseServerMessage(raw) {
  try {
    const message = JSON.parse(raw)

    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return {
        ok: false,
        error: 'Server message is missing a valid type.'
      }
    }

    return {
      ok: true,
      message
    }
  } catch {
    return {
      ok: false,
      error: 'Server message was not valid JSON.'
    }
  }
}

export function parseClientMessage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) {
    return {
      ok: false,
      error: 'Client message is too large or not text.'
    }
  }

  let message

  try {
    message = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      error: 'Client message was not valid JSON.'
    }
  }

  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    return {
      ok: false,
      error: 'Client message is missing a valid type.'
    }
  }

  switch (message.type) {
    case 'lobby:create-room':
      return {
        ok: true,
        message: {
          type: message.type,
          nickname: sanitizeNickname(message.nickname)
        }
      }

    case 'lobby:join-room': {
      const roomId = normalizeRoomId(message.roomId)

      if (!roomId) {
        return {
          ok: false,
          error: 'Room IDs must be a 4-character multiplayer code.'
        }
      }

      return {
        ok: true,
        message: {
          type: message.type,
          roomId,
          nickname: sanitizeNickname(message.nickname)
        }
      }
    }

    case 'lobby:leave-room':
      return {
        ok: true,
        message: {
          type: message.type
        }
      }

    case 'player:ready':
      return {
        ok: true,
        message: {
          type: message.type,
          ready: Boolean(message.ready)
        }
      }

    case 'player:input':
      return {
        ok: true,
        message: {
          type: message.type,
          sequence: Number.isInteger(message.sequence) && message.sequence >= 0 ? message.sequence : 0,
          input: {
            move: normalizeInput(message.input),
            aim: normalizeAim(message.aim),
            fire: Boolean(message.fire),
            dash: Boolean(message.dash),
            beacon: Boolean(message.beacon),
            nova: Boolean(message.nova),
            deploy: Boolean(message.deploy)
          }
        }
      }

    case 'player:upgrade':
      return {
        ok: true,
        message: {
          type: message.type,
          upgradeId: typeof message.upgradeId === 'string' ? message.upgradeId.trim() : ''
        }
      }

    default:
      return {
        ok: false,
        error: `Unknown client message type: ${message.type}`
      }
  }
}

export const protocolInfo = {
  networkVersion: NETWORK_VERSION
}
