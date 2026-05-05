'use client'

type FilterBadgeProps = {
  label: string
  value: string
  onRemove: () => void
}

export default function FilterBadge({ label, value, onRemove }: FilterBadgeProps) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[#F0AD4E]/15 to-[#F0AD4E]/10 text-[#F0AD4E] text-sm rounded-lg border border-[#F0AD4E]/30 shadow-sm hover:shadow-md hover:border-[#F0AD4E]/50 transition-all duration-200 group">
      <span className="font-semibold text-xs uppercase tracking-wide opacity-90">{label}:</span>
      <span className="font-medium">{value}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 p-0.5 rounded-full hover:bg-[#F0AD4E]/20 text-[#F0AD4E] hover:text-white transition-all duration-200 group-hover:scale-110"
        aria-label={`Rimuovi filtro ${label}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}