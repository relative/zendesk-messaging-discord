import {
  ActionRowBuilder,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
} from 'discord.js'
import { createCommand } from './index.ts'
import { Msg } from '../messages.ts'

export const kCancelDeleteButtonId = 'cancel-deletion'

// This only exists to handle button interactions from messages resulting from the ZD/Conversations webhook

export const ChannelDeleteTimeouts = new Map<string, NodeJS.Timeout>()

export default createCommand(
  {
    name: '',
    description: '',
    default_member_permissions: '0',
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
    type: ApplicationCommandType.ChatInput,
  },
  () => {},
  {
    buttons: {
      [kCancelDeleteButtonId]: async (interaction) => {
        if (!interaction.inGuild() || !interaction.guild) throw new Error('Missing guild')

        const { channelId } = interaction

        const timeoutId = ChannelDeleteTimeouts.get(channelId)
        if (typeof timeoutId !== 'undefined') {
          clearTimeout(timeoutId)
          ChannelDeleteTimeouts.delete(channelId)
        }

        await interaction.reply({
          content: Msg.supportRequestDeleteCancelled(),
          flags: 'Ephemeral',
        })
      },
    },
    ignoreCommand: true,
  },
)
