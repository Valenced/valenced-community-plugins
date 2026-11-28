export interface EmojiInput {
  id: string
  name: string
  animated: boolean
}

const MARKUP = /<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>/g
const URL = /https?:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\/emojis\/(\d{17,20})\.(png|jpe?g|webp|gif)(?:\?[^\s>]*)?/gi
const BARE_ID = /\b\d{17,20}\b/g

export interface EmojiParseResult {
  emojis: EmojiInput[]
  missingMetadataIds: string[]
}

export function parseEmojiInputs(...values: Array<string | undefined>): EmojiParseResult {
  const found = new Map<string, EmojiInput>()
  const missingMetadataIds = new Set<string>()

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
        name: previous?.name ?? '',
        animated: previous?.animated ?? extension.toLowerCase() === 'gif',
      })
    }

    const coveredIds = new Set(found.keys())
    for (const match of raw.matchAll(BARE_ID)) {
      if (!coveredIds.has(match[0])) missingMetadataIds.add(match[0])
    }
  }

  return {
    emojis: [...found.values()].filter(item => item.name.length > 0),
    missingMetadataIds: [...missingMetadataIds],
  }
}
