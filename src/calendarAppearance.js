export const photoRatios = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}

export const defaultMonthAppearance = {
  photoRatio: '1:1',
  noteLines: 2,
  backgroundColor: '#fffdf8',
  gridColor: '#d8d2c4',
  dateTextColor: '#30362f',
  headerTextColor: '#62695f',
  cornerStyle: 'slightly-rounded',
  cellGap: 'none',
  pageRatio: 'default',
  orientation: 'landscape',
  customRatioWidth: 5,
  customRatioHeight: 7,
}

export const PAGE_RATIOS = {
  default: 3 / 2,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
  '1:1': 1,
}

export function getMonthAppearance(monthSettings, monthKey) {
  const saved = monthSettings[monthKey] || {}
  const { paperSize, paperWidth, paperHeight, customWidth, customHeight, showNotes, ...currentSettings } = saved
  void paperSize
  void paperWidth
  void paperHeight
  void customWidth
  void customHeight
  void showNotes
  const customRatioWidth = Number(currentSettings.customRatioWidth)
  const customRatioHeight = Number(currentSettings.customRatioHeight)
  return {
    ...defaultMonthAppearance,
    ...currentSettings,
    photoRatio: photoRatios[currentSettings.photoRatio] ? currentSettings.photoRatio : '1:1',
    noteLines: [1, 2, 3].includes(Number(currentSettings.noteLines))
      ? Number(currentSettings.noteLines)
      : defaultMonthAppearance.noteLines,
    pageRatio: Object.hasOwn(PAGE_RATIOS, currentSettings.pageRatio) || currentSettings.pageRatio === 'custom'
      ? currentSettings.pageRatio
      : defaultMonthAppearance.pageRatio,
    orientation: ['landscape', 'portrait'].includes(currentSettings.orientation)
      ? currentSettings.orientation
      : defaultMonthAppearance.orientation,
    customRatioWidth: Number.isFinite(customRatioWidth)
      ? customRatioWidth
      : defaultMonthAppearance.customRatioWidth,
    customRatioHeight: Number.isFinite(customRatioHeight)
      ? customRatioHeight
      : defaultMonthAppearance.customRatioHeight,
  }
}

export function getPageLayout(appearance) {
  const customWidth = Number(appearance.customRatioWidth)
  const customHeight = Number(appearance.customRatioHeight)
  const baseRatio = appearance.pageRatio === 'custom'
    ? customWidth / customHeight
    : PAGE_RATIOS[appearance.pageRatio] || PAGE_RATIOS.default
  const validRatio = Number.isFinite(baseRatio) && baseRatio > 0
    ? baseRatio
    : PAGE_RATIOS.default

  const isLandscape = appearance.orientation === 'landscape'
  const aspectRatio = isLandscape
    ? Math.max(validRatio, 1 / validRatio)
    : Math.min(validRatio, 1 / validRatio)

  return { aspectRatio }
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

export function getRatioExportDimensions(appearance, longEdge = 2400) {
  const { aspectRatio } = getPageLayout(appearance)
  return aspectRatio >= 1
    ? { height: Math.round(longEdge / aspectRatio), width: longEdge }
    : { height: longEdge, width: Math.round(longEdge * aspectRatio) }
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
