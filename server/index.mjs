import { createGameServer } from './create-game-server.mjs'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'
const gameServer = createGameServer({ port, host })

async function main() {
  const address = await gameServer.start()
  const displayHost = host === '0.0.0.0' ? 'localhost' : host
  console.log(`Sunshard Siege listening on http://${displayHost}:${address.port}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await gameServer.stop()
    process.exit(0)
  })
}
