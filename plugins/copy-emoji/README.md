# Copy Emoji

Adds the built-in `/copy-emoji` command. It accepts custom emoji markup and emoji IDs, parses multiple inputs, detects the current server, and uploads the original CDN image bytes through a small local bot bridge.

## Files

- `manifest.json` — Valenced plugin manifest.
- `js/index.ts` — built-in command and Components V2 result payload.
- `js/parser.ts` — custom emoji markup, CDN URL, and numeric ID parser.
- `bridge/server.mjs` — local Node.js bridge that performs authenticated Discord server emoji uploads.

## Required setup

Emoji upload is a server-management action. The bridge uses a dedicated Discord bot, not a Discord user account token.

1. Create a Discord application and bot.
2. Invite the bot to the destination server with **Manage Expressions** (the API permission is `MANAGE_EMOJIS_AND_STICKERS`).
3. Run the bridge on the same machine as the Discord client.
4. Set environment variables:
   - `DISCORD_BOT_TOKEN`: the bot token. Keep it only in the bridge environment; never put it in plugin source or share it.
   - `COPY_EMOJI_SECRET`: a long random secret shared with the plugin.
   - `PORT`: optional, defaults to `8787`.
5. In `js/index.ts`, set `BRIDGE_SECRET` to the same secret. If the bridge is hosted elsewhere, change `BRIDGE_URL` to its HTTPS URL and protect it with a firewall and TLS.
6. Start with Node.js 18 or newer: `node bridge/server.mjs`.

## Usage

- `/copy-emoji emoji:<:party:123456789012345678>`
- `/copy-emoji emoji:<a:dance:123456789012345678> <:wave:123456789012345679>`
- `/copy-emoji id:123456789012345678 123456789012345679`

Up to 50 emojis are processed per invocation. Duplicate IDs are skipped. The bridge reports per-item failures, including missing source assets, insufficient permissions, and server emoji capacity limits.

## Fidelity notes

The bridge downloads the source emoji from Discord's CDN and forwards the bytes as a data URI without resizing, recompressing, or redrawing. Discord controls the accepted upload formats and may normalize assets server-side. An ID alone does not contain the original emoji name or animation metadata; use the full Discord markup (`<:name:id>` or `<a:name:id>`) when exact naming and animation detection matter.

## Components V2 compatibility

The command returns a Components V2 payload (`IS_COMPONENTS_V2`, container, text display, and separator). This requires the installed command library's `messageUtil.sendMessage` implementation to forward raw `flags` and `components` fields. The current public command result type only declares `content`, so verify this behavior against the installed Valenced build before publishing. If the client strips these fields, the command library needs a small upstream compatibility change.
