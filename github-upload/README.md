# 지역별 대기질 정보

시도별 측정소의 PM10·PM2.5와 PM10 평균을 표시합니다. 전국 조회 중 실패한 지역은 화면에 안내하며, 평균은 조회에 성공한 측정소 중 유효한 PM10 값으로 계산합니다.

## 로컬 실행

Node.js 22 이상이 필요합니다. 추가 패키지 설치는 필요하지 않습니다.

1. 터미널에서 이 README와 `package.json`이 있는 폴더로 이동합니다.
2. `.env.example`을 `.env.local`로 복사하고 `AIRKOREA_KEY`에 공공데이터포털의 대기오염정보 서비스 인증키를 입력합니다. 기존 `.env.local`이 있다면 그대로 사용합니다.
3. `npm start`를 실행합니다.
4. 브라우저에서 <http://localhost:3000>을 엽니다.

HTML 파일을 직접 열거나 정적 파일 전용 서버로 실행하면 `/api/dust`가 동작하지 않습니다. 포트가 사용 중이면 PowerShell에서 `$env:PORT = '3001'`을 설정하고 실행하세요.

## 검증

`npm test`로 평균 계산, 지역 변경, 전국 조회 실패 처리 및 API 응답 처리를 검증합니다. 테스트는 실제 API 호출 없이 실행됩니다.

## Vercel 배포

`github-upload` 폴더를 통째로 GitHub 저장소에 올렸다면 Vercel 프로젝트의 Root Directory를 `github-upload`로 설정합니다. 폴더 안의 파일들을 저장소 최상위에 올렸다면 Root Directory는 기본값으로 둡니다.

Vercel 환경변수 `AIRKOREA_KEY`에 인증키를 등록합니다. 프런트엔드는 정적 파일이며 `api/dust.js`는 서버리스 함수입니다. `.env.local`은 저장소에 올리지 마세요.

`vercel.json`도 반드시 함께 올립니다. 이 설정은 HTML·CSS·JavaScript를 정적 파일로 배포하고 `/api/dust`만 서버리스 함수로 실행합니다. `server.js`는 로컬 실행용이며 Vercel 배포 대상에서 제외합니다. 설정을 추가한 후 다시 배포하세요.

`api/`와 `test/` 하위 폴더 구조를 유지하세요. 화면의 CSS·JavaScript는 상대 경로로, 로컬 서버와 테스트의 파일 참조는 각 소스 파일 위치를 기준으로 연결되어 있으므로 이 폴더만 독립적으로 사용할 수 있습니다.

API 출처: [한국환경공단_에어코리아_대기오염정보](https://www.data.go.kr/data/15073861/openapi.do). 실제 조회에는 해당 서비스의 활용 승인과 유효한 인증키가 필요합니다.
