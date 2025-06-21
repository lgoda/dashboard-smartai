'use client'

import { useState } from 'react'

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

export default function DateRangePicker({ value, onChange, presets }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)

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
    const range = preset.value()
    onChange(range)
    setCustomMode(false)
    setIsOpen(false)
  }

  const handleCustomDateChange = (type: 'from' | 'to', dateString: string) => {
    const date = dateString ? new Date(dateString) : null
    if (date && type === 'from') {
      date.setHours(0, 0, 0, 0)
    }
    if (date && type === 'to') {
      date.setHours(23, 59, 59, 999)
    }
    
    onChange({
      ...value,
      [type]: date
    })
  }

  const clearFilter = () => {
    onChange({ from: null, to: null })
    setIsOpen(false)
    setCustomMode(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:border-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
      >
        <span className={value.from || value.to ? 'text-slate-900' : 'text-slate-500'}>
          {getDisplayText()}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-slate-900">Periodo</h4>
              {(value.from || value.to) && (
                <button
                  onClick={clearFilter}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancella
                </button>
              )}
            </div>

            {!customMode ? (
              <div className="space-y-1">
                {activePresets.map((preset, index) => (
                  <button
                    key={index}
                    onClick={() => handlePresetClick(preset)}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-md transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={() => setCustomMode(true)}
                  className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                >
                  📅 Intervallo personalizzato
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data inizio
                  </label>
                  <input
                    type="date"
                    value={value.from ? value.from.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleCustomDateChange('from', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Data fine
                  </label>
                  <input
                    type="date"
                    value={value.to ? value.to.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleCustomDateChange('to', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCustomMode(false)}
                    className="flex-1 px-3 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                  >
                    Indietro
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                  >
                    Applica
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}