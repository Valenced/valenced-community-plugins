export interface EmojiInput {
  id: string
  name: string
  animated: boolean
}

const MARKUP = /<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>/g
const URL = /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/emojis\/(\d{17,20})(?:\.(png|jpe?g|webp|gif))?/gi
const ID = /^\d{17,20}$/

export function parseEmojiInputs(...values: Array<string | undefined>): EmojiInput[] {
  const found = new Map<string, EmojiInput>()

  for (const raw of values) {
    if (!raw) continue

    for (const match of raw.matchAll(MARKUP)) {
      const [, animated, name, id] = match
      found.set(id, { id, name, animated: animated === 'a' })
    }

    for (const match of raw.matchAll(URL)) {
      const [, id, extension] = match
      const previous = found.get(id)
      found.set(id, {
        id,
        name: previous?.name ?? `emoji_${id.slice(-6)}`,
        animated: extension?.toLowerCase() === 'gif' || previous?.animated === true,
      })
    }

    for (const token of raw.split(/[\s,]+/).filter(Boolean)) {
      if (!ID.test(token)) continue
      if (!found.has(token)) {
        found.set(token, {
          id: token,
          name: `emoji_${token.slice(-6)}`,
          animated: false,
        })
      }
    }
  }

  return [...found.values()]
}
