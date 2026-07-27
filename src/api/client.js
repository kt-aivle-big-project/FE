import { API_URL } from "./config";
import { authHeaders } from "./auth";

/**
 * 공통 REST 호출 함수.
 * - 인증 토큰을 자동으로 헤더에 싣는다.
 * - 백엔드 에러 응답({ code, message })을 파싱해 Error로 던진다.
 */
const request = async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
            ...(options.headers ?? {}),
        },
    });

    // 204 No Content
    if (response.status === 204) {
        return null;
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const message =
            data?.message ??
            `요청에 실패했습니다. (HTTP ${response.status})`;

        const error = new Error(message);
        error.status = response.status;
        error.code = data?.code;
        throw error;
    }

    return data;
};

export const api = {
    get: (path) => request(path, { method: "GET" }),

    post: (path, body) =>
        request(path, {
            method: "POST",
            body: body === undefined ? undefined : JSON.stringify(body),
        }),

    patch: (path, body) =>
        request(path, {
            method: "PATCH",
            body: body === undefined ? undefined : JSON.stringify(body),
        }),

    delete: (path) => request(path, { method: "DELETE" }),
};

/* =========================================================
   시뮬레이션 관련 API
========================================================= */

export const simulationRunApi = {
    // 시뮬레이션 실행 생성
    create: (payload) => api.post("/simulation-runs", payload),

    start: (runId) => api.post(`/simulation-runs/${runId}/start`),
    pause: (runId) => api.post(`/simulation-runs/${runId}/pause`),
    resume: (runId) => api.post(`/simulation-runs/${runId}/resume`),
    reset: (runId) => api.post(`/simulation-runs/${runId}/reset`),
    stop: (runId) => api.post(`/simulation-runs/${runId}/stop`),

    getStatus: (runId) => api.get(`/simulation-runs/${runId}/status`),
    getTasks: (runId) => api.get(`/simulation-runs/${runId}/tasks`),
    getRobotStates: (runId) =>
        api.get(`/simulation-runs/${runId}/robots/states`),
};

export const scenarioApi = {
    getAll: (warehouseId) =>
        api.get(
            warehouseId
                ? `/scenarios?warehouseId=${warehouseId}`
                : "/scenarios"
        ),
    get: (scenarioId) => api.get(`/scenarios/${scenarioId}`),
    update: (scenarioId, payload) =>
        api.patch(`/scenarios/${scenarioId}`, payload),
};

export const productApi = {
    getAll: () => api.get("/products"),
};

export const optimizationApi = {
    // 재계획 요청
    reoptimize: (runId, payload) =>
        api.post(
            `/optimizations/simulation-runs/${runId}/reoptimize`,
            payload
        ),
};
