import { EmbedBuilder } from 'discord.js'

export const Msg = {
  liveChatEmbed: () => {
    const builder = new EmbedBuilder()
    builder.setTitle('Live Chat')
    builder.setDescription('Click the button below to start a chat with the support team')
    builder.setColor(0x9580ff)
    return builder
  },
  startLiveChatButton: () => `📩 Start Live Chat`,

  // Display name for bot messages shown in agent worksapce
  botDisplayName: () => 'bot',

  supportRequestDeleteCancelled: () =>
    "Your chat history will remain, but you won't be able to reply. If you still need assistance, please create a new support request.",
  cancel: () => 'Cancel',
  supportRequestAssigned: () => 'Your support request was assigned to an agent',
  supportRequestResolved: () => 'Your support request was resolved and will be deleted in 60 seconds.',

  supportRequestChannelPrefix: () => `support-`,
  supportRequestTopic: () => `Support request`,
  supportRequestCreated: (channelId: string) => `Your support ticket was created <#${channelId}>`,
  supportRequestFirstMessage: () =>
    `We've got your support request! An agent will be with you soon. In the meantime, let us know the details of your issue so we can help you faster.`,
  closeRequest: () => 'Close Request',
  customerOpenedRequestAgentView: (displayName: string, username: string) =>
    `Customer ${displayName} (${username}) opens live chat via Discord`,
  customerClosedRequest: () => "The customer closed this support request. You won't be able to reply.",
  customerCloseExistingQuestion: () =>
    'You already have an open support request. Would you like to close it to start a new one?',
  unableToRemoveExistingRequests: () => 'Sorry, we were unable to remove your existing support requests.',

  exceeded50MBLimit: () =>
    "Your message and attachment(s) weren't sent to the support agent because they exceed the 50 MB limit.",

  callbackError: (err: any) => {
    return `An error occurred while running the callback for this command\n${err instanceof Error ? err.message : err}`
  },
  failedToUpload: (err?: any) => {
    return `Failed to upload your attachments: ${err instanceof Error ? err.cause : ''}`
  },
  messageFailedToSend: (err?: any) =>
    'Your message failed to send. Please try removing any attachments and sending again.',
}
