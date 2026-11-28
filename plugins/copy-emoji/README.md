# Copy Emoji

Adds a built-in `/copy-emoji` command for importing multiple custom emojis into the current server.

## Current implementation

- Accepts full custom emoji markup: `<:name:id>` and `<a:name:id>`.
- Accepts explicit Discord CDN emoji URLs with a file extension.
- Rejects bare numeric IDs because they do not contain the source name or animation metadata.
- Detects duplicates by normalized destination name and SHA-256 of the downloaded asset bytes, not by source and destination IDs.
- Preserves the downloaded CDN response bytes when submitting the upload.
- Returns a plain-text content fallback alongside the Components V2 payload.

## Setup limitation

The current Valenced public plugin API documentation does not document a supported guild-emoji upload method. The existing implementation therefore still uses a separate Node.js bridge and a dedicated Discord bot with **Manage Expressions** permission.

This is a known usability limitation raised during PR review. Do not put a Discord user token or bot token in the plugin source. A bot-free implementation should only replace the bridge after Valenced provides or confirms a supported authenticated client API for creating guild emojis. The plugin must not extract or expose account tokens.

Bridge configuration:

1. Create a dedicated Discord application and bot.
2. Add the bot to the destination server with **Manage Expressions** permission.
3. Run `node bridge/server.mjs` on a machine reachable at `127.0.0.1:8787`.
4. Set `DISCORD_BOT_TOKEN` and `COPY_EMOJI_SECRET` in the bridge process environment.
5. Keep the bridge secret out of public commits. The placeholder in `js/index.ts` must be configured locally to match the bridge secret.

This setup is not yet suitable for a general community release because it requires users to operate a separate service.

## Usage

- `/copy-emoji emoji:<:party:123456789012345678>`
- `/copy-emoji emoji:<a:dance:123456789012345678> <:wave:123456789012345679>`
- `/copy-emoji id:<:party:123456789012345678>`

A plain numeric ID is intentionally rejected. Use the complete markup copied from Discord so the original name and static/animated state are available.

Up to 50 emojis are processed per invocation. Duplicate detection checks both normalized names and exact SHA-256 asset-byte matches. Image-hash matching is best-effort: CDN format normalization can cause visually identical assets to have different byte hashes.

## Components V2 status

The command returns Components V2 fields and also includes plain-text `content` as a fallback. The public Coco's Command Lib result type only declares `content`, and the current `sendBotMessage` forwarding path has not been verified in a running Valenced client. Therefore Components V2 rendering remains **untested** and must not be described as confirmed working until tested on-device.
