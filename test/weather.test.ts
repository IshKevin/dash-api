import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import request from 'supertest';
import app from '../src/server';
import { prisma } from '../src/lib/prisma';
import {
  ADVICE_THRESHOLDS,
  WEATHER_SOURCES,
  buildAdvice,
  buildOverview,
  classifyVsNormal,
  computeRainfallHistory,
  parseForecast,
  shiftDate,
  sprayOk,
  harvestOk,
} from '../src/services/weatherProvider';

/* ───────────── Fixtures (no network) ───────────── */

const TODAY = '2026-03-10';
const PAST = 7;
const DAYS = PAST + 16;

type HourFn = (dayOffset: number, hour: number) => Partial<Record<string, number>>;
type DayFn = (dayOffset: number) => Partial<Record<string, number>>;

/** Open-Meteo-shaped forecast JSON. Defaults: calm, dry, 24 °C, 70 % RH. */
function forecastFixture(hour: HourFn = () => ({}), day: DayFn = () => ({}), nowHour = 7) {
  const hourly: Record<string, any[]> = {
    time: [], temperature_2m: [], relative_humidity_2m: [], precipitation_probability: [], precipitation: [],
    weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], uv_index: [], et0_fao_evapotranspiration: [],
    leaf_wetness_probability: [], soil_moisture_0_to_1cm: [], soil_moisture_3_to_9cm: [], soil_moisture_9_to_27cm: [],
    soil_temperature_6cm: [],
  };
  const daily: Record<string, any[]> = {
    time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [], precipitation_hours: [],
    precipitation_probability_max: [], relative_humidity_2m_mean: [], wind_speed_10m_max: [], wind_gusts_10m_max: [],
    uv_index_max: [], sunshine_duration: [], et0_fao_evapotranspiration: [], sunrise: [], sunset: [],
  };
  for (let d = -PAST; d < DAYS - PAST; d++) {
    const date = shiftDate(TODAY, d);
    let rain = 0; let pmax = 0; let gmax = 0; let tmax = -99; let tmin = 99;
    for (let h = 0; h < 24; h++) {
      const v = { temperature_2m: 24, relative_humidity_2m: 70, precipitation_probability: 5, precipitation: 0, weather_code: 1,
        wind_speed_10m: 6, wind_gusts_10m: 12, uv_index: 5, et0_fao_evapotranspiration: 0.17, leaf_wetness_probability: 10,
        soil_moisture_0_to_1cm: 0.3, soil_moisture_3_to_9cm: 0.3, soil_moisture_9_to_27cm: 0.3, soil_temperature_6cm: 22, ...hour(d, h) };
      hourly.time.push(`${date}T${String(h).padStart(2, '0')}:00`);
      for (const k of Object.keys(v)) if (k in hourly) hourly[k].push((v as any)[k]);
      rain += v.precipitation; pmax = Math.max(pmax, v.precipitation_probability); gmax = Math.max(gmax, v.wind_gusts_10m);
      tmax = Math.max(tmax, v.temperature_2m); tmin = Math.min(tmin, v.temperature_2m);
    }
    const dv = { weather_code: 1, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: rain, precipitation_hours: 0,
      precipitation_probability_max: pmax, relative_humidity_2m_mean: 70, wind_speed_10m_max: 8, wind_gusts_10m_max: gmax,
      uv_index_max: 11, sunshine_duration: 30000, et0_fao_evapotranspiration: 4, ...day(d) };
    daily.time.push(date); daily.sunrise.push(`${date}T06:00`); daily.sunset.push(`${date}T18:00`);
    for (const k of Object.keys(dv)) if (k in daily) daily[k].push((dv as any)[k]);
  }
  return {
    elevation: 1500,
    current: { time: `${TODAY}T${String(nowHour).padStart(2, '0')}:00`, temperature_2m: 22, relative_humidity_2m: 70, precipitation: 0,
      weather_code: 1, wind_speed_10m: 6, wind_gusts_10m: 12, apparent_temperature: 22, cloud_cover: 20, wind_direction_10m: 90, is_day: 1 },
    hourly, daily,
  };
}

/** Archive JSON: constant `normal` mm/day for 10 past years, `recent` mm/day for the last 90 days. */
function archiveFixture(normal: number, recent: number, lagDays = 3) {
  const end = shiftDate(TODAY, -1);
  const start = shiftDate(shiftDate(end, -95), 0, -10);
  const time: string[] = []; const rain: (number | null)[] = []; const et0: (number | null)[] = [];
  const recentStart = shiftDate(end, -89);
  for (let d = start; d <= end; d = shiftDate(d, 1)) {
    time.push(d);
    const missing = d > shiftDate(end, -lagDays);
    rain.push(missing ? null : d >= recentStart ? recent : normal);
    et0.push(missing ? null : 4);
  }
  return { daily: { time, precipitation_sum: rain, et0_fao_evapotranspiration: et0 } };
}

const advice = (raw: any, hist: any = null) => buildAdvice(parseForecast(raw), hist);
const card = (r: ReturnType<typeof advice>, id: string) => r.advice.find((a) => a.id === id)!;

describe('Weather — derivation logic (fixtures, no network)', () => {
  it('parses the forecast and finds now/today', () => {
    const f = parseForecast(forecastFixture());
    expect(f.today).to.equal(TODAY);
    expect(f.daily[f.todayIndex].date).to.equal(TODAY);
    expect(f.hourly[f.nowIndex].time).to.equal(`${TODAY}T07:00`);
    expect(f.current.soil_moisture_pct).to.equal(30);
  });

  it('calm dry weather: spraying OK now, harvest every day, no alerts', () => {
    const r = advice(forecastFixture());
    expect(card(r, 'spraying').level).to.equal('good');
    expect(r.spray_windows.length).to.be.greaterThan(0);
    expect(card(r, 'harvest').level).to.equal('good');
    expect(r.harvest_days).to.have.length(7);
    expect(r.alerts).to.have.length(0);
    expect(card(r, 'disease').level).to.equal('good');
  });

  it('no spraying at night or when rain follows within the dry-hours window', () => {
    const raw = forecastFixture((d, h) => (d === 0 && h === 10 ? { precipitation: 2, precipitation_probability: 90 } : {}));
    const f = parseForecast(raw);
    const idx = (h: number) => f.hourly.findIndex((p) => p.time === `${TODAY}T${String(h).padStart(2, '0')}:00`);
    expect(sprayOk(f.hourly, idx(7))).to.equal(false); // rain at 10:00 within 4 h
    expect(sprayOk(f.hourly, idx(11))).to.equal(true);
    expect(sprayOk(f.hourly, idx(22))).to.equal(false); // night
  });

  it('wind above the threshold blocks spraying', () => {
    const r = advice(forecastFixture(() => ({ wind_speed_10m: ADVICE_THRESHOLDS.spray.maxWindKmh + 5, wind_gusts_10m: 40 })));
    expect(card(r, 'spraying').level).to.equal('warning');
    expect(r.spray_windows).to.have.length(0);
  });

  it('dry week with ET0 > rain → irrigation advice', () => {
    const r = advice(forecastFixture(() => ({ soil_moisture_3_to_9cm: 0.15 })));
    const irr = card(r, 'irrigation');
    expect(irr.level).to.equal('caution'); // 7 × 4 mm ET0, 0 rain → −28 mm (deficit ≤ −15, not yet severe ≤ −30)
    expect(irr.details.join(' ')).to.match(/ET0/);
  });

  it('wet past week and rain coming → no irrigation, root-rot warning', () => {
    const raw = forecastFixture(
      (d, h) => (d < 0 && h === 15 ? { precipitation: 12, precipitation_probability: 90 } : {}),
      () => ({}),
    );
    const r = advice(raw);
    expect(card(r, 'irrigation').level).to.equal('good');
    expect(card(r, 'disease').level).to.not.equal('good');
    expect(card(r, 'disease').message).to.match(/root rot/i);
  });

  it('long warm humid periods → high anthracnose risk', () => {
    const r = advice(forecastFixture(() => ({ relative_humidity_2m: 95, temperature_2m: 21 })));
    expect(card(r, 'disease').level).to.equal('warning');
    expect(card(r, 'disease').message).to.match(/anthracnose/i);
  });

  it('heat, heavy rain, thunderstorm and wind produce alerts/advice', () => {
    const raw = forecastFixture(
      (d, h) => (d === 2 && h >= 14 && h < 18 ? { precipitation: 15, precipitation_probability: 95, wind_gusts_10m: 60 } : d === 1 && h === 13 ? { temperature_2m: 33 } : {}),
      (d) => (d === 2 ? { weather_code: 95 } : {}),
    );
    const r = advice(raw);
    expect(card(r, 'heat').level).to.equal('warning');
    const ids = r.alerts.map((a) => a.id);
    expect(ids).to.include(`rain-${shiftDate(TODAY, 2)}`);
    expect(r.alerts.find((a) => a.id.startsWith('rain-'))!.level).to.equal('warning'); // 60 mm ≥ very heavy
    expect(ids).to.include(`storm-${shiftDate(TODAY, 2)}`);
    expect(ids).to.include(`wind-${shiftDate(TODAY, 2)}`);
    expect(r.harvest_days).to.not.include(shiftDate(TODAY, 2));
    expect(card(r, 'rain').level).to.equal('warning');
  });

  it('harvestOk respects rain, probability and gust thresholds', () => {
    const base = { date: TODAY, temp_min_c: 15, temp_max_c: 25, humidity_pct: 70, conditions: 'Clear' };
    expect(harvestOk({ ...base, rainfall_mm: 0, rain_probability_pct: 10, gusts_max_kmh: 20 })).to.equal(true);
    expect(harvestOk({ ...base, rainfall_mm: 5, rain_probability_pct: 10, gusts_max_kmh: 20 })).to.equal(false);
    expect(harvestOk({ ...base, rainfall_mm: 0, rain_probability_pct: 95, gusts_max_kmh: 20 })).to.equal(false);
    expect(harvestOk({ ...base, rainfall_mm: 0, rain_probability_pct: 10, gusts_max_kmh: 45 })).to.equal(false);
  });

  it('rainfall vs normal: windows, periods, reanalysis lag', () => {
    const h = computeRainfallHistory(archiveFixture(2, 1))!;
    expect(h.end_date).to.equal(shiftDate(TODAY, -4)); // last 3 days missing
    expect(h.years_compared).to.equal(10);
    const w30 = h.windows.find((w) => w.days === 30)!;
    expect(w30.actual_mm).to.equal(30);
    expect(w30.normal_mm).to.be.closeTo(60, 1); // leap years add a day
    expect(w30.pct_of_normal).to.be.closeTo(50, 1);
    expect(w30.status).to.equal('drier');
    expect(h.periods).to.have.length(9);
    expect(h.periods[8].end_date).to.equal(h.end_date);
    expect(computeRainfallHistory(archiveFixture(1, 2))!.windows[0].status).to.equal('much_wetter');
  });

  it('classifies percent of normal', () => {
    expect(classifyVsNormal(30)).to.equal('much_drier');
    expect(classifyVsNormal(100)).to.equal('normal');
    expect(classifyVsNormal(130)).to.equal('wetter');
    expect(classifyVsNormal(null)).to.equal(null);
  });

  it('dry history adds context to irrigation advice', () => {
    const h = computeRainfallHistory(archiveFixture(3, 0.5));
    const r = advice(forecastFixture(), h);
    expect(card(r, 'irrigation').details.join(' ')).to.match(/Last 30 days/);
  });

  it('buildOverview degrades gracefully when one upstream is missing', () => {
    const onlyHistory: any = buildOverview(null, archiveFixture(2, 2), [{ part: 'forecast', message: 'down' }]);
    expect(onlyHistory.forecast_available).to.equal(false);
    expect(onlyHistory.partial).to.equal(true);
    expect(onlyHistory.rainfall_history).to.not.equal(null);

    const onlyForecast: any = buildOverview(forecastFixture(), null, [{ part: 'rainfall_history', message: 'down' }]);
    expect(onlyForecast.forecast_available).to.equal(true);
    expect(onlyForecast.hourly).to.have.length(48);
    expect(onlyForecast.daily).to.have.length(16);
    expect(onlyForecast.past_daily).to.have.length(7);
    expect(onlyForecast.current.source).to.equal('open-meteo-forecast');
    expect(onlyForecast.water_balance.past_7d.et0_mm).to.equal(28);
    expect(onlyForecast.rainfall_history).to.equal(null);
  });

  it('every cited source id exists in WEATHER_SOURCES', () => {
    const ids = new Set(WEATHER_SOURCES.map((s) => s.id));
    const o: any = buildOverview(forecastFixture(), archiveFixture(2, 2));
    const cited = [o.current.source, o.hourly_source, o.daily_source, o.soil.source, o.rainfall_history.source, ...o.advice.flatMap((a: any) => [a.source, ...a.based_on])];
    cited.forEach((c) => expect(ids.has(c), c).to.equal(true));
    expect(WEATHER_SOURCES.find((s) => s.id === 'open-meteo-forecast')!.licence).to.equal('CC BY 4.0');
    expect(WEATHER_SOURCES.map((s) => s.url)).to.include('https://www.meteorwanda.gov.rw');
  });
});

/* ───────────── Route (in-process; upstream calls tolerated) ───────────── */

async function registerFarmer(tag: string, district: string) {
  const res = await request(app).post('/api/auth/register').send({
    email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
    password: 'TestPass123!', full_name: `Farmer ${tag}`, phone: '+250788200019', role: 'farmer', gender: 'Female',
    province: 'Eastern Province', district, sector: 'Musha', farm_size: 1, avocado_type: 'Hass', tree_count: 40,
  });
  expect(res.status, JSON.stringify(res.body)).to.equal(201);
  return { token: res.body.data.token as string, id: res.body.data.user.id as string };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('GET /api/weather/overview', function () {
  this.timeout(60000);
  const userIds: string[] = [];
  let a: { token: string; id: string };
  let b: { token: string; id: string };
  let farmB: string;

  before(async () => {
    a = await registerFarmer('wx-a', 'Rwamagana');
    b = await registerFarmer('wx-b', 'Huye');
    userIds.push(a.id, b.id);
    const farm = await prisma.farm.create({
      data: { farmName: 'WX test farm', farmerName: 'Farmer wx-b', farmer_id: b.id, location: { district: 'Huye' }, farm_size: 1, tree_count: 10, varieties: ['Hass'], planting_date: new Date('2020-01-01') },
    });
    farmB = farm.id;
  });

  after(async () => {
    await prisma.farm.deleteMany({ where: { farmer_id: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { recipient_id: { in: userIds } } });
    await prisma.signature.deleteMany({ where: { signer_id: { in: userIds } } });
    await prisma.document.deleteMany({ where: { owner_id: { in: userIds } } });
    await prisma.farmerProfile.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.cart.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/weather/overview');
    expect(res.status).to.equal(401);
  });

  it('rejects coordinates outside Rwanda', async () => {
    const res = await request(app).get('/api/weather/overview').query({ lat: -1.29, lng: 36.82 }).set(auth(a.token));
    expect(res.status).to.equal(400);
  });

  it("a farmer cannot read another farmer's farm", async () => {
    const res = await request(app).get('/api/weather/overview').query({ farm_id: farmB }).set(auth(a.token));
    expect(res.status).to.equal(403);
  });

  it('falls back to the district centre for a farm without GPS (live upstream; 503 tolerated)', async () => {
    const res = await request(app).get('/api/weather/overview').query({ farm_id: farmB }).set(auth(b.token));
    if (res.status === 503) return; // upstream down — not our bug
    expect(res.status, JSON.stringify(res.body)).to.equal(200);
    const d = res.body.data;
    expect(d.location.source).to.equal('district_centre');
    expect(d.location.approximate).to.equal(true);
    expect(d.location.district).to.equal('Huye');
    expect(d.location.farm_id).to.equal(farmB);
    expect(d.farms.map((f: any) => f.id)).to.include(farmB);
    expect(d.sources.map((s: any) => s.id)).to.include('open-meteo-forecast');
    if (d.forecast_available) {
      expect(d.advice.length).to.be.greaterThan(0);
      expect(d.hourly.length).to.be.greaterThan(0);
    }
  });

  it("without a farm uses the farmer's profile district", async () => {
    // Registration may create a farm; archive it so only the profile is left.
    await prisma.farm.updateMany({ where: { farmer_id: a.id }, data: { archived_at: new Date() } });
    const res = await request(app).get('/api/weather/overview').set(auth(a.token));
    if (res.status === 503) return;
    expect(res.status, JSON.stringify(res.body)).to.equal(200);
    expect(res.body.data.location.district).to.equal('Rwamagana');
    expect(res.body.data.farms).to.have.length(0);
  });
});
