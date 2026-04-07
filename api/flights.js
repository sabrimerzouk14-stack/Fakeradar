export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const lat  = url.searchParams.get('lat')      || '43.44';
  const lon  = url.searchParams.get('lon')      || '5.22';
  const dist = url.searchParams.get('dist')     || '150';
  const cs   = url.searchParams.get('callsign') || '';   // lookup d'un seul vol

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 's-maxage=8',
  };

  // ── MODE CALLSIGN : enrichissement d'un seul vol ──
  if (cs) {
    try {
      const r = await fetch(`https://api.adsb.lol/v2/callsign/${cs.trim()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const data = await r.json();
        const info = Array.isArray(data.ac) ? data.ac[0] : data.ac || {};
        return new Response(JSON.stringify({
          ok: true,
          dep:       info.dep       || info.from      || '',
          arr:       info.arr       || info.to        || '',
          from_long: info.from_long || info.origin    || '',
          to_long:   info.to_long   || info.dest      || '',
          airline:   info.airline   || '',
          type:      info.t         || info.type      || '',
        }), { headers });
      }
    } catch(e) {}
    return new Response(JSON.stringify({ ok: false }), { headers });
  }

  // ── MODE RADAR : tous les vols dans la zone ──
  let ac = [];

  try {
    const r = await fetch(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(7000),
    });
    if (r.ok) { const d = await r.json(); ac = d.ac || []; }
  } catch(e) {}

  if (!ac.length) {
    try {
      const r = await fetch(`https://api.adsb.one/v2/point/${lat}/${lon}/${dist}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (r.ok) { const d = await r.json(); ac = d.ac || []; }
    } catch(e) {}
  }

  if (!ac.length) {
    return new Response(JSON.stringify({ ok: false, total: 0 }), { status: 503, headers });
  }

  return new Response(JSON.stringify({ ok: true, ac, total: ac.length }), { headers });
}
