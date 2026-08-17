import { useEffect, useRef, useState } from 'react'
import {
  deletePhotoRecord,
  getAllPhotos,
  savePhotoRecord,
} from './photoDatabase.js'
import CalendarExportView from './CalendarExportView.jsx'
import { exportViewWidth, getExportViewHeight } from './calendarExportLayout.js'
import {
  getCellGap,
  getCornerRadius,
  getMarkerSymbol,
  getMonthAppearance,
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
const exportWidth = 1920

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
    return savedSettings && typeof savedSettings === 'object'
      ? savedSettings
      : {}
  } catch (error) {
    console.error('Could not read the saved photo ratios:', error)
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
  const [isPhotoRemoved, setIsPhotoRemoved] = useState(false)
  const [draftHighlight, setDraftHighlight] = useState(false)
  const [draftHighlightColor, setDraftHighlightColor] = useState('#f5edc9')
  const [draftMarker, setDraftMarker] = useState('none')
  const [draftMarkerColor, setDraftMarkerColor] = useState('#b85c55')
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [isApplyAppearanceConfirming, setIsApplyAppearanceConfirming] = useState(false)
  const [fileError, setFileError] = useState('')
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportFrom, setExportFrom] = useState(null)
  const [exportTo, setExportTo] = useState(null)
  const [activeExportCalendar, setActiveExportCalendar] = useState(null)
  const [exportFormat, setExportFormat] = useState('png')
  const [exportStatus, setExportStatus] = useState('')
  const fileInputRef = useRef(null)
  const exportViewRef = useRef(null)
  const objectUrlsRef = useRef(new Set())
  const cropDragRef = useRef(null)

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
        photoRecords.forEach(({ dateKey, imageBlob, imageType, crop, imageWidth, imageHeight, note = '', highlight = false, highlightColor = '#f5edc9', marker = 'none', markerColor = '#b85c55' }) => {
          restoredPhotos[dateKey] = {
            crop,
            imageBlob,
            imageHeight,
            imageType: imageType || imageBlob?.type,
            imageWidth,
            note,
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

  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()
  const monthKey = getMonthKey(year, month)
  const currentAppearance = getMonthAppearance(monthSettings, monthKey)
  const currentPhotoRatio = currentAppearance.photoRatio
  const currentPhotoRatioValue = photoRatios[currentPhotoRatio]
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
      console.error('Could not save the photo ratios:', error)
    }
  }, [monthSettings])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const calendarDays = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]
  const calendarRows = Math.ceil(calendarDays.length / 7)
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
    ? 'Start month must be earlier than or equal to end month.'
    : exportMonthCount > 24
      ? 'You can export up to 24 months at a time.'
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

  async function downloadCalendar(calendar) {
    const calendarWithDimensions = await addMissingPhotoDimensions(calendar)
    setActiveExportCalendar(calendarWithDimensions)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    if (!exportViewRef.current) {
      throw new Error('The calendar export view was not rendered.')
    }

    const outputHeight = Math.round(
      (getExportViewHeight(calendarWithDimensions.rows) / exportViewWidth) * exportWidth,
    )
    const svg = exportViewRef.current.cloneNode(true)
    svg.setAttribute('width', exportWidth)
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
      canvas.width = exportWidth
      canvas.height = outputHeight
      const context = canvas.getContext('2d')
      context.fillStyle = '#fffdf8'
      context.fillRect(0, 0, exportWidth, outputHeight)
      context.drawImage(image, 0, 0, exportWidth, outputHeight)

      const mimeType = exportFormat === 'jpg' ? 'image/jpeg' : 'image/png'
      const extension = exportFormat === 'jpg' ? 'jpg' : 'png'
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
      link.download = `photo-calendar-${getMonthKey(calendarWithDimensions.year, calendarWithDimensions.month)}.${extension}`
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
    if (!exportStatus.startsWith('Exporting')) {
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
      const calendar = getCalendarExportData(
        exportYear,
        exportMonth,
        photosByDate,
        monthSettings,
        today,
      )
      setExportStatus(`Exporting ${index + 1} / ${exportMonthCount}...`)

      try {
        await downloadCalendar(calendar)
      } catch (error) {
        console.error(`Could not export ${calendar.title}:`, error)
        setExportStatus('Failed to export this calendar.')
        setActiveExportCalendar(null)
        return
      }
    }

    setActiveExportCalendar(null)
    setExportStatus('Export complete.')
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
      setFileError('Please choose a JPG, PNG, or WebP image.')
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

    try {
      const hasDayDecoration = draftHighlight || draftMarker !== 'none'
      if (!photoToSave && !note.trim() && !hasDayDecoration) {
        await deletePhotoRecord(dateKey)
      } else {
        await savePhotoRecord({
          dateKey,
          note,
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

      setPhotosByDate((currentPhotos) => {
        const currentEntry = currentPhotos[dateKey]
        if (!photoToSave && !note.trim() && !hasDayDecoration) {
          releasePhotoUrl(currentEntry?.url)
          const updatedEntries = { ...currentPhotos }
          delete updatedEntries[dateKey]
          return updatedEntries
        }

        if (currentEntry?.url !== photoToSave?.url) {
          releasePhotoUrl(currentEntry?.url)
        }

        return {
          ...currentPhotos,
          [dateKey]: {
            note,
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
              url: photoToSave.url,
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
      setFileError('The entry could not be saved. Please try again.')
    }
  }

  function cancelDayEdit() {
    if (pendingPhoto && !pendingPhoto.usesSavedUrl) {
      releasePhotoUrl(pendingPhoto.url)
    }
    setPendingPhoto(null)
    setDraftNote(selectedEntry?.note || '')
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
      <section
        className="calendar"
        aria-label={monthFormatter.format(visibleMonth)}
        style={{
          '--calendar-background': currentAppearance.backgroundColor,
          '--calendar-grid-color': currentAppearance.gridColor,
          '--calendar-date-color': currentAppearance.dateTextColor,
          '--calendar-header-color': currentAppearance.headerTextColor,
          borderRadius: `${currentCornerRadius}px`,
        }}
      >
        <header className="calendar-header">
          <button
            className="month-button"
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
          >
            <span aria-hidden="true">←</span>
            <span>Previous</span>
          </button>

          <div className="calendar-title">
            <h1>{monthFormatter.format(visibleMonth)}</h1>

            <div className="date-jump-controls">
              <select
                value={month}
                onChange={selectMonth}
                aria-label="Choose month"
              >
                {monthNames.map((monthName, monthIndex) => (
                  <option value={monthIndex} key={monthName}>
                    {monthName}
                  </option>
                ))}
              </select>

              <select value={year} onChange={changeYear} aria-label="Choose year">
                {yearOptions.map((yearOption) => (
                  <option value={yearOption} key={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>

              <button className="today-button" type="button" onClick={goToToday}>
                Today
              </button>
            </div>

            <label className="ratio-control">
              <span>Photo Ratio</span>
              <select value={currentPhotoRatio} onChange={changePhotoRatio}>
                {Object.keys(photoRatios).map((ratio) => (
                  <option value={ratio} key={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </label>
            <button className="customize-button" type="button" onClick={() => setIsCustomizeOpen(true)}>
              Customize
            </button>
          </div>

          <button
            className="month-button"
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
          >
            <span>Next</span>
            <span aria-hidden="true">→</span>
          </button>
        </header>

        <div className="weekday-row" aria-hidden="true">
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
            '--day-cell-height': `${190 - (currentCellGap * (calendarRows - 1)) / calendarRows}px`,
            '--mobile-day-cell-height': `${112 - (currentCellGap * (calendarRows - 1)) / calendarRows}px`,
          }}
        >
          {calendarDays.map((day, index) => {
            const dateKey = day ? getDateKey(year, month, day) : null
            const entry = dateKey ? photosByDate[dateKey] : null
            const photo = entry?.imageBlob ? entry : null
            const photoLayout = photo
              ? getPhotoLayout(photo, currentPhotoRatio)
              : null
            const photoFrame = getPhotoFrameSize(currentPhotoRatio, 112, 82)

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
                    <div className="day-content">
                      {photo && (
                        <div
                          className="day-photo-frame"
                          style={{
                            aspectRatio: currentPhotoRatioValue,
                            '--photo-frame-width': `${photoFrame.width}px`,
                            '--mobile-photo-frame-width': `${Math.min(66, 48 * currentPhotoRatioValue)}px`,
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
                      )}
                      {currentAppearance.showNotes && entry?.note && (
                        <p className="day-note-preview" style={{ '--note-lines': currentAppearance.noteLines }}>
                          {entry.note}
                        </p>
                      )}
                      {!photo && !(currentAppearance.showNotes && entry?.note) && <span className="day-empty-mark" aria-hidden="true">·</span>}
                    </div>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {isCustomizeOpen && (
        <div className="modal-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsCustomizeOpen(false)
        }}>
          <section className="date-modal customize-modal" role="dialog" aria-modal="true" aria-labelledby="customize-title">
            <button className="modal-x-button" type="button" onClick={() => setIsCustomizeOpen(false)} aria-label="Close customize dialog">×</button>
            <p className="modal-label">Current month</p>
            <h2 id="customize-title">Customize Calendar</h2>

            <div className="customize-fields">
              {[
                ['backgroundColor', 'Calendar Background'],
                ['gridColor', 'Grid Color'],
                ['dateTextColor', 'Date Text Color'],
                ['headerTextColor', 'Header Text Color'],
              ].map(([field, label]) => (
                <label className="color-field" key={field}>
                  <span>{label}</span>
                  <input type="color" value={currentAppearance[field]} onChange={(event) => changeMonthAppearance(field, event.target.value)} />
                  <output>{currentAppearance[field].toUpperCase()}</output>
                </label>
              ))}

              <label className="toggle-field">
                <span>Show Notes on Calendar</span>
                <input type="checkbox" checked={currentAppearance.showNotes} onChange={(event) => changeMonthAppearance('showNotes', event.target.checked)} />
              </label>

              {currentAppearance.showNotes && (
                <label className="customize-select-field">
                  <span>Note Preview Lines</span>
                  <select value={currentAppearance.noteLines} onChange={(event) => changeMonthAppearance('noteLines', Number(event.target.value))}>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </label>
              )}

              <label className="customize-select-field">
                <span>Corner Style</span>
                <select value={currentAppearance.cornerStyle} onChange={(event) => changeMonthAppearance('cornerStyle', event.target.value)}>
                  <option value="square">Square</option>
                  <option value="slightly-rounded">Slightly Rounded</option>
                  <option value="rounded">Rounded</option>
                </select>
              </label>

              <label className="customize-select-field">
                <span>Cell Spacing</span>
                <select value={currentAppearance.cellGap} onChange={(event) => changeMonthAppearance('cellGap', event.target.value)}>
                  <option value="none">None</option>
                  <option value="small">Small</option>
                </select>
              </label>
            </div>

            {isApplyAppearanceConfirming ? (
              <div className="apply-confirmation">
                <p>Apply this appearance to all months? Day entries will not be changed.</p>
                <button className="add-photo-button" type="button" onClick={applyAppearanceToAllMonths}>Confirm</button>
                <button className="close-button" type="button" onClick={() => setIsApplyAppearanceConfirming(false)}>Cancel</button>
              </div>
            ) : (
              <button className="close-button apply-all-button" type="button" onClick={() => setIsApplyAppearanceConfirming(true)}>
                Apply Appearance to All Months
              </button>
            )}
          </section>
        </div>
      )}

      <div className="export-entry">
        <button className="export-button" type="button" onClick={openExportModal}>
          Export Calendars
        </button>
      </div>

      {isExportModalOpen && exportFrom && exportTo && (
        <div className="modal-overlay" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeExportModal()
        }}>
          <section className="date-modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
            <button className="modal-x-button" type="button" onClick={closeExportModal} aria-label="Close export dialog">×</button>
            <p className="modal-label">PNG export</p>
            <h2 id="export-modal-title">Export Calendars</h2>

            <div className="export-range">
              <fieldset>
                <legend>From</legend>
                <label>
                  <span>Month</span>
                  <select aria-label="From month" value={exportFrom.month} onChange={(event) => setExportFrom({ ...exportFrom, month: Number(event.target.value) })}>
                    {monthNames.map((name, index) => <option value={index} key={name}>{name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Year</span>
                  <select aria-label="From year" value={exportFrom.year} onChange={(event) => setExportFrom({ ...exportFrom, year: Number(event.target.value) })}>
                    {yearOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                </label>
              </fieldset>

              <fieldset>
                <legend>To</legend>
                <label>
                  <span>Month</span>
                  <select aria-label="To month" value={exportTo.month} onChange={(event) => setExportTo({ ...exportTo, month: Number(event.target.value) })}>
                    {monthNames.map((name, index) => <option value={index} key={name}>{name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Year</span>
                  <select aria-label="To year" value={exportTo.year} onChange={(event) => setExportTo({ ...exportTo, year: Number(event.target.value) })}>
                    {yearOptions.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                </label>
              </fieldset>
            </div>

            <label className="export-format-field">
              <span>Export Format</span>
              <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)}>
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </label>

            {exportValidationMessage ? (
              <p className="export-message error">{exportValidationMessage}</p>
            ) : (
              <p className="export-message">{exportMonthCount} {exportMonthCount === 1 ? 'calendar' : 'calendars'} will be exported.</p>
            )}
            {exportStatus && <p className={`export-status${exportStatus.startsWith('Failed') ? ' error' : ''}`} aria-live="polite">{exportStatus}</p>}

            <div className="modal-actions">
              <button className="add-photo-button" type="button" onClick={exportCalendars} disabled={Boolean(exportValidationMessage) || exportStatus.startsWith('Exporting')}>
                Export {exportFormat.toUpperCase()}
              </button>
              <button className="close-button" type="button" onClick={closeExportModal}>Close</button>
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
              aria-label="Close"
            >
              ×
            </button>

            <p className="modal-label">Selected date</p>
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
                <p className="crop-title">Crop Photo</p>
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
                      />
                    </div>
                  </div>
                </div>
                <p className="crop-help">Drag the photo to choose the area to keep.</p>

                <div className="zoom-control">
                  <label htmlFor="photo-zoom">Zoom</label>
                  <button
                    type="button"
                    onClick={() => adjustZoom(-0.05)}
                    aria-label="Zoom out"
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
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <output htmlFor="photo-zoom">
                    {Math.round(pendingPhoto.crop.zoom * 100)}%
                  </output>
                </div>

                <div className="rotate-controls">
                  <span>Rotate</span>
                  <button type="button" onClick={() => rotatePhoto(-90)}>
                    ↺ Rotate Left
                  </button>
                  <button type="button" onClick={() => rotatePhoto(90)}>
                    Rotate Right ↻
                  </button>
                </div>

                <button className="reset-crop-button" type="button" onClick={resetCrop}>
                  Reset
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
                  <span>Note</span>
                  <textarea
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    rows="5"
                    placeholder="Write something about this day..."
                  />
                </label>

                <div className="day-decoration-fields">
                  <label className="toggle-field">
                    <span>Highlight Day</span>
                    <input type="checkbox" checked={draftHighlight} onChange={(event) => setDraftHighlight(event.target.checked)} />
                  </label>
                  {draftHighlight && (
                    <label className="color-field compact">
                      <span>Highlight Color</span>
                      <input type="color" value={draftHighlightColor} onChange={(event) => setDraftHighlightColor(event.target.value)} />
                      <output>{draftHighlightColor.toUpperCase()}</output>
                    </label>
                  )}
                  <label className="customize-select-field">
                    <span>Marker</span>
                    <select value={draftMarker} onChange={(event) => setDraftMarker(event.target.value)}>
                      <option value="none">None</option>
                      <option value="dot">Dot</option>
                      <option value="circle">Circle</option>
                      <option value="star">Star</option>
                    </select>
                  </label>
                  {draftMarker !== 'none' && (
                    <label className="color-field compact">
                      <span>Marker Color</span>
                      <input type="color" value={draftMarkerColor} onChange={(event) => setDraftMarkerColor(event.target.value)} />
                      <output>{draftMarkerColor.toUpperCase()}</output>
                    </label>
                  )}
                </div>

                {fileError && <p className="file-error">{fileError}</p>}

                <div className="photo-edit-actions">
                  <button className="close-button" type="button" onClick={choosePhoto}>
                    {visibleEditPhoto ? 'Replace Photo' : 'Add Photo'}
                  </button>
                  {savedPhoto && !isPhotoRemoved && !pendingPhoto && (
                    <button className="close-button" type="button" onClick={adjustSavedPhoto}>
                      Adjust Crop
                    </button>
                  )}
                  {visibleEditPhoto && (
                    <button className="delete-photo-button" type="button" onClick={removePhotoFromDraft}>
                      Delete Photo
                    </button>
                  )}
                </div>

                <div className="modal-actions">
                  <button className="add-photo-button" type="button" onClick={saveDayEntry}>
                    Save
                  </button>
                  <button className="close-button" type="button" onClick={cancelDayEdit}>
                    Cancel
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
                {!savedPhoto && !selectedEntry?.note && <p className="day-empty-state">No entry for this day.</p>}

                <div className="modal-actions">
                  <button className="add-photo-button" type="button" onClick={startEditingDay}>
                    {selectedEntry ? 'Edit' : 'Add Entry'}
                  </button>
                  <button className="close-button" type="button" onClick={closeDateModal}>
                    Close
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
