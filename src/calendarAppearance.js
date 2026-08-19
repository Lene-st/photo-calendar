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
  // Old page-ratio fields are intentionally ignored. Keeping them in saved
  // localStorage is harmless and avoids touching unrelated month data.
  const { pageRatio, orientation, customRatioWidth, customRatioHeight, pageWidth, pageHeight, ...appearanceSettings } = currentSettings
  void pageRatio
  void orientation
  void customRatioWidth
  void customRatioHeight
  void pageWidth
  void pageHeight
  return {
    ...defaultMonthAppearance,
    ...appearanceSettings,
    photoRatio: photoRatios[appearanceSettings.photoRatio] ? appearanceSettings.photoRatio : '1:1',
    noteLines: [1, 2, 3].includes(Number(appearanceSettings.noteLines))
      ? Number(appearanceSettings.noteLines)
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
