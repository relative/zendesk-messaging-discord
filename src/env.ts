import { z } from 'zod'

const zEnvObject = z.object({
  /**
   * Port for the incoming webhook server to listen on
   */
  PORT: z.string().default('3000'),

  /**
   * App id from https://discord.com/developers/applications
   */
  DISCORD_APP_ID: z.string(),
  /**
   * Bot token
   */
  DISCORD_BOT_TOKEN: z.string(),
  /**
   * What guild should the bot add its commands to
   */
  DISCORD_GUILD_ID: z.string(),
  /**
   * Where the channels for conversations should go
   */
  DISCORD_CATEGORY_ID: z.string(),
  /**
   * Define this to anything in your .env to skip adding commands to the guild
   */
  DISCORD_SKIP_COMMANDS: z.string().optional(),

  /**
   * 'https://<subdomain>.zendesk.com/sc'
   */
  ZD_CONVERSATIONS_ENDPOINT: z.string().url(),
  /**
   * https://<subdomain>.zendesk.com/admin/apps-integrations/apis/conversations-api
   */
  ZD_CONVERSATIONS_APP_ID: z.string(),
  ZD_CONVERSATIONS_KEY_ID: z.string(),
  ZD_CONVERSATIONS_KEY_SECRET: z.string(),

  /**
   * https://<subdomain>.zendesk.com/admin/apps-integrations/integrations/conversations-integrations/new
   */
  ZD_CONVERSATIONS_WEBHOOK_SECRET: z.string(),

  /**
   * https://<subdomain>.zendesk.com/admin/apps-integrations/apis/zendesk-api/settings/tokens
   */
  ZD_WEBHOOK_SECRET: z.string(),

  /**
   * For sending a Slack webhook when the bot disconnects/reconnects to Discord
   */
  SLACK_WEBHOOK: z.string().url().optional(),
})

export const config = await zEnvObject.parseAsync(process.env)
