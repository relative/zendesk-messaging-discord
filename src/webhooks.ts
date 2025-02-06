import http from 'node:http'
import { config } from './env.ts'
import { logger } from './logger.ts'
import {
  kExternalIdPrefix,
  sunshineDeleteConversation,
  sunshineListConversations,
  type SunshineAuthor,
  type SunshineContentType,
  type SunshineConversation,
  type SunshineMetadata,
} from './conversations/index.ts'
import { inspect } from 'node:util'
import { client } from './discord.ts'
import { createHmac } from 'node:crypto'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  OverwriteType,
  PermissionsBitField,
  type NewsChannel,
  type PrivateThreadChannel,
  type PublicThreadChannel,
  type StageChannel,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js'
import { ChannelDeleteTimeouts, kCancelDeleteButtonId } from './commands/webhookcommand.ts'
import { Msg } from './messages.ts'
import { parseTopic } from './commands/sendopenticket.ts'

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      resolve(Buffer.concat(chunks))
    })
  })
}

type SunshineWebhookType = 'conversation:message' | 'conversation:typing'
type SunshineMessage = {
  id: string
  received: string
  author: SunshineAuthor
  content: SunshineContentType
  source: {
    type: 'api' | 'sdk' | 'messenger' | string
    integrationId?: string | null
    originalMessageId?: string | null
    originalMessageTimestamp?: string | null
    client?: {
      id: string
      type:
        | 'apple'
        | 'gbm'
        | 'googlercs'
        | 'instagram'
        | 'kakao'
        | 'line'
        | 'mailgun'
        | 'messagebird'
        | 'messenger'
        | 'slackconnect'
        | 'sdk'
        | 'telegram'
        | 'twilio'
        | 'twitter'
        | 'viber'
        | 'wechat'
        | 'whatsapp'
        | string
      status: 'active' | 'blocked' | 'inactive' | 'pending'
      integrationId: string | null
      externalId: string | null
      lastSeen: string | null
      linkedAt: string | null
      displayName: string | null
      avatarUrl: string | null
      info: object | null
      raw: object | null
    }
    device?: {
      id: string
      type: 'android' | 'ios' | 'web'
      guid: string
      clientId: string
      status: 'active' | 'inactive'
      integrationId: string
      // ISO-8601
      lastSeen: string
      pushNotificationToken?: string | null
      info?: object | null
      appVersion?: string | null
    }
    campaign?: {
      id: string
    }
  }
  quotedMessage:
    | {
        type: 'message'
        message: SunshineMessage
      }
    | {
        type: 'externalMessageId'
        externalMessageId: string
      }
  metadata?: SunshineMetadata | null
}
type SunshineWebhookEnvelope = {
  app: { id: string }
  webhook: { id: string; version: 'v2' }
  events: Array<SunshineWebhookEvent>
}

type SunshineWebhookConvoMessage = {
  id: string
  type: 'conversation:message'
  // ISO8601
  createdAt: string
  payload: {
    conversation: SunshineConversation
    message: SunshineMessage
  }
}

// https://developer.zendesk.com/documentation/webhooks/verifying/#nodejs-verification-example
function isValidZendeskWebhookSignature(remoteSignature: string, body: string, timestamp: string) {
  const hmac = createHmac('sha256', config.ZD_WEBHOOK_SECRET)
  const localComputedSignature = hmac.update(timestamp + body).digest('base64')
  // return (
  // Buffer.compare(
  //   Buffer.from(signature),
  //   Buffer.from(sig),
  // ) === 0
  // )
  return remoteSignature === localComputedSignature
}

type SunshineWebhookEvent = SunshineWebhookConvoMessage /* | ... */

type ZendeskWebhookEventAssigned = {
  type: 'ticket:assigned'
  requesterId: string
  ticketId: string
  assigneeName: string
}
type ZendeskWebhookEventSolved = {
  type: 'ticket:solved'
  requesterId: string
  ticketId: string
}
type ZendeskWebhookEvent = ZendeskWebhookEventAssigned | ZendeskWebhookEventSolved

async function handleZendeskWebhook(req: http.IncomingMessage) {
  // https://developer.zendesk.com/documentation/webhooks/verifying/

  const body = await readBody(req)
  const signature = req.headers['x-zendesk-webhook-signature'],
    rawBody = body.toString(),
    timestamp = req.headers['x-zendesk-webhook-signature-timestamp']

  if (!signature || !rawBody || !timestamp) throw 400
  if (Array.isArray(signature) || Array.isArray(timestamp)) throw 400
  if (!isValidZendeskWebhookSignature(signature, rawBody, timestamp)) throw 401

  const data = JSON.parse(rawBody) as ZendeskWebhookEvent
  // console.log(inspect(data, false, 5000, true))

  // Dont handle events for tickets not related to Discord
  if (!data.requesterId.startsWith(kExternalIdPrefix)) throw 406
  const conversationList = await sunshineListConversations(data.requesterId)

  let effectiveChannel:
    | NewsChannel
    | StageChannel
    | TextChannel
    | PublicThreadChannel<boolean>
    | PrivateThreadChannel
    | VoiceChannel
    | null = null
  let effectiveConvo: SunshineConversation | null = null
  // Loop through conversations to find the active conversation with a discord channel that exists
  for (const convo of conversationList.conversations) {
    if (convo.isDefault) continue
    const channelId = convo.metadata?.discordChannel
    if (typeof channelId !== 'string') continue
    try {
      const channel = await client.channels.fetch(channelId)
      if (!channel) continue
      if (!channel.isSendable()) continue
      if (!channel.isTextBased()) continue
      if (channel.isDMBased()) continue
      effectiveChannel = channel
      effectiveConvo = convo
    } catch (err) {
      logger.warn(
        'in handleZendeskWebhook: Failed to fetch channel for convo %s/%s: %s',
        data.requesterId,
        convo.id,
        err,
      )
      continue
    }
  }

  if (!effectiveChannel || !effectiveConvo) throw 406

  if (data.type === 'ticket:assigned') {
    effectiveChannel.send({
      content: Msg.supportRequestAssigned(),
    })
  } else if (data.type === 'ticket:solved') {
    const cancelDeletionButton = new ButtonBuilder()
      .setCustomId(kCancelDeleteButtonId)
      .setLabel(Msg.cancel())
      .setStyle(ButtonStyle.Secondary)
    const row = new ActionRowBuilder().addComponents(cancelDeletionButton)

    effectiveChannel.send({
      content: Msg.supportRequestResolved(),
      // @ts-expect-error 😎
      components: [row],
    })
    let discordOwnerId = effectiveConvo.metadata?.discordOwner
    if (typeof discordOwnerId === 'string') {
      await effectiveChannel.edit({
        permissionOverwrites: [
          {
            type: OverwriteType.Member,
            id: discordOwnerId,
            allow: [PermissionsBitField.Flags.ViewChannel],
            deny: [PermissionsBitField.Flags.SendMessages],
          },
          {
            type: OverwriteType.Role,
            id: effectiveChannel.guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
        ],
      })
    }

    // Hope the bot doesn't crash while it's being deleted.
    // But it's recoverable later through the 'delete-old-conversations' button
    ChannelDeleteTimeouts.set(
      effectiveChannel.id,
      setTimeout(async () => {
        ChannelDeleteTimeouts.delete(effectiveChannel.id)
        await effectiveChannel.delete('Ticket was resolved on Zendesk')
        await sunshineDeleteConversation(effectiveConvo.id)
      }, 60_000),
    )
  }
}

function applyTransformsToMessageContent(
  content: string | undefined | null,
  {
    ownerUserId,
  }: {
    ownerUserId: string
  },
) {
  return (content ?? '').replaceAll(/@user/gi, `<@${ownerUserId}>`).replaceAll(/@customer/gi, `<@${ownerUserId}>`)
}

async function handleMessage(channel: NewsChannel | TextChannel, message: SunshineMessage) {
  const messageContent = message.content
  const tpl = parseTopic(channel.topic)
  if (!tpl) throw 400 // wtf
  const [_, ownerUserId] = tpl
  switch (messageContent.type) {
    case 'text': {
      const messageText = applyTransformsToMessageContent(messageContent.text, { ownerUserId })

      await channel.send({
        content: messageText,
      })
      break
    }
    case 'image':
    case 'file': {
      const messageText = applyTransformsToMessageContent(messageContent.text, { ownerUserId })
      await channel.send({
        content: `${messageText}\n${messageContent.mediaUrl}`,
      })
      break
    }
    default:
      logger.warn('Unsupported message of type %s was received', messageContent.type)
  }
}

async function handleConversationsWebhook(req: http.IncomingMessage) {
  if (req.headers['x-api-key'] !== config.ZD_CONVERSATIONS_WEBHOOK_SECRET) throw 401
  const body = await readBody(req)
  const data = JSON.parse(body.toString()) as SunshineWebhookEnvelope
  // console.log(inspect(data, false, 5000, true))

  for (const event of data.events) {
    if (event.type !== 'conversation:message') continue
    const discordChannelId = event.payload.conversation.metadata?.discordChannel

    // 406 = Dont retry webhook
    if (typeof discordChannelId !== 'string') throw 406

    const channel = await client.channels.fetch(discordChannelId)

    // this api sucks 🙁
    if (!channel?.isSendable()) throw 406
    if (!channel?.isTextBased()) throw 406
    if (channel.isThread()) throw 406
    if (channel.isVoiceBased()) throw 406
    if (channel.isDMBased()) throw 406

    if (event.payload.message.author.type !== 'business') throw 406
    if (event.payload.message.metadata?.discordHidden) throw 406
    await handleMessage(channel, event.payload.message)
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST') {
      if (req.url?.includes('/zd')) {
        await handleZendeskWebhook(req)
      } else {
        await handleConversationsWebhook(req)
      }
    }
    res.writeHead(200, 'Okay', {}).end()
  } catch (err) {
    let status = 500
    if (typeof err === 'number') status = err
    res.writeHead(status, 'Not okay', {}).end()
  }
})
export function startWebhookServer() {
  return new Promise((resolve) => {
    server.listen(parseInt(config.PORT, 10), () => {
      const addr = server.address()
      let listenedPort = ''
      if (typeof addr === 'string') {
        listenedPort = addr
      } else {
        listenedPort = addr?.port.toString() ?? '?'
      }
      logger.info('Webhook server is listening on %s', listenedPort)
      resolve(listenedPort)
    })
  })
}
