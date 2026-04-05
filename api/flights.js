export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat') || '43.44';
  const lon = url.searchParams.get('lon') || '5.22';
  const dist = url.searchParams.get('dist') || '150';

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const r = await fetch(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`);
    if (r.ok) {
      const data = await r.json();
      if (data.ac?.length) {
        return new Response(JSON.stringify({ ok: true, ac: data.ac, total: data.ac.length }), { headers });
      }
    }
  } catch(e) {}

  try {
    const d = 2.5;
    const r = await fetch(`https://opensky-network.org/api/states/all?lamin=${+lat-d}&lomin=${+lon-d}&lamax=${+lat+d}&lomax=${+lon+d}`);
    if (r.ok) {
      const data = await r.json();
      if (data.states?.length) {
        return new Response(JSON.stringify({ ok: true, states: data.states, total: data.states.length }), { headers });
      }
    }
  } catch(e) {}

  return new Response(JSON.stringify({ ok: false, total: 0 }), { status: 503, headers });
}
