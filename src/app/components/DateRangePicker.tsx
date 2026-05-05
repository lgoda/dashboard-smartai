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

export default function DateRangePicker({ value, onChange, presets }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setCustomMode(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
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
    const range = preset.value()
    onChange(range)
    setCustomMode(false)
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
    setCustomMode(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2.5 text-sm bg-[#1F2124] border border-[#1F2124] rounded-lg hover:border-[#F0AD4E]/50 focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md group"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 group-hover:text-[#F0AD4E] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={value.from || value.to ? 'text-white font-medium' : 'text-gray-400'}>
            {getDisplayText()}
          </span>
        </div>
        <svg className={`w-4 h-4 text-gray-400 group-hover:text-[#F0AD4E] transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-[#3A3D42] border border-[#1F2124] rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1F2124]">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <h4 className="text-sm font-semibold text-white">Periodo</h4>
              </div>
              {(value.from || value.to) && (
                <button
                  onClick={clearFilter}
                  className="text-xs text-gray-400 hover:text-[#F0AD4E] font-medium transition-colors px-2 py-1 rounded hover:bg-[#1F2124]"
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
                    className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-[#1F2124] hover:text-[#F0AD4E] rounded-md transition-all duration-150 hover:translate-x-1"
                  >
                    {preset.label}
                  </button>
                ))}
                <button
                  onClick={() => setCustomMode(true)}
                  className="w-full text-left px-3 py-2.5 text-sm text-[#F0AD4E] hover:bg-[#1F2124] rounded-md transition-all duration-150 font-medium border-t border-[#1F2124] mt-2 pt-2 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Intervallo personalizzato
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wide">
                    Data inizio
                  </label>
                  <input
                    type="date"
                    value={value.from ? value.from.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleCustomDateChange('from', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] text-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-2 uppercase tracking-wide">
                    Data fine
                  </label>
                  <input
                    type="date"
                    value={value.to ? value.to.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleCustomDateChange('to', e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] text-white transition-all"
                  />
                </div>
                <div className="flex space-x-2 pt-2 border-t border-[#1F2124]">
                  <button
                    onClick={() => setCustomMode(false)}
                    className="flex-1 px-4 py-2.5 text-sm text-gray-300 bg-[#1F2124] hover:bg-[#2C2E31] rounded-lg transition-all duration-200 font-medium"
                  >
                    Indietro
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="flex-1 px-4 py-2.5 text-sm text-[#1e293b] bg-[#F0AD4E] hover:bg-[#E09A3D] rounded-lg transition-all duration-200 font-semibold shadow-md hover:shadow-lg"
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