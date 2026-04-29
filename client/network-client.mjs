import { parseServerMessage, stringifyMessage } from '../shared/protocol.mjs'

function createSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export function createNetworkClient(callbacks = {}) {
  let socket = null

  function emit(name, payload) {
    callbacks[name]?.(payload)
  }

  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    socket = new WebSocket(createSocketUrl())

    socket.addEventListener('open', () => {
      emit('open')
    })

    socket.addEventListener('close', () => {
      emit('close')
    })

    socket.addEventListener('error', (error) => {
      emit('error', error)
    })

    socket.addEventListener('message', (event) => {
      const parsed = parseServerMessage(event.data)

      if (!parsed.ok) {
        emit('protocolError', parsed.error)
        return
      }

      emit('message', parsed.message)
    })
  }

  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false
    }

    socket.send(stringifyMessage(message))
    return true
  }

  function disconnect() {
    socket?.close()
    socket = null
  }

  return {
    connect,
    disconnect,
    send,
    isOpen: () => socket?.readyState === WebSocket.OPEN
  }
}
