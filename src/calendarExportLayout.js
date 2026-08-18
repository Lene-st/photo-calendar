export const exportViewWidth = 1200
export const exportPagePadding = 48
export const exportTitleHeight = 142
export const exportWeekdayHeight = 62
export const exportCellHeight = 210

export function getExportViewHeight(rowCount, paperAspectRatio = null) {
  if (paperAspectRatio) {
    return exportViewWidth / paperAspectRatio
  }

  return (
    exportPagePadding * 2 +
    exportTitleHeight +
    exportWeekdayHeight +
    exportCellHeight * rowCount
  )
}
