import type { CommandsLibApi } from '../../cocos-command-lib/js'
import { ApplicationCommandOptionType } from '../../cocos-command-lib/js/types'
import { parseEmojiInputs } from './parser'

const BRIDGE_URL = 'http://127.0.0.1:8787'
const BRIDGE_SECRET = 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET'

type CommandArg = { name?: string; value?: string; options?: CommandArg[] }
type CommandContext = { guild?: { id?: string; name?: string }; channel?: { id?: string } }

function flattenArgs(args: CommandArg[]): CommandArg[] {
  return args.flatMap(arg => [arg, ...(arg.options ? flattenArgs(arg.options) : [])])
}

function result(title: string, body: string, details: string[] = []) {
  const content = [title, body, ...details].join('\n')
  // Keep content as a plain-text fallback for command-library versions that
  // do not forward Components V2 fields. Runtime rendering still needs testing.
  return {
    content,
    flags: 1 << 15,
    components: [{
      type: 17,
      components: [
        { type: 10, content: `## ${title}\n${body}` },
        ...(details.length ? [{ type: 14, divider: true }, { type: 10, content: details.join('\n') }] : []),
      ],
    }],
  } as any
}

async function copyEmojis(inputs: ReturnType<typeof parseEmojiInputs>['emojis'], guildId: string) {
  const response = await fetch(`${BRIDGE_URL.replace(/\/$/, '')}/copy-emojis`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${BRIDGE_SECRET}`,
    },
    body: JSON.stringify({ guildId, emojis: inputs }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error || `Bridge returned HTTP ${response.status}`)
  }
  return payload as {
    created?: Array<{ id: string; name: string; animated: boolean }>
    skipped?: Array<{ id: string; name: string; reason: string }>
    failed?: Array<{ id: string; name: string; reason: string }>
  }
}

let unregister: (() => void) | undefined

export default plugin({
  start(api) {
    const commands = api.commands as CommandsLibApi
    unregister = commands.commands.registerCommand({
      name: 'copy-emoji',
      displayName: 'copy-emoji',
      description: 'Copy one or more custom emojis into this server.',
      displayDescription: 'Copy one or more custom emojis into this server.',
      applicationId: '-1',
      inputType: 1,
      type: 1,
      shouldHide: () => false,
      options: [
        {
          name: 'id',
          description: 'Emoji ID input; use full markup such as <:name:id>, not a bare numeric ID.',
          type: ApplicationCommandOptionType.STRING,
          required: false,
        },
        {
          name: 'emoji',
          description: 'Custom emoji markup(s), such as <:name:id> or <a:name:id>.',
          type: ApplicationCommandOptionType.STRING,
          required: false,
        },
      ],
      async execute(args: CommandArg[], ctx: CommandContext) {
        const guildId = ctx.guild?.id
        if (!guildId) return result('Copy Emoji', 'Run this command inside the server where you want the emojis added.')

        const flat = flattenArgs(args)
        const idValue = flat.find(arg => arg.name === 'id')?.value
        const emojiValue = flat.find(arg => arg.name === 'emoji')?.value
        const parsed = parseEmojiInputs(idValue, emojiValue)

        if (parsed.missingMetadataIds.length) {
          return result(
            'Emoji metadata required',
            'A numeric ID alone does not contain the original name or animation status. Use full custom emoji markup.',
            parsed.missingMetadataIds.slice(0, 10).map(id => `• ${id}`),
          )
        }
        const inputs = parsed.emojis
        if (!inputs.length) {
          return result('Copy Emoji', 'Provide full custom emoji markup, for example <:name:id> or <a:name:id>.')
        }
        if (inputs.length > 50) {
          return result('Copy Emoji', 'A maximum of 50 emojis can be processed per command. Split the list into smaller batches.')
        }

        try {
          const copied = await copyEmojis(inputs, guildId)
          const created = copied.created ?? []
          const skipped = copied.skipped ?? []
          const failed = copied.failed ?? []
          const details = [
            `✅ Added: **${created.length}**`,
            `↪️ Skipped: **${skipped.length}**`,
            `❌ Failed: **${failed.length}**`,
            ...created.slice(0, 15).map(item => `• ${item.animated ? '<a:' : '<:'}${item.name}:${item.id}>`),
            ...skipped.slice(0, 8).map(item => `• ${item.name}: ${item.reason}`),
            ...failed.slice(0, 8).map(item => `• ${item.name}: ${item.reason}`),
          ]
          return result('Emoji copy finished', `Target: **${ctx.guild?.name ?? 'Current server'}**`, details)
        } catch (error) {
          return result('Copy Emoji failed', error instanceof Error ? error.message : 'The emoji bridge could not complete the request.')
        }
      },
    })
  },
  stop() {
    unregister?.()
    unregister = undefined
  },
})
