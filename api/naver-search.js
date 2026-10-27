export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const q = (req.query?.q || '').trim();
  if (!q) {
    return res.status(200).json({ items: [] });
  }

  const headers = {
    Referer: 'https://map.naver.com/p/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
  };

  const results = [];
  const seenKeys = new Set();
  const pushItem = (name, address, category, lat, lon) => {
    const nLat = parseFloat(lat);
    const nLon = parseFloat(lon);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLon)) return;
    if (nLat < 32 || nLat > 39.5 || nLon < 124 || nLon > 132) return;
    const key = `${nLat.toFixed(4)}_${nLon.toFixed(4)}_${name}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    results.push({
      title: name || address,
      address: address || '',
      category: category || '',
      lat: nLat,
      lon: nLon,
      display_name: address ? `${name} (${address})` : name
    });
  };

  try {
    const [instantRes, allRes] = await Promise.allSettled([
      fetch(`https://map.naver.com/p/api/search/instant-search?query=${encodeURIComponent(q)}&coords=37.5665,126.9780`, { headers }),
      fetch(`https://map.naver.com/p/api/search/allSearch?query=${encodeURIComponent(q)}&type=all&searchCoord=126.9780;37.5665&boundary=`, { headers })
    ]);

    if (allRes.status === 'fulfilled' && allRes.value.ok) {
      const data = await allRes.value.json();
      const placeList = data?.result?.place?.list || [];
      placeList.forEach((p) => {
        pushItem(p.name, p.roadAddress || p.address || '', Array.isArray(p.category) ? p.category.join('·') : (p.category || ''), p.y, p.x);
      });
      const addrList = data?.result?.address?.roadAddress?.list || data?.result?.address?.jibunsAddress?.list || [];
      addrList.forEach((a) => {
        pushItem(a.name || a.fullAddress || q, a.fullAddress || a.roadAddress || a.jibunAddress || '', '주소', a.y, a.x);
      });
    }

    if (instantRes.status === 'fulfilled' && instantRes.value.ok) {
      const data = await instantRes.value.json();
      const places = data?.result?.place?.items || data?.place || [];
      places.forEach((p) => {
        pushItem(p.name || p.title, p.roadAddress || p.address || p.jibunAddress || '', p.category || p.type || '', p.y, p.x);
      });
      const addresses = data?.result?.address?.items || data?.address || [];
      addresses.forEach((a) => {
        pushItem(a.roadAddress || a.jibunAddress || a.fullAddress || q, a.roadAddress || a.jibunAddress || a.fullAddress || '', '주소', a.y, a.x);
      });
    }
  } catch (err) {
    // ignore
  }

  return res.status(200).json({ items: results.slice(0, 10) });
}

