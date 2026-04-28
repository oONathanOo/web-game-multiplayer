import { normalizeInput, normalizeRoomId, parseServerMessage, sanitizeNickname, stringifyMessage } from '/shared/protocol.mjs'

const nicknameInput = document.querySelector('#nickname')
const roomCodeInput = document.querySelector('#room-code')
const createRoomButton = document.querySelector('#create-room')
const joinRoomButton = document.querySelector('#join-room')
const leaveRoomButton = document.querySelector('#leave-room')
const toggleReadyButton = document.querySelector('#toggle-ready')
const copyInviteButton = document.querySelector('#copy-invite')
const roomListElement = document.querySelector('#room-list')
const rosterElement = document.querySelector('#roster')
const roomCountElement = document.querySelector('#room-count')
const currentRoomLabel = document.querySelector('#current-room-label')
const connectionStatusElement = document.querySelector('#connection-status')
const tickStatusElement = document.querySelector('#tick-status')
const playerStatusElement = document.querySelector('#player-status')
const hintTextElement = document.querySelector('#hint-text')
const inviteStatusElement = document.querySelector('#invite-status')
const canvas = document.querySelector('#world')
const context = canvas.getContext('2d')
const initialRoomId = normalizeRoomId(new URL(window.location.href).searchParams.get('room'))

const state = {
  socket: null,
  connected: false,
  playerId: null,
  nickname: localStorage.getItem('multiplayer-nickname') ?? 'Pilot',
  roomId: null,
  desiredRoomId: initialRoomId,
  room: null,
  rooms: [],
  snapshot: null,
  input: {
    left: false,
    right: false,
    up: false,
    down: false
  },
  inputSequence: 0,
  reconnectTimeoutId: null
}

nicknameInput.value = state.nickname
roomCodeInput.value = initialRoomId ?? ''

function logHint(message) {
  hintTextElement.textContent = message
}

function saveNickname() {
  state.nickname = sanitizeNickname(nicknameInput.value)
  nicknameInput.value = state.nickname
  localStorage.setItem('multiplayer-nickname', state.nickname)
}

function currentReady() {
  return Boolean(state.room?.players.find((player) => player.id === state.playerId)?.ready)
}

function currentInviteUrl(roomId = state.roomId) {
  if (!roomId) {
    return null
  }

  const url = new URL(window.location.href)
  url.searchParams.set('room', roomId)
  return url.toString()
}

function syncRoomUrl(roomId) {
  const url = new URL(window.location.href)

  if (roomId) {
    url.searchParams.set('room', roomId)
  } else {
    url.searchParams.delete('room')
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

function updateInviteUi() {
  const inviteUrl = currentInviteUrl()
  copyInviteButton.disabled = !inviteUrl
  inviteStatusElement.textContent = inviteUrl ?? 'Join or create a room to generate an invite link.'
}

function updateButtons() {
  const inRoom = Boolean(state.roomId)

  createRoomButton.disabled = !state.connected
  joinRoomButton.disabled = !state.connected
  leaveRoomButton.disabled = !state.connected || !inRoom
  toggleReadyButton.disabled = !state.connected || !inRoom
  toggleReadyButton.textContent = currentReady() ? 'Ready: On' : 'Ready: Off'
}

function updateStatus() {
  connectionStatusElement.textContent = state.connected ? 'Connected' : 'Reconnecting'
  playerStatusElement.textContent = state.playerId ? state.playerId.slice(0, 8) : 'Pending'
  tickStatusElement.textContent = String(state.snapshot?.tick ?? state.room?.tick ?? 0)
  currentRoomLabel.textContent = state.roomId ?? 'No Room'
  currentRoomLabel.classList.toggle('neutral', !state.roomId)
  updateButtons()
  updateInviteUi()
}

function renderRoomList() {
  roomCountElement.textContent = String(state.rooms.length)

  if (state.rooms.length === 0) {
    roomListElement.className = 'room-list empty-state'
    roomListElement.textContent = 'No rooms yet. Create the first one.'
    return
  }

  roomListElement.className = 'room-list'
  roomListElement.replaceChildren(
    ...state.rooms.map((room) => {
      const wrapper = document.createElement('div')
      wrapper.className = 'room-entry'

      const title = document.createElement('strong')
      title.textContent = room.roomId

      const meta = document.createElement('div')
      meta.className = 'room-meta'
      meta.textContent = `${room.playerCount}/${room.maxPlayers} players`

      const joinButton = document.createElement('button')
      joinButton.className = 'secondary'
      joinButton.textContent = 'Join'
      joinButton.disabled = !state.connected
      joinButton.addEventListener('click', () => {
        roomCodeInput.value = room.roomId
        joinRoom(room.roomId)
      })

      wrapper.append(title, meta, joinButton)
      return wrapper
    })
  )
}

function renderRoster() {
  if (!state.room) {
    rosterElement.className = 'roster empty-state'
    rosterElement.textContent = 'Join a room to see connected players.'
    return
  }

  rosterElement.className = 'roster'
  rosterElement.replaceChildren(
    ...state.room.players.map((player) => {
      const entry = document.createElement('div')
      entry.className = 'roster-entry'

      const name = document.createElement('strong')
      name.textContent = player.id === state.playerId ? `${player.nickname} (You)` : player.nickname
      name.style.color = player.color

      const meta = document.createElement('div')
      meta.className = 'roster-meta'
      meta.textContent = `${player.id.slice(0, 8)} • ${player.ready ? 'Ready' : 'Not ready'}`

      entry.append(name, meta)
      return entry
    })
  )
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(bounds.width * dpr)
  canvas.height = Math.floor(bounds.height * dpr)
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function renderWorld() {
  const width = canvas.clientWidth
  const height = canvas.clientHeight

  context.clearRect(0, 0, width, height)

  context.save()
  context.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  context.lineWidth = 1

  for (let x = 24; x < width; x += 24) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, height)
    context.stroke()
  }

  for (let y = 24; y < height; y += 24) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }

  const snapshot = state.snapshot

  if (!snapshot) {
    context.fillStyle = 'rgba(236, 247, 246, 0.72)'
    context.font = '600 18px "Avenir Next", "Gill Sans", sans-serif'
    context.textAlign = 'center'
    context.fillText('Join a room to stream the server state.', width / 2, height / 2)
    context.restore()
    return
  }

  const scale = Math.min(width / snapshot.world.width, height / snapshot.world.height)
  const offsetX = (width - snapshot.world.width * scale) / 2
  const offsetY = (height - snapshot.world.height * scale) / 2

  context.translate(offsetX, offsetY)
  context.scale(scale, scale)

  context.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  context.lineWidth = 4 / scale
  context.strokeRect(0, 0, snapshot.world.width, snapshot.world.height)

  for (const player of snapshot.players) {
    const isSelf = player.id === state.playerId

    context.beginPath()
    context.fillStyle = player.color
    context.arc(player.x, player.y, snapshot.world.playerRadius, 0, Math.PI * 2)
    context.fill()

    if (isSelf) {
      context.lineWidth = 4 / scale
      context.strokeStyle = '#f8fafc'
      context.stroke()
    }

    context.fillStyle = '#f8fafc'
    context.font = `${16 / scale}px "Avenir Next", "Gill Sans", sans-serif`
    context.textAlign = 'center'
    context.fillText(player.nickname, player.x, player.y - 28)
  }

  context.restore()
}

function loop() {
  renderWorld()
  requestAnimationFrame(loop)
}

async function copyInviteLink() {
  const inviteUrl = currentInviteUrl()

  if (!inviteUrl) {
    logHint('Create or join a room before copying an invite link.')
    return
  }

  try {
    await navigator.clipboard.writeText(inviteUrl)
    logHint(`Invite link copied for room ${state.roomId}.`)
  } catch {
    inviteStatusElement.textContent = inviteUrl
    logHint('Copy was blocked by the browser, so the invite link is shown in the panel.')
  }
}

function send(message) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return
  }

  state.socket.send(stringifyMessage(message))
}

function directionalInput() {
  const rawInput = {
    x: (state.input.right ? 1 : 0) - (state.input.left ? 1 : 0),
    y: (state.input.down ? 1 : 0) - (state.input.up ? 1 : 0)
  }

  return normalizeInput(rawInput)
}

function sendInput(force = false) {
  if (!state.connected || !state.roomId) {
    return
  }

  const input = directionalInput()

  if (!force && input.x === 0 && input.y === 0) {
    return
  }

  send({
    type: 'player:input',
    sequence: state.inputSequence,
    input
  })

  state.inputSequence += 1
}

function scheduleReconnect() {
  if (state.reconnectTimeoutId) {
    return
  }

  state.reconnectTimeoutId = window.setTimeout(() => {
    state.reconnectTimeoutId = null
    connect()
  }, 1200)
}

function connect() {
  if (state.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.socket.readyState)) {
    return
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`)

  state.socket = socket
  updateStatus()

  socket.addEventListener('open', () => {
    state.connected = true
    updateStatus()
    logHint('Connected. Create or join a room, then move with WASD or arrow keys.')

    if (state.desiredRoomId) {
      joinRoom(state.desiredRoomId)
    }
  })

  socket.addEventListener('close', () => {
    state.connected = false
    updateStatus()
    logHint('Connection dropped. Reconnecting automatically...')
    scheduleReconnect()
  })

  socket.addEventListener('message', (event) => {
    const parsed = parseServerMessage(event.data)

    if (!parsed.ok) {
      logHint(parsed.error)
      return
    }

    const message = parsed.message

    switch (message.type) {
      case 'connection:welcome':
        state.playerId = message.playerId
        updateStatus()
        return

      case 'lobby:rooms':
        state.rooms = message.rooms
        renderRoomList()
        return

      case 'room:joined':
        state.roomId = message.roomId
        state.desiredRoomId = message.roomId
        syncRoomUrl(message.roomId)
        updateStatus()
        roomCodeInput.value = message.roomId
        logHint(`Joined room ${message.roomId}.`)
        return

      case 'room:left':
        state.roomId = null
        state.desiredRoomId = null
        state.room = null
        state.snapshot = null
        syncRoomUrl(null)
        renderRoster()
        updateStatus()
        logHint('You left the room. Pick another or create a new one.')
        return

      case 'room:state':
        state.room = message.room
        state.roomId = message.room.roomId
        syncRoomUrl(message.room.roomId)
        renderRoster()
        updateStatus()
        return

      case 'game:snapshot':
        state.snapshot = message
        tickStatusElement.textContent = String(message.tick)
        return

      case 'room:error':
        logHint(message.message)
        return

      default:
        return
    }
  })
}

function createRoom() {
  saveNickname()
  send({
    type: 'lobby:create-room',
    nickname: state.nickname
  })
}

function joinRoom(explicitRoomId = roomCodeInput.value) {
  saveNickname()
  const roomId = normalizeRoomId(explicitRoomId)

  if (!roomId) {
    logHint('Room codes use 4 clear characters, like AB23.')
    return
  }

  state.desiredRoomId = roomId
  roomCodeInput.value = roomId

  send({
    type: 'lobby:join-room',
    roomId,
    nickname: state.nickname
  })
}

function leaveRoom() {
  send({ type: 'lobby:leave-room' })
}

function toggleReady() {
  send({
    type: 'player:ready',
    ready: !currentReady()
  })
}

function handleKeyChange(key, pressed) {
  if (key === 'ArrowLeft' || key.toLowerCase() === 'a') {
    state.input.left = pressed
  }

  if (key === 'ArrowRight' || key.toLowerCase() === 'd') {
    state.input.right = pressed
  }

  if (key === 'ArrowUp' || key.toLowerCase() === 'w') {
    state.input.up = pressed
  }

  if (key === 'ArrowDown' || key.toLowerCase() === 's') {
    state.input.down = pressed
  }

  sendInput(true)
}

createRoomButton.addEventListener('click', createRoom)
joinRoomButton.addEventListener('click', () => joinRoom())
leaveRoomButton.addEventListener('click', leaveRoom)
toggleReadyButton.addEventListener('click', toggleReady)
copyInviteButton.addEventListener('click', copyInviteLink)
nicknameInput.addEventListener('change', saveNickname)
roomCodeInput.addEventListener('input', () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase()
})
roomCodeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    joinRoom()
  }
})

window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return
  }

  handleKeyChange(event.key, true)
})

window.addEventListener('keyup', (event) => {
  handleKeyChange(event.key, false)
})

window.addEventListener('resize', resizeCanvas)

setInterval(() => sendInput(false), 1000 / 30)

if (initialRoomId) {
  logHint(`Invite link detected for room ${initialRoomId}. Connecting now...`)
}

resizeCanvas()
renderRoomList()
renderRoster()
updateStatus()
loop()
connect()
