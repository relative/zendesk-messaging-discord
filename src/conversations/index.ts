import { User } from 'discord.js'
import { config } from '../env.ts'
import { fetch, FormData, type Response } from 'undici'
import { logger } from '../logger.ts'

// Strip the last character if its a '/'
if (config.ZD_CONVERSATIONS_ENDPOINT.endsWith('/'))
  config.ZD_CONVERSATIONS_ENDPOINT = config.ZD_CONVERSATIONS_ENDPOINT.slice(0, -1)

const buildUrl = (endpoint: string) =>
  (config.ZD_CONVERSATIONS_ENDPOINT + endpoint).replaceAll('{appId}', config.ZD_CONVERSATIONS_APP_ID)

export const kExternalIdPrefix = 'discord-'

// This function is asynchronous so you can make requests to a webserver/database
export const buildExternalId = async (user: User | string) =>
  kExternalIdPrefix + (typeof user === 'string' ? user : user.id)

type AllowedMethods = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export class SunshineError extends Error {
  status: number
  codes: Array<string>
  constructor(
    message: string,
    options: {
      cause?: string
      status: number
      codes?: Array<string>
    },
  ) {
    super(message, { cause: options.cause })
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
    this.status = options.status
    this.codes = options.codes ?? []
  }
}
async function sunshineRequest<T = unknown>(
  method: AllowedMethods,
  url: string,
  options: {
    errorMessage?: string
    body?: FormData | {}

    // If the errors array has **ANY** of these codes then an Error won't be thrown
    ignoredCodes?: Array<string>
  } = {},
): Promise<{
  res: Response
  json: T
}> {
  const body = options.body,
    bodyIsFormData = body instanceof FormData

  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa([config.ZD_CONVERSATIONS_KEY_ID, config.ZD_CONVERSATIONS_KEY_SECRET].join(':'))}`,
  }
  if (!['GET', 'HEAD'].includes(method) && body && !bodyIsFormData) {
    headers['Content-Type'] = 'application/json'
    // undici.fetch will add the 'multipart/form-data' Content-Type header with the boundary if its passed undici.FormData
  }
  const res = await fetch(buildUrl(url), {
    method,
    headers,
    body: bodyIsFormData ? body : JSON.stringify(body),
  })

  const untypedJson = (await res.json()) as any
  const json = untypedJson as T

  if (!res.ok) {
    const errors = untypedJson.errors,
      errorsIsArray = Array.isArray(errors)
    logger.warn('Error calling Sunshine Conversations API: %s', JSON.stringify(untypedJson))

    const ignoredCodes = options.ignoredCodes,
      ignoredCodesIsArray = Array.isArray(options.ignoredCodes)

    const codes: Array<string> = []
    let cause = ''

    if (errorsIsArray) {
      for (const error of errors) {
        cause += (error.title ?? error.code) + '\n'
        codes.push(error.code)
      }
    }

    if (
      !ignoredCodesIsArray ||
      (ignoredCodesIsArray && ignoredCodes!.every((ignoredCode) => !codes.includes(ignoredCode)))
    ) {
      throw new SunshineError(options.errorMessage ?? 'Unexpected error', {
        cause: cause,
        status: res.status,
        codes: codes,
      })
    }
  }

  return {
    res,
    json,
  }
}

//#region Sunshine types
/**
 * Sunshine metadata is limited to 4KB in size and can only house values of string, numbers, and booleans.
 */
export type SunshineMetadata = Record<string, string | number | boolean>
type SunshineParticipantWithUserExternalId = {
  userExternalId: string
  subscribeSDKClient?: boolean
}
type SunshineParticipantWithUserId = {
  userId: string
  subscribeSDKClient?: boolean
}
type SunshineParticipant = SunshineParticipantWithUserId | SunshineParticipantWithUserExternalId

export type SunshineUserData = {
  externalId: string
  signedUpAt?: string
  toBeRetained?: boolean
  profile?: {
    givenName?: string | null
    surname?: string | null
    email?: string | null
    avatarUrl?: string | null
    // BCP-47 format
    locale?: string | null
  }
  metadata?: SunshineMetadata
}
export type SunshineConversationData = {
  type: 'personal' | 'sdkGroup'
  participants: Array<SunshineParticipant>
  displayName?: string | null
  description?: string | null
  // jpg, png, or gif
  iconUrl?: string | null
  metadata?: SunshineMetadata
}

type SunshineSwitchboardIntegration = {
  id: string
  name: string
  integrationId: string
  integrationType: string
}
export type SunshineConversation = {
  id: string
  type: 'personal' | 'sdkGroup'
  metadata?: SunshineMetadata | null
  activeSwitchboardIntegration?: SunshineSwitchboardIntegration | null
  pendingSwitchboardIntegration?: SunshineSwitchboardIntegration | null
  isDefault: boolean
  displayName?: string | null
  description?: string | null
  iconUrl?: string | null
  // ISO-8601
  businessLastRead?: string | null
  // ISO-8601
  lastUpdatedAt?: string | null
  // ISO-8601
  createdAt?: string
}
type SunshineContentActionBuy = {
  type: 'buy'
  text: string
  /** Must be specified in cents */
  amount: number
  // ISO-4217 currency code, lowercase.
  currency?: string
  metadata?: SunshineMetadata | null
}
type SunshineContentActionLink = {
  type: 'link'
  uri: string
  text: string
  default?: boolean
  metadata?: SunshineMetadata | null
  extraChannelOptions?: {
    messenger?: {
      messenger_extensions?: boolean
      webview_share_button?: 'hide'
    }
  }
}
type SunshineContentActionLocationRequest = {
  type: 'locationRequest'
  text: string
  metadata?: SunshineMetadata | null
}
type SunshineContentActionPostback = {
  type: 'postback'
  text: string
  payload: string
  metadata?: SunshineMetadata | null
}
type SunshineContentActionReply = {
  type: 'reply'
  text: string
  payload: string
  metadata?: SunshineMetadata | null
  iconUrl?: string
}
type SunshineContentActionWebview = {
  type: 'webview'
  uri: string
  text: string
  default?: boolean
  metadata?: SunshineMetadata | null
  extraChannelOptions?: {
    messenger?: {
      messenger_extensions?: boolean
      webview_share_button?: 'hide'
    }
  }
  size?: 'compact' | 'tall' | 'full'
  fallback: string
  openOnReceive?: boolean
}
type SunshineContentAction =
  | SunshineContentActionBuy
  | SunshineContentActionLink
  | SunshineContentActionLocationRequest
  | SunshineContentActionPostback
  | SunshineContentActionReply
  | SunshineContentActionWebview

type SunshineContentText = {
  type: 'text'
  text: string
  actions?: Array<any>
  payload?: string
  metadata?: SunshineMetadata | null
}
type SunshineContentCarousel = {
  type: 'carousel'
  items: Array<{
    title: string
    description?: string
    mediaUrl?: string
    mediaType?: string
    altText?: string
    size?: 'compact' | 'large'
    actions?: Array<
      | SunshineContentActionBuy
      | SunshineContentActionLink
      | SunshineContentActionPostback
      | SunshineContentActionWebview
    >
    metadata?: SunshineMetadata | null
  }>
  displaySettings?: {
    imageAspectRatio: 'horizontal' | 'square'
  }
}
type SunshineContentFile = {
  type: 'file'
  mediaUrl: string
  altText?: string
  text?: string
  attachmentId?: string
}
type SunshineFormField = {
  type: 'email' | 'select' | 'text'
  name: string
  label: string
  text?: string
  email?: string
  select: Array<{}>
  placeholder?: string
  minSize?: number
  maxSize?: number
  options: Array<{ name: string; label: string }>
}
type SunshineContentForm = {
  type: 'form'
  blockChatInput?: boolean
  fields: Array<SunshineFormField>
}
type SunshineContentFormResponse = {
  type: 'formResponse'
  fields: Array<{
    type: 'email' | 'select' | 'text'
    name: string
    label: string
    text?: string
    email?: string
    select?: Array<any>
    quotedMessageId?: string
  }>
}
type SunshineContentImage = {
  type: 'image'
  mediaUrl: string
  altText?: string
  text?: string
  actions?: Array<SunshineContentAction>
  attachmentId?: string
}
type SunshineContentList = {
  type: 'list'
  items: Array<{
    title: string
    description?: string
    mediaUrl?: string
    // Mime Type
    mediaType?: string
    altText?: string
    size?: 'compact' | 'large'
    actions?: Array<
      | SunshineContentActionBuy
      | SunshineContentActionLink
      | SunshineContentActionPostback
      | SunshineContentActionWebview
    >
    metadata?: SunshineMetadata | null
  }>
  actions?: Array<
    SunshineContentActionBuy | SunshineContentActionLink | SunshineContentActionPostback | SunshineContentActionWebview
  >
}
type SunshineContentLocation = {
  type: 'location'
  coordinates: {
    lat: number
    long: number
  }
  location?: {
    name?: string
    address?: string
  }
}
type SunshineContentTemplate = {
  type: 'template'
  /**
   * @see https://docs.smooch.io/guide/whatsapp#sending-message-templates
   */
  template: any
}
export type SunshineAuthor = {
  type: 'business' | 'user'
  subtypes?: Array<'AI' | 'activity'>
  userId?: string
  userExternalId?: string
  displayName?: string
  avatarUrl?: string
}
export type SunshineContentType =
  | SunshineContentText
  | SunshineContentCarousel
  | SunshineContentFile
  | SunshineContentForm
  | SunshineContentFormResponse
  | SunshineContentImage
  | SunshineContentList
  | SunshineContentLocation
  | SunshineContentTemplate
export type SunshineMessageData = {
  author: SunshineAuthor
  content: SunshineContentType
  destination?: { integrationId: string } | { integrationType: string }
  metadata?: SunshineMetadata | null
  override?: any // unused here
  schema?: 'whatsapp'
}

//#endregion

export async function sunshineCreateUser(data: SunshineUserData) {
  const { res, json } = await sunshineRequest('POST', '/v2/apps/{appId}/users', {
    body: data,
    errorMessage: 'Failed to create user',
  })
  if (res.status === 201) {
    // Create a new default conversation that will stay unused for this external user
    await sunshineCreateConversation({
      type: 'personal',
      participants: [
        {
          userExternalId: data.externalId,
          subscribeSDKClient: false,
        },
      ],
    })
  }
  return res
}

export async function sunshineUpdateUser(data: SunshineUserData) {
  const { res, json } = await sunshineRequest(
    'PATCH',
    `/v2/apps/{appId}/users/${encodeURIComponent(data.externalId)}`,
    {
      body: data,
      errorMessage: 'Failed to update user',
    },
  )
  return res
}

export async function sunshineUpsertUser(data: SunshineUserData) {
  try {
    return await sunshineCreateUser(data)
  } catch (err) {
    if (err instanceof SunshineError) {
      if (err.codes.includes('conflict')) {
        return await sunshineUpdateUser(data)
      }
    }

    throw err
  }
}

/**
 * @param data
 * @returns Successful deletion
 */
export async function sunshineDeletePII(externalId: string) {
  const { res } = await sunshineRequest('DELETE', `/v2/apps/{appId}/users/${externalId}/personalinformation`, {
    errorMessage: 'Failed to remove PII',
  })
  return res.status === 200
}

export async function sunshineCreateConversation(data: SunshineConversationData) {
  const { res, json } = await sunshineRequest<{
    conversation: SunshineConversation
  }>('POST', '/v2/apps/{appId}/conversations', {
    body: data,
    errorMessage: 'Failed to create conversation',
  })
  return json.conversation
}

export async function sunshineUpdateConversation(
  conversationId: string,
  data: {
    displayName?: string | null
    description?: string | null
    iconUrl?: string | null
    metadata?: SunshineMetadata | null
  },
) {
  const { res, json } = await sunshineRequest<{ conversation: SunshineConversation }>(
    'PATCH',
    `/v2/apps/{appId}/conversations/${conversationId}`,
    {
      body: data,
      errorMessage: 'Failed to update conversation',
    },
  )
  return json.conversation
}

export async function sunshinePassControl(
  conversationId: string,
  data: {
    switchboardIntegration: 'next' | string
    metadata?: SunshineMetadata | null
  },
) {
  const { res } = await sunshineRequest('POST', `/v2/apps/{appId}/conversations/${conversationId}/passControl`, {
    body: data,
    errorMessage: 'Failed to pass control of conversation',
  })
  return res.status === 200
}

export async function sunshinePostMessage(conversationId: string, data: SunshineMessageData) {
  const { res, json } = await sunshineRequest('POST', `/v2/apps/{appId}/conversations/${conversationId}/messages`, {
    body: data,
    errorMessage: 'Failed to create message',
  })
  if (res.status !== 201) throw new Error("Couldn't create message")
  return json
}

export async function sunshinePostActivity(
  conversationId: string,
  data: {
    author: SunshineAuthor
    type: 'conversation:read' | 'typing:start' | 'typing:stop'
  },
) {
  const { res } = await sunshineRequest('POST', `/v2/apps/{appId}/conversations/${conversationId}/activity`, {
    body: data,
    errorMessage: 'Failed to post activity',
  })
  return res.status === 200
}

export async function sunshineListConversations(externalUserId: string) {
  const params = new URLSearchParams()
  params.set('page[size]', '100')
  params.set('filter[userExternalId]', externalUserId)
  const { res, json } = await sunshineRequest<{
    conversations: Array<SunshineConversation>
    meta: {
      hasMore: boolean
      afterCursor?: string
      beforeCursor?: string
    }
    links?: {
      prev?: string
      next?: string
    }
  }>('GET', `/v2/apps/{appId}/conversations?${params.toString()}`, {
    errorMessage: "Couldn't fetch conversations for user",
  })

  return json
}

export async function sunshineDeleteConversation(conversationId: string) {
  const { res } = await sunshineRequest('DELETE', `/v2/apps/{appId}/conversations/${conversationId}`, {
    errorMessage: 'Failed to delete conversation',
  })
  return res.ok
}

export async function sunshineUploadAttachment(conversationId: string, filename: string, file: Blob) {
  const query = new URLSearchParams()
  query.set('access', 'public')
  query.set('for', 'message')
  query.set('conversationId', conversationId)

  const form = new FormData()
  form.set('source', file, filename)

  const { res, json } = await sunshineRequest<{
    attachment: {
      mediaUrl: string
      mediaType: string
    }
  }>('POST', `/v2/apps/{appId}/attachments?${query.toString()}`, {
    body: form,
    errorMessage: `Couldn't upload attachment to Sunshine`,
  })

  return json.attachment
}
