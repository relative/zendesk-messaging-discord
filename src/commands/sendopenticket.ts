import {
  ActionRowBuilder,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  type Interaction,
  InteractionContextType,
  OverwriteType,
  PermissionsBitField,
} from 'discord.js'
import { createCommand } from './index.ts'
import { logger } from '../logger.ts'
import {
  buildExternalId,
  sunshineCreateConversation,
  sunshineUpsertUser,
  sunshineDeleteConversation,
  sunshineListConversations,
  sunshinePassControl,
  sunshinePostMessage,
  sunshineUpdateConversation,
} from '../conversations/index.ts'
import { config } from '../env.ts'
import { Msg } from '../messages.ts'

export const kCreateConversationButtonId = 'create-conversation'
export const kDeleteOldConversationsButtonId = 'delete-old-conversations'
const kAvatarOptions = { size: 256, forceStatic: true, extension: 'png' } as const

// probably should store this data somewhere other than Discord
type TopicPayload = [conversation: string, owner: string]
const kTopicSentinel = String.fromCharCode(8206).repeat(5)
export function buildTopic(data: TopicPayload) {
  let retn = kTopicSentinel + JSON.stringify(data)
  if (retn.length > 800) {
    throw new Error('Channel topics have a maximum length of 1024')
  }
  return retn
}
export function parseTopic(topic?: string | null): TopicPayload | undefined {
  if (!topic) return undefined
  const idx = topic.indexOf(kTopicSentinel)
  if (idx === -1) return undefined
  return JSON.parse(topic.substring(idx + kTopicSentinel.length))
}

/**
 * Creates a conversation on ZD and passes it to agent workspace to create a ticket.
 * Expects that the interaction has a deferred reply sent already.
 * @param interaction
 * @returns
 */
export async function zdmdCreateConversation(interaction: Interaction) {
  if (!interaction.inGuild() || !interaction.guild) return false
  const externalId = await buildExternalId(interaction.user.id)

  await sunshineUpsertUser({
    externalId,
    signedUpAt: new Date().toISOString(),
    toBeRetained: true,
    profile: {
      givenName: interaction.user.displayName,
      surname: null,
      avatarUrl: interaction.user.displayAvatarURL(kAvatarOptions),
    },
    metadata: {
      discordId: interaction.user.id,
      discordUsername: interaction.user.username,
    },
  })

  const listConvoRes = await sunshineListConversations(externalId)
  const filteredConvoList = listConvoRes.conversations.filter((i) => !i.isDefault && i.metadata?.discordChannel)

  if (filteredConvoList.length) {
    if (interaction.isRepliable()) {
      const deleteOldTicketsButton = new ButtonBuilder()
        .setCustomId(kDeleteOldConversationsButtonId)
        .setLabel(Msg.closeRequest())
        .setStyle(ButtonStyle.Danger)
      const row = new ActionRowBuilder().addComponents(deleteOldTicketsButton)

      await interaction.editReply({
        content: Msg.customerCloseExistingQuestion(),
        // @ts-expect-error 😎
        components: [row],
      })
    }
    return false
  }

  const conversation = await sunshineCreateConversation({
    type: 'personal',
    participants: [{ userExternalId: externalId }],
    metadata: {
      discordOwner: interaction.user.id,
      discordChannel: '',
    },
  })

  const newChannel = await interaction.guild.channels.create({
    name: `${Msg.supportRequestChannelPrefix()}${interaction.user.username}`,
    parent: config.DISCORD_CATEGORY_ID,
    topic: `${Msg.supportRequestTopic()}\n\n${buildTopic([conversation.id, interaction.user.id])}`,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel],
        type: OverwriteType.Role,
      },
      // We explicitly don't add the user yet
    ],
    reason: `Create channel for conversation ${conversation.id}`,
  })

  const updatedConvo = await sunshineUpdateConversation(conversation.id, {
    metadata: {
      discordChannel: newChannel.id,
    },
  })

  await sunshinePostMessage(updatedConvo.id, {
    author: {
      type: 'business',
      displayName: Msg.botDisplayName(),
    },
    content: {
      type: 'text',
      text: Msg.customerOpenedRequestAgentView(interaction.user.displayName, interaction.user.username),
    },
    metadata: {
      discordHidden: true,
    },
  })

  // pass control to zd:agentWorkspace to open a new support request
  await sunshinePassControl(updatedConvo.id, {
    switchboardIntegration: 'next',
  })

  await newChannel.permissionOverwrites.edit(
    interaction.user,
    {
      ViewChannel: true,
    },
    { reason: `Finished creating ${conversation.id}` },
  )

  if (interaction.isRepliable()) {
    await interaction.editReply({
      content: Msg.supportRequestCreated(newChannel.id),
    })
  }
  await newChannel.send(Msg.supportRequestFirstMessage())
  return true
}

export default createCommand(
  {
    name: 'sendopenticket',
    description: 'Send open ticket embed to channel',
    default_member_permissions: '0',
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
    type: ApplicationCommandType.ChatInput,
  },
  async (interaction) => {
    if (interaction.channel?.isSendable()) {
      const startLiveChatButton = new ButtonBuilder()
        .setCustomId(kCreateConversationButtonId)
        .setLabel(Msg.startLiveChatButton())
        .setStyle(ButtonStyle.Primary)
      const row = new ActionRowBuilder().addComponents(startLiveChatButton)
      interaction.channel.send({
        embeds: [Msg.liveChatEmbed()],
        // @ts-expect-error okay
        components: [row],
      })
    }
    return interaction.reply({
      content: 'Sent the embed to the current channel',
      flags: 'Ephemeral',
    })
  },
  {
    buttons: {
      [kCreateConversationButtonId]: async (interaction) => {
        if (!interaction.inGuild() || !interaction.guild) throw new Error('Missing guild')

        await interaction.deferReply({ flags: 'Ephemeral' })
        await zdmdCreateConversation(interaction)
      },
      [kDeleteOldConversationsButtonId]: async (interaction) => {
        if (!interaction.inGuild() || !interaction.guild) throw new Error('Missing guild')

        try {
          // Defer reply so the interaction doesn't timeout in 3 seconds
          await interaction.deferReply({ flags: 'Ephemeral' })

          const externalId = await buildExternalId(interaction.user.id)
          const listConvoRes = await sunshineListConversations(externalId)
          const filteredConvoList = listConvoRes.conversations.filter((i) => !i.isDefault && i.metadata?.discordChannel)

          for (const convo of filteredConvoList) {
            if (!convo.metadata) continue
            const discordChannelId = convo.metadata.discordChannel
            if (typeof discordChannelId !== 'string') continue

            // why does Channels.fetch return Channel | null if it throws an error if it cant find it
            const channel = await interaction.client.channels
              .fetch(discordChannelId)
              .then(null, (err) =>
                logger.warn('error fetching channel %s for conversation %s: %s', discordChannelId, convo.id, err),
              )
            if (channel) {
              await channel
                .delete(`Customer requested deletion of existing conversations`)
                .then(null, (err) =>
                  logger.warn('error deleting channel %s for conversation %s: %s', discordChannelId, convo.id, err),
                )
            }
            await sunshinePostMessage(convo.id, {
              author: {
                type: 'business',
                displayName: Msg.botDisplayName(),
              },
              content: {
                type: 'text',
                text: Msg.customerClosedRequest(),
              },
              metadata: {
                discordHidden: true,
              },
            })
            await sunshineDeleteConversation(convo.id).then(null, (err) =>
              logger.warn('Error deleting conversation %s in sunshine: %s', convo.id, err),
            )
          }
        } catch (err) {
          console.error(err)
          return interaction.editReply({
            content: Msg.unableToRemoveExistingRequests(),
          })
        }

        await zdmdCreateConversation(interaction)
      },
    },
  },
)
