/**
 * Builds the offline Rwanda geography data the API serves (src/data/rwanda/).
 *
 *   node scripts/build-rwanda-geo.js <path-to-rwanda-package> <dir-with-geoBoundaries-ADM1..4.geojson>
 *
 * Inputs (download once, nothing is fetched at runtime):
 *  - Official names: the `rwanda` npm package (knowbee/rwanda 3.0.2, MIT) — already
 *    a dependency of the web app: 5 provinces, 30 districts, 416 sectors, 2,148 cells,
 *    14,837 villages.
 *  - Boundaries: geoBoundaries gbOpen RWA ADM1–ADM4 "simplified" GeoJSON
 *    (https://www.geoboundaries.org/api/current/gbOpen/RWA/ADM3/ etc.), CC BY 4.0,
 *    source: Rwanda Geo Portal / Open Data Rwanda. Attribution is required.
 *
 * geoBoundaries sectors/cells carry only their own name, and names repeat across
 * districts, so each polygon's parent is found by containment and its name is
 * matched to the official spelling within that parent (small spelling
 * differences between the 2012 boundary data and current names are tolerated).
 */
const fs = require('fs');
const path = require('path');

const [, , rwandaPkg, boundariesDir] = process.argv;
if (!rwandaPkg || !boundariesDir) {
  console.error('usage: node scripts/build-rwanda-geo.js <rwanda-package-dir> <geoboundaries-dir>');
  process.exit(1);
}
const rw = require(path.resolve(rwandaPkg, 'dist/rwanda.umd.cjs'));
const OUT = path.join(__dirname, '..', 'src', 'data', 'rwanda');
fs.mkdirSync(OUT, { recursive: true });

const PKG_TO_APP = { Kigali: 'Kigali City', East: 'Eastern Province', North: 'Northern Province', South: 'Southern Province', West: 'Western Province' };
const norm = (s) => String(s ?? '').normalize('NFD').toLowerCase().replace(/[^a-z]/g, '');
const safe = (fn) => { try { return fn() || []; } catch { return []; } };

// ── Official hierarchy ───────────────────────────────────────────────────────
const divisions = rw.Provinces().map((p) => ({
  name: PKG_TO_APP[p] || p,
  districts: rw.Districts({ province: p }).map((d) => {
    // Sectors() returns the whole province's sectors: keep the ones with cells in this district.
    const sectors = [...new Set(safe(() => rw.Sectors({ province: p, district: d })))]
      .map((s) => ({ s, cells: safe(() => rw.Cells({ province: p, district: d, sector: s })) }))
      .filter((x) => x.cells.length);
    return {
      name: d,
      sectors: sectors.map(({ s, cells }) => ({
        name: s,
        cells: cells.map((c) => ({ name: c, villages: safe(() => rw.Villages({ province: p, district: d, sector: s, cell: c })) })),
      })),
    };
  // Districts() lists every district for every province: keep this province's own.
  }).filter((d) => d.sectors.length > 0),
}));
const count = (lvl) => divisions.flatMap((p) => p.districts).flatMap((d) => (lvl === 'd' ? [d] : d.sectors)).flatMap((s) => (lvl === 's' || lvl === 'd' ? [s] : s.cells)).length;
console.log('official:', divisions.length, 'provinces,', count('d'), 'districts,', count('s'), 'sectors,', count('c'), 'cells');
fs.writeFileSync(path.join(OUT, 'divisions.json'), JSON.stringify(divisions));

// ── Geometry helpers ─────────────────────────────────────────────────────────
const round = (c) => (typeof c[0] === 'number' ? [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5] : c.map(round));
const polygonsOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
function inRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inGeom = (pt, g) => polygonsOf(g).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));
/** Sample points spread over a polygon (vertices pulled 20% towards its centre) for robust containment votes. */
function samplePoints(g) {
  const ring = polygonsOf(g).sort((a, b) => b[0].length - a[0].length)[0][0];
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const step = Math.max(1, Math.floor(ring.length / 12));
  return [[cx, cy], ...ring.filter((_, i) => i % step === 0).map(([x, y]) => [x + (cx - x) * 0.2, y + (cy - y) * 0.2])];
}
function parentOf(feature, parents) {
  const pts = samplePoints(feature.geometry);
  let best = null;
  let bestVotes = 0;
  for (const p of parents) {
    const votes = pts.filter((pt) => inGeom(pt, p.geometry)).length;
    if (votes > bestVotes) { best = p; bestVotes = votes; }
  }
  return best;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Official spelling within the parent: exact (ignoring case/punctuation), else the closest within 3 edits. */
function officialName(name, candidates) {
  const n = norm(name);
  const exact = candidates.find((c) => norm(c) === n);
  if (exact) return exact;
  const scored = candidates.map((c) => [c, lev(norm(c), n)]).sort((a, b) => a[1] - b[1]);
  return scored.length && scored[0][1] <= 3 ? scored[0][0] : null;
}

const load = (lvl) => JSON.parse(fs.readFileSync(path.join(boundariesDir, `${lvl}.geojson`), 'utf8')).features;
const fc = (features) => ({
  type: 'FeatureCollection',
  attribution: 'Boundaries: geoBoundaries (gbOpen, CC BY 4.0) — Rwanda Geo Portal / Open Data Rwanda',
  features,
});
const feature = (properties, geometry) => ({ type: 'Feature', properties, geometry: { type: geometry.type, coordinates: round(geometry.coordinates) } });
const unmatched = [];

// Provinces
const provinceName = (n) => ({ cityofkigali: 'Kigali City', kigalicity: 'Kigali City' }[norm(n)] || divisions.find((p) => norm(p.name) === norm(n))?.name);
const provinces = load('ADM1').map((f) => feature({ province: provinceName(f.properties.shapeName) }, f.geometry));

// Districts (unique names nationwide)
const allDistricts = divisions.flatMap((p) => p.districts.map((d) => ({ province: p.name, district: d.name })));
const districts = load('ADM2').map((f) => {
  const m = allDistricts.find((d) => norm(d.district) === norm(f.properties.shapeName));
  if (!m) unmatched.push(['district', f.properties.shapeName]);
  return feature({ province: m?.province ?? null, district: m?.district ?? f.properties.shapeName }, f.geometry);
});

// Sectors: parent district by containment
const sectors = load('ADM3').map((f) => {
  const parent = parentOf(f, districts);
  const official = parent && divisions.flatMap((p) => p.districts).find((d) => d.name === parent.properties.district);
  const name = official && officialName(f.properties.shapeName, official.sectors.map((s) => s.name));
  if (!name) unmatched.push(['sector', `${f.properties.shapeName} (${parent?.properties.district})`]);
  return feature({ ...(parent?.properties ?? {}), sector: name ?? f.properties.shapeName, official: Boolean(name) }, f.geometry);
});

// Cells: parent sector by containment
const cells = load('ADM4').map((f) => {
  const parent = parentOf(f, sectors);
  const d = parent && divisions.flatMap((p) => p.districts).find((x) => x.name === parent.properties.district);
  const s = d?.sectors.find((x) => x.name === parent.properties.sector);
  const name = s && officialName(f.properties.shapeName, s.cells.map((c) => c.name));
  if (!name) unmatched.push(['cell', `${f.properties.shapeName} (${parent?.properties.sector}, ${parent?.properties.district})`]);
  const { official: _o, ...pp } = parent?.properties ?? {};
  return feature({ ...pp, cell: name ?? f.properties.shapeName, official: Boolean(name) }, f.geometry);
});

for (const [lvl, data] of [['province', provinces], ['district', districts], ['sector', sectors], ['cell', cells]]) {
  fs.writeFileSync(path.join(OUT, `boundaries-${lvl}.json`), JSON.stringify(fc(data)));
}
const byLevel = (l) => unmatched.filter((u) => u[0] === l).length;
console.log('boundaries:', provinces.length, districts.length, sectors.length, cells.length, '| not matched to an official name: districts', byLevel('district'), 'sectors', byLevel('sector'), 'cells', byLevel('cell'));
console.log('examples:', unmatched.slice(0, 15).map((u) => u.join(': ')).join(' | '));
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), 'KB');
