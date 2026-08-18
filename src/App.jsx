import { useEffect, useRef, useState } from 'react'
import {
  deletePhotoRecord,
  getAllPhotos,
  savePhotoRecord,
} from './photoDatabase.js'
import CalendarExportView from './CalendarExportView.jsx'
import { calculateCalendarLayout, calculateCellContentLayout, calculateEditorCalendarLayout, calculateMobileCalendarLayout } from './calendarLayout.js'
import {
  getCellGap,
  getCornerRadius,
  getRatioExportDimensions,
  getFittedCalendarSize,
  getMarkerSymbol,
  getMonthAppearance,
  getPageLayout,
  getPhotoFrameSize,
  photoRatios,
} from './calendarAppearance.js'

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
})

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
    new Date(2026, month, 1),
  ),
)
const yearOptions = Array.from({ length: 101 }, (_, index) => 2000 + index)
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const visibleMonthStorageKey = 'photo-calendar-visible-month'
const monthSettingsStorageKey = 'calendarMonthSettings'
const previewZoomStorageKey = 'photo-calendar-preview-zoom'
const exportLongEdge = 2400

function getInitialPreviewZoom() {
  try {
    const savedZoom = Number(localStorage.getItem(previewZoomStorageKey))
    return Number.isFinite(savedZoom) && savedZoom >= 50 && savedZoom <= 200
      ? savedZoom
      : 100
  } catch (error) {
    console.error('Could not read the preview zoom:', error)
    return 100
  }
}

function getDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function getMonthIndex(year, month) {
  return year * 12 + month
}

function getCalendarExportData(year, month, photosByDate, monthSettings, today) {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  const monthKey = getMonthKey(year, month)
  const appearance = getMonthAppearance(monthSettings, monthKey)
  const ratioName = appearance.photoRatio

  return {
    year,
    month,
    title: monthFormatter.format(new Date(year, month, 1)),
    weekdays,
    rows: Math.ceil(days.length / 7),
    appearance,
    photoRatioName: ratioName,
    photoRatioValue: photoRatios[ratioName],
    days: days.map((day) => {
      if (!day) return null
      const dateKey = getDateKey(year, month, day)
      const entry = photosByDate[dateKey]
      return {
        day,
        dateKey,
        note: entry?.note || '',
        showNoteInCalendar: entry?.showNoteInCalendar === true,
        highlight: Boolean(entry?.highlight),
        highlightColor: entry?.highlightColor || '#f5edc9',
        marker: entry?.marker || 'none',
        markerColor: entry?.markerColor || '#b85c55',
        isToday:
          day === today.getDate() &&
          month === today.getMonth() &&
          year === today.getFullYear(),
        photo: entry?.imageBlob
          ? { ...entry, crop: getCropForRatio(entry.crop, ratioName) }
          : null,
      }
    }),
  }
}

function getInitialMonthSettings() {
  try {
    const savedSettings = JSON.parse(
      localStorage.getItem(monthSettingsStorageKey),
    )
    if (!savedSettings || typeof savedSettings !== 'object') return {}
    return Object.fromEntries(
      Object.keys(savedSettings).map((savedMonthKey) => [
        savedMonthKey,
        getMonthAppearance(savedSettings, savedMonthKey),
      ]),
    )
  } catch (error) {
    console.error('Could not read the saved calendar appearance:', error)
    return {}
  }
}

function normalizeRotation(rotation = 0) {
  return ((rotation % 360) + 360) % 360
}

function getMinimumZoom(photo, ratio, rotation = 0) {
  if (!photo?.imageWidth || !photo?.imageHeight) {
    return 0.5
  }

  const isSideways = normalizeRotation(rotation) % 180 !== 0
  const imageWidth = isSideways ? photo.imageHeight : photo.imageWidth
  const imageHeight = isSideways ? photo.imageWidth : photo.imageHeight
  const frameRatio = photoRatios[ratio]
  const containScale = Math.min(frameRatio / imageWidth, 1 / imageHeight)
  const coverScale = Math.max(frameRatio / imageWidth, 1 / imageHeight)

  return coverScale / containScale
}

function getCropForRatio(crop, ratio) {
  if (!crop || crop.ratio !== ratio) {
    const rotation = 0
    return {
      x: 0.5,
      y: 0.5,
      zoom: 1,
      rotation,
      ratio,
    }
  }

  const rotation = normalizeRotation(crop.rotation)
  return {
    ...crop,
    rotation,
    zoom:
      Number.isFinite(crop.zoom) && crop.zoom >= 0.5
        ? crop.zoom
        : 1,
  }
}

function clamp(value) {
  return Math.min(1, Math.max(0, value))
}

function getPhotoLayout(photo, ratio) {
  const crop = getCropForRatio(photo?.crop, ratio)
  const minimumZoom = getMinimumZoom(
    photo,
    ratio,
    crop.rotation,
  )

  if (!photo?.imageWidth || !photo?.imageHeight) {
    return {
      crop,
      imageStyle: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: 'translate(-50%, -50%)',
      },
      wrapperStyle: { inset: 0 },
    }
  }

  const isSideways = crop.rotation % 180 !== 0
  const rotatedWidth = isSideways ? photo.imageHeight : photo.imageWidth
  const rotatedHeight = isSideways ? photo.imageWidth : photo.imageHeight
  const imageRatio = rotatedWidth / rotatedHeight
  const frameRatio = photoRatios[ratio]
  const sizeMultiplier = crop.zoom / minimumZoom
  const baseWidth = imageRatio >= frameRatio ? (imageRatio / frameRatio) * 100 : 100
  const baseHeight = imageRatio >= frameRatio ? 100 : (frameRatio / imageRatio) * 100
  const width = baseWidth * sizeMultiplier
  const height = baseHeight * sizeMultiplier
  const rotatedLayerRatio = (width / height) * frameRatio

  return {
    crop,
    imageStyle: isSideways
      ? {
          width: `${100 / rotatedLayerRatio}%`,
          height: `${rotatedLayerRatio * 100}%`,
          transform: `translate(-50%, -50%) rotate(${crop.rotation}deg)`,
          transformOrigin: 'center',
        }
      : {
          width: '100%',
          height: '100%',
          transform: `translate(-50%, -50%) rotate(${crop.rotation}deg)`,
          transformOrigin: 'center',
        },
    wrapperStyle: {
      width: `${width}%`,
      height: `${height}%`,
      left: `${-(width - 100) * crop.x}%`,
      top: `${-(height - 100) * crop.y}%`,
    },
  }
}

function getInitialVisibleMonth() {
  const today = new Date()

  try {
    const savedMonth = JSON.parse(
      localStorage.getItem(visibleMonthStorageKey),
    )

    if (
      Number.isInteger(savedMonth?.year) &&
      Number.isInteger(savedMonth?.month) &&
      savedMonth.month >= 0 &&
      savedMonth.month <= 11
    ) {
      return new Date(savedMonth.year, savedMonth.month, 1)
    }
  } catch (error) {
    console.error('Could not read the saved calendar month:', error)
  }

  return new Date(today.getFullYear(), today.getMonth(), 1)
}

function App() {
  const today = new Date()
  const [visibleMonth, setVisibleMonth] = useState(getInitialVisibleMonth)
  const [selectedDate, setSelectedDate] = useState(null)
  const [photosByDate, setPhotosByDate] = useState({})
  const [monthSettings, setMonthSettings] = useState(getInitialMonthSettings)
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [isEditingDay, setIsEditingDay] = useState(false)
  const [draftNote, setDraftNote] = useState('')
  const [draftShowNoteInCalendar, setDraftShowNoteInCalendar] = useState(false)
  const [isPhotoRemoved, setIsPhotoRemoved] = useState(false)
  const [draftHighlight, setDraftHighlight] = useState(false)
  const [draftHighlightColor, setDraftHighlightColor] = useState('#f5edc9')
  const [draftMarker, setDraftMarker] = useState('none')
  const [draftMarkerColor, setDraftMarkerColor] = useState('#b85c55')
  const [isApplyAppearanceConfirming, setIsApplyAppearanceConfirming] = useState(false)
  const [fileError, setFileError] = useState('')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportFrom, setExportFrom] = useState(null)
  const [exportTo, setExportTo] = useState(null)
  const [activeExportCalendar, setActiveExportCalendar] = useState(null)
  const [exportFormat, setExportFormat] = useState('png')
  const [exportStatus, setExportStatus] = useState('')
  const [previewZoom, setPreviewZoom] = useState(getInitialPreviewZoom)
  const [isDesktopEditor, setIsDesktopEditor] = useState(false)
  const [isMobileEditor, setIsMobileEditor] = useState(false)
  const fileInputRef = useRef(null)
  const exportViewRef = useRef(null)
  const calendarWorkspaceRef = useRef(null)
  const objectUrlsRef = useRef(new Set())
  const cropDragRef = useRef(null)
  const [calendarWorkspaceSize, setCalendarWorkspaceSize] = useState({ height: 0, width: 0 })

  function createPhotoUrl(blob) {
    const url = URL.createObjectURL(blob)
    objectUrlsRef.current.add(url)
    return url
  }

  function releasePhotoUrl(url) {
    if (url && objectUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      objectUrlsRef.current.delete(url)
    }
  }

  useEffect(() => {
    let isCancelled = false

    async function restorePhotos() {
      try {
        const photoRecords = await getAllPhotos()

        if (isCancelled) {
          return
        }

        const restoredPhotos = {}
        photoRecords.forEach(({ dateKey, imageBlob, imageType, crop, imageWidth, imageHeight, note = '', showNoteInCalendar = false, highlight = false, highlightColor = '#f5edc9', marker = 'none', markerColor = '#b85c55' }) => {
          restoredPhotos[dateKey] = {
            crop,
            imageBlob,
            imageHeight,
            imageType: imageType || imageBlob?.type,
            imageWidth,
            note,
            showNoteInCalendar: showNoteInCalendar === true,
            highlight,
            highlightColor,
            marker,
            markerColor,
            url: imageBlob ? createPhotoUrl(imageBlob) : null,
          }
        })
        setPhotosByDate(restoredPhotos)
      } catch (error) {
        console.error('Could not load photos from IndexedDB:', error)
      }
    }

    restorePhotos()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      objectUrlsRef.current.clear()
    },
    [],
  )

  useEffect(() => {
    const workspace = calendarWorkspaceRef.current
    if (!workspace) return undefined

    const updateWorkspaceSize = () => {
      const styles = window.getComputedStyle(workspace)
      const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)
      const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom)
      setCalendarWorkspaceSize({
        height: Math.max(0, workspace.clientHeight - verticalPadding),
        width: Math.max(0, workspace.clientWidth - horizontalPadding),
      })
    }
    const observer = new ResizeObserver(updateWorkspaceSize)
    observer.observe(workspace)
    updateWorkspaceSize()

    return () => observer.disconnect()
  }, [])

  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()
  const monthKey = getMonthKey(year, month)
  const currentAppearance = getMonthAppearance(monthSettings, monthKey)
  const currentPageLayout = getPageLayout(currentAppearance)
  const currentPhotoRatio = currentAppearance.photoRatio
  const currentPhotoRatioValue = photoRatios[currentPhotoRatio]
  const customRatioInvalid = currentAppearance.pageRatio === 'custom' && (
    currentAppearance.customRatioWidth <= 0 || currentAppearance.customRatioHeight <= 0
  )
  const cropFrameWidth =
    currentPhotoRatioValue < 1 ? currentPhotoRatioValue * 320 : 360

  useEffect(() => {
    try {
      localStorage.setItem(
        visibleMonthStorageKey,
        JSON.stringify({ year, month }),
      )
    } catch (error) {
      console.error('Could not save the current calendar month:', error)
    }
  }, [year, month])

  useEffect(() => {
    try {
      localStorage.setItem(
        monthSettingsStorageKey,
        JSON.stringify(monthSettings),
      )
    } catch (error) {
      console.error('Could not save the calendar appearance:', error)
    }
  }, [monthSettings])

  useEffect(() => {
    try {
      localStorage.setItem(previewZoomStorageKey, String(previewZoom))
    } catch (error) {
      console.error('Could not save the preview zoom:', error)
    }
  }, [previewZoom])

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 901px)')
    const mobileQuery = window.matchMedia('(max-width: 767px)')
    const updateEditorMode = () => {
      setIsDesktopEditor(desktopQuery.matches)
      setIsMobileEditor(mobileQuery.matches)
    }
    desktopQuery.addEventListener('change', updateEditorMode)
    mobileQuery.addEventListener('change', updateEditorMode)
    updateEditorMode()
    return () => {
      desktopQuery.removeEventListener('change', updateEditorMode)
      mobileQuery.removeEventListener('change', updateEditorMode)
    }
  }, [])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const calendarDaysWithLeadingBlanks = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  const calendarRows = Math.ceil(calendarDaysWithLeadingBlanks.length / 7)
  const calendarDays = [
    ...calendarDaysWithLeadingBlanks,
    ...Array(calendarRows * 7 - calendarDaysWithLeadingBlanks.length).fill(null),
  ]
  const previewAspectRatio = currentPageLayout.aspectRatio
  const workspaceFittedCalendarSize = getFittedCalendarSize(
    calendarWorkspaceSize.width,
    calendarWorkspaceSize.height,
    previewAspectRatio,
  )
  const editorLayout = isDesktopEditor && calendarWorkspaceSize.width
    ? calculateEditorCalendarLayout({
        calendarWidth: calendarWorkspaceSize.width,
        pageAspectRatio: previewAspectRatio,
        weekCount: calendarRows,
        cellGap: getCellGap(currentAppearance.cellGap),
        photoRatio: currentPhotoRatio,
      })
    : null
  const mobileLayout = isMobileEditor && calendarWorkspaceSize.width
    ? calculateMobileCalendarLayout({
        calendarWidth: calendarWorkspaceSize.width,
        pageAspectRatio: previewAspectRatio,
        weekCount: calendarRows,
        cellGap: getCellGap(currentAppearance.cellGap),
        photoRatio: currentPhotoRatio,
      })
    : null
  const naturalEditorLayout = editorLayout || mobileLayout
  const calendarDisplaySize = naturalEditorLayout
    ? { height: naturalEditorLayout.calendarHeight, width: calendarWorkspaceSize.width }
    : workspaceFittedCalendarSize
  const previewLayout = naturalEditorLayout || (workspaceFittedCalendarSize
    ? calculateCalendarLayout({
        paperWidth: workspaceFittedCalendarSize.width,
        paperHeight: workspaceFittedCalendarSize.height,
        weekCount: calendarRows,
        cellGap: getCellGap(currentAppearance.cellGap),
        photoRatio: currentPhotoRatio,
        noteLines: currentAppearance.noteLines,
      })
    : null)
  const previewScale = isMobileEditor ? 1 : previewZoom / 100
  const scaledPreviewWidth = (calendarDisplaySize?.width || 0) * previewScale
  const scaledPreviewHeight = (calendarDisplaySize?.height || 0) * previewScale
  const currentCellGap = getCellGap(currentAppearance.cellGap)
  const currentCornerRadius = getCornerRadius(currentAppearance.cornerStyle)
  const exportStartIndex = exportFrom
    ? getMonthIndex(exportFrom.year, exportFrom.month)
    : 0
  const exportEndIndex = exportTo
    ? getMonthIndex(exportTo.year, exportTo.month)
    : 0
  const exportMonthCount = exportFrom && exportTo
    ? exportEndIndex - exportStartIndex + 1
    : 0
  const exportValidationMessage = exportMonthCount < 1
    ? '开始月份必须早于或等于结束月份。'
    : exportMonthCount > 24
      ? '一次最多可以导出 24 个月。'
      : ''

  async function blobUrlToDataUrl(url) {
    const response = await fetch(url)
    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }

  function loadImageDimensions(url) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
      })
      image.onerror = () => reject(new Error('Could not read the photo dimensions.'))
      image.src = url
    })
  }

  async function addMissingPhotoDimensions(calendar) {
    const days = await Promise.all(calendar.days.map(async (entry) => {
      if (!entry?.photo || (entry.photo.imageWidth && entry.photo.imageHeight)) {
        return entry
      }

      const dimensions = await loadImageDimensions(entry.photo.url)
      return {
        ...entry,
        photo: { ...entry.photo, ...dimensions },
      }
    }))

    return { ...calendar, days }
  }

  async function downloadCalendar(calendar, fileName) {
    const calendarWithDimensions = await addMissingPhotoDimensions(calendar)
    setActiveExportCalendar(calendarWithDimensions)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    if (!exportViewRef.current) {
      throw new Error('The calendar export view was not rendered.')
    }

    const { width: outputWidth, height: outputHeight } = getRatioExportDimensions(
      calendarWithDimensions.appearance,
      exportLongEdge,
    )
    const svg = exportViewRef.current.cloneNode(true)
    svg.setAttribute('width', outputWidth)
    svg.setAttribute('height', outputHeight)
    const images = Array.from(svg.querySelectorAll('image'))
    await Promise.all(images.map(async (image) => {
      const href = image.getAttribute('href')
      if (href?.startsWith('blob:')) {
        image.setAttribute('href', await blobUrlToDataUrl(href))
      }
    }))

    const svgText = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)

    try {
      const image = new Image()
      await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = reject
        image.src = svgUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const context = canvas.getContext('2d')
      context.fillStyle = '#fffdf8'
      context.fillRect(0, 0, outputWidth, outputHeight)
      context.drawImage(image, 0, 0, outputWidth, outputHeight)

      const mimeType = exportFormat === 'jpg' ? 'image/jpeg' : 'image/png'
      const imageBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error(`The browser could not create ${mimeType}.`)),
          mimeType,
          exportFormat === 'jpg' ? 0.92 : undefined,
        )
      })
      const downloadUrl = URL.createObjectURL(imageBlob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName
      link.click()
      URL.revokeObjectURL(downloadUrl)
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  }

  function openExportModal() {
    const selection = { year, month }
    setExportFrom(selection)
    setExportTo(selection)
    setExportStatus('')
    setIsExportModalOpen(true)
  }

  function closeExportModal() {
    if (!exportStatus.startsWith('正在导出')) {
      setIsExportModalOpen(false)
      setActiveExportCalendar(null)
    }
  }

  async function exportCalendars() {
    if (exportValidationMessage) return

    for (let index = 0; index < exportMonthCount; index += 1) {
      const monthIndex = exportStartIndex + index
      const exportYear = Math.floor(monthIndex / 12)
      const exportMonth = monthIndex % 12
      const monthString = String(exportMonth + 1).padStart(2, '0')
      const extension = exportFormat === 'jpg' ? 'jpg' : 'png'
      const fileName = `photo-calendar-${exportYear}-${monthString}.${extension}`
      const calendar = getCalendarExportData(
        exportYear,
        exportMonth,
        photosByDate,
        monthSettings,
        today,
      )
      setExportStatus(`正在导出 ${index + 1} / ${exportMonthCount}……`)

      try {
        await downloadCalendar(calendar, fileName)
      } catch (error) {
        console.error(`Could not export ${calendar.title}:`, error)
        setExportStatus('导出失败，请重试。')
        setActiveExportCalendar(null)
        return
      }
    }

    setActiveExportCalendar(null)
    setExportStatus('导出完成。')
  }

  function changeMonth(offset) {
    setVisibleMonth((currentMonth) =>
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1),
    )
  }

  function changeYear(event) {
    setVisibleMonth(new Date(Number(event.target.value), month, 1))
  }

  function selectMonth(event) {
    setVisibleMonth(new Date(year, Number(event.target.value), 1))
  }

  function goToToday() {
    const currentDate = new Date()
    setVisibleMonth(
      new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
    )
  }

  function changePhotoRatio(event) {
    const photoRatio = event.target.value
    setMonthSettings((currentSettings) => ({
      ...currentSettings,
      [monthKey]: { ...currentSettings[monthKey], photoRatio },
    }))
  }

  function changeMonthAppearance(field, value) {
    setMonthSettings((currentSettings) => ({
      ...currentSettings,
      [monthKey]: {
        ...getMonthAppearance(currentSettings, monthKey),
        [field]: value,
      },
    }))
  }

  function applyAppearanceToAllMonths() {
    const updatedSettings = {}
    yearOptions.forEach((appearanceYear) => {
      monthNames.forEach((_, appearanceMonth) => {
        updatedSettings[getMonthKey(appearanceYear, appearanceMonth)] = {
          ...currentAppearance,
        }
      })
    })
    setMonthSettings(updatedSettings)
    setIsApplyAppearanceConfirming(false)
  }

  function changeZoom(event) {
    const zoom = Number(event.target.value)
    setPendingPhoto((currentPhoto) => ({
      ...currentPhoto,
      crop: { ...currentPhoto.crop, zoom },
    }))
    setFileError('')
  }

  function adjustZoom(amount) {
    setPendingPhoto((currentPhoto) => ({
      ...currentPhoto,
      crop: {
        ...currentPhoto.crop,
        zoom: Math.min(
          3,
          Math.max(0.5, currentPhoto.crop.zoom + amount),
        ),
      },
    }))
    setFileError('')
  }

  function rotatePhoto(amount) {
    setPendingPhoto((currentPhoto) => {
      const rotation = normalizeRotation(currentPhoto.crop.rotation + amount)

      return {
        ...currentPhoto,
        crop: {
          ...currentPhoto.crop,
          x: 0.5,
          y: 0.5,
          rotation,
          zoom: 1,
        },
      }
    })
    setFileError('')
  }

  function resetCrop() {
    setPendingPhoto((currentPhoto) => ({
      ...currentPhoto,
      crop: {
        x: 0.5,
        y: 0.5,
        zoom: 1,
        rotation: 0,
        ratio: currentPhotoRatio,
      },
    }))
  }

  function isToday(day) {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    )
  }

  function openDateModal(day) {
    const date = new Date(year, month, day)
    const dateKey = getDateKey(year, month, day)
    setSelectedDate(date)
    setPendingPhoto(null)
    setDraftNote(photosByDate[dateKey]?.note || '')
    setDraftShowNoteInCalendar(photosByDate[dateKey]?.showNoteInCalendar === true)
    setDraftHighlight(Boolean(photosByDate[dateKey]?.highlight))
    setDraftHighlightColor(photosByDate[dateKey]?.highlightColor || '#f5edc9')
    setDraftMarker(photosByDate[dateKey]?.marker || 'none')
    setDraftMarkerColor(photosByDate[dateKey]?.markerColor || '#b85c55')
    setIsEditingDay(false)
    setIsPhotoRemoved(false)
    setFileError('')
  }

  function closeDateModal() {
    if (pendingPhoto && !pendingPhoto.usesSavedUrl) {
      releasePhotoUrl(pendingPhoto.url)
    }
    setSelectedDate(null)
    setPendingPhoto(null)
    setIsEditingDay(false)
    setIsPhotoRemoved(false)
    setFileError('')
  }

  function startEditingDay() {
    setDraftNote(selectedEntry?.note || '')
    setDraftShowNoteInCalendar(selectedEntry?.showNoteInCalendar === true)
    setDraftHighlight(Boolean(selectedEntry?.highlight))
    setDraftHighlightColor(selectedEntry?.highlightColor || '#f5edc9')
    setDraftMarker(selectedEntry?.marker || 'none')
    setDraftMarkerColor(selectedEntry?.markerColor || '#b85c55')
    setPendingPhoto(null)
    setIsPhotoRemoved(false)
    setIsEditingDay(true)
    setFileError('')
  }

  function closeOnOverlay(event) {
    if (event.target === event.currentTarget) {
      closeDateModal()
    }
  }

  function choosePhoto() {
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  function handlePhotoSelection(event) {
    const file = event.target.files[0]

    if (!file) {
      return
    }

    if (!allowedImageTypes.includes(file.type)) {
      setFileError('当前浏览器暂不支持显示这种图片格式，请尝试使用 JPG、PNG 或 WebP 图片。')
      return
    }

    if (pendingPhoto && !pendingPhoto.usesSavedUrl) {
      releasePhotoUrl(pendingPhoto.url)
    }
    setPendingPhoto({
      blob: file,
      crop: {
        x: 0.5,
        y: 0.5,
        zoom: 1,
        rotation: 0,
        ratio: currentPhotoRatio,
      },
      imageHeight: null,
      type: file.type,
      imageWidth: null,
      url: createPhotoUrl(file),
      usesSavedUrl: false,
    })
    setIsPhotoRemoved(false)
    setFileError('')
  }

  function handlePendingImageLoad(event) {
    const imageWidth = event.currentTarget.naturalWidth
    const imageHeight = event.currentTarget.naturalHeight

    setPendingPhoto((currentPhoto) => {
      if (
        currentPhoto.imageWidth === imageWidth &&
        currentPhoto.imageHeight === imageHeight
      ) {
        return currentPhoto
      }

      const photoWithDimensions = {
        ...currentPhoto,
        imageHeight,
        imageWidth,
      }

      return {
        ...photoWithDimensions,
        crop: currentPhoto.crop,
      }
    })
  }

  function handlePendingImageError() {
    setFileError('当前浏览器无法显示这张图片，请尝试使用 JPG、PNG 或 WebP 图片。')
  }

  function rememberPhotoDimensions(dateKey, event) {
    const imageWidth = event.currentTarget.naturalWidth
    const imageHeight = event.currentTarget.naturalHeight

    setPhotosByDate((currentPhotos) => {
      const photo = currentPhotos[dateKey]
      if (!photo || (photo.imageWidth && photo.imageHeight)) {
        return currentPhotos
      }

      return {
        ...currentPhotos,
        [dateKey]: { ...photo, imageHeight, imageWidth },
      }
    })
  }

  async function saveDayEntry() {
    const dateKey = getDateKey(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    )
    const previousEntry = photosByDate[dateKey]
    const photoToSave = pendingPhoto || (
      !isPhotoRemoved && previousEntry?.imageBlob
        ? {
            blob: previousEntry.imageBlob,
            crop: getCropForRatio(previousEntry.crop, currentPhotoRatio),
            imageHeight: previousEntry.imageHeight,
            imageWidth: previousEntry.imageWidth,
            type: previousEntry.imageType,
            url: previousEntry.url,
          }
        : null
    )
    const note = draftNote
    const showNoteInCalendar = Boolean(note.trim() && draftShowNoteInCalendar)

    try {
      const hasDayDecoration = draftHighlight || draftMarker !== 'none'
      if (!photoToSave && !note.trim() && !hasDayDecoration) {
        await deletePhotoRecord(dateKey)
      } else {
        await savePhotoRecord({
          dateKey,
          note,
          showNoteInCalendar,
          highlight: draftHighlight,
          highlightColor: draftHighlightColor,
          marker: draftMarker,
          markerColor: draftMarkerColor,
          ...(photoToSave && {
            crop: photoToSave.crop,
            imageBlob: photoToSave.blob,
            imageHeight: photoToSave.imageHeight,
            imageType: photoToSave.type,
            imageWidth: photoToSave.imageWidth,
          }),
        })
      }

      const savedPhotoUrl = photoToSave
        ? createPhotoUrl(photoToSave.blob)
        : null

      setPhotosByDate((currentPhotos) => {
        const currentEntry = currentPhotos[dateKey]
        if (!photoToSave && !note.trim() && !hasDayDecoration) {
          releasePhotoUrl(currentEntry?.url)
          const updatedEntries = { ...currentPhotos }
          delete updatedEntries[dateKey]
          return updatedEntries
        }

        if (currentEntry?.url !== savedPhotoUrl) {
          releasePhotoUrl(currentEntry?.url)
        }
        if (photoToSave?.url && photoToSave.url !== currentEntry?.url) {
          releasePhotoUrl(photoToSave.url)
        }

        return {
          ...currentPhotos,
          [dateKey]: {
            note,
            showNoteInCalendar,
            highlight: draftHighlight,
            highlightColor: draftHighlightColor,
            marker: draftMarker,
            markerColor: draftMarkerColor,
            ...(photoToSave && {
              crop: photoToSave.crop,
              imageBlob: photoToSave.blob,
              imageHeight: photoToSave.imageHeight,
              imageType: photoToSave.type,
              imageWidth: photoToSave.imageWidth,
              url: savedPhotoUrl,
            }),
          },
        }
      })
      setPendingPhoto(null)
      setIsEditingDay(false)
      setIsPhotoRemoved(false)
      setFileError('')
    } catch (error) {
      console.error(`Could not save the entry for ${dateKey}:`, error)
      setFileError('保存失败，请重试。')
    }
  }

  function cancelDayEdit() {
    if (pendingPhoto && !pendingPhoto.usesSavedUrl) {
      releasePhotoUrl(pendingPhoto.url)
    }
    setPendingPhoto(null)
    setDraftNote(selectedEntry?.note || '')
    setDraftShowNoteInCalendar(selectedEntry?.showNoteInCalendar === true)
    setDraftHighlight(Boolean(selectedEntry?.highlight))
    setDraftHighlightColor(selectedEntry?.highlightColor || '#f5edc9')
    setDraftMarker(selectedEntry?.marker || 'none')
    setDraftMarkerColor(selectedEntry?.markerColor || '#b85c55')
    setIsPhotoRemoved(false)
    setIsEditingDay(false)
    setFileError('')
  }

  function removePhotoFromDraft() {
    if (pendingPhoto && !pendingPhoto.usesSavedUrl) {
      releasePhotoUrl(pendingPhoto.url)
    }
    setPendingPhoto(null)
    setIsPhotoRemoved(true)
    setFileError('')
  }

  function adjustSavedPhoto() {
    setPendingPhoto({
      blob: savedPhoto.imageBlob,
      crop: getCropForRatio(savedPhoto.crop, currentPhotoRatio),
      imageHeight: savedPhoto.imageHeight,
      type: savedPhoto.imageType,
      imageWidth: savedPhoto.imageWidth,
      url: savedPhoto.url,
      usesSavedUrl: true,
    })
    setIsPhotoRemoved(false)
  }

  function startCropDrag(event) {
    event.currentTarget.setPointerCapture(event.pointerId)
    cropDragRef.current = {
      pointerId: event.pointerId,
      startCrop: pendingPhoto.crop,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  function moveCrop(event) {
    const drag = cropDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = clamp(drag.startCrop.x - (event.clientX - drag.startX) / bounds.width)
    const y = clamp(drag.startCrop.y - (event.clientY - drag.startY) / bounds.height)
    setPendingPhoto((currentPhoto) => ({
      ...currentPhoto,
      crop: { ...currentPhoto.crop, x, y },
    }))
  }

  function stopCropDrag(event) {
    if (cropDragRef.current?.pointerId === event.pointerId) {
      cropDragRef.current = null
    }
  }

  const selectedDateKey = selectedDate
    ? getDateKey(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      )
    : null
  const selectedEntry = selectedDateKey ? photosByDate[selectedDateKey] : null
  const savedPhoto = selectedEntry?.imageBlob ? selectedEntry : null
  const visibleEditPhoto = pendingPhoto || (!isPhotoRemoved ? savedPhoto : null)
  const savedPhotoLayout = savedPhoto
    ? getPhotoLayout(savedPhoto, currentPhotoRatio)
    : null
  const pendingPhotoLayout = pendingPhoto
    ? getPhotoLayout(pendingPhoto, currentPhotoRatio)
    : null

  return (
    <main className="calendar-page">
      <nav className="calendar-toolbar" aria-label="月历工具栏">
        <button className="month-button" type="button" onClick={() => changeMonth(-1)} aria-label="上一个月">
          <span aria-hidden="true">←</span><span>上个月</span>
        </button>
        <div className="toolbar-date-controls">
          <select value={month} onChange={selectMonth} aria-label="选择月份">
            {monthNames.map((monthName, monthIndex) => (
              <option value={monthIndex} key={monthName}>{monthName}</option>
            ))}
          </select>
          <select value={year} onChange={changeYear} aria-label="选择年份">
            {yearOptions.map((yearOption) => (
              <option value={yearOption} key={yearOption}>{yearOption}</option>
            ))}
          </select>
          <button className="today-button" type="button" onClick={goToToday}>今天</button>
        </div>
        <button className="month-button" type="button" onClick={() => changeMonth(1)} aria-label="下一个月">
          <span>下个月</span><span aria-hidden="true">→</span>
        </button>
        <button className="export-button toolbar-export-button" type="button" onClick={openExportModal}>导出月历</button>
        <div className="preview-zoom-controls" aria-label="预览缩放">
          <span>编辑缩放</span>
          <button type="button" onClick={() => setPreviewZoom((zoom) => Math.max(50, zoom - 25))} aria-label="缩小预览">−</button>
          <output aria-live="polite">{previewZoom}%</output>
          <button type="button" onClick={() => setPreviewZoom((zoom) => Math.min(200, zoom + 25))} aria-label="放大预览">＋</button>
          <button className="fit-preview-button" type="button" onClick={() => setPreviewZoom(100)}>恢复 100%</button>
        </div>
      </nav>

      <div className="workspace-layout">
      <div className="calendar-workspace" ref={calendarWorkspaceRef}>
      <div
        className="editor-calendar-shell"
        style={{
          height: `${scaledPreviewHeight}px`,
          width: `${scaledPreviewWidth}px`,
          marginTop: isDesktopEditor || isMobileEditor
            ? '0px'
            : `${Math.max(0, (calendarWorkspaceSize.height - scaledPreviewHeight) / 2)}px`,
        }}
      >
      <section
        className="calendar editor-calendar"
        aria-label={monthFormatter.format(visibleMonth)}
        style={{
          '--calendar-background': currentAppearance.backgroundColor,
          '--calendar-grid-color': currentAppearance.gridColor,
          '--calendar-date-color': currentAppearance.dateTextColor,
          '--calendar-header-color': currentAppearance.headerTextColor,
          aspectRatio: previewAspectRatio,
          ...(calendarDisplaySize && {
            height: `${calendarDisplaySize.height}px`,
            width: `${calendarDisplaySize.width}px`,
          }),
          transform: `scale(${previewScale})`,
          transformOrigin: 'top left',
          borderRadius: `${currentCornerRadius}px`,
        }}
      >
        <header
          className="paper-month-header"
          style={{
            height: `${previewLayout?.monthHeaderHeight || 0}px`,
            marginBottom: `${previewLayout?.sectionGap || 0}px`,
            marginTop: `${previewLayout?.pagePadding || 0}px`,
            paddingInline: `${previewLayout?.pagePadding || 0}px`,
          }}
        >
          <h1 style={{ fontSize: `${previewLayout?.monthTitleFontSize || 14}px` }}>
            {monthFormatter.format(visibleMonth)}
          </h1>
        </header>

        <div
          className="weekday-row"
          aria-hidden="true"
          style={{
            height: `${previewLayout?.weekdayHeaderHeight || 0}px`,
            margin: `0 ${previewLayout?.pagePadding || 0}px ${previewLayout?.sectionGap || 0}px`,
            '--weekday-font-size': `${previewLayout?.weekdayFontSize || 6}px`,
            '--weekday-letter-spacing': `${previewLayout?.weekdayLetterSpacing || 0.3}px`,
          }}
        >
          {weekdays.map((weekday) => (
            <div className="weekday" key={weekday}>
              {weekday}
            </div>
          ))}
        </div>

        <div
          className={`days-grid${currentCellGap ? ' spaced' : ''}`}
          style={{
            gap: `${currentCellGap}px`,
            height: `${previewLayout?.gridHeight || 0}px`,
            marginInline: `${previewLayout?.pagePadding || 0}px`,
            '--calendar-rows': calendarRows,
            '--date-font-size': `${previewLayout?.dateFontSize || 7}px`,
            '--date-header-height': `${previewLayout?.dateHeaderHeight || 0}px`,
            '--day-cell-height': `${previewLayout?.cellHeight || 0}px`,
            '--note-font-size': `${previewLayout?.noteFontSize || 5}px`,
            '--cell-padding': `${previewLayout?.cellPadding || 1}px`,
            '--content-gap': `${previewLayout?.contentGap || 1}px`,
            '--content-padding-x': `${previewLayout?.contentPaddingX || 1}px`,
            '--content-padding-top': `${previewLayout?.contentPaddingTop || 1}px`,
            '--content-padding-bottom': `${previewLayout?.contentPaddingBottom || 1}px`,
            '--circle-size': `${previewLayout?.circleSize || 10}px`,
            '--circle-border-width': `${previewLayout?.circleBorderWidth || 1}px`,
            '--marker-dot-size': `${previewLayout?.markerDotSize || 3}px`,
            '--marker-star-size': `${previewLayout?.markerStarSize || 6}px`,
            '--marker-gap': `${previewLayout?.markerGap || 2}px`,
            '--note-line-height': previewLayout?.noteLineHeight || 1.4,
            '--note-line-height-px': `${previewLayout?.noteLineHeightPx || 9.8}px`,
            '--note-padding-y': `${previewLayout?.notePaddingY || 1}px`,
          }}
        >
          {calendarDays.map((day, index) => {
            const dateKey = day ? getDateKey(year, month, day) : null
            const entry = dateKey ? photosByDate[dateKey] : null
            const photo = entry?.imageBlob ? entry : null
            const photoLayout = photo
              ? getPhotoLayout(photo, currentPhotoRatio)
              : null
            const hasVisibleNote = Boolean(entry?.note && entry.showNoteInCalendar === true)
            const cellContentLayout = previewLayout
              ? calculateCellContentLayout(previewLayout, {
                  hasNote: hasVisibleNote,
                  noteLineCount: currentAppearance.noteLines,
                })
              : null
            const photoFrame = getPhotoFrameSize(
              currentPhotoRatio,
              previewLayout?.photoMaxWidth || 1,
              cellContentLayout?.photoAreaHeight || 1,
            )

            return (
              <div
                className={`day-cell${day === null ? ' empty' : ''}${
                  isToday(day) ? ' today' : ''
                }`}
                key={`${year}-${month}-${index}`}
                style={day ? {
                  backgroundColor: entry?.highlight
                    ? entry.highlightColor
                    : currentAppearance.backgroundColor,
                  borderColor: currentAppearance.gridColor,
                  borderRadius: `${currentCornerRadius}px`,
                  color: currentAppearance.dateTextColor,
                } : undefined}
              >
                {day !== null && (
                  <button
                    className="date-button"
                    type="button"
                    onClick={() => openDateModal(day)}
                    aria-label={fullDateFormatter.format(new Date(year, month, day))}
                  >
                    <div className="date-header">
                      <time
                        className={entry?.marker === 'circle' ? 'circle-marker' : ''}
                        dateTime={dateKey}
                        style={entry?.marker === 'circle' ? { borderColor: entry.markerColor } : undefined}
                      >
                        {day}
                      </time>
                      {entry?.marker && entry.marker !== 'none' && entry.marker !== 'circle' && (
                        <span className={`day-marker ${entry.marker}`} style={{ color: entry.markerColor }}>
                          {getMarkerSymbol(entry.marker)}
                        </span>
                      )}
                    </div>
                    <div className={`day-content${photo ? ' has-photo' : ''}${hasVisibleNote ? ' has-note' : ''}`}>
                      {photo && (
                        <div className="day-photo-area">
                          <div
                            className="day-photo-frame"
                            style={{
                              aspectRatio: currentPhotoRatioValue,
                              '--photo-frame-width': `${photoFrame.width}px`,
                              '--photo-frame-height': `${photoFrame.height}px`,
                            }}
                            data-photo-ratio={currentPhotoRatio}
                          >
                            <div
                              className="photo-transform"
                              style={photoLayout.wrapperStyle}
                            >
                              <img
                                src={photo.url}
                                alt=""
                                style={photoLayout.imageStyle}
                                onLoad={(event) => rememberPhotoDimensions(dateKey, event)}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      {hasVisibleNote && (
                        <div
                          className="day-note-area"
                          style={{ height: `${cellContentLayout?.noteAreaHeight || 0}px` }}
                        >
                          <p className="day-note-preview" style={{ '--note-lines': currentAppearance.noteLines }}>
                            {entry.note}
                          </p>
                        </div>
                      )}
                      {!photo && !hasVisibleNote && <span className="day-empty-mark" aria-hidden="true">·</span>}
                    </div>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>
      </div>
      </div>

      <aside className="calendar-sidebar" aria-label="月历设置">
        <h2>月历设置</h2>
        <p className="sidebar-month">{monthFormatter.format(visibleMonth)}</p>
        <div className="customize-fields">
              <label className="customize-select-field">
                <span>页面比例</span>
                <select value={currentAppearance.pageRatio} onChange={(event) => changeMonthAppearance('pageRatio', event.target.value)}>
                  <option value="default">默认</option>
                  <option value="4:3">4:3</option>
                  <option value="3:2">3:2</option>
                  <option value="16:9">16:9</option>
                  <option value="1:1">1:1</option>
                  <option value="custom">自定义</option>
                </select>
                <small className="setting-help">页面比例会同时影响当前月历布局和导出图片。</small>
              </label>
              <label className="customize-select-field">
                <span>方向</span>
                <select value={currentAppearance.orientation} onChange={(event) => changeMonthAppearance('orientation', event.target.value)}>
                  <option value="landscape">横向</option>
                  <option value="portrait">纵向</option>
                </select>
              </label>
              {currentAppearance.pageRatio === 'custom' && (
                <div className="custom-ratio-fields">
                  <label><span>宽度比例</span><input type="number" min="0.1" step="0.1" value={currentAppearance.customRatioWidth} onChange={(event) => changeMonthAppearance('customRatioWidth', Number(event.target.value))} /></label>
                  <label><span>高度比例</span><input type="number" min="0.1" step="0.1" value={currentAppearance.customRatioHeight} onChange={(event) => changeMonthAppearance('customRatioHeight', Number(event.target.value))} /></label>
                  {customRatioInvalid && <p className="settings-error">请输入有效的页面比例。</p>}
                </div>
              )}

              <label className="customize-select-field">
                <span>图片比例</span>
                <select value={currentPhotoRatio} onChange={changePhotoRatio}>
                  {Object.keys(photoRatios).map((ratio) => <option value={ratio} key={ratio}>{ratio}</option>)}
                </select>
              </label>

              {[
                ['backgroundColor', '月历背景'],
                ['gridColor', '网格颜色'],
                ['dateTextColor', '日期颜色'],
                ['headerTextColor', '标题颜色'],
              ].map(([field, label]) => (
                <label className="color-field" key={field}>
                  <span>{label}</span>
                  <input type="color" value={currentAppearance[field]} onChange={(event) => changeMonthAppearance(field, event.target.value)} />
                  <output>{currentAppearance[field].toUpperCase()}</output>
                </label>
              ))}

              <label className="customize-select-field">
                <span>文字显示行数</span>
                <select value={currentAppearance.noteLines} onChange={(event) => changeMonthAppearance('noteLines', Number(event.target.value))}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>

              <label className="customize-select-field">
                <span>圆角</span>
                <select value={currentAppearance.cornerStyle} onChange={(event) => changeMonthAppearance('cornerStyle', event.target.value)}>
                  <option value="square">直角</option>
                  <option value="slightly-rounded">轻微圆角</option>
                  <option value="rounded">圆角</option>
                </select>
              </label>

              <label className="customize-select-field">
                <span>日期格间距</span>
                <select value={currentAppearance.cellGap} onChange={(event) => changeMonthAppearance('cellGap', event.target.value)}>
                  <option value="none">无</option>
                  <option value="small">小</option>
                </select>
              </label>
            </div>

            {isApplyAppearanceConfirming ? (
              <div className="apply-confirmation">
                <p>将当前外观应用到所有月份？照片和日期记录不会改变。</p>
                <button className="add-photo-button" type="button" onClick={applyAppearanceToAllMonths}>确认</button>
                <button className="close-button" type="button" onClick={() => setIsApplyAppearanceConfirming(false)}>取消</button>
              </div>
            ) : (
              <button className="close-button apply-all-button" type="button" onClick={() => setIsApplyAppearanceConfirming(true)}>
                应用到所有月份
              </button>
            )}
      </aside>
      </div>

      {isExportModalOpen && exportFrom && exportTo && (
        <div className="modal-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeExportModal()
        }}>
          <section className="date-modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
            <button className="modal-x-button" type="button" onClick={closeExportModal} aria-label="关闭导出窗口">×</button>
            <p className="modal-label">{exportFormat.toUpperCase()} 导出</p>
            <h2 id="export-modal-title">导出月历</h2>

            <div className="export-range">
              <fieldset>
                <legend>开始月份</legend>
                <label>
                  <span>月份</span>
                  <select aria-label="开始月份" value={exportFrom.month} onChange={(event) => setExportFrom({ ...exportFrom, month: Number(event.target.value) })}>
                    {monthNames.map((name, index) => <option value={index} key={name}>{name}</option>)}
                  </select>
                </label>
                <label>
                  <span>年份</span>
                  <select aria-label="开始年份" value={exportFrom.year} onChange={(event) => setExportFrom({ ...exportFrom, year: Number(event.target.value) })}>
                    {yearOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                </label>
              </fieldset>

              <fieldset>
                <legend>结束月份</legend>
                <label>
                  <span>月份</span>
                  <select aria-label="结束月份" value={exportTo.month} onChange={(event) => setExportTo({ ...exportTo, month: Number(event.target.value) })}>
                    {monthNames.map((name, index) => <option value={index} key={name}>{name}</option>)}
                  </select>
                </label>
                <label>
                  <span>年份</span>
                  <select aria-label="结束年份" value={exportTo.year} onChange={(event) => setExportTo({ ...exportTo, year: Number(event.target.value) })}>
                    {yearOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                </label>
              </fieldset>
            </div>

            <label className="export-format-field">
              <span>导出格式</span>
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </label>
            <p className="export-page-note">页面比例：跟随月份设置<br />方向：跟随月份设置</p>
            <p className="export-page-help">导出使用固定高清长边 2400px，并保持各月份的页面比例。</p>

            {exportValidationMessage ? (
              <p className="export-message error">{exportValidationMessage}</p>
            ) : (
              <p className="export-message">将导出 {exportMonthCount} 张月历。</p>
            )}
            {exportStatus && <p className={`export-status${exportStatus.startsWith('导出失败') ? ' error' : ''}`} aria-live="polite">{exportStatus}</p>}

            <div className="modal-actions">
              <button className="add-photo-button" type="button" onClick={exportCalendars} disabled={Boolean(exportValidationMessage) || exportStatus.startsWith('正在导出')}>
                导出 {exportFormat.toUpperCase()}
              </button>
              <button className="close-button" type="button" onClick={closeExportModal}>关闭</button>
            </div>
          </section>
        </div>
      )}

      <div className="export-render-host" aria-hidden="true">
        {activeExportCalendar && <CalendarExportView calendar={activeExportCalendar} svgRef={exportViewRef} />}
      </div>

      {selectedDate && (
        <div className="modal-overlay" onMouseDown={closeOnOverlay}>
          <section
            className="date-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="date-modal-title"
          >
            <button
              className="modal-x-button"
              type="button"
              onClick={closeDateModal}
              aria-label="关闭"
            >
              ×
            </button>

            <p className="modal-label">所选日期</p>
            <h2 id="date-modal-title">
              {fullDateFormatter.format(selectedDate)}
            </h2>

            <input
              ref={fileInputRef}
              className="photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelection}
            />

            {isEditingDay ? (
              <>
                {pendingPhoto ? (
                  <div className="crop-section">
                <p className="crop-title">调整图片</p>
                <div className="crop-editor">
                  <div
                    className="crop-frame"
                    style={{
                      aspectRatio: currentPhotoRatioValue,
                      width: `min(100%, ${cropFrameWidth}px)`,
                    }}
                    onPointerDown={startCropDrag}
                    onPointerMove={moveCrop}
                    onPointerUp={stopCropDrag}
                    onPointerCancel={stopCropDrag}
                  >
                    <div
                      className="photo-transform"
                      style={pendingPhotoLayout.wrapperStyle}
                    >
                      <img
                        src={pendingPhoto.url}
                        alt={`Crop preview for ${fullDateFormatter.format(selectedDate)}`}
                        draggable="false"
                        style={pendingPhotoLayout.imageStyle}
                        onLoad={handlePendingImageLoad}
                        onError={handlePendingImageError}
                      />
                    </div>
                  </div>
                </div>
                <p className="crop-help">拖动图片来调整保留区域。</p>

                <div className="zoom-control">
                  <label htmlFor="photo-zoom">缩放</label>
                  <button
                    type="button"
                    onClick={() => adjustZoom(-0.05)}
                    aria-label="缩小"
                  >
                    −
                  </button>
                  <input
                    id="photo-zoom"
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.05"
                    value={pendingPhoto.crop.zoom}
                    onInput={changeZoom}
                  />
                  <button
                    type="button"
                    onClick={() => adjustZoom(0.05)}
                    aria-label="放大"
                  >
                    +
                  </button>
                  <output htmlFor="photo-zoom">
                    {Math.round(pendingPhoto.crop.zoom * 100)}%
                  </output>
                </div>

                <div className="rotate-controls">
                  <span>旋转</span>
                  <button type="button" onClick={() => rotatePhoto(-90)}>
                    ↺ 向左旋转
                  </button>
                  <button type="button" onClick={() => rotatePhoto(90)}>
                    向右旋转 ↻
                  </button>
                </div>

                <button className="reset-crop-button" type="button" onClick={resetCrop}>
                  重置
                </button>
                  </div>
                ) : savedPhoto && !isPhotoRemoved ? (
                  <div className="photo-preview">
                <div
                  className="saved-photo-frame"
                  style={{
                    aspectRatio: currentPhotoRatioValue,
                    width: `min(100%, ${cropFrameWidth}px)`,
                  }}
                >
                  <div
                    className="photo-transform"
                    style={savedPhotoLayout.wrapperStyle}
                  >
                    <img
                      src={savedPhoto.url}
                      alt={`Photo for ${fullDateFormatter.format(selectedDate)}`}
                      style={savedPhotoLayout.imageStyle}
                      onLoad={(event) =>
                        rememberPhotoDimensions(selectedDateKey, event)
                      }
                    />
                  </div>
                </div>
                  </div>
                ) : null}

                <label className="note-field">
                  <span>文字记录</span>
                  <textarea
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    rows="5"
                    placeholder="记录这一天……"
                  />
                </label>

                <label className="toggle-field note-calendar-toggle">
                  <span>在月历格中显示文字</span>
                  <input
                    type="checkbox"
                    checked={draftShowNoteInCalendar}
                    onChange={(event) => setDraftShowNoteInCalendar(event.target.checked)}
                  />
                </label>

                <div className="day-decoration-fields">
                  <label className="toggle-field">
                    <span>日期高亮</span>
                    <input type="checkbox" checked={draftHighlight} onChange={(event) => setDraftHighlight(event.target.checked)} />
                  </label>
                  {draftHighlight && (
                    <label className="color-field compact">
                      <span>高亮颜色</span>
                      <input type="color" value={draftHighlightColor} onChange={(event) => setDraftHighlightColor(event.target.value)} />
                      <output>{draftHighlightColor.toUpperCase()}</output>
                    </label>
                  )}
                  <label className="customize-select-field">
                    <span>日期标记</span>
                    <select value={draftMarker} onChange={(event) => setDraftMarker(event.target.value)}>
                      <option value="none">无</option>
                      <option value="dot">圆点</option>
                      <option value="circle">圆圈</option>
                      <option value="star">星标</option>
                    </select>
                  </label>
                  {draftMarker !== 'none' && (
                    <label className="color-field compact">
                      <span>标记颜色</span>
                      <input type="color" value={draftMarkerColor} onChange={(event) => setDraftMarkerColor(event.target.value)} />
                      <output>{draftMarkerColor.toUpperCase()}</output>
                    </label>
                  )}
                </div>

                {fileError && <p className="file-error">{fileError}</p>}

                <div className="photo-edit-actions">
                  <button className="close-button" type="button" onClick={choosePhoto}>
                    {visibleEditPhoto ? '更换图片' : '添加图片'}
                  </button>
                  {savedPhoto && !isPhotoRemoved && !pendingPhoto && (
                    <button className="close-button" type="button" onClick={adjustSavedPhoto}>
                      调整图片
                    </button>
                  )}
                  {visibleEditPhoto && (
                    <button className="delete-photo-button" type="button" onClick={removePhotoFromDraft}>
                      删除图片
                    </button>
                  )}
                </div>

                <div className="modal-actions">
                  <button className="add-photo-button" type="button" onClick={saveDayEntry}>
                    保存
                  </button>
                  <button className="close-button" type="button" onClick={cancelDayEdit}>
                    取消
                  </button>
                </div>
              </>
            ) : (
              <>
                {(selectedEntry?.highlight || (selectedEntry?.marker && selectedEntry.marker !== 'none')) && (
                  <div className="view-decoration" style={{ backgroundColor: selectedEntry.highlight ? selectedEntry.highlightColor : 'transparent' }}>
                    <span
                      className={selectedEntry.marker === 'circle' ? 'circle-marker' : ''}
                      style={{ color: selectedEntry.markerColor, borderColor: selectedEntry.markerColor }}
                    >
                      {selectedEntry.marker === 'circle' ? selectedDate.getDate() : getMarkerSymbol(selectedEntry.marker)}
                    </span>
                  </div>
                )}
                {savedPhoto && (
                  <div className="photo-preview day-view-photo">
                    <div
                      className="saved-photo-frame"
                      style={{
                        aspectRatio: currentPhotoRatioValue,
                        width: `min(100%, ${cropFrameWidth}px)`,
                      }}
                    >
                      <div className="photo-transform" style={savedPhotoLayout.wrapperStyle}>
                        <img
                          src={savedPhoto.url}
                          alt={`Photo for ${fullDateFormatter.format(selectedDate)}`}
                          style={savedPhotoLayout.imageStyle}
                          onLoad={(event) => rememberPhotoDimensions(selectedDateKey, event)}
                        />
                      </div>
                    </div>
                  </div>
                )}
                {selectedEntry?.note && <p className="day-view-note">{selectedEntry.note}</p>}
                {!savedPhoto && !selectedEntry?.note && <p className="day-empty-state">当天暂无记录。</p>}

                <div className="modal-actions">
                  <button className="add-photo-button" type="button" onClick={startEditingDay}>
                    {selectedEntry ? '编辑' : '添加记录'}
                  </button>
                  <button className="close-button" type="button" onClick={closeDateModal}>
                    关闭
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default App
