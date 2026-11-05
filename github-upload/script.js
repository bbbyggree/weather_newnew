const REGION_LIST = [
  '전국',
  '서울',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '세종',
  '경기',
  '강원',
  '충북',
  '충남',
  '전북',
  '전남',
  '경북',
  '경남',
  '제주',
];

const regionSelect = document.getElementById('regionSelect');
const averageValue = document.getElementById('averageValue');
const regionTitle = document.getElementById('regionTitle');
const stationList = document.getElementById('stationList');
const stationHeading = document.getElementById('stationHeading');
const statusMessage = document.getElementById('statusMessage');
let activeRequest = 0;
let activeController;

// 시도 선택이 바뀌면 해당 지역의 데이터를 다시 불러오는 이벤트를 연결한다.
regionSelect.addEventListener('change', () => {
  loadRegionData(regionSelect.value);
});

// 지역명을 기준으로 서버리스 API를 호출하는 함수다.
async function fetchAirQualityBySido(sidoName, signal) {
  const url = new URL('/api/dust', window.location.origin);
  url.searchParams.set('sido', sidoName);

  const response = await fetch(url.toString(), { signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '데이터 요청에 실패했습니다.');
  }

  const data = await response.json();
  const items = data?.items;

  if (!Array.isArray(items)) {
    throw new Error('서버 응답 형식이 올바르지 않습니다.');
  }

  return Array.isArray(items) ? items : [];
}

// 전국 선택 시 모든 시도를 순회해서 측정소 정보를 모아서 보여준다.
async function loadAllRegions(signal) {
  const provinces = REGION_LIST.filter((item) => item !== '전국');
  statusMessage.textContent = '전국 데이터를 불러오는 중입니다...';

  const allResults = await Promise.allSettled(
    provinces.map((region) => fetchAirQualityBySido(region, signal))
  );
  const failedRegions = provinces.filter((_, index) => allResults[index].status === 'rejected');
  if (failedRegions.length === provinces.length) {
    throw new Error('전국 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  return {
    items: allResults.flatMap((result) => result.status === 'fulfilled' ? result.value : []),
    failedRegions,
  };
}

// 선택한 지역의 데이터를 불러오고 화면을 갱신한다.
async function loadRegionData(selectedRegion) {
  const requestId = ++activeRequest;
  activeController?.abort();
  activeController = new AbortController();
  const { signal } = activeController;
  stationList.replaceChildren();
  stationList.setAttribute('aria-busy', 'true');
  regionTitle.textContent = `${selectedRegion} 평균 미세먼지`;
  stationHeading.textContent = `${selectedRegion} 측정소 목록`;
  averageValue.textContent = '-';
  statusMessage.textContent = '데이터를 불러오는 중입니다...';

  try {
    const { items, failedRegions } = selectedRegion === '전국'
      ? await loadAllRegions(signal)
      : { items: await fetchAirQualityBySido(selectedRegion, signal), failedRegions: [] };
    if (requestId !== activeRequest) return;
    renderStationCards(items, selectedRegion);
    if (failedRegions.length) {
      statusMessage.textContent += ` 일부 지역(${failedRegions.join(', ')}) 조회에 실패했습니다. 평균은 조회된 측정소 기준입니다.`;
    }
  } catch (error) {
    if (requestId !== activeRequest || error.name === 'AbortError') return;
    console.error('API 호출 오류:', error);
    statusMessage.textContent = error.message || '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
    stationList.innerHTML = '';
    averageValue.textContent = '측정 안 됨';
  } finally {
    if (requestId === activeRequest) stationList.setAttribute('aria-busy', 'false');
  }
}

// 카드에 표시할 값이 없거나 '-'일 경우를 처리한다.
function formatDisplayValue(value) {
  if (value === undefined || value === null) {
    return '측정 안 됨';
  }

  const trimmed = String(value).trim();
  if (trimmed === '' || trimmed === '-') {
    return '측정 안 됨';
  }

  return trimmed;
}

// 평균 미세먼지 계산에서 '-' 또는 빈 값은 제외한다.
function calculateAveragePm10(items) {
  const values = items
    .map((item) => item?.pm10Value)
    .filter((value) => (typeof value === 'string' && value.trim() !== '') || typeof value === 'number')
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (values.length === 0) {
    return '측정 안 됨';
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${Math.round(average)} μg/m³`;
}

// 등급 값에 따라 카드 테마를 정한다.
function getGradeClass(pm10Grade) {
  const grade = Number(pm10Grade);

  if (grade === 1) {
    return 'grade-1';
  }
  if (grade === 2) {
    return 'grade-2';
  }
  if (grade === 3) {
    return 'grade-3';
  }
  if (grade === 4) {
    return 'grade-4';
  }

  return 'grade-empty';
}

// 외부 응답이 HTML로 실행되지 않도록 텍스트를 이스케이프한다.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

// 측정소 카드들을 화면에 출력한다.
function renderStationCards(items, regionName) {
  const safeItems = Array.isArray(items) ? items : [];
  stationHeading.textContent = `${regionName} 측정소 목록`;
  regionTitle.textContent = `${regionName} 평균 미세먼지`;
  averageValue.textContent = calculateAveragePm10(safeItems);

  if (safeItems.length === 0) {
    statusMessage.textContent = '표시할 데이터가 없습니다.';
    stationList.innerHTML = '';
    return;
  }

  statusMessage.textContent = `${safeItems.length}개의 측정소 정보를 확인했습니다.`;
  stationList.innerHTML = safeItems
    .map((item) => {
      const stationName = escapeHtml(item?.stationName || '알 수 없는 측정소');
      const pm10 = escapeHtml(formatDisplayValue(item?.pm10Value));
      const pm25 = escapeHtml(formatDisplayValue(item?.pm25Value));
      const dataTime = escapeHtml(formatDisplayValue(item?.dataTime));
      const gradeClass = getGradeClass(item?.pm10Grade);

      return `
        <article class="station-card ${gradeClass}">
          <h3>${stationName}</h3>
          <div class="metric">
            <span>미세먼지(pm10)</span>
            <strong>${pm10}</strong>
          </div>
          <div class="metric">
            <span>초미세먼지(pm25)</span>
            <strong>${pm25}</strong>
          </div>
          <div class="station-time">측정 시각: ${dataTime}</div>
        </article>
      `;
    })
    .join('');
}

// 페이지 로드 시 기본값으로 서울 데이터를 보여준다.
window.addEventListener('DOMContentLoaded', () => {
  regionSelect.value = '서울';
  loadRegionData('서울');
});
