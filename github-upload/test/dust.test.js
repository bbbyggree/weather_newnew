import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import handler from '../api/dust.js';

const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
function frontend(fetch) {
  const elements = new Map();
  const context = vm.createContext({
    URL, AbortController, fetch, console: { error() {} },
    window: { location: { origin: 'http://localhost:3000' }, addEventListener() {} },
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        textContent: '', innerHTML: '', attributes: {}, addEventListener() {},
        replaceChildren() { this.innerHTML = ''; },
        setAttribute(name, value) { this.attributes[name] = value; },
      });
      return elements.get(id);
    } },
  });
  vm.runInContext(source, context);
  return { elements, run: (code) => vm.runInContext(code, context) };
}
const ok = (items) => ({ ok: true, json: async () => ({ items }) });

test('평균에서 결측·음수를 제외하고 실제 0은 포함한다', () => {
  const app = frontend();
  assert.equal(app.run(`calculateAveragePm10([
    {pm10Value: '20'}, {pm10Value: '40'}, {pm10Value: null},
    {pm10Value: ''}, {pm10Value: ' '}, {pm10Value: '-'}, {},
    {pm10Value: -10}, {pm10Value: false}, {pm10Value: 0}
  ])`), '20 μg/m³');
  assert.equal(app.run('calculateAveragePm10([{pm10Value: null}])'), '측정 안 됨');
});

test('늦게 도착한 이전 지역 응답이 최신 선택을 덮지 않는다', async () => {
  let resolveOld;
  const app = frontend((url) => new URL(url).searchParams.get('sido') === '서울'
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.resolve(ok([{ stationName: '부산 측정소', pm10Value: '30' }])));
  const old = app.run("loadRegionData('서울')");
  await app.run("loadRegionData('부산')");
  resolveOld(ok([{ stationName: '서울 측정소', pm10Value: '90' }]));
  await old;
  assert.equal(app.elements.get('regionTitle').textContent, '부산 평균 미세먼지');
  assert.equal(app.elements.get('averageValue').textContent, '30 μg/m³');
  assert.equal(app.elements.get('stationList').attributes['aria-busy'], 'false');
});

test('전국 조회의 일부 실패와 전체 실패를 구분한다', async () => {
  const app = frontend(async (url) => {
    if (new URL(url).searchParams.get('sido') === '서울') throw new Error('offline');
    return ok([{ stationName: '측정소', pm10Value: '10' }]);
  });
  await app.run("loadRegionData('전국')");
  assert.match(app.elements.get('statusMessage').textContent, /일부 지역\(서울\)/);
  const failed = frontend(async () => { throw new Error('offline'); });
  await failed.run("loadRegionData('전국')");
  assert.match(failed.elements.get('statusMessage').textContent, /전국 데이터를 불러오지 못했습니다/);
});

test('외부 응답의 HTML을 텍스트로 출력한다', async () => {
  const app = frontend(async () => ok([{
    stationName: '<img src=x onerror=alert(1)>', pm10Value: '<script>', dataTime: '<svg>',
  }]));
  await app.run("loadRegionData('서울')");
  const html = app.elements.get('stationList').innerHTML;
  assert.doesNotMatch(html, /<img|<script|<svg/);
  assert.match(html, /&lt;img/);
});

function response() {
  return {
    headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}
function upstream(items, totalCount = items.length) {
  return { ok: true, text: async () => JSON.stringify({ response: {
    header: { resultCode: '00' }, body: { items, totalCount },
  } }) };
}

test('API 입력, 인증키, 페이지, 인코딩 및 오류 처리', async (t) => {
  const previousKey = process.env.AIRKOREA_KEY;
  t.after(() => {
    if (previousKey === undefined) delete process.env.AIRKOREA_KEY;
    else process.env.AIRKOREA_KEY = previousKey;
  });
  const run = async (query = {}, method = 'GET') => {
    const res = response();
    await handler({ query, method }, res);
    return res;
  };
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected fetch'); });
  assert.equal((await run({}, 'POST')).statusCode, 405);
  assert.equal((await run({ sido: ['서울', '부산'] })).statusCode, 400);
  assert.equal((await run({ sido: '없는 지역' })).statusCode, 400);
  delete process.env.AIRKOREA_KEY;
  assert.equal((await run()).statusCode, 500);
  process.env.AIRKOREA_KEY = 'test%2Bkey%2F%3D';
  const calls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    const page = Number(parsed.searchParams.get('pageNo'));
    return upstream(Array.from({ length: page === 1 ? 100 : 1 }, (_, index) => ({ stationName: `${page}-${index}` })), 101);
  };
  const result = await run({ sido: '경기' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.items.length, 101);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get('serviceKey'), 'test+key/=');
  assert.equal(calls[0].searchParams.get('sidoName'), '경기');
  globalThis.fetch = async () => ({ ok: true, text: async () => '<error>invalid key</error>' });
  assert.equal((await run()).statusCode, 502);
  globalThis.fetch = async () => upstream(undefined, 3);
  assert.equal((await run()).statusCode, 502);
  globalThis.fetch = async () => ({ ok: true, text: async () => '{}' });
  assert.equal((await run()).statusCode, 502);
  globalThis.fetch = async () => upstream([]);
  assert.deepEqual((await run()).body.items, []);
});
