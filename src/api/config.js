// 백엔드 서버 주소
export const API_BASE_URL = "http://localhost:8080";

// REST API prefix
export const API_URL = `${API_BASE_URL}/api`;

// WebSocket(SockJS) 연결 엔드포인트
export const WS_URL = `${API_BASE_URL}/ws`;

// 구독 토픽
export const TOPICS = {
    // 시뮬레이션 실행 상태 변경
    SIMULATION_RUNS: "/topic/simulation-runs",

    // 특정 실행의 로봇 실시간 상태
    runRobots: (simulationRunId) =>
        `/topic/simulation-runs/${simulationRunId}/robots`,

    // 작업 변경
    TASKS: "/topic/tasks",

    // 이벤트 발생/해결
    EVENTS: "/topic/events",

    // AI 미션 시뮬레이션 기록 변경
    SIMULATIONS: "/topic/simulations",
};
