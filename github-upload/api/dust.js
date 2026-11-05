const REGIONS = new Set([
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]);
const BASE_URL = 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty';
const PAGE_SIZE = 100;

function decodeServiceKey(value) {
  try { return decodeURIComponent(value.trim()); }
  catch { return value.trim(); }
}

async function fetchPage(sido, apiKey, pageNo, signal) {
  const url = new URL(BASE_URL);
  url.search = new URLSearchParams({
    serviceKey: decodeServiceKey(apiKey), returnType: 'json',
    numOfRows: String(PAGE_SIZE), pageNo: String(pageNo), ver: '1.3', sidoName: sido,
  }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('대기질 제공 서버에서 요청을 처리하지 못했습니다.');
  let data;
  try { data = JSON.parse(await response.text()); }
  catch { throw new Error('대기질 서버 응답을 확인할 수 없습니다. 인증키와 서비스 상태를 확인해주세요.'); }
  const { header, body } = data?.response || {};
  if (String(header?.resultCode) !== '00') {
    throw new Error('대기질 API 요청에 실패했습니다. 인증키, 활용 승인 및 호출 한도를 확인해주세요.');
  }
  if (!body || typeof body !== 'object') throw new Error('대기질 데이터 형식이 올바르지 않습니다.');
  const rawItems = body.items;
  const items = Array.isArray(rawItems) ? rawItems : rawItems?.item;
  const totalCount = Number(body.totalCount);
  if (items != null && !Array.isArray(items) && typeof items !== 'object') {
    throw new Error('측정소 데이터 형식이 올바르지 않습니다.');
  }
  const normalizedItems = items == null ? [] : Array.isArray(items) ? items : [items];
  if (normalizedItems.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('측정소 데이터 형식이 올바르지 않습니다.');
  }
  if (Number.isFinite(totalCount) && totalCount > 0 && normalizedItems.length === 0) {
    throw new Error('측정소 데이터가 누락되었습니다. 잠시 후 다시 시도해주세요.');
  }
  return { items: normalizedItems, totalCount };
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'GET 요청만 지원합니다.' });
  }
  const sido = req.query?.sido;
  if (sido !== undefined && typeof sido !== 'string') {
    return res.status(400).json({ message: '지역을 하나만 선택해주세요.' });
  }
  const targetSido = sido?.trim() || '서울';
  if (!REGIONS.has(targetSido)) {
    return res.status(400).json({ message: '지원하지 않는 지역입니다.' });
  }
  const apiKey = process.env.AIRKOREA_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ message: '서버에 AIRKOREA_KEY 인증키가 설정되지 않았습니다.' });
  }
  const signal = AbortSignal.timeout(20_000);
  try {
    const firstPage = await fetchPage(targetSido, apiKey, 1, signal);
    const items = [...firstPage.items];
    const pageCount = Number.isFinite(firstPage.totalCount)
      ? Math.ceil(firstPage.totalCount / PAGE_SIZE) : 1;
    if (pageCount > 100) throw new Error('대기질 데이터의 전체 건수가 올바르지 않습니다.');
    for (let pageNo = 2; pageNo <= pageCount; pageNo++) {
      const page = await fetchPage(targetSido, apiKey, pageNo, signal);
      items.push(...page.items);
    }
    return res.status(200).json({ sido: targetSido, items });
  } catch (error) {
    return res.status(signal.aborted ? 504 : 502).json({
      message: signal.aborted ? '대기질 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
        : error.message === 'fetch failed' ? '대기질 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'
          : error.message || '대기질 데이터를 불러오지 못했습니다.',
    });
  }
}
