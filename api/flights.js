export const config = { runtime: 'edge' };

const RAPIDAPI_KEY = '10afcc18cdmsh82284cafd9b38d5p182f29jsn3dda2a9823c2';

export default async function handler(req) {
  const url  = new URL(req.url);
  const lat  = parseFloat(url.searchParams.get('lat')  || '43.44');
  const lon  = parseFloat(url.searchParams.get('lon')  || '5.22');
  const dist = parseFloat(url.searchParams.get('dist') || '150');
  const cs   = url.searchParams.get('callsign') || '';

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 's-maxage=8',
  };

  // MODE CALLSIGN : adsb.lol uniquement (gratuit, pas de quota)
  if (cs) {
    try {
      const r = await fetch(
        `https://api.adsb.lol/v2/callsign/${cs.trim().toUpperCase()}`,
        { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(5000) }
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
            airline:   '',
          }), { headers });
        }
      }
    } catch(e) {}
    return new Response(JSON.stringify({ ok: false }), { headers });
  }

  // MODE RADAR : positions avions
  const deg = dist * 0.0167;
  const latMin = lat - deg, latMax = lat + deg;
  const lonMin = lon - deg, lonMax = lon + deg;

  let ac = [];
  let source = '';

  // SOURCE 1 : OpenSky Network (gratuit, sans cle, illimite)
  try {
    const osUrl = `https://opensky-network.org/api/states/all?lamin=${latMin.toFixed(4)}&lomin=${lonMin.toFixed(4)}&lamax=${latMax.toFixed(4)}&lomax=${lonMax.toFixed(4)}`;
    const r = await fetch(osUrl, {
      headers: { 'User-Agent': 'SkyView/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const data = await r.json();
      if (data.states && data.states.length) {
        ac = data.states
          .filter(s => s[5] && s[6])
          .map(s => ({
            hex:      s[0] || '',
            flight:   (s[1] || '').trim(),
            lat:      s[6],
            lon:      s[5],
            alt_baro: s[7] ? Math.round(s[7] * 3.28084) : 0,
            gs:       s[9] ? Math.round(s[9] * 1.944)   : 0,
            track:    s[10] || 0,
            baro_rate: s[11] ? Math.round(s[11] * 196.85) : 0,
            squawk:   s[14] || '',
            gnd:      s[8] ? 1 : 0,
            t:        '',
            r:        (s[1] || '').trim(),
          }));
        source = 'opensky';
      }
    }
  } catch(e) {}

  // SOURCE 2 : adsb.lol (fallback)
  if (!ac.length) {
    try {
      const r = await fetch(
        `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
        { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(7000) }
      );
      if (r.ok) {
        const d = await r.json();
        ac = d.ac || [];
        source = 'adsb.lol';
      }
    } catch(e) {}
  }

  // SOURCE 3 : adsb.one (fallback secondaire)
  if (!ac.length) {
    try {
      const r = await fetch(
        `https://api.adsb.one/v2/point/${lat}/${lon}/${dist}`,
        { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(7000) }
      );
      if (r.ok) {
        const d = await r.json();
        ac = d.ac || [];
        source = 'adsb.one';
      }
    } catch(e) {}
  }

  if (!ac.length) {
    return new Response(
      JSON.stringify({ ok: false, total: 0, source: 'none' }),
      { status: 503, headers }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, ac, source, total: ac.length }),
    { headers }
  );
}
