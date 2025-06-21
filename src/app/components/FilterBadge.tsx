'use client'

type FilterBadgeProps = {
  label: string
  value: string
  onRemove: () => void
}

export default function FilterBadge({ label, value, onRemove }: FilterBadgeProps) {
  return (
    <div className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-200">
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
      <button
        onClick={onRemove}
        className="ml-1 text-blue-500 hover:text-blue-700 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}