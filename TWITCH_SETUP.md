# Twitch setup for MOONHAUL

MOONHAUL uses Twitch's current chat architecture: EventSub `channel.chat.message` over WebSockets for receiving chat, and the Helix Send Chat Message API for replies. It does not use Twitch IRC.

Official references:

- [Twitch chat and chatbot overview](https://dev.twitch.tv/docs/chat/)
- [Authenticating and setting up EventSub chat](https://dev.twitch.tv/docs/chat/authenticating/)
- [Receiving and sending chat messages](https://dev.twitch.tv/docs/chat/send-receive-messages/)
- [Handling EventSub WebSockets](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)
- [OAuth authorization-code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/)
- [Refreshing user access tokens](https://dev.twitch.tv/docs/authentication/refresh-tokens/)
- [Modify Channel Information](https://dev.twitch.tv/docs/api/reference/#modify-channel-information)
- [Twitch OAuth scopes](https://dev.twitch.tv/docs/authentication/scopes/)

## 1. Choose the accounts

You need a broadcaster channel. A separate bot account is recommended so responses appear under a recognizable worker/foreman name. Add the bot as a moderator in the broadcaster's chat if the accounts differ.

Record both permanent numeric user IDs:

- broadcaster → `TWITCH_BROADCASTER_ID`
- bot/chatting user → `TWITCH_BOT_USER_ID`

Do not use display names as IDs.

## 2. Register a Twitch application

1. Sign in at the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Register an application.
3. Add the HTTPS callback URL used by your OAuth helper. For local testing, use the callback supported by the Twitch CLI or your own authorization-code helper.
4. Choose an appropriate application category.
5. Record the Client ID as `TWITCH_CLIENT_ID`.
6. Generate a client secret and store it as `TWITCH_CLIENT_SECRET`.

Never commit the client secret, access token, refresh token, or stream key.

## 3. Obtain a user access token

The EventSub WebSocket subscription must be created with a **user access token**, not an app access token. Authorize the bot/chatting user with:

```text
user:read:chat user:write:chat
```

- `user:read:chat` is required to receive `channel.chat.message`.
- `user:write:chat` is required only for the compact `!help`, `!status`, and `!join` responses sent by MOONHAUL.

For a server application, use Twitch's OAuth authorization-code grant so you receive both an access token and a refresh token. For temporary local testing, the official Twitch CLI can generate a user token with the same scopes.

Put the resulting values in `.env`:

```env
TWITCH_ACCESS_TOKEN=the-user-access-token-without-an-oauth-prefix
TWITCH_REFRESH_TOKEN=the-refresh-token
```

### Obtain the broadcaster title token

MOONHAUL changes the Twitch title when incidents activate and restores the base title when they resolve or are cancelled:

```text
MOONHAUL | Chat-Controlled Idle Game
MOONHAUL | Chat-Controlled Idle Game — LIVE INCIDENT: [EVENT NAME]
```

Twitch requires a broadcaster-owned user access token with the `channel:manage:broadcast` scope. If the chat bot is a separate account, authorize the broadcaster separately through the same application and store that token pair as:

```env
TWITCH_BROADCAST_ACCESS_TOKEN=the-broadcaster-user-token
TWITCH_BROADCAST_REFRESH_TOKEN=the-broadcaster-refresh-token
```

The user ID represented by this token must match `TWITCH_BROADCASTER_ID`. If the broadcaster account is also the chat bot, add `channel:manage:broadcast` to that account's existing authorization; MOONHAUL will reuse `TWITCH_ACCESS_TOKEN` when the dedicated broadcaster token is left blank.

## 4. Configure MOONHAUL

```env
CHAT_PROVIDER=twitch
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_BROADCASTER_ID=...
TWITCH_BOT_USER_ID=...
TWITCH_ACCESS_TOKEN=...
TWITCH_REFRESH_TOKEN=...
TWITCH_BROADCAST_ACCESS_TOKEN=...
TWITCH_BROADCAST_REFRESH_TOKEN=...
```

The `user_id` in the EventSub condition is the bot user ID. The `broadcaster_user_id` is the channel whose chat drives the game.

## 5. Validate the token

Twitch requires third-party applications that maintain OAuth sessions to validate tokens. MOONHAUL validates at startup and reacts to HTTP 401 responses by refreshing in memory when a refresh token and client secret are available.

Manual validation:

```bash
curl -H "Authorization: OAuth YOUR_ACCESS_TOKEN" https://id.twitch.tv/oauth2/validate
```

Confirm that the returned Client ID and user ID match your `.env`, and that `user:read:chat` is present. Include `user:write:chat` if you want command replies. Validate the broadcaster token separately and confirm its user ID matches `TWITCH_BROADCASTER_ID` and its scopes include `channel:manage:broadcast`.

## 6. Start and verify

```bash
npm run dev
```

Then:

1. Open `/admin` and confirm Twitch shows **Connected**.
2. Send `!join` in the broadcaster's Twitch chat.
3. Confirm the worker appears under `/workers`.
4. Send `!haul` after the action cooldown.
5. Confirm the stream and public dashboard update.
6. Restart the service and confirm the worker remains.

## What the adapter does

1. Connects to `wss://eventsub.wss.twitch.tv/ws`.
2. Waits for `session_welcome` and captures its session ID.
3. Creates a version 1 `channel.chat.message` subscription within Twitch's welcome deadline.
4. Normalizes chat to permanent user ID, display name, message ID, text, timestamp, and badges.
5. Stores the message ID before applying commands, so Twitch's at-least-once delivery does not duplicate game effects.
6. Handles keepalive timeout, reconnect instructions, socket closure, subscription revocation, token validation, and 401-triggered refresh.
7. Serializes channel-title updates so incident activation, resolution, cancellation, and restart recovery cannot apply titles out of order.

## Troubleshooting

- **Subscription returns 401:** the token is invalid, is an app token, belongs to a different Client ID, or lacks `user:read:chat`.
- **Subscription returns 403:** verify the bot's access to the broadcaster's room and make the separate bot account a moderator.
- **Messages arrive but replies fail:** add `user:write:chat`, confirm `TWITCH_BOT_USER_ID` matches the user represented by the access token, and re-authorize.
- **No messages after `session_welcome`:** check the subscription response in structured logs and confirm both numeric IDs.
- **Repeated commands:** the database deduplicates Twitch `message_id`; ensure `DATABASE_PATH` is persistent and writable.
- **Refresh fails after a long outage:** obtain a new authorization-code token pair and update both token values in `.env`.
- **Chat works but titles do not change:** authorize the broadcaster with `channel:manage:broadcast`, confirm the broadcaster token's user ID matches `TWITCH_BROADCASTER_ID`, and set the two `TWITCH_BROADCAST_*` values. A separate bot or moderator token cannot modify the broadcaster's channel title.
