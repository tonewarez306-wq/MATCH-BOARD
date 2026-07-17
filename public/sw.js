// 설치 이벤트를 위한 아주 기본적인 서비스 워커
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 브라우저 PWA 필수 조건(fetch 이벤트 핸들러) 통과용
self.addEventListener('fetch', (event) => {
  // 아무 작업도 하지 않고 바로 요청을 넘깁니다.
  return;
});