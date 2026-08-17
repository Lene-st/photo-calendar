import { useRef, useState } from 'react'

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
const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']

function getDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function App() {
  const today = new Date()
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [selectedDate, setSelectedDate] = useState(null)
  const [photosByDate, setPhotosByDate] = useState({})
  const [pendingPhoto, setPendingPhoto] = useState(null)
  const [fileError, setFileError] = useState('')
  const fileInputRef = useRef(null)

  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()
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

    const reader = new FileReader()
    reader.onload = () => {
      setPendingPhoto(reader.result)
      setFileError('')
    }
    reader.readAsDataURL(file)
  }

  function savePhoto() {
    const dateKey = getDateKey(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    )

    setPhotosByDate((currentPhotos) => ({
      ...currentPhotos,
      [dateKey]: pendingPhoto,
    }))
    closeDateModal()
  }

  function cancelPhotoSelection() {
    setPendingPhoto(null)
    setFileError('')
  }

  function deletePhoto() {
    const dateKey = getDateKey(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    )

    setPhotosByDate((currentPhotos) => {
      const updatedPhotos = { ...currentPhotos }
      delete updatedPhotos[dateKey]
      return updatedPhotos
    })
    closeDateModal()
  }

  const selectedDateKey = selectedDate
    ? getDateKey(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      )
    : null
  const savedPhoto = selectedDateKey ? photosByDate[selectedDateKey] : null

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

          <h1>{monthFormatter.format(visibleMonth)}</h1>

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

        <div className="days-grid">
          {calendarDays.map((day, index) => {
            const dateKey = day ? getDateKey(year, month, day) : null
            const photo = dateKey ? photosByDate[dateKey] : null

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
                    {photo && <img src={photo} alt="" />}
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

            {(pendingPhoto || savedPhoto) && (
              <div className="photo-preview">
                <img
                  src={pendingPhoto || savedPhoto}
                  alt={`Photo for ${fullDateFormatter.format(selectedDate)}`}
                />
              </div>
            )}

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
                  <button
                    className="delete-photo-button"
                    type="button"
                    onClick={deletePhoto}
                  >
                    Delete Photo
                  </button>
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
