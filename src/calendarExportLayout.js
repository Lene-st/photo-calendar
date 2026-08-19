export const exportViewWidth = 1200

export const EXPORT_QUALITY_PRESETS = {
  standard: 1600,
  high: 2400,
  ultra: 3200,
}

export function calculateExportDimensions(editorWidth, editorHeight, longEdge) {
  const width = Number(editorWidth)
  const height = Number(editorHeight)
  const edge = Number(longEdge)
  if (!(width > 0 && height > 0 && edge > 0)) return { width: 0, height: 0 }
  const scale = edge / Math.max(width, height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
