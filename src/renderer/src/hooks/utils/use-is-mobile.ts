import { useEffect, useState } from 'react';

/**
 * 모바일(세로 폰) 화면 판정 훅
 *
 * 프론트는 원래 데스크탑 2단 레이아웃만 상정하고 만들어졌다. 폰 브라우저로
 * 들어오면 사이드바 440px + 세션 레일 72px 이 가로를 다 먹고 푸터 버튼줄이
 * 잘려 나간다. 그래서 폭이 좁으면 전용 셸(mobile-shell)로 갈아탄다.
 *
 * - 기준은 폭 768px 이하. Chakra 의 md 브레이크포인트와 같은 선이라
 *   기존 { base, md } 반응형 스타일과 어긋나지 않는다.
 * - Electron 데스크탑 앱은 창을 줄여도 모바일로 바뀌면 혼란스럽고 pet 모드와
 *   섞이므로 아예 제외한다.
 */
const MOBILE_QUERY = '(max-width: 768px)';

const isElectron = typeof window !== 'undefined' && window.api !== undefined;

function matchMobile(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (isElectron) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(matchMobile);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia || isElectron) {
      return undefined;
    }
    const mql = window.matchMedia(MOBILE_QUERY);
    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // 사파리 구버전 대응 — addEventListener 가 없으면 addListener 로 폴백한다.
    if (mql.addEventListener) {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  return isMobile;
}

export default useIsMobile;
