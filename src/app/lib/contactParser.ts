import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParsedContact = {
  contact_name: string       // full name fallback (used when first/last not split)
  first_name: string
  last_name: string
  phone_normalized: string | null
  email: string
  company: string
  address: string            // street address → GHL address1
  raw_data: Record<string, string>
  is_valid_mobile: boolean
  exclusion_reason: 'no_phone' | 'duplicate' | null
}

export type ParseResult = {
  contacts: ParsedContact[]
  total_rows: number
  valid_contacts: number
  excluded_no_phone: number
  excluded_duplicates: number
  queued_contacts: number
  column_map: Record<string, string>
}

// ─── Column detection ─────────────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  contact_name: ['nominativo', 'contatto', 'contact name', 'contactname', 'full name', 'fullname', 'nome completo'],
  first_name:   ['nome', 'first_name', 'firstname', 'first name', 'given name', 'given_name'],
  last_name:    ['cognome', 'last_name', 'lastname', 'last name', 'surname', 'family name', 'family_name'],
  phone:        ['telefono', 'tel', 'phone', 'cellulare', 'mobile', 'cell', 'numero', 'number', 'whatsapp', 'tel.', 'phone number'],
  email:        ['email', 'e-mail', 'mail', 'posta', 'posta elettronica'],
  company:      ['azienda', 'company', 'società', 'societa', 'impresa', 'attività', 'attivita', 'ragione sociale', 'business'],
  address:      ['indirizzo', 'via', 'street', 'address', 'street address', 'streetaddress', 'sede', 'domicilio'],
}

export function detectColumns(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const header of headers) {
    const h = header.toLowerCase().trim()
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (!map[field] && aliases.some((a) => h.includes(a))) {
        map[field] = header
      }
    }
  }
  return map
}

// ─── Phone normalization ──────────────────────────────────────────────────────

export function normalizePhone(raw: string): string | null {
  if (!raw) return null
  // Remove all non-digit characters except leading +
  let cleaned = raw.trim().replace(/[\s\-().\/]/g, '')
  // Remove leading zeros after country code
  cleaned = cleaned.replace(/^\+/, '00')
  // Extract digits only
  const digits = cleaned.replace(/\D/g, '')
  if (!digits) return null

  // Handle Italian country code (39)
  if (digits.startsWith('0039')) return '+39' + digits.slice(4)
  if (digits.startsWith('39') && digits.length >= 11 && digits.length <= 13) return '+39' + digits.slice(2)
  // Italian mobile starting with 3 (no country code)
  if (digits.startsWith('3') && digits.length === 10) return '+39' + digits
  // Already has + format (other countries)
  if (raw.trim().startsWith('+') && digits.length >= 9) return '+' + digits
  // Fallback: return as-is with digits only if long enough
  if (digits.length >= 8) return digits

  return null
}

export function isMobilePhone(normalized: string | null): boolean {
  if (!normalized) return false
  const digits = normalized.replace(/\D/g, '')
  // Italian mobile: +39 followed by 3xx (10 local digits)
  if (normalized.startsWith('+39')) {
    const local = digits.slice(2)
    return /^3[0-9]{9}$/.test(local)
  }
  // Other international numbers with explicit + prefix: accept if plausible length
  if (normalized.startsWith('+')) {
    return digits.length >= 9 && digits.length <= 15
  }
  // Numbers without country code: accept only Italian mobile pattern (3xx, 10 digits)
  // This rejects landlines (02..., 06..., etc.) that slip through normalization
  return digits.startsWith('3') && digits.length === 10
}

// ─── Row extraction ───────────────────────────────────────────────────────────

function extractField(row: Record<string, string>, columnMap: Record<string, string>, field: string): string {
  const col = columnMap[field]
  return col ? (row[col] ?? '').toString().trim() : ''
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

export function parseCSV(content: string): { rows: Record<string, string>[]; headers: string[] } {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  return {
    rows: result.data,
    headers: result.meta.fields ?? [],
  }
}

// ─── Excel parsing ────────────────────────────────────────────────────────────

export function parseExcel(buffer: ArrayBuffer): { rows: Record<string, string>[]; headers: string[] } {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: '',
    raw: false,
  })
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  return { rows, headers }
}

// ─── Main parse function ──────────────────────────────────────────────────────

export function processContacts(
  rows: Record<string, string>[],
  headers: string[],
  columnMapOverride?: Record<string, string>
): ParseResult {
  const columnMap = columnMapOverride ?? detectColumns(headers)
  const seenPhones = new Set<string>()
  const contacts: ParsedContact[] = []

  for (const row of rows) {
    const rawPhone = extractField(row, columnMap, 'phone')
    const phoneNorm = normalizePhone(rawPhone)
    const isValid = isMobilePhone(phoneNorm)

    const contactName = extractField(row, columnMap, 'contact_name')
    let firstName = extractField(row, columnMap, 'first_name')
    let lastName = extractField(row, columnMap, 'last_name')

    // If first/last not found but contact_name exists, split it
    if (!firstName && !lastName && contactName) {
      const parts = contactName.trim().split(/\s+/)
      firstName = parts[0] ?? ''
      lastName = parts.slice(1).join(' ')
    }

    const contact: ParsedContact = {
      contact_name: contactName,
      first_name: firstName,
      last_name: lastName,
      phone_normalized: phoneNorm,
      email: extractField(row, columnMap, 'email'),
      company: extractField(row, columnMap, 'company'),
      address: extractField(row, columnMap, 'address'),
      raw_data: Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, String(v ?? '')])
      ),
      is_valid_mobile: isValid,
      exclusion_reason: null,
    }

    if (!isValid) {
      contact.exclusion_reason = 'no_phone'
    } else if (phoneNorm && seenPhones.has(phoneNorm)) {
      contact.exclusion_reason = 'duplicate'
    } else if (phoneNorm) {
      seenPhones.add(phoneNorm)
    }

    contacts.push(contact)
  }

  const valid = contacts.filter((c) => c.exclusion_reason === null)
  const noPhone = contacts.filter((c) => c.exclusion_reason === 'no_phone')
  const dupes = contacts.filter((c) => c.exclusion_reason === 'duplicate')

  return {
    contacts,
    total_rows: contacts.length,
    valid_contacts: valid.length,
    excluded_no_phone: noPhone.length,
    excluded_duplicates: dupes.length,
    queued_contacts: valid.length,
    column_map: columnMap,
  }
}
