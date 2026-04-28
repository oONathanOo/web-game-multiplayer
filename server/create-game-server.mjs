import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'

import { TICK_MS } from '../shared/constants.mjs'
import { parseClientMessage, protocolInfo } from '../shared/protocol.mjs'
import { createRoomManager } from './room-manager.mjs'
import { createWebSocketConnection } from './websocket.mjs'

const clientRootUrl = new URL('../client/', import.meta.url)
const sharedRootUrl = new URL('../shared/', import.meta.url)

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8'
}

function createPlayerId() {
  return randomUUID().split('-')[0]
}

function safePathSegments(pathname) {
  return decodeURIComponent(pathname)
    .split('/')
    .filter(Boolean)
    .every((segment) => segment !== '..')
}

function resolveAssetUrl(pathname) {
  if (!safePathSegments(pathname)) {
    return null
  }

  if (pathname === '/') {
    return new URL('index.html', clientRootUrl)
  }

  if (pathname.startsWith('/client/')) {
    return new URL(pathname.slice('/client/'.length), clientRootUrl)
  }

  if (pathname.startsWith('/shared/')) {
    return new URL(pathname.slice('/shared/'.length), sharedRootUrl)
  }

  return null
}

async function serveFile(pathname, response, method = 'GET') {
  const assetUrl = resolveAssetUrl(pathname)

  if (!assetUrl) {
    response.statusCode = 404
    response.end('Not found')
    return
  }

  try {
    const content = await readFile(assetUrl)
    response.statusCode = 200
    response.setHeader('Content-Type', mimeTypes[extname(assetUrl.pathname)] ?? 'application/octet-stream')
    response.end(method === 'HEAD' ? undefined : content)
  } catch {
    response.statusCode = 404
    response.end('Not found')
  }
}

export function createGameServer(options = {}) {
  const port = options.port ?? 3000
  const host = options.host ?? '0.0.0.0'
  const roomManager = createRoomManager()
  const connections = new Map()
  const startedAt = Date.now()

  const httpServer = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (url.pathname === '/health') {
      const payload = JSON.stringify({
        ok: true,
        uptimeMs: Date.now() - startedAt,
        rooms: roomManager.getRoomSummaries().length,
        connections: connections.size
      })

      response.statusCode = 200
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(request.method === 'HEAD' ? undefined : payload)
      return
    }

    if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
      response.statusCode = 405
      response.end('Method not allowed')
      return
    }

    await serveFile(url.pathname, response, request.method ?? 'GET')
  })

  function sendToPlayer(playerId, message) {
    const connection = connections.get(playerId)
    connection?.socket.sendJson(message)
  }

  function sendRoomList(targetPlayerId = null) {
    const payload = {
      type: 'lobby:rooms',
      rooms: roomManager.getRoomSummaries()
    }

    if (targetPlayerId) {
      sendToPlayer(targetPlayerId, payload)
      return
    }

    for (const playerId of connections.keys()) {
      sendToPlayer(playerId, payload)
    }
  }

  function broadcastRoomState(roomId) {
    const roomState = roomManager.getRoomState(roomId)

    if (!roomState) {
      return
    }

    for (const player of roomState.players) {
      sendToPlayer(player.id, {
        type: 'room:state',
        room: roomState,
        selfId: player.id
      })
    }
  }

  function broadcastSnapshots() {
    for (const roomId of roomManager.getRoomIds()) {
      const snapshot = roomManager.getRoomSnapshot(roomId)

      if (!snapshot) {
        continue
      }

      const players = snapshot.players.map(({ lastSequence, ...player }) => player)

      for (const player of snapshot.players) {
        sendToPlayer(player.id, {
          type: 'game:snapshot',
          roomId: snapshot.roomId,
          tick: snapshot.tick,
          world: snapshot.world,
          players,
          selfId: player.id,
          acknowledgedSequence: player.lastSequence
        })
      }
    }
  }

  function syncTouchedRooms(touchedRoomIds) {
    const uniqueRoomIds = [...new Set(touchedRoomIds.filter(Boolean))]

    for (const roomId of uniqueRoomIds) {
      broadcastRoomState(roomId)
    }

    sendRoomList()
  }

  function handleDisconnect(playerId) {
    const leaveResult = roomManager.handleDisconnect(playerId)
    connections.delete(playerId)
    syncTouchedRooms(leaveResult.touchedRoomIds)
  }

  function handleClientMessage(playerId, rawMessage) {
    const parsed = parseClientMessage(rawMessage)

    if (!parsed.ok) {
      sendToPlayer(playerId, {
        type: 'room:error',
        code: 'bad_request',
        message: parsed.error
      })
      return
    }

    const connection = connections.get(playerId)

    if (!connection) {
      return
    }

    const message = parsed.message

    switch (message.type) {
      case 'lobby:create-room': {
        connection.nickname = message.nickname
        const result = roomManager.createRoomForPlayer({
          playerId,
          nickname: connection.nickname
        })

        sendToPlayer(playerId, {
          type: 'room:joined',
          roomId: result.roomId,
          source: 'create'
        })

        syncTouchedRooms(result.touchedRoomIds)
        return
      }

      case 'lobby:join-room': {
        connection.nickname = message.nickname
        const result = roomManager.joinRoom({
          playerId,
          nickname: connection.nickname,
          roomId: message.roomId
        })

        if (!result.ok) {
          sendToPlayer(playerId, {
            type: 'room:error',
            code: result.code,
            message: result.message
          })
          return
        }

        sendToPlayer(playerId, {
          type: 'room:joined',
          roomId: result.roomId,
          source: 'join'
        })

        syncTouchedRooms(result.touchedRoomIds)
        return
      }

      case 'lobby:leave-room': {
        const result = roomManager.leaveRoom(playerId)

        sendToPlayer(playerId, {
          type: 'room:left',
          previousRoomId: result.previousRoomId
        })

        syncTouchedRooms(result.touchedRoomIds)
        return
      }

      case 'player:ready': {
        const changed = roomManager.setPlayerReady(playerId, message.ready)

        if (!changed) {
          sendToPlayer(playerId, {
            type: 'room:error',
            code: 'not_in_room',
            message: 'Join a room before toggling ready state.'
          })
          return
        }

        const roomId = roomManager.getRoomIdForPlayer(playerId)

        if (roomId) {
          broadcastRoomState(roomId)
        }

        return
      }

      case 'player:input':
        roomManager.updatePlayerInput(playerId, message.sequence, message.input)
        return

      default:
        return
    }
  }

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    const playerId = createPlayerId()
    const websocket = createWebSocketConnection(request, socket, head, {
      onText: (text) => handleClientMessage(playerId, text),
      onClose: () => handleDisconnect(playerId),
      onError: (error) => {
        console.error(`WebSocket error for ${playerId}:`, error)
      }
    })

    if (!websocket) {
      return
    }

    connections.set(playerId, {
      id: playerId,
      nickname: `Pilot ${playerId.slice(0, 4)}`,
      socket: websocket
    })

    websocket.sendJson({
      type: 'connection:welcome',
      playerId,
      serverTime: Date.now(),
      tickRate: 1000 / TICK_MS,
      networkVersion: protocolInfo.networkVersion
    })

    sendRoomList(playerId)
  })

  let intervalHandle = null
  let lastTickAt = Date.now()

  async function start() {
    await new Promise((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(port, host, () => {
        httpServer.off('error', reject)
        resolve()
      })
    })

    intervalHandle = setInterval(() => {
      const now = Date.now()
      const deltaMs = now - lastTickAt
      lastTickAt = now
      roomManager.tick(deltaMs)
      broadcastSnapshots()
    }, TICK_MS)

    intervalHandle.unref?.()

    const address = httpServer.address()
    return {
      port: typeof address === 'object' && address ? address.port : port,
      host
    }
  }

  async function stop() {
    if (intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }

    for (const connection of connections.values()) {
      connection.socket.close(1001, 'Server shutting down')
    }

    await new Promise((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  return {
    start,
    stop,
    roomManager,
    httpServer
  }
}
