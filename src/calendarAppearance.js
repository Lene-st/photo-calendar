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
  paperSize: 'default',
  orientation: 'landscape',
  customWidth: 180,
  customHeight: 120,
}

export const PAPER_PRESETS = {
  a4: { width: 210, height: 297 },
  a5: { width: 148, height: 210 },
  a6: { width: 105, height: 148 },
}

export function getMonthAppearance(monthSettings, monthKey) {
  const saved = monthSettings[monthKey] || {}
  const customWidth = Number(saved.customWidth)
  const customHeight = Number(saved.customHeight)
  return {
    ...defaultMonthAppearance,
    ...saved,
    photoRatio: photoRatios[saved.photoRatio] ? saved.photoRatio : '1:1',
    noteLines: [1, 2, 3].includes(Number(saved.noteLines))
      ? Number(saved.noteLines)
      : defaultMonthAppearance.noteLines,
    paperSize: ['default', 'a4', 'a5', 'a6', 'custom'].includes(saved.paperSize)
      ? saved.paperSize
      : defaultMonthAppearance.paperSize,
    orientation: ['landscape', 'portrait'].includes(saved.orientation)
      ? saved.orientation
      : defaultMonthAppearance.orientation,
    customWidth: Number.isFinite(customWidth)
      ? customWidth
      : defaultMonthAppearance.customWidth,
    customHeight: Number.isFinite(customHeight)
      ? customHeight
      : defaultMonthAppearance.customHeight,
  }
}

export function getPaperLayout(appearance) {
  if (appearance.paperSize === 'default') {
    return { aspectRatio: null, height: null, width: null }
  }

  const baseSize = appearance.paperSize === 'custom'
    ? { width: Number(appearance.customWidth), height: Number(appearance.customHeight) }
    : PAPER_PRESETS[appearance.paperSize]

  if (!baseSize || baseSize.width <= 0 || baseSize.height <= 0) {
    return { aspectRatio: null, height: null, width: null }
  }

  const isLandscape = appearance.orientation === 'landscape'
  const width = isLandscape
    ? Math.max(baseSize.width, baseSize.height)
    : Math.min(baseSize.width, baseSize.height)
  const height = isLandscape
    ? Math.min(baseSize.width, baseSize.height)
    : Math.max(baseSize.width, baseSize.height)

  return { aspectRatio: width / height, height, width }
}

export function getFittedCalendarSize(availableWidth, availableHeight, aspectRatio) {
  if (!aspectRatio || availableWidth <= 0 || availableHeight <= 0) {
    return null
  }

  if (availableWidth / availableHeight > aspectRatio) {
    return {
      height: availableHeight,
      width: availableHeight * aspectRatio,
    }
  }

  return {
    height: availableWidth / aspectRatio,
    width: availableWidth,
  }
}

export function getExportDimensions(appearance, defaultWidth, defaultHeight, dpi = 300) {
  const paper = getPaperLayout(appearance)
  if (!paper.aspectRatio) {
    return { height: defaultHeight, width: defaultWidth }
  }

  return {
    height: Math.round((paper.height / 25.4) * dpi),
    width: Math.round((paper.width / 25.4) * dpi),
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
