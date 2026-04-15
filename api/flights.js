export const config = { runtime: 'edge' };

const RAPIDAPI_KEY = '10afcc18cdmsh82284cafd9b38d5p182f29jsn3dda2a9823c2';

export default async function handler(req) {
  const url  = new URL(req.url);
  const lat  = url.searchParams.get('lat')      || '43.44';
  const lon  = url.searchParams.get('lon')      || '5.22';
  const dist = url.searchParams.get('dist')     || '150';
  const cs   = url.searchParams.get('callsign') || '';

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 's-maxage=8',
  };

  // ── MODE CALLSIGN : lookup via AeroDataBox ──
  if (cs) {
    try {
      const r = await fetch(
        `https://aerodatabox.p.rapidapi.com/flights/number/${cs.trim().toUpperCase()}`,
        {
          headers: {
            'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY,
          },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (r.ok) {
        const data = await r.json();
        const flight = Array.isArray(data) ? data[0] : data;
        if (flight) {
          return new Response(JSON.stringify({
            ok: true,
            dep:       flight.departure?.airport?.iata || '',
            arr:       flight.arrival?.airport?.iata   || '',
            from_long: flight.departure?.airport?.name || '',
            to_long:   flight.arrival?.airport?.name   || '',
            airline:   flight.airline?.name            || '',
            type:      flight.aircraft?.model          || '',
            status:    flight.status                   || '',
            dep_time:  flight.departure?.scheduledTime?.local || '',
            arr_time:  flight.arrival?.scheduledTime?.local   || '',
            dep_terminal: flight.departure?.terminal   || '',
            arr_terminal: flight.arrival?.terminal     || '',
            dep_gate:     flight.departure?.gate       || '',
          }), { headers });
        }
      }
    } catch(e) {}

    // Fallback : adsb.lol callsign
    try {
      const r = await fetch(
        `https://api.adsb.lol/v2/callsign/${cs.trim().toUpperCase()}`,
        { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(4000) }
      );
      if (r.ok) {
        const data = await r.json();
        const ac = Array.isArray(data.ac) ? data.ac[0] : null;
        if (ac) {
          return new Response(JSON.stringify({
            ok: true,
            dep:       ac.dep       || '',
            arr:       ac.arr       || '',
            from_long: ac.from_long || '',
            to_long:   ac.to_long   || '',
            type:      ac.t         || '',
          }), { headers });
        }
      }
    } catch(e) {}

    return new Response(JSON.stringify({ ok: false }), { headers });
  }

  // ── MODE AIRPORT : départs/arrivées via AeroDataBox ──
  const airport = url.searchParams.get('airport') || '';
  const dir     = url.searchParams.get('direction') || 'dep';
  if (airport) {
    try {
      const now  = new Date();
      const from = now.toISOString().substring(0,16);
      const to   = new Date(now.getTime()+12*3600000).toISOString().substring(0,16);
      const direction = dir==='dep'?'Departure':'Arrival';
      const adbUrl = `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${airport}/${from}/${to}?withLeg=true&direction=${direction}&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false`;
      const r = await fetch(adbUrl, {
        headers: {
          'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
          'x-rapidapi-key':  RAPIDAPI_KEY,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (r.status === 429) return new Response(JSON.stringify({ok:false,error:'429'}),{status:429,headers});
      if (!r.ok) throw new Error('API '+r.status);
      const d = await r.json();
      const flights = dir==='dep'?(d.departures||[]):(d.arrivals||[]);
      return new Response(JSON.stringify({ok:true,flights}),{headers});
    } catch(e) {
      return new Response(JSON.stringify({ok:false,error:e.message}),{status:500,headers});
    }
  }

  // ── MODE RADAR : tous les vols dans la zone ──
  let ac = [];
  let source = '';

  try {
    const r = await fetch(
      `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
      { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(7000) }
    );
    if (r.ok) { const d = await r.json(); ac = d.ac || []; source = 'adsb.lol'; }
  } catch(e) {}

  if (!ac.length) {
    try {
      const r = await fetch(
        `https://api.adsb.one/v2/point/${lat}/${lon}/${dist}`,
        { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(7000) }
      );
      if (r.ok) { const d = await r.json(); ac = d.ac || []; source = 'adsb.one'; }
    } catch(e) {}
  }

  if (!ac.length) {
    return new Response(JSON.stringify({ ok: false, total: 0 }), { status: 503, headers });
  }

  return new Response(
    JSON.stringify({ ok: true, ac, source, total: ac.length }),
    { headers }
  );
}
