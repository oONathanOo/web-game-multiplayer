import { createHash } from 'node:crypto'

const SOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const payloadLength = payload.length

  if (payloadLength < 126) {
    return Buffer.concat([Buffer.from([0x80 | opcode, payloadLength]), payload])
  }

  if (payloadLength < 65_536) {
    const header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(payloadLength, 2)
    return Buffer.concat([header, payload])
  }

  const header = Buffer.alloc(10)
  header[0] = 0x80 | opcode
  header[1] = 127
  header.writeBigUInt64BE(BigInt(payloadLength), 2)
  return Buffer.concat([header, payload])
}

function decodeFrame(buffer) {
  if (buffer.length < 2) {
    return null
  }

  const firstByte = buffer[0]
  const secondByte = buffer[1]
  const fin = (firstByte & 0x80) !== 0
  const opcode = firstByte & 0x0f
  const masked = (secondByte & 0x80) !== 0
  let payloadLength = secondByte & 0x7f
  let offset = 2

  if (!fin) {
    throw new Error('Fragmented frames are not supported.')
  }

  if (payloadLength === 126) {
    if (buffer.length < 4) {
      return null
    }

    payloadLength = buffer.readUInt16BE(2)
    offset = 4
  } else if (payloadLength === 127) {
    if (buffer.length < 10) {
      return null
    }

    payloadLength = Number(buffer.readBigUInt64BE(2))
    offset = 10
  }

  const maskLength = masked ? 4 : 0

  if (buffer.length < offset + maskLength + payloadLength) {
    return null
  }

  const maskingKey = masked ? buffer.subarray(offset, offset + 4) : null
  offset += maskLength

  const rawPayload = buffer.subarray(offset, offset + payloadLength)
  const payload = Buffer.alloc(payloadLength)

  if (masked && maskingKey) {
    for (let index = 0; index < payloadLength; index += 1) {
      payload[index] = rawPayload[index] ^ maskingKey[index % 4]
    }
  } else {
    rawPayload.copy(payload)
  }

  return {
    opcode,
    payload,
    bytesConsumed: offset + payloadLength
  }
}

export function createWebSocketConnection(request, socket, head, handlers = {}) {
  const key = request.headers['sec-websocket-key']

  if (!key || request.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.destroy()
    return null
  }

  const acceptKey = createHash('sha1').update(`${key}${SOCKET_GUID}`).digest('base64')
  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n'
  ]

  socket.write(responseHeaders.join('\r\n'))

  let isOpen = true
  let buffered = Buffer.alloc(0)

  function cleanup(error = null) {
    if (!isOpen) {
      return
    }

    isOpen = false
    handlers.onClose?.(error)
  }

  function sendBuffer(buffer) {
    if (!isOpen) {
      return
    }

    socket.write(buffer)
  }

  const connection = {
    request,
    get isOpen() {
      return isOpen
    },
    sendText(text) {
      sendBuffer(encodeFrame(0x1, Buffer.from(String(text))))
    },
    sendJson(message) {
      sendBuffer(encodeFrame(0x1, Buffer.from(JSON.stringify(message))))
    },
    close(code = 1000, reason = '') {
      if (!isOpen) {
        return
      }

      const reasonBuffer = Buffer.from(reason).subarray(0, 123)
      const closeBuffer = Buffer.alloc(2 + reasonBuffer.length)
      closeBuffer.writeUInt16BE(code, 0)
      reasonBuffer.copy(closeBuffer, 2)
      sendBuffer(encodeFrame(0x8, closeBuffer))
      socket.end()
      cleanup()
    }
  }

  function processChunk(chunk) {
    buffered = Buffer.concat([buffered, chunk])

    while (buffered.length > 0) {
      const frame = decodeFrame(buffered)

      if (!frame) {
        return
      }

      buffered = buffered.subarray(frame.bytesConsumed)

      if (frame.opcode === 0x1) {
        handlers.onText?.(frame.payload.toString('utf8'), connection)
        continue
      }

      if (frame.opcode === 0x8) {
        connection.close()
        return
      }

      if (frame.opcode === 0x9) {
        sendBuffer(encodeFrame(0xA, frame.payload))
      }
    }
  }

  socket.on('data', (chunk) => {
    try {
      processChunk(chunk)
    } catch (error) {
      handlers.onError?.(error, connection)
      connection.close(1003, 'Protocol error')
    }
  })

  socket.on('error', (error) => {
    handlers.onError?.(error, connection)
    cleanup(error)
  })

  socket.on('close', () => cleanup())
  socket.on('end', () => cleanup())

  if (head && head.length > 0) {
    processChunk(head)
  }

  return connection
}
