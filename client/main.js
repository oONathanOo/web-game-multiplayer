import { GAME_META, RELIC_STATE, UPGRADE_DEFS } from '../shared/game-data.mjs'
import { normalizeInput, normalizeRoomId, sanitizeNickname } from '../shared/protocol.mjs'
import { createNetworkClient } from './network-client.mjs'
import { createArenaRenderer } from './render-game.mjs'

const NICKNAME_KEY = 'sunshard-siege-nickname'

const canvas = document.querySelector('#game-canvas')
const nicknameInput = document.querySelector('#nickname-input')
const roomCodeInput = document.querySelector('#room-code-input')
const createRoomButton = document.querySelector('#create-room-button')
const joinRoomButton = document.querySelector('#join-room-button')
const readyButton = document.querySelector('#ready-button')
const leaveRoomButton = document.querySelector('#leave-room-button')
const copyInviteButton = document.querySelector('#copy-invite-button')
const connectionBadge = document.querySelector('#connection-badge')
const statusLine = document.querySelector('#status-line')
const sessionPanel = document.querySelector('#session-panel')
const rosterPanel = document.querySelector('#roster-panel')
const infoPanel = document.querySelector('#info-panel')
const abilityBar = document.querySelector('#ability-bar')
const hudTop = document.querySelector('#hud-top')
const upgradeOverlay = document.querySelector('#upgrade-overlay')
const phaseOverlay = document.querySelector('#phase-overlay')

const renderer = createArenaRenderer(canvas)
const network = createNetworkClient({
  open: () => {
    state.connection = 'online'
    state.notice = 'Connected to the shrine network.'
    renderStaticUi()
  },
  close: () => {
    state.connection = 'offline'
    state.notice = 'Connection lost. Reconnecting...'
    state.snapshot = null
    renderStaticUi()
    window.setTimeout(() => network.connect(), 1200)
  },
  error: () => {
    state.notice = 'The shrine connection hit turbulence.'
    renderStaticUi()
  },
  protocolError: (error) => {
    state.notice = error
    renderStaticUi()
  },
  message: handleServerMessage
})

const state = {
  connection: 'connecting',
  selfId: null,
  currentRoomId: null,
  roomState: null,
  roomList: [],
  snapshot: null,
  notice: 'Awakening shrine relay...',
  inputSequence: 0,
  lastInputSendAt: 0,
  localInput: {
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    fire: false,
    dash: false,
    beacon: false,
    nova: false,
    deploy: false
  },
  keys: new Set(),
  pendingRoomFromUrl: normalizeRoomId(new URLSearchParams(window.location.search).get('room'))
}

const ABILITIES = [
  {
    key: 'Mouse',
    name: 'Sun Bolt',
    description: 'Hold to fire rapid shots.',
    cooldownField: 'fireCooldownMs',
    instant: true
  },
  {
    key: 'Space',
    name: 'Ash Dash',
    description: 'Dash and supercharge the relic tether.',
    cooldownField: 'dashCooldownMs'
  },
  {
    key: 'E',
    name: 'Relay Beacon',
    description: 'Drop a temporary anchor to redirect your tether.',
    cooldownField: 'beaconCooldownMs'
  },
  {
    key: 'Q',
    name: 'Star Nova',
    description: 'Blast nearby foes and pull in motes.',
    cooldownField: 'novaCooldownMs'
  },
  {
    key: 'R',
    name: 'Sun Spire',
    description: 'Plant an autonomous defense ahead of your aim.',
    cooldownField: 'defenseCooldownMs'
  }
]

function nickname() {
  return sanitizeNickname(nicknameInput.value)
}

function saveNickname() {
  const cleaned = nickname()
  nicknameInput.value = cleaned
  localStorage.setItem(NICKNAME_KEY, cleaned)
}

function currentPlayer() {
  return state.snapshot?.players.find((player) => player.id === state.selfId) ?? null
}

function currentPhase() {
  return state.snapshot?.world.phase ?? state.roomState?.phase ?? 'lobby'
}

function livingPlayerCount(players) {
  return players.filter((player) => player.alive !== false).length
}

function refreshAmbientNotice() {
  const world = state.snapshot?.world

  if (world?.phase === 'countdown') {
    state.notice = world.eventText || 'The shrine awakens...'
    return
  }

  if (world?.phase === 'intermission') {
    state.notice = world.eventText || 'Choose a blessing before the next wave.'
    return
  }

  if (world?.phase === 'playing') {
    const remaining = world.wave?.remainingSpawns ?? 0
    state.notice = `${world.wave?.name ?? 'Wave live'} • ${remaining} spawns still queued`
    return
  }

  if (world?.phase === 'victory' || world?.phase === 'defeat') {
    state.notice = world.eventText || state.notice
    return
  }

  if (state.roomState) {
    state.notice = 'Room open. Invite allies or launch a solo defense.'
    return
  }

  state.notice = 'Connected to the shrine network.'
}

function updateUrlRoom(roomId) {
  const url = new URL(window.location.href)

  if (roomId) {
    url.searchParams.set('room', roomId)
  } else {
    url.searchParams.delete('room')
  }

  history.replaceState({}, '', url)
}

function inviteLink(roomId) {
  const url = new URL(window.location.href)
  url.searchParams.set('room', roomId)
  return url.toString()
}

function setConnectionBadge() {
  if (!connectionBadge) {
    return
  }

  connectionBadge.dataset.state = state.connection
  connectionBadge.textContent =
    state.connection === 'online' ? 'Connected' : state.connection === 'offline' ? 'Reconnecting' : 'Connecting'
}

function send(message) {
  network.send(message)
}

function handleServerMessage(message) {
  switch (message.type) {
    case 'connection:welcome':
      state.selfId = message.playerId
      if (state.pendingRoomFromUrl) {
        joinRoom(state.pendingRoomFromUrl)
        state.pendingRoomFromUrl = null
      }
      break

    case 'lobby:rooms':
      state.roomList = message.rooms
      break

    case 'room:joined':
      state.currentRoomId = message.roomId
      state.notice = message.source === 'create' ? 'Room created. Invite allies or ready up.' : 'Joined the shrine party.'
      updateUrlRoom(message.roomId)
      break

    case 'room:left':
      state.currentRoomId = null
      state.roomState = null
      state.snapshot = null
      state.notice = 'Left the room.'
      updateUrlRoom(null)
      break

    case 'room:state':
      state.roomState = message.room
      state.currentRoomId = message.room.roomId
      if (!state.selfId) {
        state.selfId = message.selfId
      }
      if (!state.snapshot || currentPhase() === 'lobby') {
        refreshAmbientNotice()
      }
      break

    case 'game:snapshot':
      state.snapshot = message
      state.currentRoomId = message.roomId
      refreshAmbientNotice()
      break

    case 'room:error':
      state.notice = message.message
      break

    default:
      break
  }

  renderStaticUi()
}

function createRoom() {
  saveNickname()
  send({
    type: 'lobby:create-room',
    nickname: nickname()
  })
}

function joinRoom(roomId = roomCodeInput.value) {
  const normalized = normalizeRoomId(roomId)

  if (!normalized) {
    state.notice = 'Room codes are 4 characters.'
    renderStaticUi()
    return
  }

  saveNickname()
  roomCodeInput.value = normalized
  send({
    type: 'lobby:join-room',
    roomId: normalized,
    nickname: nickname()
  })
}

function toggleReady() {
  const self = state.roomState?.players.find((player) => player.id === state.selfId)
  send({
    type: 'player:ready',
    ready: !self?.ready
  })
}

function leaveRoom() {
  send({
    type: 'lobby:leave-room'
  })
}

function chooseUpgrade(upgradeId) {
  send({
    type: 'player:upgrade',
    upgradeId
  })
}

function readMovementVector() {
  let x = 0
  let y = 0

  if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) {
    x -= 1
  }
  if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) {
    x += 1
  }
  if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) {
    y -= 1
  }
  if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) {
    y += 1
  }

  return normalizeInput({ x, y })
}

function sendInputFrame(now) {
  if (!network.isOpen() || !state.currentRoomId) {
    return
  }

  if (now - state.lastInputSendAt < 40) {
    return
  }

  state.lastInputSendAt = now
  state.inputSequence += 1
  send({
    type: 'player:input',
    sequence: state.inputSequence,
    input: state.localInput.move,
    aim: state.localInput.aim,
    fire: state.localInput.fire,
    dash: state.localInput.dash,
    beacon: state.localInput.beacon,
    nova: state.localInput.nova,
    deploy: state.localInput.deploy
  })

  state.localInput.dash = false
  state.localInput.beacon = false
  state.localInput.nova = false
  state.localInput.deploy = false
}

function renderSessionPanel() {
  if (!sessionPanel) {
    return
  }

  const room = state.roomState
  const inRoom = Boolean(room)
  const phase = currentPhase()

  sessionPanel.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Session</p>
        <h2>${inRoom ? `Room ${room.roomId}` : 'Find a Room'}</h2>
      </div>
      ${inRoom ? `<span class="room-phase">${phase}</span>` : ''}
    </div>

    <div class="field-stack">
      <label class="field">
        <span>Warden Name</span>
        <input id="nickname-proxy" value="${nicknameInput.value}" placeholder="Your name" />
      </label>
      <label class="field">
        <span>Room Code</span>
        <input id="room-proxy" value="${roomCodeInput.value}" placeholder="AB23" />
      </label>
    </div>

    <div class="button-row">
      <button class="action-button primary" data-action="create-room">Create Room</button>
      <button class="action-button" data-action="join-room">Join</button>
    </div>

    ${
      inRoom
        ? `
          <div class="room-card">
            <div>
              <p class="mini-label">Invite Link</p>
              <strong>${inviteLink(room.roomId)}</strong>
            </div>
            <div class="button-row compact">
              <button class="action-button" data-action="copy-invite">Copy Invite</button>
              <button class="action-button ${phase === 'lobby' || phase === 'victory' || phase === 'defeat' ? 'primary' : ''}" data-action="toggle-ready">Ready</button>
              <button class="action-button danger" data-action="leave-room">Leave</button>
            </div>
          </div>
        `
        : `
          <div class="room-list">
            ${state.roomList.length ? state.roomList.map(renderRoomListItem).join('') : '<div class="room-empty">No active rooms yet. Create the first shrine party.</div>'}
          </div>
        `
    }
  `

  const nicknameProxy = sessionPanel.querySelector('#nickname-proxy')
  const roomProxy = sessionPanel.querySelector('#room-proxy')

  nicknameProxy?.addEventListener('change', (event) => {
    nicknameInput.value = event.target.value
    saveNickname()
    renderStaticUi()
  })

  roomProxy?.addEventListener('change', (event) => {
    roomCodeInput.value = event.target.value.toUpperCase()
  })
}

function renderRoomListItem(room) {
  return `
    <button class="room-list-item" data-room-code="${room.roomId}">
      <span>${room.roomId}</span>
      <span>${room.playerCount}/${room.maxPlayers}</span>
      <span>${room.phase}</span>
    </button>
  `
}

function renderRosterPanel() {
  if (!rosterPanel) {
    return
  }

  const players = state.snapshot?.players ?? state.roomState?.players ?? []

  rosterPanel.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Party</p>
        <h2>${players.length ? `${players.length} Wardens` : 'No Wardens Yet'}</h2>
      </div>
    </div>
    <div class="roster-list">
      ${
        players.length
          ? players
              .map(
                (player) => `
                  <div class="roster-card ${player.id === state.selfId ? 'is-self' : ''}">
                    <div class="roster-row">
                      <strong>${player.nickname}</strong>
                      <span class="roster-tag">${player.alive === false ? 'Down' : player.ready ? 'Ready' : 'Here'}</span>
                    </div>
                    <div class="roster-meta">
                      <span>Lv ${player.level ?? 1}</span>
                      <span>${player.hp ?? '--'}/${player.maxHp ?? '--'} HP</span>
                      <span>${player.score ?? 0} score</span>
                    </div>
                  </div>
                `
              )
              .join('')
          : '<div class="room-empty">Create or join a room to gather your party.</div>'
      }
    </div>
  `
}

function renderInfoPanel() {
  if (!infoPanel) {
    return
  }

  const world = state.snapshot?.world
  const players = state.snapshot?.players ?? state.roomState?.players ?? []
  const self = currentPlayer()
  const inspiration = `${GAME_META.inspiration} inspired`
  const remainingSpawns = world?.wave?.remainingSpawns ?? 0
  const alive = players.length ? `${livingPlayerCount(players)}/${players.length}` : '--'
  const blessings = self?.upgrades?.length ?? 0
  const spires = world?.defenses?.filter((defense) => defense.ownerId === state.selfId).length ?? 0

  infoPanel.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">Run Brief</p>
        <h2>${world?.wave?.name ?? GAME_META.title}</h2>
      </div>
    </div>

    <div class="info-copy">
      <p><strong>${GAME_META.genre}</strong> with a shared relic-defense objective and live co-op positioning.</p>
      <p>${inspiration}: fast readable combat, short escalating runs, and blessing-driven progression.</p>
      <p><strong>Unique twist:</strong> each warden drags a radiant tether back to the Sunshard relic or their beacon, burning enemies that cross it.</p>
    </div>

    <div class="info-stat-grid">
      <div class="info-stat-card">
        <span class="mini-label">Wardens Up</span>
        <strong>${alive}</strong>
      </div>
      <div class="info-stat-card">
        <span class="mini-label">Queued Spawns</span>
        <strong>${remainingSpawns}</strong>
      </div>
      <div class="info-stat-card">
        <span class="mini-label">Blessings</span>
        <strong>${blessings}</strong>
      </div>
      <div class="info-stat-card">
        <span class="mini-label">Sun Spires</span>
        <strong>${spires}</strong>
      </div>
    </div>

    <div class="info-block">
      <p class="mini-label">Controls</p>
      <div class="controls-grid">
        <span>WASD / Arrows</span><span>Move</span>
        <span>Mouse</span><span>Aim & fire</span>
        <span>Space</span><span>Dash</span>
        <span>E</span><span>Relay Beacon</span>
        <span>Q</span><span>Star Nova</span>
        <span>R</span><span>Sun Spire</span>
        <span>1 / 2 / 3</span><span>Pick blessing</span>
      </div>
    </div>
  `
}

function cooldownLabel(value, instant = false) {
  if (instant) {
    return value > 0 ? `${(value / 1000).toFixed(1)}s` : 'Ready'
  }

  return value > 0 ? `${Math.ceil(value / 100) / 10}s` : 'Ready'
}

function renderAbilityBar() {
  if (!abilityBar) {
    return
  }

  const self = currentPlayer()

  abilityBar.innerHTML = ABILITIES.map((ability) => {
    const cooldownValue = self?.[ability.cooldownField] ?? 0
    const ratio = ability.cooldownField === 'fireCooldownMs' ? Math.min(1, cooldownValue / 350) : Math.min(1, cooldownValue / 10000)

    return `
      <div class="ability-card ${cooldownValue <= 0 ? 'is-ready' : ''}">
        <div class="ability-top">
          <span class="ability-key">${ability.key}</span>
          <strong>${ability.name}</strong>
        </div>
        <p>${ability.description}</p>
        <div class="cooldown-track"><div class="cooldown-fill" style="transform:scaleX(${1 - ratio})"></div></div>
        <span class="ability-state">${cooldownLabel(cooldownValue, ability.instant)}</span>
      </div>
    `
  }).join('')
}

function renderHudTop() {
  if (!hudTop) {
    return
  }

  const world = state.snapshot?.world
  const self = currentPlayer()

  hudTop.innerHTML = `
    <div class="hud-card">
      <span class="mini-label">Relic</span>
      <strong>${world ? `${world.relic.hp}/${world.relic.maxHp}` : '--'}</strong>
    </div>
    <div class="hud-card">
      <span class="mini-label">Wave</span>
      <strong>${world ? `${world.wave.index}/${world.wave.total}` : '--'}</strong>
    </div>
    <div class="hud-card">
      <span class="mini-label">Level</span>
      <strong>${self?.level ?? 1}</strong>
    </div>
    <div class="hud-card">
      <span class="mini-label">Motes</span>
      <strong>${self?.motes ?? 0}</strong>
    </div>
    <div class="hud-card">
      <span class="mini-label">Kills</span>
      <strong>${world?.totals.kills ?? 0}</strong>
    </div>
  `
}

function renderUpgradeOverlay() {
  if (!upgradeOverlay) {
    return
  }

  const self = currentPlayer()
  const choices = self?.upgradeChoices ?? []

  if (!choices.length || state.snapshot?.world.phase !== 'intermission') {
    upgradeOverlay.classList.add('hidden')
    upgradeOverlay.innerHTML = ''
    return
  }

  upgradeOverlay.classList.remove('hidden')
  upgradeOverlay.innerHTML = `
    <div class="upgrade-card-shell">
      <p class="eyebrow">Blessing Draft</p>
      <h2>Choose One Boon Before The Next Assault</h2>
      <div class="upgrade-grid">
        ${choices
          .map((upgradeId, index) => {
            const upgrade = UPGRADE_DEFS[upgradeId]
            return `
              <button class="upgrade-option rarity-${upgrade.rarity}" data-upgrade-id="${upgradeId}">
                <span class="upgrade-index">${index + 1}</span>
                <strong>${upgrade.name}</strong>
                <span class="upgrade-rarity">${upgrade.rarity}</span>
                <p>${upgrade.description}</p>
              </button>
            `
          })
          .join('')}
      </div>
    </div>
  `
}

function renderPhaseOverlay() {
  if (!phaseOverlay) {
    return
  }

  const world = state.snapshot?.world
  const phase = world?.phase ?? currentPhase()
  const inRoom = Boolean(state.currentRoomId)

  if (!inRoom) {
    phaseOverlay.classList.remove('hidden')
    phaseOverlay.innerHTML = `
      <div class="phase-card">
        <p class="eyebrow">Multiplayer Shrine</p>
        <h2>${GAME_META.title}</h2>
        <p>Create a room, invite friends, or start a solo run while the rest of the party is offline.</p>
      </div>
    `
    return
  }

  if (phase === 'countdown') {
    phaseOverlay.classList.remove('hidden')
    phaseOverlay.innerHTML = `
      <div class="phase-card">
        <p class="eyebrow">Run Starting</p>
        <h2>${Math.max(1, Math.ceil((world?.countdownMs ?? 1000) / 1000))}</h2>
        <p>${world?.eventText ?? 'The shrine awakens...'}</p>
      </div>
    `
    return
  }

  if (phase === 'victory' || phase === 'defeat') {
    phaseOverlay.classList.remove('hidden')
    phaseOverlay.innerHTML = `
      <div class="phase-card">
        <p class="eyebrow">${phase === 'victory' ? 'Victory' : 'Defeat'}</p>
        <h2>${world?.eventText ?? ''}</h2>
        <p>When everyone is ready again, the next run will begin from wave one.</p>
      </div>
    `
    return
  }

  phaseOverlay.classList.add('hidden')
  phaseOverlay.innerHTML = ''
}

function renderStaticUi() {
  setConnectionBadge()

  if (statusLine) {
    statusLine.textContent = state.notice
  }

  renderSessionPanel()
  renderRosterPanel()
  renderInfoPanel()
  renderHudTop()
  renderAbilityBar()
  renderUpgradeOverlay()
  renderPhaseOverlay()
}

function syncPointerAim(clientX, clientY) {
  const self = currentPlayer()

  if (!self) {
    return
  }

  const pointer = renderer.screenToWorld(clientX, clientY)
  state.localInput.aim = normalizeInput({
    x: pointer.x - self.x,
    y: pointer.y - self.y
  })
}

function bindStaticEvents() {
  if (nicknameInput) {
    nicknameInput.value = localStorage.getItem(NICKNAME_KEY) || 'Warden'
  }

  nicknameInput?.addEventListener('change', () => {
    saveNickname()
    renderStaticUi()
  })

  roomCodeInput?.addEventListener('change', () => {
    roomCodeInput.value = roomCodeInput.value.toUpperCase()
  })

  createRoomButton?.addEventListener('click', createRoom)
  joinRoomButton?.addEventListener('click', () => joinRoom())
  readyButton?.addEventListener('click', toggleReady)
  leaveRoomButton?.addEventListener('click', leaveRoom)
  copyInviteButton?.addEventListener('click', async () => {
    if (!state.currentRoomId) {
      return
    }

    await navigator.clipboard.writeText(inviteLink(state.currentRoomId))
    state.notice = 'Invite link copied.'
    renderStaticUi()
  })

  sessionPanel?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action], [data-room-code]')

    if (!button) {
      return
    }

    if (button.dataset.roomCode) {
      joinRoom(button.dataset.roomCode)
      return
    }

    switch (button.dataset.action) {
      case 'create-room':
        createRoom()
        return
      case 'join-room':
        joinRoom(sessionPanel.querySelector('#room-proxy')?.value ?? roomCodeInput.value)
        return
      case 'copy-invite':
        if (state.currentRoomId) {
          await navigator.clipboard.writeText(inviteLink(state.currentRoomId))
          state.notice = 'Invite link copied.'
          renderStaticUi()
        }
        return
      case 'toggle-ready':
        toggleReady()
        return
      case 'leave-room':
        leaveRoom()
        return
      default:
        return
    }
  })

  upgradeOverlay?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-upgrade-id]')

    if (!button) {
      return
    }

    chooseUpgrade(button.dataset.upgradeId)
  })

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      return
    }

    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault()
    }

    state.keys.add(event.code)

    if (event.code === 'Space') {
      state.localInput.dash = true
    } else if (event.code === 'KeyE') {
      state.localInput.beacon = true
    } else if (event.code === 'KeyQ') {
      state.localInput.nova = true
    } else if (event.code === 'KeyR') {
      state.localInput.deploy = true
    } else if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
      const choiceIndex = Number(event.code.replace('Digit', '')) - 1
      const choice = currentPlayer()?.upgradeChoices?.[choiceIndex]
      if (choice) {
        chooseUpgrade(choice)
      }
    } else if (event.code === 'Enter' && state.currentRoomId) {
      toggleReady()
    }

    state.localInput.move = readMovementVector()
  })

  window.addEventListener('keyup', (event) => {
    state.keys.delete(event.code)

    state.localInput.move = readMovementVector()
  })

  canvas?.addEventListener('pointermove', (event) => {
    syncPointerAim(event.clientX, event.clientY)
  })

  canvas?.addEventListener('pointerdown', (event) => {
    state.localInput.fire = true
    syncPointerAim(event.clientX, event.clientY)
  })

  window.addEventListener('pointerup', () => {
    state.localInput.fire = false
  })
}

function animationFrame(now) {
  sendInputFrame(now)
  renderer.render(state.snapshot, { selfId: state.selfId })
  requestAnimationFrame(animationFrame)
}

const resizeObserver = new ResizeObserver(() => {
  renderer.resize()
  renderStaticUi()
})

bindStaticEvents()
renderer.resize()
resizeObserver.observe(canvas)
renderStaticUi()
network.connect()
requestAnimationFrame(animationFrame)
