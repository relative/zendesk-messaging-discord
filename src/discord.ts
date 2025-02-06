import { Client, REST, GatewayIntentBits, Routes } from 'discord.js'
import { config } from './env.ts'
import { logger } from './logger.ts'
import './commands/_listing.ts'
import { ButtonMap, CommandMap } from './commands/_listing.ts'
import { parseTopic } from './commands/sendopenticket.ts'
import {
  buildExternalId,
  type SunshineMessageData,
  sunshinePostActivity,
  sunshinePostMessage,
  sunshineUploadAttachment,
} from './conversations/index.ts'
import { request } from 'undici'
import { Msg } from './messages.ts'

export const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN)
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageTyping,
  ],
})

client.on('ready', (client) => {
  logger.info('Logged into Discord (user %s, id %s)', client.user.username, client.user.id)
})
client.on('interactionCreate', async (interaction) => {
  if (interaction.isUserContextMenuCommand() || interaction.isUserSelectMenu()) {
  } else if (interaction.isMessageContextMenuCommand()) {
  } else if (interaction.isChatInputCommand()) {
    const { commandName } = interaction
    const command = CommandMap.get(commandName)
    if (!command) return
    try {
      const result = await command.callback(interaction)
    } catch (err) {
      logger.warn('Command callback for %s failed %s', commandName, err)
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: Msg.callbackError(err),
          })
        } else {
          await interaction.reply({
            content: Msg.callbackError(err),
            flags: 'Ephemeral',
          })
        }
      }
    }
  } else if (interaction.isButton()) {
    const buttonId = interaction.customId
    if (!buttonId) return
    const callback = ButtonMap.get(buttonId)
    if (!callback) return
    try {
      const result = await callback(interaction)
    } catch (err) {
      logger.warn('Button callback for %s failed %s', buttonId, err)
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content: Msg.callbackError(err),
          })
        } else {
          await interaction.reply({
            content: Msg.callbackError(err),
            flags: 'Ephemeral',
          })
        }
      }
    }
  }
})

// Handler to send messages in support request channels to SC
client.on('messageCreate', async (message) => {
  if (!message.inGuild()) return

  const channel = message.channel
  if (channel.isThread()) return
  if (channel.isVoiceBased()) return
  const res = parseTopic(channel.topic)
  if (!res) return
  const [conversationId, ownerId] = res
  if (message.author.bot) return
  if (message.author.id !== ownerId) return

  const kMaxAttachmentSizeInMB = 50 * 1000 * 1000

  const messagesToSend: Array<SunshineMessageData> = [
    {
      author: {
        type: 'user',
        userExternalId: await buildExternalId(message.author),
        displayName: message.author.displayName,
      },
      content: {
        type: 'text',
        text: `${message.content}`,
      },
      metadata: {
        discordMessage: message.id,
      },
    },
  ]

  if (message.attachments.size) {
    for (const attachment of message.attachments.values()) {
      try {
        if (attachment.size > kMaxAttachmentSizeInMB) {
          return message.reply(Msg.exceeded50MBLimit())
        }
        const res = await fetch(attachment.url)
        const blob = await res.blob()
        const uploadedAttachment = await sunshineUploadAttachment(conversationId, attachment.name, blob)
        messagesToSend.push({
          // Copy author & metadata from the first message
          ...messagesToSend[0],
          content: {
            type: uploadedAttachment.mediaType.startsWith('image/') ? 'image' : 'file',
            mediaUrl: uploadedAttachment.mediaUrl,
          },
        })
      } catch (err) {
        void message.reply(Msg.failedToUpload(err))
      }
    }
  }

  // Send in order
  for (const queuedMessage of messagesToSend) {
    if (queuedMessage.content.type === 'text' && !queuedMessage.content.text) continue

    await sunshinePostMessage(conversationId, queuedMessage).then(null, (err) => {
      message.reply(Msg.messageFailedToSend())
    })
  }
})

if (config.SLACK_WEBHOOK) {
  client.on('ready', async (client) => {
    const payload = JSON.stringify({
      text: `Logged into Discord (user ${client.user.username}, id ${client.user.id})`,
    })
    const res = await request(config.SLACK_WEBHOOK!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    })
  })
}

export async function createDiscordCommands() {
  const body = []
  for (const e of CommandMap.values()) {
    if (e.ignoreCommand) body.push(e.command)
  }
  await rest.put(Routes.applicationGuildCommands(config.DISCORD_APP_ID, config.DISCORD_GUILD_ID), {
    body,
  })
}

export async function startDiscordBot() {
  await client.login(config.DISCORD_BOT_TOKEN)
}
