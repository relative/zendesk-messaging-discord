## zendesk-messaging-discord

Zendesk messaging live chat for customers in Discord

## Issues

Please report any **SECURITY** issues to the email listed on [my website](https://relative.im). No installation support will be provided on the GitHub issue tracker.

## Authenticating customers based on identities other than Discord

The user's external ID is created based on their Discord user ID, however you can replace the `buildExternalId` function in [src/conversations/index.ts](src/conversations/index.ts) to return a new external user ID that matches the authenticated profile used in your Web Widget. See [Authenticating end users for messaging](https://support.zendesk.com/hc/en-us/articles/4411666638746-Authenticating-end-users-for-messaging).

## Configuring

Your Zendesk account & brand **MUST** have Messaging & multi-conversations enabled. Configure your Multi-conversation settings at `https://<subdomain>.zendesk.com/admin/channels/messaging_and_social/messaging/setup`. This project does not support Zendesk Chat.

Copy .env.example to .env (see [src/env.ts](src/env.ts) for description for each env var)

Fill in the Discord env vars

<details><summary>Create Conversations API key</summary>
  Create a new conversations API key in Zendesk under Apps and integrations > Conversations API (<code>https://&lt;subdomain>.zendesk.com/admin/apps-integrations/apis/conversations-api</code>)

Fill in <code>ZD_CONVERSATIONS_APP_ID</code>, <code>ZD_CONVERSATIONS_KEY_ID</code>, and <code>ZD_CONVERSATIONS_KEY_SECRET</code> in your .env

</details><br/>

<details><summary>Create Conversations webhook</summary>
  Create a webhook in Zendesk under Apps and integrations > Conversations integrations (<code>https://&lt;subdomain>.zendesk.com/admin/apps-integrations/integrations/conversations-integrations/new</code>)

The webhook should be pointed to the webhook server running on port 3000 by default without a path: <code>https://....com/</code>

The webhook must have request method "POST".

The webhook must have request format "JSON".

The webhook should have a single event selected "Conversation message".

Fill in <code>ZD_CONVERSATIONS_WEBHOOK_ID</code> and <code>ZD_CONVERSATIONS_WEBHOOK_SECRET</code> in your .env

</details><br/>

<details><summary>Create Zendesk webhook</summary>
  Create a webhook in Zendesk under Apps and integrations > Webhooks (<code>https://&lt;subdomain>.zendesk.com/admin/apps-integrations/actions-webhooks/webhooks/add</code>)

The webhook must be type "Trigger or automation".

The webhook should be pointed to the webhook server running on port 3000 by default with the path /zd: <code>https://....com/zd</code>

The webhook must have request method "POST".

The webhook must have request format "JSON".

The webhook should have Authentication type "None".

Fill in <code>ZD_WEBHOOK_SECRET</code> in your .env

</details><br/>

<details><summary>Create Zendesk webhook trigger for assigned tickets</summary>
  Create a trigger in Zendesk under Objects and rules > Triggers (<code>https://&lt;subdomain>.zendesk.com/admin/objects-rules/rules/triggers/new</code>)

Configure the trigger to match the screenshot (use the webhook you created in the previous step)

<details>
  <summary>Screenshot</summary>

![](/.github/screenshot_assigned.png)

</details>

Webhook request body:

```json
{
  "type": "ticket:assigned",
  "requesterId": "{{ticket.requester.external_id}}",
  "ticketId": "{{ticket.id}}",
  "assigneeName": "{{ticket.assignee.name}}"
}
```

</details><br/>

<details><summary>Create Zendesk webhook trigger for solved tickets</summary>
  Create a trigger in Zendesk under Objects and rules > Triggers (<code>https://&lt;subdomain>.zendesk.com/admin/objects-rules/rules/triggers/new</code>)

Configure the trigger to match the screenshot (use the webhook you created in the previous step)

<details>
  <summary>Screenshot</summary>

![](/.github/screenshot_solved.png)

</details>

Webhook request body:

```json
{
  "type": "ticket:solved",
  "requesterId": "{{ticket.requester.external_id}}",
  "ticketId": "{{ticket.id}}"
}
```

</details><br/>

<details><summary>Modifying the messages shown to customers</summary>

Every message shown to the end-user is modifiable in [src/messages.ts](src/messages.ts).

</details>

After starting the app with `DISCORD_SKIP_COMMANDS` **UNDEFINED** you can run /sendopenticket to send the Start Live Chat embed in your current channel. There aren't any permissions to configure for your customers, but your Discord bot account should have these permissions in your guild at least:

- View Channels
- Create Channels (to create Support Request channels)
- Manage Channels (to remove Support Request channels)
- Send Messages (to bridge Agent messages to Discord)
- Embed Links (sendopenticket embed, for attachments)
- Attach Files (for attachments)

## Caveats

- Missing support for `carousel`, `form`, `formResponse`, `list`, `location`, and `template` message content types
- Typing status is not bridged across Discord/ZD Agent Workspace
  - I don't think Agent Workspace supports typing status from the Conversations postActivity API.
- No feedback if request not picked up by agent
