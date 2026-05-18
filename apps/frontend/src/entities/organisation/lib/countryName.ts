import type { IsoAlpha3 } from '@repo/contracts/organisations';

/**
 * ISO 3166-1 alpha-3 → alpha-2 lookup, ordered to match
 * `ISO_3166_ALPHA3_CODES` in `@repo/contracts`. We need alpha-2 because
 * `Intl.DisplayNames` only accepts alpha-2 (and UN M.49 numeric) for
 * the `region` type — alpha-3 is not part of the standard.
 *
 * Hand-maintained; if you add a code to the contracts list, add the
 * matching alpha-2 here and `countryName()` will pick up its localised
 * label automatically from the browser's ICU data.
 */
const ALPHA3_TO_ALPHA2: Record<IsoAlpha3, string> = {
  AFG: 'AF', ALB: 'AL', DZA: 'DZ', AND: 'AD', AGO: 'AO', ATG: 'AG', ARG: 'AR', ARM: 'AM', AUS: 'AU', AUT: 'AT',
  AZE: 'AZ', BHS: 'BS', BHR: 'BH', BGD: 'BD', BRB: 'BB', BLR: 'BY', BEL: 'BE', BLZ: 'BZ', BEN: 'BJ', BTN: 'BT',
  BOL: 'BO', BIH: 'BA', BWA: 'BW', BRA: 'BR', BRN: 'BN', BGR: 'BG', BFA: 'BF', BDI: 'BI', CPV: 'CV', KHM: 'KH',
  CMR: 'CM', CAN: 'CA', CAF: 'CF', TCD: 'TD', CHL: 'CL', CHN: 'CN', COL: 'CO', COM: 'KM', COG: 'CG', COD: 'CD',
  CRI: 'CR', CIV: 'CI', HRV: 'HR', CUB: 'CU', CYP: 'CY', CZE: 'CZ', DNK: 'DK', DJI: 'DJ', DMA: 'DM', DOM: 'DO',
  ECU: 'EC', EGY: 'EG', SLV: 'SV', GNQ: 'GQ', ERI: 'ER', EST: 'EE', SWZ: 'SZ', ETH: 'ET', FJI: 'FJ', FIN: 'FI',
  FRA: 'FR', GAB: 'GA', GMB: 'GM', GEO: 'GE', DEU: 'DE', GHA: 'GH', GRC: 'GR', GRD: 'GD', GTM: 'GT', GIN: 'GN',
  GNB: 'GW', GUY: 'GY', HTI: 'HT', HND: 'HN', HUN: 'HU', ISL: 'IS', IND: 'IN', IDN: 'ID', IRN: 'IR', IRQ: 'IQ',
  IRL: 'IE', ISR: 'IL', ITA: 'IT', JAM: 'JM', JPN: 'JP', JOR: 'JO', KAZ: 'KZ', KEN: 'KE', KIR: 'KI', KWT: 'KW',
  KGZ: 'KG', LAO: 'LA', LVA: 'LV', LBN: 'LB', LSO: 'LS', LBR: 'LR', LBY: 'LY', LIE: 'LI', LTU: 'LT', LUX: 'LU',
  MDG: 'MG', MWI: 'MW', MYS: 'MY', MDV: 'MV', MLI: 'ML', MLT: 'MT', MHL: 'MH', MRT: 'MR', MUS: 'MU', MEX: 'MX',
  FSM: 'FM', MDA: 'MD', MCO: 'MC', MNG: 'MN', MNE: 'ME', MAR: 'MA', MOZ: 'MZ', MMR: 'MM', NAM: 'NA', NRU: 'NR',
  NPL: 'NP', NLD: 'NL', NZL: 'NZ', NIC: 'NI', NER: 'NE', NGA: 'NG', PRK: 'KP', MKD: 'MK', NOR: 'NO', OMN: 'OM',
  PAK: 'PK', PLW: 'PW', PSE: 'PS', PAN: 'PA', PNG: 'PG', PRY: 'PY', PER: 'PE', PHL: 'PH', POL: 'PL', PRT: 'PT',
  QAT: 'QA', ROU: 'RO', RUS: 'RU', RWA: 'RW', KNA: 'KN', LCA: 'LC', VCT: 'VC', WSM: 'WS', SMR: 'SM', STP: 'ST',
  SAU: 'SA', SEN: 'SN', SRB: 'RS', SYC: 'SC', SLE: 'SL', SGP: 'SG', SVK: 'SK', SVN: 'SI', SLB: 'SB', SOM: 'SO',
  ZAF: 'ZA', KOR: 'KR', SSD: 'SS', ESP: 'ES', LKA: 'LK', SDN: 'SD', SUR: 'SR', SWE: 'SE', CHE: 'CH', SYR: 'SY',
  TWN: 'TW', TJK: 'TJ', TZA: 'TZ', THA: 'TH', TLS: 'TL', TGO: 'TG', TON: 'TO', TTO: 'TT', TUN: 'TN', TUR: 'TR',
  TKM: 'TM', TUV: 'TV', UGA: 'UG', UKR: 'UA', ARE: 'AE', GBR: 'GB', USA: 'US', URY: 'UY', UZB: 'UZ', VUT: 'VU',
  VAT: 'VA', VEN: 'VE', VNM: 'VN', YEM: 'YE', ZMB: 'ZM', ZWE: 'ZW',
};

// Intl.DisplayNames is stateful per (locale, options) pair — cache it
// so listing 195 country codes doesn't allocate a fresh instance per
// item per render. Keyed by the base language tag.
const DISPLAY_NAMES_CACHE = new Map<string, Intl.DisplayNames>();

function getDisplayNames(locale: string): Intl.DisplayNames {
  const lang = locale.split('-')[0] ?? 'en';
  let dn = DISPLAY_NAMES_CACHE.get(lang);
  if (!dn) {
    dn = new Intl.DisplayNames([lang, 'en'], { type: 'region', fallback: 'code' });
    DISPLAY_NAMES_CACHE.set(lang, dn);
  }
  return dn;
}

/**
 * Localised country name for an ISO 3166-1 alpha-3 code, e.g.
 * `countryName('SWE', 'sv')` → `"Sverige"`. Falls back to the code
 * itself if the locale doesn't recognise it.
 */
export function countryName(code: IsoAlpha3, locale: string): string {
  const alpha2 = ALPHA3_TO_ALPHA2[code];
  if (!alpha2) return code;
  return getDisplayNames(locale).of(alpha2) ?? code;
}

/**
 * ISO 3166-1 alpha-2 code (lowercase) for the given alpha-3, or `null`
 * if not mapped. Used to build `flag-icons` classnames like `fi fi-se`.
 */
export function countryAlpha2(code: IsoAlpha3): string | null {
  const alpha2 = ALPHA3_TO_ALPHA2[code];
  return alpha2 ? alpha2.toLowerCase() : null;
}
