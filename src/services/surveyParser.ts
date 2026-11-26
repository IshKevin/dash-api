/**
 * Parsing/validation for the farmer field-survey spreadsheet.
 *
 * Pure functions only (no DB) so they can be unit-tested. The import route
 * (src/routes/surveys.ts) reads the workbook, calls `mapHeaders` + `parseRow`
 * for every row, then matches farmers against the database.
 */
import { RWANDA_DISTRICTS, canonicalDistrict, canonicalProvince, parseUpi } from './rwandaGeo';

export type SurveyField =
  | 'survey_province' | 'survey_district' | 'enumerator_name' | 'enumerator_contact' | 'interview_date' | 'consent'
  | 'province' | 'district' | 'sector' | 'cell' | 'village' | 'latitude' | 'longitude'
  | 'respondent_name' | 'respondent_contact' | 'respondent_is_owner' | 'respondent_role' | 'respondent_position'
  | 'owner_name' | 'farmer_contact' | 'sex' | 'has_disability' | 'date_of_birth' | 'farmer_age' | 'national_id' | 'land_owner'
  | 'farm_zoning' | 'tree_arrangement' | 'farm_area' | 'seedling_sources' | 'varieties'
  | 'physical_tree_count' | 'hass_trees' | 'fuerte_trees' | 'planting_date'
  | 'ever_harvested' | 'avocados_per_tree' | 'fruits_per_tree_per_year' | 'total_tons' | 'price_per_avocado'
  | 'uses_fertilizer' | 'fertilizer_types' | 'uses_pesticides' | 'pesticide_types' | 'input_access'
  | 'selling_channels' | 'selling_site' | 'main_market_outlet' | 'production_info_access' | 'market_info_access'
  | 'uses_credit' | 'credit_access' | 'aggregation_effectiveness' | 'challenges'
  // Member-register (ASR farmer database) columns
  | 'first_name' | 'last_name' | 'home_province' | 'home_district' | 'home_sector' | 'home_cell' | 'home_village'
  | 'upi' | 'extra_upis' | 'assistance';

/** Fields that exist only on the parsed row, not on the FarmSurvey table. */
export const NON_SURVEY_FIELDS: SurveyField[] = [
  'first_name', 'last_name', 'home_province', 'home_district', 'home_sector', 'home_cell', 'home_village', 'upi', 'extra_upis', 'assistance',
];

type Kind = 'text' | 'bool' | 'number' | 'int' | 'date' | 'phone' | 'list' | 'nid' | 'sex' | 'lat' | 'lng' | 'upi' | 'age_or_dob' | 'assistance';

/** Normalised header (lowercase, alphanumerics only) → target field. */
const HEADER_MAP: Record<string, { field: SurveyField; kind: Kind }> = {
  enumerator: { field: 'enumerator_name', kind: 'text' },
  contact: { field: 'enumerator_contact', kind: 'phone' },
  enumeratorcontact: { field: 'enumerator_contact', kind: 'phone' },
  dateofinterview: { field: 'interview_date', kind: 'date' },
  interviewdate: { field: 'interview_date', kind: 'date' },
  consentyn: { field: 'consent', kind: 'bool' },
  consent: { field: 'consent', kind: 'bool' },
  sector: { field: 'sector', kind: 'text' },
  cell: { field: 'cell', kind: 'text' },
  village: { field: 'village', kind: 'text' },
  respondent: { field: 'respondent_name', kind: 'text' },
  respondentname: { field: 'respondent_name', kind: 'text' },
  respondentcontact: { field: 'respondent_contact', kind: 'phone' },
  owneshipyn: { field: 'respondent_is_owner', kind: 'bool' },
  ownershipyn: { field: 'respondent_is_owner', kind: 'bool' },
  roleofrespondent: { field: 'respondent_role', kind: 'text' },
  ownerofthefarm: { field: 'owner_name', kind: 'text' },
  farmowner: { field: 'owner_name', kind: 'text' },
  farmercontact: { field: 'farmer_contact', kind: 'phone' },
  sex: { field: 'sex', kind: 'sex' },
  gender: { field: 'sex', kind: 'sex' },
  disabilityyn: { field: 'has_disability', kind: 'bool' },
  positionoftherespondent: { field: 'respondent_position', kind: 'text' },
  datebirth: { field: 'date_of_birth', kind: 'date' },
  dateofbirth: { field: 'date_of_birth', kind: 'date' },
  farmerage: { field: 'farmer_age', kind: 'int' },
  nationalid: { field: 'national_id', kind: 'nid' },
  landowner: { field: 'land_owner', kind: 'text' },
  farmarrangementzoning: { field: 'farm_zoning', kind: 'text' },
  treearrangementinafarmer: { field: 'tree_arrangement', kind: 'text' },
  treearrangement: { field: 'tree_arrangement', kind: 'text' },
  farmarea: { field: 'farm_area', kind: 'number' },
  sourceofseedling: { field: 'seedling_sources', kind: 'list' },
  sourceseed1: { field: 'seedling_sources', kind: 'list' },
  sourceseed2: { field: 'seedling_sources', kind: 'list' },
  sourceseed3: { field: 'seedling_sources', kind: 'list' },
  sourceseed4: { field: 'seedling_sources', kind: 'list' },
  sourceseed5: { field: 'seedling_sources', kind: 'list' },
  sourceseed6: { field: 'seedling_sources', kind: 'list' },
  avocadovarieties: { field: 'varieties', kind: 'list' },
  avocadovariety1: { field: 'varieties', kind: 'list' },
  avocadovariety2: { field: 'varieties', kind: 'list' },
  everharvestedyn: { field: 'ever_harvested', kind: 'bool' },
  numberofavokadopertree: { field: 'avocados_per_tree', kind: 'number' },
  numberofavocadopertree: { field: 'avocados_per_tree', kind: 'number' },
  avocadofruitspertreeperyear: { field: 'fruits_per_tree_per_year', kind: 'number' },
  totaltons: { field: 'total_tons', kind: 'number' },
  priceperavacadoatfarm: { field: 'price_per_avocado', kind: 'number' },
  priceperavocadoatfarm: { field: 'price_per_avocado', kind: 'number' },
  useoffertiliseryn: { field: 'uses_fertilizer', kind: 'bool' },
  useoffertilizeryn: { field: 'uses_fertilizer', kind: 'bool' },
  typeoffertiliserused: { field: 'fertilizer_types', kind: 'list' },
  typeoffertilizerused: { field: 'fertilizer_types', kind: 'list' },
  useofpesticidesyn: { field: 'uses_pesticides', kind: 'bool' },
  pesticidetype: { field: 'pesticide_types', kind: 'list' },
  accessofinputs: { field: 'input_access', kind: 'list' },
  otherinputs: { field: 'input_access', kind: 'list' },
  waysofselling: { field: 'selling_channels', kind: 'list' },
  otherwaysofs: { field: 'selling_channels', kind: 'list' },
  sellingsitecollectionsite: { field: 'selling_site', kind: 'text' },
  sellingsite: { field: 'selling_site', kind: 'text' },
  mainmarketaoutlet: { field: 'main_market_outlet', kind: 'text' },
  mainmarketoutlet: { field: 'main_market_outlet', kind: 'text' },
  accesstoproductioninformation: { field: 'production_info_access', kind: 'list' },
  otheraccesstop: { field: 'production_info_access', kind: 'list' },
  accesstomarketinformation: { field: 'market_info_access', kind: 'list' },
  otheraccesstom: { field: 'market_info_access', kind: 'list' },
  useofcreditsyn: { field: 'uses_credit', kind: 'bool' },
  accesstocredit: { field: 'credit_access', kind: 'list' },
  accesstocredit1: { field: 'credit_access', kind: 'list' },
  accesstocredit2: { field: 'credit_access', kind: 'list' },
  accesstocredit3: { field: 'credit_access', kind: 'list' },
  accesstocredit4: { field: 'credit_access', kind: 'list' },
  accesstocredit5: { field: 'credit_access', kind: 'list' },
  accesstocredit6: { field: 'credit_access', kind: 'list' },
  otherwaytoaccesstoc: { field: 'credit_access', kind: 'list' },
  effectivenessofaggrmodel: { field: 'aggregation_effectiveness', kind: 'text' },
  challenges: { field: 'challenges', kind: 'text' },
  physicalcount: { field: 'physical_tree_count', kind: 'int' },
  hass: { field: 'hass_trees', kind: 'int' },
  fuerte: { field: 'fuerte_trees', kind: 'int' },
  dateofplanting: { field: 'planting_date', kind: 'date' },
  plantingdate: { field: 'planting_date', kind: 'date' },
  lat: { field: 'latitude', kind: 'lat' },
  latitude: { field: 'latitude', kind: 'lat' },
  long: { field: 'longitude', kind: 'lng' },
  lng: { field: 'longitude', kind: 'lng' },
  longitude: { field: 'longitude', kind: 'lng' },
  // ASR member register ("ASR - Farmer Database"): firstname, lastname, telephone, idnumber,
  // home location (province…village), farm_province…farm_village, farmsize, tree-count, upi-number …
  firstname: { field: 'first_name', kind: 'text' },
  lastname: { field: 'last_name', kind: 'text' },
  telephone: { field: 'farmer_contact', kind: 'phone' },
  phone: { field: 'farmer_contact', kind: 'phone' },
  phonenumber: { field: 'farmer_contact', kind: 'phone' },
  idnumber: { field: 'national_id', kind: 'nid' },
  age: { field: 'farmer_age', kind: 'age_or_dob' },
  farmsize: { field: 'farm_area', kind: 'number' },
  treecount: { field: 'physical_tree_count', kind: 'int' },
  numberoftrees: { field: 'physical_tree_count', kind: 'int' },
  avocadotype: { field: 'varieties', kind: 'list' },
  upinumber: { field: 'upi', kind: 'upi' },
  upi: { field: 'upi', kind: 'upi' },
  assistance: { field: 'assistance', kind: 'assistance' },
};

/** Columns kept only in `raw` (known, intentionally not mapped). */
const RAW_ONLY = new Set([
  'typeoffertiliseruseyes', 'typeoffertiliserusedyes', 'typeoffertiliserusedno',
  // register bookkeeping / unreliable columns, kept in `raw` only
  'no', 'id', 'column1', 'planted', 'farmage', 'mixedpercentage',
]);

const LOCATION_KEYS = ['province', 'district', 'sector', 'cell', 'village'] as const;

export const normalizeHeader = (h: unknown) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export interface ColumnMapping {
  index: number;
  header: string;
  field: SurveyField | null;
  kind: Kind | null;
}

/**
 * Map spreadsheet headers to fields. The sheet has "Province"/"District" twice:
 * the first pair is where the enumerator works, the second is the farm's
 * location. With only one pair present it is treated as the farm location.
 */
export function mapHeaders(headers: unknown[]): { columns: ColumnMapping[]; unknown: string[]; missingCore: string[] } {
  const norm = headers.map(normalizeHeader);
  const count = (k: string) => norm.filter((n) => n === k).length;
  const seen: Record<string, number> = {};

  // Member register: plain province…village is where the farmer lives and
  // farm_province…farm_village is the farm. The farm is what we map.
  const hasFarmLocation = norm.some((n) => n === 'farmprovince' || n === 'farmdistrict');

  const columns: ColumnMapping[] = headers.map((h, index) => {
    const key = norm[index];
    seen[key] = (seen[key] ?? 0) + 1;
    if (hasFarmLocation) {
      const loc = LOCATION_KEYS.find((k) => key === k || key === `farm${k}`);
      if (loc) {
        const field = (key === loc ? `home_${loc}` : loc) as SurveyField;
        return { index, header: String(h ?? ''), field, kind: 'text' };
      }
    }
    if (key === 'province' || key === 'district') {
      const twice = count(key) >= 2;
      const field = (twice && seen[key] === 1 ? `survey_${key}` : key) as SurveyField;
      return { index, header: String(h ?? ''), field, kind: 'text' };
    }
    const m = HEADER_MAP[key];
    return { index, header: String(h ?? ''), field: m?.field ?? null, kind: m?.kind ?? null };
  });

  const unknown = columns.filter((c) => !c.field && c.header.trim() && !RAW_ONLY.has(normalizeHeader(c.header))).map((c) => c.header);
  const mapped = new Set(columns.map((c) => c.field));
  const missingCore = (['district', 'owner_name', 'national_id', 'farmer_contact'] as SurveyField[])
    .filter((f) => !mapped.has(f) && !(f === 'owner_name' && (mapped.has('respondent_name') || mapped.has('first_name'))));
  return { columns, unknown, missingCore };
}

// ── value parsers ────────────────────────────────────────────────────────────

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'string' && /^(n\/?a|none|-|null)$/i.test(v.trim()));

export function parseBool(v: unknown): boolean | null | undefined {
  if (isBlank(v)) return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['y', 'yes', 'yego', '1', 'true', 'ok'].includes(s)) return true;
  if (['n', 'no', 'oya', '0', 'false'].includes(s)) return false;
  return null; // present but not understood
}

export function parseNumber(v: unknown): number | null | undefined {
  if (isBlank(v)) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/rwf|frw|kg|ha|tons?|,/gi, '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Excel serial date → JS Date (1900 date system). */
const fromExcelSerial = (serial: number) => new Date(Math.round((serial - 25569) * 86400 * 1000));

/** Dates outside 1900–2100 are typos ("20224") — and break the database. */
const plausible = (d: Date | null | undefined) => {
  if (!d) return d;
  const y = d.getUTCFullYear();
  return Number.isNaN(d.getTime()) || y < 1900 || y > 2100 ? null : d;
};

export function parseDate(v: unknown): Date | null | undefined {
  return plausible(parseDateRaw(v));
}

function parseDateRaw(v: unknown): Date | null | undefined {
  if (isBlank(v)) return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    if (v > 1800 && v < 2100) return new Date(Date.UTC(v, 0, 1)); // just a year, e.g. planting year 2018
    if (v > 20000 && v < 80000) return fromExcelSerial(v);
    return null;
  }
  const s = String(v).trim();
  if (/^\d{4}$/.test(s)) return new Date(Date.UTC(Number(s), 0, 1));
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy (Rwanda convention)
  if (m) {
    const [, d, mo, y] = m.map(Number);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, mo - 1, d));
    if (d >= 1 && d <= 12 && mo >= 1 && mo <= 31) return new Date(Date.UTC(y, d - 1, mo)); // mm/dd/yyyy fallback
  }
  m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Rwandan mobile numbers → +2507XXXXXXXX. Returns null when not recognisable. */
export function normalizePhone(v: unknown): string | null | undefined {
  if (isBlank(v)) return undefined;
  let digits = String(typeof v === 'number' ? Math.round(v) : v).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith('7')) return `+250${digits}`;
  if (digits.length === 10 && digits.startsWith('07')) return `+250${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('2507')) return `+${digits}`;
  return null;
}

export function normalizeSex(v: unknown): string | null | undefined {
  if (isBlank(v)) return undefined;
  const s = String(v).trim().toLowerCase();
  if (['m', 'male', 'gabo', 'man', 'mr'].includes(s)) return 'male';
  if (['f', 'female', 'gore', 'woman', 'mrs', 'ms'].includes(s)) return 'female';
  return null;
}

export function splitList(v: unknown): string[] {
  if (isBlank(v)) return [];
  const s = String(v).trim();
  if (/^(0|1|true|false)$/i.test(s)) return []; // one-hot flags carry no label
  return s.split(/[,;\n|]+/).map((x) => x.trim()).filter(Boolean);
}

const KNOWN_VARIETIES: [RegExp, string][] = [
  [/\bhass\b/i, 'Hass'],
  [/\bfuerte\b/i, 'Fuerte'],
  [/\bettinger\b/i, 'Ettinger'],
  [/\breed\b/i, 'Reed'],
  [/\bbacon\b/i, 'Bacon'],
  [/\bpinkerton\b/i, 'Pinkerton'],
  [/\b(local|kinyarwanda|gakondo)\b/i, 'Local'],
];

/** "Hass Fuerte", "hass", "bivanze" (Kinyarwanda: mixed) → canonical variety names. */
export function normalizeVarieties(items: string[]): string[] {
  const out = new Set<string>();
  for (const item of items) {
    if (/bivanze|mixed|both/i.test(item)) { out.add('Hass'); out.add('Fuerte'); continue; }
    const found = KNOWN_VARIETIES.filter(([re]) => re.test(item)).map(([, name]) => name);
    if (found.length) found.forEach((v) => out.add(v));
    else out.add(item.trim());
  }
  return [...out].filter(Boolean);
}

/** Every well-formed UPI in a free-text cell ("UPI 5/07/13/02/2010; UPI 5/07/13/02/2535"). */
export function extractUpis(v: unknown): string[] {
  if (isBlank(v)) return [];
  const text = String(v).replace(/\\/g, '/');
  const found: string[] = [];
  for (const m of text.matchAll(/\d{1,2}\s*\/\s*\d{1,4}\s*\/\s*\d{1,3}\s*\/\s*\d{1,3}\s*\/\s*\d{1,7}(?:-\d{1,4})?/g)) {
    const parsed = parseUpi(m[0].replace(/\s+/g, ''));
    if (parsed && !found.includes(parsed.normalized)) found.push(parsed.normalized);
  }
  return found;
}

/** Kinyarwanda answers in the member register → the app's assistance codes. */
const ASSISTANCE_CODES: [RegExp, string][] = [
  [/imihingire|training|amahugurwa/i, 'training'],
  [/ubujyanama|advi[cs]e|advisory/i, 'advisory'],
  [/inguzanyo|credit|loan/i, 'credit'],
  [/ifumbire|fertili[sz]er/i, 'fertilizers'],
  [/ingemwe|seedling/i, 'seedlings'],
  [/kuhira|irrigation/i, 'irrigation'],
  [/ibikoresho|equipment/i, 'equipment'],
  [/udukoko|imiti|pest/i, 'pest_control'],
];

export function parseAssistance(v: unknown): string[] {
  if (isBlank(v)) return [];
  const items = String(v).replace(/[{}"]/g, '').split(/[,;\n|]+/).map((x) => x.trim()).filter(Boolean);
  const out = new Set<string>();
  for (const item of items) {
    const code = ASSISTANCE_CODES.find(([re]) => re.test(item))?.[1];
    out.add(code ?? item.toLowerCase());
  }
  return [...out];
}

/** Rwanda's bounding box (with a small margin). */
export const RWANDA_BOUNDS = { minLat: -2.95, maxLat: -1.0, minLng: 28.8, maxLng: 30.95 };
export const inRwanda = (lat: number, lng: number) =>
  lat >= RWANDA_BOUNDS.minLat && lat <= RWANDA_BOUNDS.maxLat && lng >= RWANDA_BOUNDS.minLng && lng <= RWANDA_BOUNDS.maxLng;

// ── row parsing ──────────────────────────────────────────────────────────────

export interface ParsedRow {
  row_number: number;
  /** Worksheet the row came from (multi-sheet workbooks) */
  sheet?: string;
  data: Partial<Record<SurveyField, any>>;
  raw: Record<string, any>;
  errors: string[];
  warnings: string[];
}

export function parseRow(cells: unknown[], columns: ColumnMapping[], rowNumber: number): ParsedRow {
  const data: Partial<Record<SurveyField, any>> = {};
  const raw: Record<string, any> = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  const usedHeaders: Record<string, number> = {};
  for (const col of columns) {
    const value = cells[col.index];
    const header = col.header || `column_${col.index + 1}`;
    usedHeaders[header] = (usedHeaders[header] ?? 0) + 1;
    const rawKey = usedHeaders[header] > 1 ? `${header} (${usedHeaders[header]})` : header;
    raw[rawKey] = value instanceof Date ? value.toISOString() : value ?? null;
    if (!col.field || !col.kind || isBlank(value)) continue;

    const f = col.field;
    const bad = (what: string) => warnings.push(`${col.header}: could not read "${String(value)}" as ${what}`);
    switch (col.kind) {
      case 'text':
        data[f] = String(value).trim();
        break;
      case 'bool': {
        const b = parseBool(value);
        if (b === null) bad('yes/no');
        else data[f] = b;
        break;
      }
      case 'number': {
        const n = parseNumber(value);
        if (n === null || (n as number) < 0) bad('a number');
        else data[f] = n;
        break;
      }
      case 'int': {
        const n = parseNumber(value);
        if (n === null || (n as number) < 0) bad('a whole number');
        else data[f] = Math.round(n as number);
        break;
      }
      case 'date': {
        const d = parseDate(value);
        if (d === null) bad('a date');
        else data[f] = d;
        break;
      }
      case 'phone': {
        const p = normalizePhone(value);
        if (p === null) {
          warnings.push(`${col.header}: "${String(value)}" is not a valid Rwandan mobile number`);
          data[f] = String(value).trim();
        } else data[f] = p;
        break;
      }
      case 'sex': {
        const s = normalizeSex(value);
        if (s === null) bad('male/female');
        else data[f] = s;
        break;
      }
      case 'list': {
        const items = splitList(value);
        if (items.length) data[f] = [...new Set([...(data[f] ?? []), ...items])];
        break;
      }
      case 'nid': {
        // Excel stores numbers with 15 significant digits, so a 16-digit ID
        // typed as a number silently loses its last digit.
        const asText = typeof value === 'number' ? value.toFixed(0) : String(value).replace(/\s/g, '');
        if (typeof value === 'number') {
          warnings.push('national_id is stored as a number in Excel and may be truncated — format that column as Text');
        }
        // Only a real 16-digit ID is used for matching: placeholders like "0"
        // would otherwise merge unrelated farmers into one account.
        if (!/^\d{16}$/.test(asText)) warnings.push(`national_id "${asText}" is not 16 digits — ignored`);
        else data[f] = asText;
        break;
      }
      case 'upi': {
        const upis = extractUpis(value);
        if (!upis.length) warnings.push(`UPI "${String(value).trim().slice(0, 60)}" is not a valid UPI (province/district/sector/cell/parcel)`);
        else {
          data.upi = upis[0];
          if (upis.length > 1) data.extra_upis = upis.slice(1);
        }
        break;
      }
      case 'assistance': {
        const items = parseAssistance(value);
        if (items.length) data[f] = [...new Set([...(data[f] ?? []), ...items])];
        break;
      }
      case 'age_or_dob': {
        // "age" holds an age in some sheets and a date of birth in others.
        if (typeof value === 'number' && value > 0 && value < 120) { data.farmer_age = Math.round(value); break; }
        const d = parseDate(value);
        if (d) data.date_of_birth = d;
        else bad('an age or date of birth');
        break;
      }
      case 'lat':
      case 'lng': {
        const n = parseNumber(value);
        if (n === null) bad('a coordinate');
        else data[f] = n;
        break;
      }
    }
  }

  // Coordinates: must be inside Rwanda; fix the common lat/long swap.
  if (data.latitude !== undefined || data.longitude !== undefined) {
    const lat = data.latitude as number | undefined;
    const lng = data.longitude as number | undefined;
    if (lat === undefined || lng === undefined) {
      warnings.push('Only one of lat/long is filled — location ignored');
      delete data.latitude;
      delete data.longitude;
    } else if (!inRwanda(lat, lng)) {
      if (inRwanda(lng, lat)) {
        data.latitude = lng;
        data.longitude = lat;
        warnings.push('lat and long looked swapped — corrected');
      } else {
        warnings.push(`Location (${lat}, ${lng}) is outside Rwanda — ignored`);
        delete data.latitude;
        delete data.longitude;
      }
    }
  }

  // First + last name columns → owner name.
  if (!data.owner_name && (data.first_name || data.last_name)) {
    data.owner_name = [data.first_name, data.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  // 1970-01-01 is what an empty date becomes in some exports; dates that make
  // the farmer a child are placeholders too (e.g. the interview date typed again).
  if (data.date_of_birth) {
    const dob = data.date_of_birth as Date;
    const age = new Date().getUTCFullYear() - dob.getUTCFullYear();
    if (dob.getTime() === 0 || age < 12 || age > 110) delete data.date_of_birth;
  }

  // Administrative names → canonical spelling.
  for (const key of ['home_province'] as const) {
    if (data[key]) data[key] = canonicalProvince(data[key]) ?? data[key];
  }
  if (data.home_district) {
    const d = canonicalDistrict(data.home_district);
    if (d) {
      data.home_district = d.name;
      if (!data.home_province) data.home_province = d.province;
    }
  }
  for (const key of ['province', 'survey_province'] as const) {
    if (data[key]) {
      const p = canonicalProvince(data[key]);
      if (p) data[key] = p;
      else if (!canonicalDistrict(key === 'province' ? data.district : data.survey_district)) warnings.push(`Unknown province "${data[key]}"`);
    }
  }
  for (const key of ['district', 'survey_district'] as const) {
    if (data[key]) {
      const d = canonicalDistrict(data[key]);
      if (d) {
        data[key] = d.name;
        // The district is the more specific answer: its province wins.
        if (key === 'district') data.province = d.province;
        if (key === 'survey_district') data.survey_province = d.province;
      } else warnings.push(`Unknown district "${data[key]}" (expected one of Rwanda's 30 districts)`);
    }
  }
  // Member register rows with no farm location: the farm is assumed to be where the farmer lives.
  if (!data.district && data.home_district) {
    for (const k of LOCATION_KEYS) if (!data[k] && data[`home_${k}` as SurveyField]) data[k] = data[`home_${k}` as SurveyField];
    warnings.push('No farm location given — using where the farmer lives');
  }
  if (!data.province && data.survey_province) data.province = data.survey_province;
  if (!data.district && data.survey_district) data.district = data.survey_district;

  if (data.farmer_age !== undefined && (data.farmer_age < 12 || data.farmer_age > 110)) {
    warnings.push(`Farmer age ${data.farmer_age} looks wrong`);
  }
  if (data.date_of_birth && data.farmer_age === undefined) {
    data.farmer_age = new Date().getUTCFullYear() - (data.date_of_birth as Date).getUTCFullYear();
  }
  if (data.physical_tree_count === undefined && (data.hass_trees || data.fuerte_trees)) {
    data.physical_tree_count = (data.hass_trees ?? 0) + (data.fuerte_trees ?? 0);
  }
  const varieties = new Set<string>(normalizeVarieties(data.varieties ?? []));
  if (data.hass_trees) varieties.add('Hass');
  if (data.fuerte_trees) varieties.add('Fuerte');
  if (varieties.size) data.varieties = [...varieties];

  if (data.upi) {
    const upiDistrict = parseUpi(data.upi)?.district;
    if (upiDistrict && data.district && upiDistrict !== data.district) {
      warnings.push(`UPI ${data.upi} is in ${upiDistrict} but the farm is recorded in ${data.district}`);
    }
  }

  // Hard errors → row is skipped on commit.
  if (data.consent === false) errors.push('Respondent did not consent — row will not be imported');
  if (!data.owner_name && !data.respondent_name) errors.push('Missing farm owner / respondent name');
  if (!data.district) errors.push('Missing district');

  return { row_number: rowNumber, data, raw, errors, warnings };
}

/** Name used for the farmer account (owner preferred over respondent). */
export const farmerNameOf = (d: ParsedRow['data']) =>
  String(d.owner_name || d.respondent_name || '').replace(/\s+/g, ' ').trim();

/** Lower-case name with spacing/punctuation removed, for comparing people. */
export const nameKey = (name: string) => name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');

/** Phone of the farmer: their own contact, else the respondent's when the respondent is the owner. */
export const farmerPhoneOf = (d: ParsedRow['data']) => {
  const own = typeof d.farmer_contact === 'string' && d.farmer_contact.startsWith('+250') ? d.farmer_contact : undefined;
  if (own) return own;
  if ((d.respondent_is_owner || !d.owner_name) && typeof d.respondent_contact === 'string' && d.respondent_contact.startsWith('+250')) {
    return d.respondent_contact;
  }
  return undefined;
};

/** Farm area → hectares. Values > 100 are assumed to be square metres. */
export function farmAreaHectares(area: number | undefined): { hectares: number; assumedSqm: boolean } | null {
  if (area === undefined || area === null || !Number.isFinite(area) || area <= 0) return null;
  if (area > 100) return { hectares: Math.round((area / 10000) * 10000) / 10000, assumedSqm: true };
  return { hectares: area, assumedSqm: false };
}

export { RWANDA_DISTRICTS };
