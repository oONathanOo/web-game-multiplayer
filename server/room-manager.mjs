import {
  MAX_PLAYERS_PER_ROOM,
  PLAYER_COLORS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from '../shared/constants.mjs'
import { createRoomId, normalizeInput, normalizeRoomId, sanitizeNickname } from '../shared/protocol.mjs'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function createSpawnPoint(playerIndex) {
  const centerX = WORLD_WIDTH / 2
  const centerY = WORLD_HEIGHT / 2
  const radius = 180
  const angle = (Math.PI * 2 * playerIndex) / Math.max(MAX_PLAYERS_PER_ROOM, 1)

  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius
  }
}

function roomRoster(room) {
  return [...room.players.values()].map((player) => ({
    id: player.id,
    nickname: player.nickname,
    color: player.color,
    ready: player.ready,
    connected: true
  }))
}

export function createRoomManager(options = {}) {
  const now = options.now ?? (() => Date.now())
  const randomValue = options.randomValue ?? Math.random
  const rooms = new Map()
  const playerRoomIndex = new Map()

  function createUniqueRoomId() {
    let attempts = 0

    while (attempts < 64) {
      const roomId = createRoomId(randomValue)

      if (!rooms.has(roomId)) {
        return roomId
      }

      attempts += 1
    }

    throw new Error('Unable to create a unique room ID.')
  }

  function buildPlayer(playerId, nickname, room) {
    const rosterIndex = room.players.size
    const spawn = createSpawnPoint(rosterIndex)

    return {
      id: playerId,
      nickname: sanitizeNickname(nickname),
      color: PLAYER_COLORS[rosterIndex % PLAYER_COLORS.length],
      ready: false,
      input: { x: 0, y: 0 },
      lastSequence: 0,
      x: clamp(spawn.x, PLAYER_RADIUS, WORLD_WIDTH - PLAYER_RADIUS),
      y: clamp(spawn.y, PLAYER_RADIUS, WORLD_HEIGHT - PLAYER_RADIUS),
      joinedAt: now()
    }
  }

  function deleteRoomIfEmpty(roomId) {
    const room = rooms.get(roomId)

    if (room && room.players.size === 0) {
      rooms.delete(roomId)
      return true
    }

    return false
  }

  function leaveRoomInternal(playerId) {
    const currentRoomId = playerRoomIndex.get(playerId)

    if (!currentRoomId) {
      return {
        previousRoomId: null,
        touchedRoomIds: []
      }
    }

    const room = rooms.get(currentRoomId)
    playerRoomIndex.delete(playerId)

    if (!room) {
      return {
        previousRoomId: currentRoomId,
        touchedRoomIds: [currentRoomId]
      }
    }

    room.players.delete(playerId)
    deleteRoomIfEmpty(currentRoomId)

    return {
      previousRoomId: currentRoomId,
      touchedRoomIds: [currentRoomId]
    }
  }

  function createRoomForPlayer({ playerId, nickname }) {
    const leaveResult = leaveRoomInternal(playerId)
    const roomId = createUniqueRoomId()
    const createdAt = now()
    const room = {
      roomId,
      seed: Math.floor(randomValue() * 1_000_000),
      createdAt,
      tick: 0,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      players: new Map()
    }

    rooms.set(roomId, room)

    const player = buildPlayer(playerId, nickname, room)
    room.players.set(playerId, player)
    playerRoomIndex.set(playerId, roomId)

    return {
      ok: true,
      roomId,
      previousRoomId: leaveResult.previousRoomId,
      touchedRoomIds: [...leaveResult.touchedRoomIds, roomId]
    }
  }

  function joinRoom({ playerId, nickname, roomId }) {
    const normalizedRoomId = normalizeRoomId(roomId)

    if (!normalizedRoomId) {
      return {
        ok: false,
        code: 'invalid_room',
        message: 'That room code is not valid.'
      }
    }

    const room = rooms.get(normalizedRoomId)

    if (!room) {
      return {
        ok: false,
        code: 'room_not_found',
        message: 'That room does not exist yet.'
      }
    }

    if (room.players.size >= room.maxPlayers) {
      return {
        ok: false,
        code: 'room_full',
        message: 'That room is already full.'
      }
    }

    const leaveResult = leaveRoomInternal(playerId)
    const player = buildPlayer(playerId, nickname, room)

    room.players.set(playerId, player)
    playerRoomIndex.set(playerId, normalizedRoomId)

    return {
      ok: true,
      roomId: normalizedRoomId,
      previousRoomId: leaveResult.previousRoomId,
      touchedRoomIds: [...leaveResult.touchedRoomIds, normalizedRoomId]
    }
  }

  function leaveRoom(playerId) {
    return leaveRoomInternal(playerId)
  }

  function handleDisconnect(playerId) {
    return leaveRoomInternal(playerId)
  }

  function updatePlayerInput(playerId, sequence, input) {
    const roomId = playerRoomIndex.get(playerId)

    if (!roomId) {
      return false
    }

    const room = rooms.get(roomId)
    const player = room?.players.get(playerId)

    if (!player) {
      return false
    }

    player.input = normalizeInput(input)
    player.lastSequence = Number.isInteger(sequence) ? sequence : player.lastSequence
    return true
  }

  function setPlayerReady(playerId, ready) {
    const roomId = playerRoomIndex.get(playerId)

    if (!roomId) {
      return false
    }

    const room = rooms.get(roomId)
    const player = room?.players.get(playerId)

    if (!player) {
      return false
    }

    player.ready = Boolean(ready)
    return true
  }

  function getRoomIdForPlayer(playerId) {
    return playerRoomIndex.get(playerId) ?? null
  }

  function getRoomState(roomId) {
    const room = rooms.get(roomId)

    if (!room) {
      return null
    }

    return {
      roomId: room.roomId,
      createdAt: room.createdAt,
      seed: room.seed,
      tick: room.tick,
      maxPlayers: room.maxPlayers,
      playerCount: room.players.size,
      players: roomRoster(room)
    }
  }

  function getRoomSnapshot(roomId) {
    const room = rooms.get(roomId)

    if (!room) {
      return null
    }

    return {
      roomId: room.roomId,
      tick: room.tick,
      world: {
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        playerRadius: PLAYER_RADIUS
      },
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        nickname: player.nickname,
        color: player.color,
        ready: player.ready,
        x: Number(player.x.toFixed(2)),
        y: Number(player.y.toFixed(2)),
        lastSequence: player.lastSequence
      }))
    }
  }

  function getRoomSummaries() {
    return [...rooms.values()]
      .map((room) => ({
        roomId: room.roomId,
        createdAt: room.createdAt,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        openSlots: room.maxPlayers - room.players.size
      }))
      .sort((left, right) => left.roomId.localeCompare(right.roomId))
  }

  function getRoomIds() {
    return [...rooms.keys()]
  }

  function tick(deltaMs) {
    const deltaSeconds = Math.max(0, Math.min(deltaMs, 250)) / 1000

    for (const room of rooms.values()) {
      room.tick += 1

      for (const player of room.players.values()) {
        player.x = clamp(
          player.x + player.input.x * PLAYER_SPEED * deltaSeconds,
          PLAYER_RADIUS,
          WORLD_WIDTH - PLAYER_RADIUS
        )
        player.y = clamp(
          player.y + player.input.y * PLAYER_SPEED * deltaSeconds,
          PLAYER_RADIUS,
          WORLD_HEIGHT - PLAYER_RADIUS
        )
      }
    }
  }

  return {
    createRoomForPlayer,
    joinRoom,
    leaveRoom,
    handleDisconnect,
    updatePlayerInput,
    setPlayerReady,
    getRoomIdForPlayer,
    getRoomState,
    getRoomSnapshot,
    getRoomSummaries,
    getRoomIds,
    tick
  }
}
