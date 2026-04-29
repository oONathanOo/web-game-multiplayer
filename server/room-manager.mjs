import { MAX_PLAYERS_PER_ROOM } from '../shared/constants.mjs'
import { buildRoomSnapshot, buildRoomState, createRoomGameState, createSpawnPoint, initializePlayerGameState, roomAllowsJoin, selectUpgradeForPlayer, tickRoomGame } from '../shared/game-sim.mjs'
import { createRoomId, normalizeRoomId, sanitizeNickname } from '../shared/protocol.mjs'

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
    const spawn = createSpawnPoint(rosterIndex, Math.max(room.maxPlayers, 1))
    const player = {
      id: playerId,
      nickname: sanitizeNickname(nickname),
      ready: false,
      lastSequence: 0,
      joinedAt: now(),
      color: room.palette[rosterIndex % room.palette.length]
    }

    initializePlayerGameState(player, spawn)
    return player
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
      palette: ['#f97316', '#10b981', '#2563eb', '#eab308', '#a855f7', '#ef4444', '#0ea5e9', '#84cc16'],
      players: new Map(),
      game: null
    }

    room.game = createRoomGameState(room.seed)

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

    if (!roomAllowsJoin(room)) {
      return {
        ok: false,
        code: 'match_in_progress',
        message: 'That room is already in the middle of a run.'
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

    player.input = input?.move
      ? {
          ...player.input,
          ...input
        }
      : {
          ...player.input,
          move: input
        }
    player.lastSequence = Number.isInteger(sequence) ? sequence : player.lastSequence
    return true
  }

  function selectUpgrade(playerId, upgradeId) {
    const roomId = playerRoomIndex.get(playerId)

    if (!roomId) {
      return false
    }

    const room = rooms.get(roomId)

    if (!room) {
      return false
    }

    return selectUpgradeForPlayer(room, playerId, upgradeId)
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
    return room ? buildRoomState(room) : null
  }

  function getRoomSnapshot(roomId) {
    const room = rooms.get(roomId)
    return room ? buildRoomSnapshot(room) : null
  }

  function getRoomSummaries() {
    return [...rooms.values()]
      .map((room) => ({
        roomId: room.roomId,
        createdAt: room.createdAt,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        openSlots: room.maxPlayers - room.players.size,
        phase: room.game.phase
      }))
      .sort((left, right) => left.roomId.localeCompare(right.roomId))
  }

  function getRoomIds() {
    return [...rooms.keys()]
  }

  function tick(deltaMs) {
    for (const room of rooms.values()) {
      room.tick += 1
      tickRoomGame(room, Math.max(0, Math.min(deltaMs, 250)), randomValue)
    }
  }

  return {
    createRoomForPlayer,
    joinRoom,
    leaveRoom,
    handleDisconnect,
    updatePlayerInput,
    selectUpgrade,
    setPlayerReady,
    getRoomIdForPlayer,
    getRoomState,
    getRoomSnapshot,
    getRoomSummaries,
    getRoomIds,
    tick
  }
}
