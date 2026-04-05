export default async function handler(req, res) {
  // CORS headers — allow any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=4');

  const { lat = 43.44, lon = 5.22, dist = 150 } = req.query;
  const d = parseFloat(dist) / 111; // nm → degrés approx
  const lamin = parseFloat(lat) - d;
  const lamax = parseFloat(lat) + d;
  const lomin = parseFloat(lon) - d;
  const lomax = parseFloat(lon) + d;

  // Source 1: ADS-B Exchange (adsb.lol)
  try {
    const r = await fetch(
      `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
      { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (r.ok) {
      const data = await r.json();
      if (data.ac && data.ac.length > 0) {
        return res.json({ source: 'adsb.lol', ac: data.ac, total: data.ac.length });
      }
    }
  } catch (e) {}

  // Source 2: OpenSky Network
  try {
    const r = await fetch(
      `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`,
      { headers: { 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (r.ok) {
      const data = await r.json();
      if (data.states && data.states.length > 0) {
        return res.json({ source: 'opensky', states: data.states, total: data.states.length });
      }
    }
  } catch (e) {}

  // Source 3: ADS-B Exchange globe API
  try {
    const r = await fetch(
      `https://globe.adsbexchange.com/re-api/?box=${lamin},${lamax},${lomin},${lomax}&maxage=15`,
      { headers: { 'Referer': 'https://globe.adsbexchange.com/', 'User-Agent': 'SkyView/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (r.ok) {
      const data = await r.json();
      const ac = (data.aircraft || data.ac || []).filter(a => a.lat && a.lon);
      if (ac.length > 0) {
        return res.json({ source: 'adsbx-globe', ac, total: ac.length });
      }
    }
  } catch (e) {}

  return res.status(503).json({ error: 'No live data available', total: 0 });
}
