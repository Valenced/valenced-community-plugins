export interface SectionBounds {
	key: string
	y: number
	height: number
	rows: { id: string; y: number; height: number; movable?: boolean }[]
}
export interface DropTarget {
	section: string
	before?: string
	y: number
}

// Preview transforms keep the measured hit-test layout stable while rows make room.
export function getSectionPreview(
	sections: readonly SectionBounds[],
	id: string,
	drop?: DropTarget,
) {
	const source = sections.find(section =>
		section.rows.some(row => row.id === id),
	)
	const lifted = source?.rows.find(row => row.id === id)
	const destination = sections.find(section => section.key === drop?.section)
	const result = new Map<
		string,
		{ offset: number; height: number; rows: Map<string, number> }
	>()
	if (!source || !lifted || !destination)
		return { sections: result, dropY: drop?.y ?? 0 }
	let offset = 0
	let dropY = 0
	for (const section of sections) {
		const rows =
			section === source && section !== destination
				? section.rows.filter(row => row.id !== id)
				: [...section.rows]
		if (section === destination) {
			// Match persisted ordering: unsupported/plugin rows retain their slots.
			const ranked = rows.filter(row => row.movable !== false && row.id !== id)
			const before = ranked.findIndex(row => row.id === drop?.before)
			ranked.splice(before < 0 ? ranked.length : before, 0, lifted)
			if (section !== source) rows.push(lifted)
			let rank = 0
			for (let index = 0; index < rows.length; index++) {
				if (rows[index].movable !== false) rows[index] = ranked[rank++]
			}
		}
		const shifts = new Map<string, number>()
		let y = section.y
		for (const row of rows) {
			if (row.id === id) dropY = y + offset
			else shifts.set(row.id, y - row.y)
			y += row.height
		}
		const delta =
			(section === destination ? lifted.height : 0) -
			(section === source ? lifted.height : 0)
		const height = Math.max(48, section.height + delta)
		result.set(section.key, { offset, height, rows: shifts })
		offset += height - section.height
	}
	return { sections: result, dropY, extraHeight: offset }
}

export function findDropTarget(
	sections: readonly SectionBounds[],
	id: string,
	y: number,
): DropTarget | undefined {
	let closest: SectionBounds | undefined
	let distance = Infinity
	for (const section of sections) {
		const next = Math.max(section.y - y, y - section.y - section.height, 0)
		if (next < distance) {
			closest = section
			distance = next
		}
	}
	if (!closest) return
	const rows = closest.rows.filter(
		row => row.id !== id && row.movable !== false,
	)
	const before = rows.find(row => y < row.y + row.height / 2)
	const last = rows.at(-1)
	return {
		section: closest.key,
		before: before?.id,
		y: before?.y ?? (last ? last.y + last.height : closest.y),
	}
}

export function edgeScrollSpeed(y: number, height: number) {
	const edge = Math.min(64, height / 4)
	if (y < edge) return -12 * Math.max(0, Math.min(1, (edge - y) / edge))
	if (y > height - edge)
		return 12 * Math.max(0, Math.min(1, (y - height + edge) / edge))
	return 0
}
