function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

export function calculateTypographyScale({
  cellWidth,
  cellHeight,
  monthHeaderHeight,
  weekdayHeaderHeight,
}) {
  const scaleBase = Math.min(cellWidth, cellHeight)
  const dateFontSize = clamp(scaleBase * 0.13, 9, 22)
  const noteFontSize = clamp(scaleBase * 0.09, 7.5, 15)
  const noteLineHeight = 1.4
  const noteLineHeightPx = noteFontSize * noteLineHeight
  const notePaddingY = Math.max(1, noteFontSize * 0.18)

  return {
    dateFontSize,
    monthTitleFontSize: clamp(
      Math.min(cellWidth * 0.72, monthHeaderHeight * 0.52),
      16,
      52,
    ),
    noteFontSize,
    noteLineHeight,
    noteLineHeightPx,
    notePaddingY,
    weekdayFontSize: clamp(
      Math.min(cellWidth * 0.13, weekdayHeaderHeight * 0.38),
      8,
      20,
    ),
  }
}

export function getPhotoAspectInfo(photoRatio = '1:1') {
  const [width, height] = String(photoRatio).split(':').map(Number)
  const aspect = width > 0 && height > 0 ? width / height : 1

  return {
    aspect,
    cellHeightBias: clamp(0.92 - Math.log2(aspect) * 0.18, 0.78, 1),
  }
}

export function calculateCellContentLayout(layout, { hasNote = false, noteLineCount = 0 } = {}) {
  const visibleNoteLines = hasNote ? clamp(Number(noteLineCount) || 1, 1, 3) : 0
  const noteTextHeight = layout.noteLineHeightPx * visibleNoteLines
  const noteAreaHeight = hasNote
    ? noteTextHeight + layout.notePaddingY * 2
    : 0
  const photoNoteGap = hasNote ? layout.contentGap : 0
  const contentHeight = Math.max(
    0,
    layout.cellHeight
      - layout.dateHeaderHeight
      - layout.contentPaddingTop
      - layout.contentPaddingBottom,
  )

  return {
    contentHeight,
    noteAreaHeight,
    noteTextHeight,
    photoAreaHeight: Math.max(1, contentHeight - noteAreaHeight - photoNoteGap),
    photoNoteGap,
  }
}

export function calculateEditorCalendarLayout({
  calendarWidth,
  pageAspectRatio,
  weekCount,
  cellGap = 0,
  photoRatio = '1:1',
}) {
  const validPageAspectRatio = Number.isFinite(pageAspectRatio) && pageAspectRatio > 0
    ? pageAspectRatio
    : 3 / 2
  const calendarHeight = calendarWidth / validPageAspectRatio
  const shortSide = Math.min(calendarWidth, calendarHeight)
  const pagePadding = clamp(shortSide * 0.035, 16, 36)
  const contentWidth = Math.max(0, calendarWidth - pagePadding * 2)
  const contentHeight = Math.max(0, calendarHeight - pagePadding * 2)
  const monthHeaderHeight = clamp(contentHeight * 0.12, 54, 108)
  const weekdayHeaderHeight = clamp(contentHeight * 0.065, 34, 64)
  const sectionGap = clamp(contentHeight * 0.012, 7, 18)
  const gridWidth = contentWidth
  const gridHeight = Math.max(
    0,
    contentHeight - monthHeaderHeight - weekdayHeaderHeight - sectionGap * 2,
  )
  const cellWidth = Math.max(0, (gridWidth - cellGap * 6) / 7)
  const cellHeight = Math.max(
    0,
    (gridHeight - cellGap * (weekCount - 1)) / weekCount,
  )
  const { aspect: photoAspect, cellHeightBias } = getPhotoAspectInfo(photoRatio)
  const typography = calculateTypographyScale({
    cellWidth,
    cellHeight,
    monthHeaderHeight,
    weekdayHeaderHeight,
  })
  const dateFontSize = Math.max(14, typography.dateFontSize)
  const noteFontSize = Math.max(12, typography.noteFontSize)
  const noteLineHeight = 1.4
  const noteLineHeightPx = noteFontSize * noteLineHeight
  const notePaddingY = Math.max(2, noteFontSize * 0.18)
  const contentPaddingX = Math.max(8, cellWidth * 0.06)
  const contentPaddingTop = Math.max(6, cellHeight * 0.045)
  const contentPaddingBottom = Math.max(6, cellHeight * 0.035)
  const contentGap = Math.max(7, cellHeight * 0.04)
  const dateHeaderHeight = Math.max(cellHeight * 0.16, dateFontSize * 1.9)

  return {
    calendarHeight,
    cellPadding: contentPaddingX,
    cellHeight,
    cellHeightBias,
    cellWidth,
    circleBorderWidth: clamp(dateFontSize * 0.09, 1, 2.5),
    circleSize: clamp(Math.min(cellWidth, cellHeight) * 0.22, dateFontSize * 1.45, dateFontSize * 1.9),
    contentGap,
    contentHeight,
    contentPaddingBottom,
    contentPaddingTop,
    contentPaddingX,
    contentWidth,
    dateFontSize,
    dateHeaderHeight,
    gridHeight,
    gridWidth,
    markerDotSize: dateFontSize * 0.35,
    markerGap: Math.max(2, dateFontSize * 0.3),
    markerStarSize: dateFontSize * 0.8,
    monthHeaderHeight,
    monthTitleFontSize: Math.max(32, typography.monthTitleFontSize),
    noteFontSize,
    noteLineHeight,
    noteLineHeightPx,
    notePaddingY,
    pagePadding,
    photoAspect,
    photoMaxHeight: Math.max(1, cellHeight - dateHeaderHeight - contentPaddingTop - contentPaddingBottom),
    photoMaxWidth: Math.max(1, cellWidth - contentPaddingX * 2),
    sectionGap,
    weekdayFontSize: Math.max(14, typography.weekdayFontSize),
    weekdayHeaderHeight,
    weekdayLetterSpacing: clamp(cellWidth * 0.012, 0.5, 2.2),
  }
}

export function calculateMobileCalendarLayout({
  calendarWidth,
  pageAspectRatio,
  weekCount,
  cellGap = 0,
  photoRatio = '1:1',
}) {
  const validPageAspectRatio = Number.isFinite(pageAspectRatio) && pageAspectRatio > 0
    ? pageAspectRatio
    : 3 / 2
  const pagePadding = clamp(calendarWidth * 0.025, 6, 10)
  const contentWidth = Math.max(0, calendarWidth - pagePadding * 2)
  const gridWidth = contentWidth
  const cellWidth = Math.max(0, (gridWidth - cellGap * 6) / 7)
  const mobileCellHeightRatio = clamp(
    2.1 / Math.sqrt(validPageAspectRatio),
    1.5,
    2.3,
  )
  const cellHeight = Math.max(80, cellWidth * mobileCellHeightRatio)
  const gridHeight = cellHeight * weekCount + cellGap * (weekCount - 1)
  const monthHeaderHeight = clamp(calendarWidth * 0.14, 46, 58)
  const weekdayHeaderHeight = 32
  const sectionGap = 7
  const dateFontSize = clamp(cellWidth * 0.25, 12, 15)
  const noteFontSize = clamp(cellWidth * 0.18, 9, 11)
  const noteLineHeight = 1.3
  const noteLineHeightPx = noteFontSize * noteLineHeight
  const notePaddingY = 1.5
  const contentPaddingX = clamp(cellWidth * 0.06, 2, 4)
  const contentPaddingTop = 3
  const contentPaddingBottom = 3
  const contentGap = 3
  const dateHeaderHeight = Math.max(24, dateFontSize * 1.7)
  const calendarHeight = pagePadding * 2
    + monthHeaderHeight
    + weekdayHeaderHeight
    + sectionGap * 2
    + gridHeight
  const { aspect: photoAspect, cellHeightBias } = getPhotoAspectInfo(photoRatio)

  return {
    calendarHeight,
    cellPadding: contentPaddingX,
    cellHeight,
    cellHeightBias,
    cellWidth,
    circleBorderWidth: 1,
    circleSize: clamp(Math.min(cellWidth, cellHeight) * 0.28, 18, 24),
    contentGap,
    contentHeight: calendarHeight - pagePadding * 2,
    contentPaddingBottom,
    contentPaddingTop,
    contentPaddingX,
    contentWidth,
    dateFontSize,
    dateHeaderHeight,
    gridHeight,
    gridWidth,
    markerDotSize: Math.max(4, dateFontSize * 0.35),
    markerGap: 2,
    markerStarSize: Math.max(9, dateFontSize * 0.8),
    monthHeaderHeight,
    monthTitleFontSize: clamp(calendarWidth * 0.07, 22, 28),
    noteFontSize,
    noteLineHeight,
    noteLineHeightPx,
    notePaddingY,
    pagePadding,
    photoAspect,
    photoMaxHeight: Math.max(1, cellHeight - dateHeaderHeight - contentPaddingTop - contentPaddingBottom),
    photoMaxWidth: Math.max(1, cellWidth - contentPaddingX * 2),
    sectionGap,
    weekdayFontSize: 11,
    weekdayHeaderHeight,
    weekdayLetterSpacing: 0.3,
  }
}

export function calculateCalendarLayout({
  paperWidth,
  paperHeight,
  weekCount,
  cellGap = 0,
  photoRatio = '1:1',
  noteLines = 2,
}) {
  const shortSide = Math.min(paperWidth, paperHeight)
  const pagePadding = shortSide * 0.04
  const contentWidth = Math.max(0, paperWidth - pagePadding * 2)
  const contentHeight = Math.max(0, paperHeight - pagePadding * 2)
  const monthHeaderHeight = contentHeight * 0.12
  const weekdayHeaderHeight = contentHeight * 0.065
  const sectionGap = contentHeight * 0.012
  const gridWidth = contentWidth
  const maximumGridHeight = Math.max(
    0,
    contentHeight - monthHeaderHeight - weekdayHeaderHeight - sectionGap * 2,
  )
  const { aspect: photoAspect, cellHeightBias: baseCellHeightBias } = getPhotoAspectInfo(photoRatio)
  const cellHeightBias = clamp(
    baseCellHeightBias + clamp(Number(noteLines) || 1, 1, 3) * 0.015,
    0.78,
    1,
  )
  const gridHeight = maximumGridHeight * cellHeightBias
  const cellWidth = Math.max(0, (gridWidth - cellGap * 6) / 7)
  const cellHeight = Math.max(
    0,
    (gridHeight - cellGap * (weekCount - 1)) / weekCount,
  )
  const typography = calculateTypographyScale({
    cellWidth,
    cellHeight,
    monthHeaderHeight,
    weekdayHeaderHeight,
  })
  const {
    dateFontSize,
    monthTitleFontSize,
    noteFontSize,
    noteLineHeight,
    noteLineHeightPx,
    notePaddingY,
    weekdayFontSize,
  } = typography
  const contentPaddingX = Math.max(1, cellWidth * 0.06)
  const contentPaddingTop = Math.max(1, cellHeight * 0.045)
  const contentPaddingBottom = Math.max(1, cellHeight * 0.035)
  const contentGap = Math.max(1, cellHeight * 0.04)
  const dateHeaderHeight = Math.max(cellHeight * 0.14, dateFontSize * 1.7)
  const availablePhotoHeight = Math.max(
    1,
    cellHeight - dateHeaderHeight - contentPaddingTop - contentPaddingBottom,
  )

  return {
    cellPadding: contentPaddingX,
    cellHeight,
    cellHeightBias,
    cellWidth,
    circleBorderWidth: clamp(dateFontSize * 0.09, 0.75, 2.5),
    circleSize: clamp(Math.min(cellWidth, cellHeight) * 0.22, dateFontSize * 1.45, dateFontSize * 1.9),
    contentHeight,
    contentPaddingX,
    contentPaddingBottom,
    contentPaddingTop,
    contentWidth,
    contentGap,
    dateFontSize,
    dateHeaderHeight,
    gridHeight,
    gridWidth,
    monthHeaderHeight,
    monthTitleFontSize,
    markerDotSize: dateFontSize * 0.35,
    markerGap: Math.max(1, dateFontSize * 0.3),
    markerStarSize: dateFontSize * 0.8,
    noteFontSize,
    noteLineHeight,
    noteLineHeightPx,
    notePaddingY,
    pagePadding,
    sectionGap,
    photoAspect,
    photoMaxHeight: availablePhotoHeight,
    photoMaxWidth: Math.max(1, cellWidth - contentPaddingX * 2),
    weekdayFontSize,
    weekdayLetterSpacing: clamp(cellWidth * 0.012, 0.3, 2.2),
    weekdayHeaderHeight,
  }
}
