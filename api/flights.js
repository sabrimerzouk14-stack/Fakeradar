export const config = { runtime: 'edge' };

const AVIATIONSTACK_KEY = 'bfbc1dbd1f69c45d802cdba8abe73737';

export default async function handler(req) {
  const url    = new URL(req.url);
  const lat    = parseFloat(url.searchParams.get('lat')  || '43.44');
  const lon    = parseFloat(url.searchParams.get('lon')  || '5.22');
  const dist   = parseFloat(url.searchParams.get('dist') || '150');
  const cs     = url.searchParams.get('callsign') || '';
  const airport= url.searchParams.get('airport')  || '';
  const dir    = url.searchParams.get('direction')|| 'dep';

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 's-maxage=60',
  };

  // ── MODE AIRPORT : départs/arrivées via AviationStack ──
  if (airport) {
    try {
      const type = dir === 'dep' ? 'departure' : 'arrival';
      const asUrl = `http://api.aviationstack.com/v1/flights?access_key=${AVIATIONSTACK_KEY}&${type}_iata=${airport}&flight_status=active,scheduled,landed&limit=50`;
      const r = await fetch(asUrl, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('API '+r.status);
      const d = await r.json();
      if (d.error) throw new Error(d.error.message||'API error');
      const raw = d.data || [];
      if (!raw.length) throw new Error('empty');

      // Convertir format AviationStack → format attendu par renderTable
      const flights = raw.map(f => ({
        number: f.flight?.iata || f.flight?.icao || '',
        airline: { iata: f.airline?.iata||'', name: f.airline?.name||'' },
        status: mapStatus(f.flight_status),
        aircraft: { model: f.aircraft?.iata||'', reg: f.aircraft?.registration||'' },
        departure: {
          airport: { iata: f.departure?.iata||'', name: f.departure?.airport||'' },
          scheduledTime: { local: f.departure?.scheduled||'' },
          actualTime:    { local: f.departure?.actual||'' },
          revisedTime:   { local: f.departure?.estimated||'' },
          terminal: f.departure?.terminal||'',
          gate:     f.departure?.gate||'',
          delay:    f.departure?.delay||0,
        },
        arrival: {
          airport: { iata: f.arrival?.iata||'', name: f.arrival?.airport||'' },
          scheduledTime: { local: f.arrival?.scheduled||'' },
          actualTime:    { local: f.arrival?.actual||'' },
          revisedTime:   { local: f.arrival?.estimated||'' },
          terminal: f.arrival?.terminal||'',
          gate:     f.arrival?.gate||'',
          delay:    f.arrival?.delay||0,
        },
      }));

      return new Response(JSON.stringify({ ok: true, flights }), { headers });
    } catch(e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
    }
  }

  // ── MODE CALLSIGN ──
  if (cs) {
    try {
      const r = await fetch(
        `https://api.adsb.lol/v2/callsign/${cs.trim().toUpperCase()}`,
        { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const data = await r.json();
        const ac = Array.isArray(data.ac) ? data.ac[0] : null;
        if (ac) return new Response(JSON.stringify({
          ok: true,
          dep: ac.dep||'', arr: ac.arr||'',
          from_long: ac.from_long||'', to_long: ac.to_long||'',
          type: ac.t||'', airline: '',
        }), { headers });
      }
    } catch(e) {}
    return new Response(JSON.stringify({ ok: false }), { headers });
  }

  // ── MODE RADAR ──
  const deg = dist*0.0167;
  const latMin=lat-deg, latMax=lat+deg, lonMin=lon-deg, lonMax=lon+deg;
  let ac=[], source='';

  // OpenSky
  try {
    const r = await fetch(
      `https://opensky-network.org/api/states/all?lamin=${latMin.toFixed(4)}&lomin=${lonMin.toFixed(4)}&lamax=${latMax.toFixed(4)}&lomax=${lonMax.toFixed(4)}`,
      { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const data = await r.json();
      if (data.states?.length) {
        ac = data.states.filter(s=>s[5]&&s[6]).map(s=>({
          hex:s[0]||'', flight:(s[1]||'').trim(), lat:s[6], lon:s[5],
          alt_baro:s[7]?Math.round(s[7]*3.28084):0,
          gs:s[9]?Math.round(s[9]*1.944):0,
          track:s[10]||0, baro_rate:s[11]?Math.round(s[11]*196.85):0,
          squawk:s[14]||'', gnd:s[8]?1:0, t:'', r:(s[1]||'').trim(),
        }));
        source = 'opensky';
      }
    }
  } catch(e) {}

  // adsb.lol fallback
  if (!ac.length) {
    try {
      const r = await fetch(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
        { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(7000) });
      if (r.ok) { const d=await r.json(); ac=d.ac||[]; source='adsb.lol'; }
    } catch(e) {}
  }

  // adsb.one fallback
  if (!ac.length) {
    try {
      const r = await fetch(`https://api.adsb.one/v2/point/${lat}/${lon}/${dist}`,
        { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(7000) });
      if (r.ok) { const d=await r.json(); ac=d.ac||[]; source='adsb.one'; }
    } catch(e) {}
  }

  if (!ac.length) return new Response(JSON.stringify({ok:false,total:0}),{status:503,headers});
  return new Response(JSON.stringify({ok:true,ac,source,total:ac.length}),{headers});
}

function mapStatus(s) {
  const m = {
    'scheduled':'Scheduled', 'active':'EnRoute', 'landed':'Arrived',
    'cancelled':'Cancelled', 'incident':'Diverted', 'diverted':'Diverted',
  };
  return m[s]||'Scheduled';
}
