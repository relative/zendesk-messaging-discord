import type {
  ApplicationCommandOptionAllowedChannelTypes,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  Interaction,
  InteractionContextType,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
  UserSelectMenuInteraction,
  ButtonInteraction,
} from 'discord.js'
type MaybePromise<T> = Promise<T> | PromiseLike<T> | T

interface ApplicationCommandOption {
  type: ApplicationCommandOptionType
  name: string
  description: string
  required?: boolean
  choices?: Array<ApplicationCommandOptionType>
  options?: Array<ApplicationCommandOption>
  channel_types?: Array<ApplicationCommandOptionAllowedChannelTypes>
  min_value?: number
  max_value?: number
  min_length?: number
  max_length?: number
  autocomplete?: boolean
}
interface ApplicationCommand<Type extends ApplicationCommandType = ApplicationCommandType> {
  name: string
  description: string
  options?: Array<ApplicationCommandOption>
  default_member_permissions?: string
  // dm_permissions?: boolean
  // default_permissions?: boolean
  integration_types?: Array<ApplicationIntegrationType>
  contexts?: Array<InteractionContextType>
  type: Type
  nsfw?: boolean
}

type Mapping = {
  [ApplicationCommandType.User]: UserContextMenuCommandInteraction | UserSelectMenuInteraction
  [ApplicationCommandType.Message]: MessageContextMenuCommandInteraction
  [ApplicationCommandType.ChatInput]: ChatInputCommandInteraction
  [ApplicationCommandType.PrimaryEntryPoint]: Interaction
}

type CallbackForType<Type extends ApplicationCommandType> = (interaction: Mapping[Type]) => MaybePromise<unknown>

export interface ZdmdCommand<Type extends ApplicationCommandType = ApplicationCommandType> {
  command: ApplicationCommand<Type>
  callback: CallbackForType<Type>
  buttons?: Record<string, ZdmdButtonCallback>
  ignoreCommand?: boolean
}
export type ZdmdButtonCallback = (interaction: ButtonInteraction) => MaybePromise<unknown>
export function createCommand<Type extends ApplicationCommandType>(
  command: ApplicationCommand<Type>,
  callback: CallbackForType<Type>,
  extra?: Omit<ZdmdCommand<Type>, 'command' | 'callback'>,
): ZdmdCommand {
  // @ts-ignore it's ok
  return {
    command,
    callback,
    ...extra,
  } as ZdmdCommand
}
