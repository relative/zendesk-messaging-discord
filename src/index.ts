import { createDiscordCommands, startDiscordBot } from './discord.ts'
import { config } from './env.ts'
import { startWebhookServer } from './webhooks.ts'

if (typeof config.DISCORD_SKIP_COMMANDS === 'undefined') {
  await createDiscordCommands()
}

await Promise.all([
  //
  startWebhookServer(),
  startDiscordBot(),
])
