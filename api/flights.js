export const config = { runtime: 'edge' };

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

  // ── MODE CALLSIGN : lookup route d'un vol précis ──
  if (cs) {
    // Essai 1 : adsb.lol callsign
    try {
      const r = await fetch(`https://api.adsb.lol/v2/callsign/${cs.trim().toUpperCase()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
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
            type:      ac.t         || ac.type || '',
          }), { headers });
        }
      }
    } catch(e) {}

    // Essai 2 : adsb.lol hex (si callsign ressemble à un hex)
    try {
      const r = await fetch(`https://api.adsb.lol/v2/hex/${cs.trim().toLowerCase()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const data = await r.json();
        const ac = Array.isArray(data.ac) ? data.ac[0] : null;
        if (ac && (ac.dep || ac.arr)) {
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

  // ── MODE RADAR : tous les vols dans la zone ──
  let ac = [];
  let source = '';

  // Source 1 : adsb.lol
  try {
    const r = await fetch(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(7000),
    });
    if (r.ok) {
      const d = await r.json();
      ac = d.ac || [];
      source = 'adsb.lol';
    }
  } catch(e) {}

  // Source 2 : adsb.one fallback
  if (!ac.length) {
    try {
      const r = await fetch(`https://api.adsb.one/v2/point/${lat}/${lon}/${dist}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (r.ok) {
        const d = await r.json();
        ac = d.ac || [];
        source = 'adsb.one';
      }
    } catch(e) {}
  }

  if (!ac.length) {
    return new Response(JSON.stringify({ ok: false, total: 0 }), { status: 503, headers });
  }

  // Enrichir les vols sans dep/arr via lookup callsign en parallèle
  // (limité aux 30 premiers pour ne pas dépasser le timeout Edge)
  const needsEnrich = ac.filter(a => !a.dep && !a.arr && (a.flight||'').trim().length >= 3).slice(0, 30);

  if (needsEnrich.length > 0) {
    await Promise.allSettled(
      needsEnrich.map(async (a) => {
        const callsign = (a.flight || '').trim().toUpperCase();
        try {
          const r = await fetch(`https://api.adsb.lol/v2/callsign/${callsign}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(3000),
          });
          if (r.ok) {
            const data = await r.json();
            const info = Array.isArray(data.ac) ? data.ac[0] : null;
            if (info) {
              a.dep       = a.dep       || info.dep       || '';
              a.arr       = a.arr       || info.arr       || '';
              a.from_long = a.from_long || info.from_long || '';
              a.to_long   = a.to_long   || info.to_long   || '';
            }
          }
        } catch(e) {}
      })
    );
  }

  return new Response(
    JSON.stringify({ ok: true, ac, source, total: ac.length }),
    { headers }
  );
}
