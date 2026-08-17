import { useEffect, useRef, useState } from 'react'
import {
  deletePhotoRecord,
  getAllPhotos,
  savePhotoRecord,
} from './photoDatabase.js'

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
const photoRatios = {
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}
const visibleMonthStorageKey = 'photo-calendar-visible-month'
const monthSettingsStorageKey = 'calendarMonthSettings'

function getDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
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
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef(null)
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
        photoRecords.forEach(({ dateKey, imageBlob, imageType, crop, imageWidth, imageHeight }) => {
          restoredPhotos[dateKey] = {
            crop,
            imageBlob,
            imageHeight,
            imageType: imageType || imageBlob.type,
            imageWidth,
            url: createPhotoUrl(imageBlob),
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
  const currentPhotoRatio = photoRatios[monthSettings[monthKey]?.photoRatio]
    ? monthSettings[monthKey].photoRatio
    : '1:1'
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
      [monthKey]: { photoRatio },
    }))
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
    setSelectedDate(new Date(year, month, day))
    setPendingPhoto(null)
    setFileError('')
  }

  function closeDateModal() {
    if (pendingPhoto && !pendingPhoto.usesSavedUrl) {
      releasePhotoUrl(pendingPhoto.url)
    }
    setSelectedDate(null)
    setPendingPhoto(null)
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

  async function savePhoto() {
    const dateKey = getDateKey(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    )
    try {
      await savePhotoRecord({
        dateKey,
        crop: pendingPhoto.crop,
        imageBlob: pendingPhoto.blob,
        imageHeight: pendingPhoto.imageHeight,
        imageType: pendingPhoto.type,
        imageWidth: pendingPhoto.imageWidth,
      })

      setPhotosByDate((currentPhotos) => {
        const previousPhoto = currentPhotos[dateKey]
        if (previousPhoto?.url !== pendingPhoto.url) {
          releasePhotoUrl(previousPhoto?.url)
        }
        return {
          ...currentPhotos,
          [dateKey]: {
            crop: pendingPhoto.crop,
            imageBlob: pendingPhoto.blob,
            imageHeight: pendingPhoto.imageHeight,
            imageType: pendingPhoto.type,
            imageWidth: pendingPhoto.imageWidth,
            url: pendingPhoto.url,
          },
        }
      })
      setPendingPhoto(null)
      setSelectedDate(null)
      setFileError('')
    } catch (error) {
      console.error(`Could not save the photo for ${dateKey}:`, error)
      setFileError('The photo could not be saved. Please try again.')
    }
  }

  function cancelPhotoSelection() {
    if (pendingPhoto && !pendingPhoto.usesSavedUrl) {
      releasePhotoUrl(pendingPhoto.url)
    }
    setPendingPhoto(null)
    setFileError('')
  }

  async function deletePhoto() {
    const dateKey = getDateKey(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    )

    try {
      await deletePhotoRecord(dateKey)
      setPhotosByDate((currentPhotos) => {
        releasePhotoUrl(currentPhotos[dateKey]?.url)
        const updatedPhotos = { ...currentPhotos }
        delete updatedPhotos[dateKey]
        return updatedPhotos
      })
      setSelectedDate(null)
      setFileError('')
    } catch (error) {
      console.error(`Could not delete the photo for ${dateKey}:`, error)
      setFileError('The photo could not be deleted. Please try again.')
    }
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
  const savedPhoto = selectedDateKey ? photosByDate[selectedDateKey] : null
  const savedPhotoLayout = savedPhoto
    ? getPhotoLayout(savedPhoto, currentPhotoRatio)
    : null
  const pendingPhotoLayout = pendingPhoto
    ? getPhotoLayout(pendingPhoto, currentPhotoRatio)
    : null

  return (
    <main className="calendar-page">
      <section className="calendar" aria-label={monthFormatter.format(visibleMonth)}>
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
          className="days-grid"
          style={{ '--photo-ratio': currentPhotoRatioValue }}
        >
          {calendarDays.map((day, index) => {
            const dateKey = day ? getDateKey(year, month, day) : null
            const photo = dateKey ? photosByDate[dateKey] : null
            const photoLayout = photo
              ? getPhotoLayout(photo, currentPhotoRatio)
              : null

            return (
              <div
                className={`day-cell${day === null ? ' empty' : ''}${
                  isToday(day) ? ' today' : ''
                }`}
                key={`${year}-${month}-${index}`}
              >
                {day !== null && (
                  <button
                    className="date-button"
                    type="button"
                    onClick={() => openDateModal(day)}
                    aria-label={fullDateFormatter.format(new Date(year, month, day))}
                  >
                    {photo && (
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
                    )}
                    <time dateTime={dateKey}>{day}</time>
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

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
            ) : savedPhoto ? (
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

            {fileError && <p className="file-error">{fileError}</p>}

            {pendingPhoto ? (
              <div className="modal-actions">
                <button
                  className="add-photo-button"
                  type="button"
                  onClick={savePhoto}
                >
                  Save Photo
                </button>
                <button
                  className="close-button"
                  type="button"
                  onClick={cancelPhotoSelection}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="modal-actions">
                <button
                  className="add-photo-button"
                  type="button"
                  onClick={choosePhoto}
                >
                  {savedPhoto ? 'Replace Photo' : 'Add Photo'}
                </button>
                {savedPhoto && (
                  <>
                    <button
                      className="close-button"
                      type="button"
                      onClick={adjustSavedPhoto}
                    >
                      Adjust Crop
                    </button>
                    <button
                      className="delete-photo-button"
                      type="button"
                      onClick={deletePhoto}
                    >
                      Delete Photo
                    </button>
                  </>
                )}
                <button
                  className="close-button"
                  type="button"
                  onClick={closeDateModal}
                >
                  Close
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export default App
