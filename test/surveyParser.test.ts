import { expect } from 'chai';
import { describe, it } from 'mocha';
import { mapHeaders, parseRow, normalizePhone, parseBool, parseDate, farmAreaHectares } from '../src/services/surveyParser';
import { parseUpi, ringAreaSqm, canonicalDistrict, canonicalProvince } from '../src/services/rwandaGeo';
import { TEMPLATE_HEADERS } from '../src/routes/surveys';

describe('Survey parser (unit)', () => {
  const { columns, unknown, missingCore } = mapHeaders(TEMPLATE_HEADERS);
  const row = (values: Record<string, unknown>) => {
    const cells = TEMPLATE_HEADERS.map(() => null as unknown);
    for (const [header, v] of Object.entries(values)) {
      const idx = header.endsWith('#2') ? TEMPLATE_HEADERS.indexOf(header.slice(0, -2), 1) : TEMPLATE_HEADERS.indexOf(header);
      cells[idx] = v;
    }
    return parseRow(cells, columns, 2);
  };

  it('recognises every column of the official survey sheet', () => {
    expect(unknown).to.deep.equal([]);
    expect(missingCore).to.deep.equal([]);
    // first Province/District = enumerator area, second = farm location
    expect(columns[0].field).to.equal('survey_province');
    expect(columns[1].field).to.equal('survey_district');
    expect(columns[6].field).to.equal('province');
    expect(columns[7].field).to.equal('district');
  });

  it('normalises Rwandan phone numbers', () => {
    expect(normalizePhone(788123456)).to.equal('+250788123456');
    expect(normalizePhone('0788 123 456')).to.equal('+250788123456');
    expect(normalizePhone('+250 788-123-456')).to.equal('+250788123456');
    expect(normalizePhone('12345')).to.equal(null);
    expect(normalizePhone('')).to.equal(undefined);
  });

  it('reads yes/no in English and Kinyarwanda', () => {
    expect(parseBool('Y')).to.equal(true);
    expect(parseBool('yego')).to.equal(true);
    expect(parseBool('oya')).to.equal(false);
    expect(parseBool('maybe')).to.equal(null);
  });

  it('reads dd/mm/yyyy, ISO, Excel serials and bare years', () => {
    expect(parseDate('25/03/2024')!.toISOString().slice(0, 10)).to.equal('2024-03-25');
    expect(parseDate('2024-03-25')!.toISOString().slice(0, 10)).to.equal('2024-03-25');
    expect(parseDate(45376)!.toISOString().slice(0, 10)).to.equal('2024-03-25');
    expect(parseDate(2018)!.getUTCFullYear()).to.equal(2018);
  });

  it('parses a full row, canonicalises names and fixes swapped coordinates', () => {
    const r = row({
      Province: 'East', District: 'rwamagana', 'Date of Interview': '12/02/2025', 'consent(y/n)': 'y',
      province: 'Iburasirazuba', district: 'Rwamagana District', sector: 'Musha', 'owner of the farm': 'Jean Bosco',
      'Farmer contact': 788111222, sex: 'M', national_id: '1198080012345678', 'avocado varieties': 'Hass, Local',
      Hass: 40, Fuerte: 10, 'use of fertiliser(y/n)': 'yes', lat: 30.42, long: -1.95,
    });
    expect(r.errors).to.deep.equal([]);
    expect(r.data.province).to.equal('Eastern Province');
    expect(r.data.district).to.equal('Rwamagana');
    expect(r.data.survey_province).to.equal('Eastern Province');
    expect(r.data.farmer_contact).to.equal('+250788111222');
    expect(r.data.sex).to.equal('male');
    expect(r.data.physical_tree_count).to.equal(50);
    expect(r.data.varieties).to.have.members(['Hass', 'Local', 'Fuerte']);
    expect(r.data.latitude).to.equal(-1.95);
    expect(r.data.longitude).to.equal(30.42);
    expect(r.warnings.some((w) => /swapped/.test(w))).to.equal(true);
    expect(r.raw['Province']).to.equal('East');
    expect(r.raw['province']).to.equal('Iburasirazuba');
  });

  it('flags hard errors and data-quality warnings', () => {
    const r = row({ 'consent(y/n)': 'n', national_id: 1198080012345670, 'Farmer age': 7 });
    expect(r.errors.join(' ')).to.match(/consent/).and.match(/name/).and.match(/district/);
    expect(r.warnings.join(' ')).to.match(/truncated/).and.match(/age 7/);
  });

  it('converts large farm areas from m² to hectares', () => {
    expect(farmAreaHectares(2.5)).to.deep.equal({ hectares: 2.5, assumedSqm: false });
    expect(farmAreaHectares(5000)).to.deep.equal({ hectares: 0.5, assumedSqm: true });
  });
});

describe('Rwanda geo helpers (unit)', () => {
  it('parses and normalises UPIs', () => {
    const u = parseUpi(' 1/3/1/4/30 ');
    expect(u).to.include({ normalized: '1/03/01/04/30', province: 'Kigali City', district: 'Kicukiro', parcel_number: 30 });
    expect(parseUpi('5/01/02/03/1234-2')).to.include({ district: 'Rwamagana', unit: 2 });
    expect(parseUpi('6/01/01/01/1')).to.equal(null); // no province 6
    expect(parseUpi('1/09/01/01/1')).to.equal(null); // Kigali has 3 districts
    expect(parseUpi('hello')).to.equal(null);
  });

  it('canonicalises district and province names', () => {
    expect(canonicalDistrict('GATSIBO')!.province).to.equal('Eastern Province');
    expect(canonicalDistrict('Nowhere')).to.equal(null);
    expect(canonicalProvince('Amajyaruguru')).to.equal('Northern Province');
  });

  it('computes polygon area in m² (≈1 ha square near the equator)', () => {
    const d = 0.000898; // ~100 m in degrees at -2°
    const ring = [[30, -2], [30 + d, -2], [30 + d, -2 + d], [30, -2 + d], [30, -2]];
    const area = ringAreaSqm(ring);
    expect(area).to.be.within(9500, 10500);
  });
});
