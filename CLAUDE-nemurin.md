# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code(claude.ai/code)에게 제공되는 안내 문서입니다.

## 개발 명령어

```bash
npm install
npm run dev           # Electron 앱 개발 모드 실행
npm run dev:web       # 웹 전용 버전 실행 (Electron 없음)
npm run typecheck     # TypeScript 타입 검사 (node 및 web 설정 모두)
npm run lint:fix      # ESLint 자동 수정
npm run format        # Prettier 포맷팅
npm run build:web     # 웹 SPA 빌드
npm run build:win     # Windows Electron 패키지 빌드
npm run build:mac     # macOS Electron 패키지 빌드
npm run build:linux   # Linux Electron 패키지 빌드
npm run extract-translations  # i18n 문자열 키 동기화
```

`typecheck`는 두 개의 설정 파일을 별도로 실행한다: `tsconfig.node.json` (메인 프로세스)과 `tsconfig.web.json` (렌더러). `.eslintrc.js`에서 대부분의 ESLint 규칙이 비활성화되어 있으므로, 요청 없이는 PR에 린팅 관련 내용을 추가하지 않는다.

## 아키텍처 개요

Live2D가 포함된 AI VTuber용 Electron + React 앱이다. 백엔드는 WebSocket으로 연결되는 별도 서버이며, 이 프론트엔드는 UI와 오디오만 담당한다.

### 프로세스 구조

**메인 프로세스** (`src/main/`): 창 관리, IPC 핸들러, 시스템 트레이, 화면 캡처.

**Preload** (`src/preload/index.ts`): IPC를 위해 렌더러에 `window.api`를 노출한다. 모든 IPC 채널 이름과 타입은 `preload/index.d.ts`에 정의되어 있다.

**렌더러** (`src/renderer/src/`): React SPA. 웹 빌드(`npm run dev:web`)는 Electron 없이 실행되므로, 이 모드에서는 `window.api`가 undefined이다. 코드에서는 반드시 `ModeContext`의 `isElectron`으로 가드해야 한다.

### 상태 관리

**React Context만 사용** — `zustand`가 의존성에 등록되어 있지만 실제로는 어디에도 사용되지 않는다. `App.tsx`에서 14개의 Context Provider가 외부→내부 순으로 앱을 감싼다:

| Context | 역할 |
|---|---|
| `CameraProvider` | 배경 카메라 스트림 |
| `ScreenCaptureProvider` | 화면 공유용 데스크톱 캡처 |
| `CharacterConfigProvider` | 캐릭터 프리셋 목록 및 선택된 설정 |
| `ChatHistoryProvider` | 채팅 메시지 및 대화 기록 목록 |
| `AiStateProvider` | AI 상태 머신 (아래 참조) |
| `ProactiveSpeakProvider` | 능동적 말걸기 기능 |
| `Live2DConfigProvider` | Live2D 모델 설정 및 로딩 상태 |
| `SubtitleProvider` | AI 자막 텍스트 |
| `VADProvider` | 음성 감지(VAD) 설정 및 마이크 상태 |
| `BgUrlProvider` | 배경 이미지 및 카메라 배경 전환 |
| `GroupProvider` | 다중 사용자 그룹 멤버 및 소유권 |
| `BrowserProvider` | 내장 브라우저 DevTools 뷰 데이터 |
| `WebSocketHandler` | WebSocket 메시지 중앙 라우터 |
| `ModeProvider` | Window/Pet 모드 구분, isElectron 플래그 |

**설정 저장**: 모든 설정은 커스텀 `useLocalStorage` 훅(`hooks/use-local-storage.ts`)을 통해 `localStorage`에 저장된다. `electron-store`는 사용하지 않는다. 스토리지 키 목록: `wsUrl`, `baseUrl`, `modelInfo`, `micOn`, `autoStopMic`, `vadSettings`, `autoStartMicOn`, `autoStartMicOnConvEnd`, `i18nextLng`, `appImageCompressionQuality`, `appImageMaxWidth`, `configFiles`.

### AI 상태 머신

`AiStateEnum`의 상태 전환 (`ai-state-context.tsx`):

```
IDLE → THINKING_SPEAKING  (서버가 응답 시작)
THINKING_SPEAKING → INTERRUPTED  (사용자가 중단)
IDLE/THINKING_SPEAKING → LOADING  (캐릭터 전환)
IDLE → LISTENING  (VAD가 음성 감지)
IDLE → WAITING  (사용자 타이핑 중, 2초 후 자동으로 IDLE 복귀)
```

### WebSocket 레이어

`WebSocketService` (`services/websocket-service.tsx`)는 RxJS `Subject`를 사용하는 싱글톤이다. 컴포넌트는 `onMessage()`와 `onStateChange()`로 구독한다.

`WebSocketHandler` (`services/websocket-handler.tsx`)는 모든 Context를 감싸며, switch문으로 모든 수신 메시지 타입을 처리한다. 연결 시 자동으로 전송하는 메시지: `fetch-backgrounds`, `fetch-configs`, `fetch-history-list`, `create-new-history`.

**주요 수신 메시지 타입:**

| 타입 | 처리 내용 |
|---|---|
| `audio` | 오디오 재생 큐 추가 + volume 배열로 Live2D 립싱크 구동 |
| `set-model-and-conf` | 새 Live2D 모델 로드 |
| `full-text` | 자막 텍스트 업데이트 |
| `config-files` | 캐릭터 전환 목록 갱신 |
| `control` | 명령어: `start-mic`, `stop-mic`, `conversation-chain-end` 등 |
| `history-data` | 채팅 기록 채움 |
| `tool_call_status` | 도구 실행 상태, `browser_view` 데이터 포함 가능 |
| `group-update` | 그룹 멤버 목록 업데이트 |

### 오디오 파이프라인

1. VAD(`@ricky0123/vad-web`, ONNX 기반)가 브라우저에서 음성 감지
2. `useSendAudio` 훅이 WebSocket으로 오디오 전송
3. 서버가 `audio` 메시지로 응답: `{ audio: base64, volumes: number[], sliceLength: ms, display_text, actions.expressions }`
4. `audioTaskQueue`(`utils/task-queue.ts`)가 순차 재생 보장
5. volume 배열이 프레임 단위로 Live2D 립싱크 구동

AI가 말하는 동안 마이크 자동 정지, 대화 종료 시 마이크 자동 시작 — 둘 다 VAD 설정에서 조정 가능.

### Window/Pet 모드

**Window 모드**: 사이드바, 푸터, 캔버스가 있는 전체 UI.

**Pet 모드**: 투명 플로팅 오버레이, 항상 최상위, 데스크톱 클릭 통과. IPC `update-component-hover` 메시지로 메인 프로세스에 어떤 UI 요소에 호버 중인지 알려 마우스 이벤트를 선택적으로 활성화한다.

모드 전환 흐름: 렌더러가 `window.api.setMode()` 호출 → 메인이 `pre-mode-changed` 전송 → 렌더러 응답 → 메인 500ms 대기 → 창 속성 적용 → `mode-changed` 전송 → 렌더러가 `mode-change-rendered` 전송 → 메인 페이드인.

### Live2D 통합

Cubism WebSDK는 `src/renderer/WebSDK/`에 번들되어 있다 (npm 패키지 아님). 설정에서 사용하는 주요 `ModelInfo` 필드:

```typescript
{
  url: string;           // 백엔드에서 제공하는 모델 파일 URL
  kScale: number;        // 스케일 (내부적으로 2배 처리됨)
  initialXshift: number;
  initialYshift: number;
  emotionMap: { [emotion: string]: number | string };
  tapMotions?: { [area: string]: { [motion: string]: number } };
  idleMotionGroupName?: string;
  pointerInteractive?: boolean;
  scrollToResize?: boolean;
}
```

### i18n

`i18next` + `react-i18next`. 지원 언어: `en` (기본값), `zh`. 번역 파일 위치: `src/renderer/src/locales/{en,zh}/translation.json`. 감지 순서: localStorage → 브라우저 navigator. `t('new.key')` 호출 추가 후 반드시 `npm run extract-translations`를 실행해 JSON 파일을 동기화한다.
