'use client'

type PaginationProps = {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (itemsPerPage: number) => void
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange
}: PaginationProps) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalItems)

  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 7

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 3) {
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push('...')
        pages.push(totalPages)
      }
    }

    return pages
  }

  if (totalPages <= 1) return null

  return (
    <div className="bg-[#222428] rounded-xl p-4 shadow-sm border border-[#141517]">
      <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-300">
            Mostrando <span className="font-semibold text-white">{startItem}-{endItem}</span> di{' '}
            <span className="font-semibold text-white">{totalItems}</span> risultati
          </div>

          <div className="flex items-center space-x-2">
            <label htmlFor="itemsPerPage" className="text-sm text-gray-300">
              Per pagina:
            </label>
            <select
              id="itemsPerPage"
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
              className="px-3 py-1.5 border border-[#141517] bg-[#141517] rounded-lg text-sm font-medium text-white focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B]"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="1000">1000</option>
              <option value="2000">2000</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-sm font-medium text-gray-300 bg-[#141517] border border-[#141517] rounded-lg hover:bg-[#18191C] hover:text-[#F59E0B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Precedente
          </button>

          <div className="hidden sm:flex items-center space-x-1">
            {getPageNumbers().map((page, index) => {
              if (page === '...') {
                return (
                  <span key={`ellipsis-${index}`} className="px-3 py-1.5 text-gray-500">
                    ...
                  </span>
                )
              }

              const pageNumber = page as number
              const isActive = pageNumber === currentPage

              return (
                <button
                  key={pageNumber}
                  onClick={() => onPageChange(pageNumber)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-[#F59E0B] text-[#1e293b]'
                      : 'text-gray-300 hover:bg-[#141517] hover:text-[#F59E0B]'
                  }`}
                >
                  {pageNumber}
                </button>
              )
            })}
          </div>

          <div className="sm:hidden text-sm font-medium text-gray-300">
            Pagina {currentPage} di {totalPages}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 text-sm font-medium text-gray-300 bg-[#141517] border border-[#141517] rounded-lg hover:bg-[#18191C] hover:text-[#F59E0B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Successivo
          </button>
        </div>
      </div>
    </div>
  )
}
