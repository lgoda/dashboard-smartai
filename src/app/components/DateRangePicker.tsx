'use client'

import { useState, useEffect, useRef } from 'react'

type DateRange = {
  from: Date | null
  to: Date | null
}

type DateRangePickerProps = {
  value: DateRange
  onChange: (range: DateRange) => void
  presets?: Array<{
    label: string
    value: () => DateRange
  }>
}

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x }
const isSameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa', 'Do']

export default function DateRangePicker({ value, onChange, presets }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  // Month shown in the custom calendar, and the first endpoint while a range is
  // being picked (two-click selection: start → end).
  const [viewDate, setViewDate] = useState<Date>(value.from || new Date())
  const [pendingFrom, setPendingFrom] = useState<Date | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // When opening, jump the calendar to the selected month and reset any
  // half-finished selection.
  useEffect(() => {
    if (isOpen) {
      setViewDate(value.from || value.to || new Date())
      setPendingFrom(null)
    }
    // Intentionally only on open — we don't want to reset while the user picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const defaultPresets = [
    {
      label: 'Oggi',
      value: () => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        return { from: today, to: tomorrow }
      }
    },
    {
      label: 'Ultimi 7 giorni',
      value: () => {
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 6)
        weekAgo.setHours(0, 0, 0, 0)
        return { from: weekAgo, to: today }
      }
    },
    {
      label: 'Ultimi 30 giorni',
      value: () => {
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        const monthAgo = new Date()
        monthAgo.setDate(monthAgo.getDate() - 29)
        monthAgo.setHours(0, 0, 0, 0)
        return { from: monthAgo, to: today }
      }
    },
    {
      label: 'Questo mese',
      value: () => {
        const today = new Date()
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        firstDay.setHours(0, 0, 0, 0)
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        lastDay.setHours(23, 59, 59, 999)
        return { from: firstDay, to: lastDay }
      }
    }
  ]

  const activePresets = presets || defaultPresets

  const formatDate = (date: Date | null) => {
    if (!date) return ''
    return date.toLocaleDateString('it-IT')
  }

  const getDisplayText = () => {
    if (!value.from && !value.to) return 'Seleziona periodo'
    if (value.from && value.to) {
      return `${formatDate(value.from)} - ${formatDate(value.to)}`
    }
    if (value.from) return `Dal ${formatDate(value.from)}`
    if (value.to) return `Fino al ${formatDate(value.to)}`
    return 'Seleziona periodo'
  }

  const handlePresetClick = (preset: typeof activePresets[0]) => {
    onChange(preset.value())
    setPendingFrom(null)
    setIsOpen(false)
  }

  const clearFilter = () => {
    onChange({ from: null, to: null })
    setPendingFrom(null)
  }

  // Two-click range selection: first click sets the start, second sets the end
  // (auto-ordered). A subsequent click starts a new range.
  const handleDayClick = (day: Date) => {
    if (!pendingFrom) {
      setPendingFrom(startOfDay(day))
      return
    }
    const a = startOfDay(pendingFrom)
    const b = startOfDay(day)
    const from = a <= b ? a : b
    const to = a <= b ? b : a
    onChange({ from: startOfDay(from), to: endOfDay(to) })
    setPendingFrom(null)
  }

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  const today = new Date()
  const inRange = (day: Date) =>
    !pendingFrom && value.from && value.to && day >= startOfDay(value.from) && day <= endOfDay(value.to)
  const isEndpoint = (day: Date) =>
    isSameDay(day, pendingFrom) || (!pendingFrom && (isSameDay(day, value.from) || isSameDay(day, value.to)))

  const dayClass = (day: Date) => {
    const base = 'h-8 w-full rounded-md text-sm font-mono tabular-nums flex items-center justify-center transition-colors'
    if (isEndpoint(day)) return `${base} bg-[var(--amber)] text-[#1b1d20] font-semibold`
    if (inRange(day)) return `${base} bg-[rgba(245,158,11,0.18)] text-[var(--text)]`
    if (isSameDay(day, today)) return `${base} text-[var(--text)] ring-1 ring-inset ring-[rgba(245,158,11,0.6)] hover:bg-[var(--surface-2)]`
    return `${base} text-[var(--mute)] hover:bg-[var(--surface-2)] hover:text-[var(--amber)]`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2.5 text-sm bg-[var(--surface)] border border-[var(--line)] rounded-lg hover:border-[rgba(245,158,11,0.5)] focus:ring-2 focus:ring-[rgba(245,158,11,0.4)] focus:border-[var(--amber)] transition-all duration-200 text-[var(--text)] group"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--mute)] group-hover:text-[var(--amber)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={`font-mono text-[13px] ${value.from || value.to ? 'text-[var(--text)]' : 'text-[var(--mute)]'}`}>
            {getDisplayText()}
          </span>
        </div>
        <svg className={`w-4 h-4 text-[var(--mute)] group-hover:text-[var(--amber)] transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200 min-w-[280px]">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-[var(--line-soft)]">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--amber)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <h4 className="font-display text-sm font-semibold text-[var(--text)]">Periodo</h4>
              </div>
              {(value.from || value.to) && (
                <button
                  onClick={clearFilter}
                  className="text-xs text-[var(--mute)] hover:text-[var(--amber)] font-medium transition-colors px-2 py-1 rounded hover:bg-[var(--surface-2)]"
                >
                  Cancella
                </button>
              )}
            </div>

            <div className="space-y-1">
              {activePresets.map((preset, index) => (
                <button
                  key={index}
                  onClick={() => handlePresetClick(preset)}
                  className="w-full text-left px-3 py-2.5 text-sm text-[var(--mute)] hover:bg-[var(--surface-2)] hover:text-[var(--amber)] rounded-md transition-colors duration-150"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom calendar — fully self-contained, no native <input type=date> */}
            <div className="mt-3 pt-3 border-t border-[var(--line-soft)]">
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setViewDate(new Date(year, month - 1, 1))}
                  aria-label="Mese precedente"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--mute)] hover:bg-[var(--surface-2)] hover:text-[var(--amber)] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="font-display text-sm font-semibold text-[var(--text)] capitalize">
                  {viewDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => setViewDate(new Date(year, month + 1, 1))}
                  aria-label="Mese successivo"
                  className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--mute)] hover:bg-[var(--surface-2)] hover:text-[var(--amber)] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {WEEKDAYS.map(w => (
                  <div key={w} className="text-center font-mono text-[10px] text-[var(--mute-2)] font-medium uppercase">{w}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => day === null
                  ? <div key={`e${i}`} />
                  : (
                    <button
                      key={day.getTime()}
                      type="button"
                      onClick={() => handleDayClick(day)}
                      className={dayClass(day)}
                    >
                      {day.getDate()}
                    </button>
                  )
                )}
              </div>

              <p className="text-[11px] text-[var(--mute-2)] mt-2">
                {pendingFrom ? 'Seleziona la data di fine' : 'Seleziona la data di inizio'}
              </p>

              <button
                onClick={() => setIsOpen(false)}
                className="w-full mt-3 px-4 py-2.5 text-sm text-[#1b1d20] bg-[var(--amber)] hover:bg-[var(--amber-deep)] rounded-lg transition-colors duration-200 font-semibold"
              >
                Applica
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
