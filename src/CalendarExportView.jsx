import {
  exportCellHeight,
  exportPagePadding,
  exportTitleHeight,
  exportViewWidth,
  exportWeekdayHeight,
  getExportViewHeight,
} from './calendarExportLayout.js'
import {
  getCellGap,
  getCornerRadius,
  getMarkerSymbol,
  getPhotoFrameSize,
} from './calendarAppearance.js'

function ExportPhoto({ photo, frame, clipId }) {
  const crop = photo.crop
  const sideways = crop.rotation % 180 !== 0
  const sourceWidth = photo.imageWidth || 1
  const sourceHeight = photo.imageHeight || 1
  const rotatedWidth = sideways ? sourceHeight : sourceWidth
  const rotatedHeight = sideways ? sourceWidth : sourceHeight
  const containScale = Math.min(frame.width / rotatedWidth, frame.height / rotatedHeight)
  const rotatedBoxWidth = rotatedWidth * containScale * crop.zoom
  const rotatedBoxHeight = rotatedHeight * containScale * crop.zoom
  const centerX = frame.x + (frame.width - rotatedBoxWidth) * crop.x + rotatedBoxWidth / 2
  const centerY = frame.y + (frame.height - rotatedBoxHeight) * crop.y + rotatedBoxHeight / 2
  const imageWidth = sideways ? rotatedBoxHeight : rotatedBoxWidth
  const imageHeight = sideways ? rotatedBoxWidth : rotatedBoxHeight

  return (
    <g clipPath={`url(#${clipId})`}>
      <rect {...frame} fill="#f3efe5" />
      <image
        href={photo.url}
        x={centerX - imageWidth / 2}
        y={centerY - imageHeight / 2}
        width={imageWidth}
        height={imageHeight}
        preserveAspectRatio="none"
        transform={`rotate(${crop.rotation} ${centerX} ${centerY})`}
      />
      <rect {...frame} fill="none" stroke="#d7d0c1" strokeWidth="1" />
    </g>
  )
}

function getNoteLines(note, maxLines, maxCharacters = 20) {
  if (!note) return []
  const characters = Array.from(note.replace(/\s+/g, ' ').trim())
  const lines = []

  for (let index = 0; index < characters.length && lines.length < maxLines; index += maxCharacters) {
    lines.push(characters.slice(index, index + maxCharacters).join(''))
  }

  if (characters.length > maxCharacters * maxLines && lines.length === maxLines) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`
  }
  return lines
}

export default function CalendarExportView({ calendar, svgRef }) {
  const appearance = calendar.appearance
  const height = getExportViewHeight(calendar.rows)
  const gridWidth = exportViewWidth - exportPagePadding * 2
  const cellGap = getCellGap(appearance.cellGap, 1.5)
  const cellWidth = (gridWidth - cellGap * 6) / 7
  const gridHeight = exportCellHeight * calendar.rows
  const cellHeight = (gridHeight - cellGap * (calendar.rows - 1)) / calendar.rows
  const cornerRadius = getCornerRadius(appearance.cornerStyle) * 1.5
  const gridY = exportPagePadding + exportTitleHeight + exportWeekdayHeight

  return (
    <svg
      ref={svgRef}
      className="calendar-export-view"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${exportViewWidth} ${height}`}
      role="img"
      aria-label={`${calendar.title} export view`}
      data-photo-ratio={calendar.photoRatioName}
    >
      <rect width={exportViewWidth} height={height} fill={appearance.backgroundColor} />
      <rect
        x={exportPagePadding}
        y={exportPagePadding}
        width={gridWidth}
        height={height - exportPagePadding * 2}
        fill={appearance.backgroundColor}
        stroke={appearance.gridColor}
        strokeWidth="2"
        rx={cornerRadius}
      />

      <text
        x={exportViewWidth / 2}
        y={exportPagePadding + exportTitleHeight / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={appearance.headerTextColor}
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="48"
      >
        {calendar.title}
      </text>

      {calendar.weekdays.map((weekday, index) => (
        <text
          key={weekday}
          x={exportPagePadding + (cellWidth + cellGap) * index + cellWidth / 2}
          y={exportPagePadding + exportTitleHeight + exportWeekdayHeight / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={appearance.headerTextColor}
          fontFamily="Arial, sans-serif"
          fontSize="20"
          fontWeight="600"
        >
          {weekday}
        </text>
      ))}

      {Array.from({ length: calendar.rows * 7 }, (_, index) => {
        const entry = calendar.days[index] || null
        const column = index % 7
        const row = Math.floor(index / 7)
        const cellX = exportPagePadding + column * (cellWidth + cellGap)
        const cellY = gridY + row * (cellHeight + cellGap)
        const padding = 10
        const dateHeaderHeight = 38
        const noteLines = entry && appearance.showNotes
          ? getNoteLines(entry.note, appearance.noteLines)
          : []
        const noteLineHeight = 17
        const noteHeight = noteLines.length ? noteLines.length * noteLineHeight + 10 : 0
        const availableWidth = cellWidth - padding * 2
        const availableHeight = cellHeight - dateHeaderHeight - padding * 2 - noteHeight
        const frameSize = getPhotoFrameSize(calendar.photoRatioName, availableWidth, availableHeight)
        const frameWidth = frameSize.width
        const frameHeight = frameSize.height
        const frame = {
          x: cellX + (cellWidth - frameWidth) / 2,
          y: cellY + dateHeaderHeight + padding + (availableHeight - frameHeight) / 2,
          width: frameWidth,
          height: frameHeight,
        }
        const clipId = entry ? `export-photo-${entry.dateKey}` : `empty-${index}`

        return (
          <g key={entry?.dateKey || `empty-${index}`}>
            <rect
              x={cellX}
              y={cellY}
              width={cellWidth}
              height={cellHeight}
              fill={entry?.highlight ? entry.highlightColor : appearance.backgroundColor}
              stroke={appearance.gridColor}
              strokeWidth="1.5"
              rx={cornerRadius}
            />
            {entry && (
              <>
            <rect
              x={cellX}
              y={cellY}
              width={cellWidth}
              height={dateHeaderHeight}
              fill={entry.highlight ? entry.highlightColor : appearance.backgroundColor}
              rx={cornerRadius}
            />
            <line
              x1={cellX}
              x2={cellX + cellWidth}
              y1={cellY + dateHeaderHeight}
              y2={cellY + dateHeaderHeight}
              stroke={appearance.gridColor}
              strokeWidth="1"
            />
            <defs>
              <clipPath id={clipId} data-photo-ratio={calendar.photoRatioName}>
                <rect {...frame} />
              </clipPath>
            </defs>
            {entry.photo && <ExportPhoto photo={entry.photo} frame={frame} clipId={clipId} />}
            <text
              x={cellX + 12}
              y={cellY + dateHeaderHeight / 2}
              textAnchor="start"
              dominantBaseline="central"
              fill={appearance.dateTextColor}
              fontFamily="Arial, sans-serif"
              fontSize="18"
              fontWeight="600"
            >
              {entry.day}
            </text>
            {entry.marker === 'circle' && (
              <circle cx={cellX + 20} cy={cellY + dateHeaderHeight / 2} r="14" fill="none" stroke={entry.markerColor} strokeWidth="2" />
            )}
            {entry.marker !== 'none' && entry.marker !== 'circle' && (
              <text x={cellX + 40} y={cellY + dateHeaderHeight / 2} dominantBaseline="central" fill={entry.markerColor} fontSize="18">
                {getMarkerSymbol(entry.marker)}
              </text>
            )}
            {noteLines.length > 0 && (
              <text
                x={cellX + padding}
                y={cellY + cellHeight - noteHeight + 14}
                fill={appearance.dateTextColor}
                fontFamily="Arial, sans-serif"
                fontSize="13"
              >
                {noteLines.map((line, lineIndex) => (
                  <tspan x={cellX + padding} dy={lineIndex === 0 ? 0 : noteLineHeight} key={`${entry.dateKey}-note-${lineIndex}`}>
                    {line}
                  </tspan>
                ))}
              </text>
            )}
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
