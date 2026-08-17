export const photoRatios = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}

export const defaultMonthAppearance = {
  photoRatio: '1:1',
  showNotes: true,
  noteLines: 2,
  backgroundColor: '#fffdf8',
  gridColor: '#d8d2c4',
  dateTextColor: '#30362f',
  headerTextColor: '#62695f',
  cornerStyle: 'slightly-rounded',
  cellGap: 'none',
}

export function getMonthAppearance(monthSettings, monthKey) {
  const saved = monthSettings[monthKey] || {}
  return {
    ...defaultMonthAppearance,
    ...saved,
    photoRatio: photoRatios[saved.photoRatio] ? saved.photoRatio : '1:1',
    noteLines: [1, 2, 3].includes(Number(saved.noteLines))
      ? Number(saved.noteLines)
      : defaultMonthAppearance.noteLines,
  }
}

export function getPhotoFrameSize(ratioName, maxWidth, maxHeight) {
  const ratio = photoRatios[ratioName] || 1
  const height = Math.min(maxHeight, maxWidth / ratio)
  return { width: height * ratio, height, ratio }
}

export function getCornerRadius(cornerStyle) {
  if (cornerStyle === 'rounded') return 14
  if (cornerStyle === 'slightly-rounded') return 6
  return 0
}

export function getCellGap(cellGap, scale = 1) {
  return cellGap === 'small' ? 4 * scale : 0
}

export function getMarkerSymbol(marker) {
  if (marker === 'dot') return '•'
  if (marker === 'star') return '★'
  return ''
}
