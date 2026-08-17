import { useState } from 'react'

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
})

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function App() {
  const today = new Date()
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )

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
          {calendarDays.map((day, index) => (
            <div
              className={`day-cell${day === null ? ' empty' : ''}${
                isToday(day) ? ' today' : ''
              }`}
              key={`${year}-${month}-${index}`}
            >
              {day !== null && (
                <time dateTime={`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`}>
                  {day}
                </time>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
