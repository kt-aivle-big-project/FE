import { API_URL } from "./config";
import {
    authHeaders,
    redirectToLogin,
    setAccessToken,
} from "./auth";

let refreshPromise = null;

const parseResponseData = async (response) => {
    if (response.status === 204) {
        return null;
    }

    const text = await response.text();

    if (!text) {
        return null;
    }

    return JSON.parse(text);
};

const buildHeaders = (options = {}) => ({
    "Content-Type": "application/json",
    ...authHeaders(),
    ...(options.headers ?? {}),
});

const refreshAccessToken = async () => {
    console.log("[auth] refresh request");

    const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
    });

    const data = await parseResponseData(response);

    if (!response.ok || !data?.accessToken) {
        const error = new Error(
            data?.message ?? "Access token refresh failed."
        );
        error.status = response.status;
        throw error;
    }

    setAccessToken(data.accessToken);
    console.log("[auth] refresh success");
    return data.accessToken;
};

const getRefreshedAccessToken = () => {
    if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
        });
    }

    return refreshPromise;
};

const request = async (path, options = {}) => {
    let response = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: buildHeaders(options),
    });

    if (response.status === 401) {
        try {
            console.log(`[auth] 401 received for ${path}`);
            await getRefreshedAccessToken();
            console.log(`[auth] retry request for ${path}`);
            response = await fetch(`${API_URL}${path}`, {
                ...options,
                credentials: "include",
                headers: buildHeaders(options),
            });
        } catch (error) {
            console.log("[auth] refresh failed, redirect to login");
            redirectToLogin();
            throw error;
        }
    }

    const data = await parseResponseData(response);

    if (!response.ok) {
        const message =
            data?.message ??
            `Request failed. (HTTP ${response.status})`;

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

export const simulationRunApi = {
    create: (payload) => api.post("/simulation-runs", payload),
    start: (runId) => api.post(`/simulation-runs/${runId}/start`),
    pause: (runId) => api.post(`/simulation-runs/${runId}/pause`),
    resume: (runId) => api.post(`/simulation-runs/${runId}/resume`),
    reset: (runId) => api.post(`/simulation-runs/${runId}/reset`),
    changeSpeed: (runId, simulationSpeed) =>
        api.patch(`/simulation-runs/${runId}/speed`, {
            simulationSpeed: simulationSpeed,
        }),
    stop: (runId) => api.post(`/simulation-runs/${runId}/stop`),

    // 창고에서 진행 중인 시뮬레이션 전체 중지
    stopActive: (warehouseId) =>
        api.post(`/simulation-runs/stop-active?warehouseId=${warehouseId}`),

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
    reoptimize: (runId, payload) =>
        api.post(
            `/optimizations/simulation-runs/${runId}/reoptimize`,
            payload
        ),
};

export const robotApi = {
    getAll: (warehouseId) =>
        api.get(
            warehouseId
                ? `/robots?warehouseId=${warehouseId}`
                : "/robots"
    ),
    get: (robotId) => api.get(`/robots/${robotId}`),
    create: (payload) => api.post("/robots", payload),
};

export const taskApi = {
    getAll: () => api.get("/tasks"),
    get: (taskId) => api.get(`/tasks/${taskId}`),
};

export const robotSpecApi = {
    getAll: () => api.get("/robot-specs"),
};

export const warehouseApi = {
    getAll: () => api.get("/warehouses"),
    getLayout: (warehouseId) =>
        api.get(`/warehouses/${warehouseId}/layout`),
};
