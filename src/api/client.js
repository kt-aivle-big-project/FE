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
    ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
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

const requestBlob = async (path) => {
    let response = await fetch(`${API_URL}${path}`, {
        method: "GET",
        credentials: "include",
        headers: authHeaders(),
    });

    if (response.status === 401) {
        await getRefreshedAccessToken();
        response = await fetch(`${API_URL}${path}`, {
            method: "GET",
            credentials: "include",
            headers: authHeaders(),
        });
    }

    if (!response.ok) {
        const data = await parseResponseData(response);
        const error = new Error(data?.message ?? `Request failed. (HTTP ${response.status})`);
        error.status = response.status;
        error.code = data?.code;
        throw error;
    }

    return response.blob();
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

    put: (path, body) =>
        request(path, {
            method: "PUT",
            body: body === undefined ? undefined : JSON.stringify(body),
        }),

    delete: (path, body) =>
        request(path, {
            method: "DELETE",
            body: body === undefined ? undefined : JSON.stringify(body),
        }),

    postForm: (path, formData) =>
        request(path, {
            method: "POST",
            body: formData,
        }),
};

export const userAccountApi = {
    getProfile: () => api.get("/users/me"),
    updateProfile: (name) => api.patch("/users/me", { name }),
    changePassword: (currentPassword, newPassword) =>
        api.patch("/users/me/password", { currentPassword, newPassword }),
    withdraw: (password) => api.delete("/users/me", { password }),
};

export const boardPostApi = {
    getAll: () => api.get("/board-posts"),
    get: (postId) => api.get(`/board-posts/${postId}`),
    create: (payload) => api.post("/board-posts", payload),
    update: (postId, payload) => api.patch(`/board-posts/${postId}`, payload),
    remove: (postId) => api.delete(`/board-posts/${postId}`),
    uploadAttachment: (postId, file) => {
        const formData = new FormData();
        formData.append("file", file);
        return api.postForm(`/board-posts/${postId}/attachment`, formData);
    },
    downloadAttachment: (postId) =>
        requestBlob(`/board-posts/${postId}/attachment`),
    deleteAttachment: (postId) =>
        api.delete(`/board-posts/${postId}/attachment`),
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

    get: (scenarioId) =>
        api.get(`/scenarios/${scenarioId}`),

    create: (payload) =>
        api.post("/scenarios", payload),

    update: (scenarioId, payload) =>
        api.patch(`/scenarios/${scenarioId}`, payload),

    delete: (scenarioId) =>
        api.delete(`/scenarios/${scenarioId}`),
};

export const productApi = {
    getAll: () => api.get("/products"),
};

export const warehouseItemApi = {
    getAll: (warehouseId) =>
        api.get(
            warehouseId
                ? `/warehouse-items?warehouseId=${warehouseId}`
                : "/warehouse-items"
        ),
};

export const optimizationApi = {
    reoptimize: (runId, payload) =>
        api.post(
            `/optimizations/simulation-runs/${runId}/reoptimize`,
            payload
        ),

    getReoptimizationHistories: (runId) =>
        api.get(
            `/optimizations/simulation-runs/${runId}/reoptimization-histories`
        ),
};

export const laroPlanApi = {
    preflight: (runId) =>
        api.get(`/laro/simulation-runs/${runId}/plan/preflight`),
    create: (runId, payload) =>
        api.post(`/laro/simulation-runs/${runId}/plan`, payload),
    submitUserCommand: (runId, payload) =>
        api.post(`/laro/simulation-runs/${runId}/user-command`, payload),
    respondToHumanReview: (runId, interactionId, payload) =>
        api.post(
            `/laro/simulation-runs/${runId}/human-reviews/${interactionId}/respond`,
            payload
        ),
    retryHumanReview: (runId, interactionId, executionVersion) =>
        api.post(
            `/laro/simulation-runs/${runId}/human-reviews/${interactionId}/retry`,
            { executionVersion }
        ),
};

export const fulfillmentCommandApi = {
    generate: (runId, payload) =>
        api.post(`/simulation-runs/${runId}/fulfillment-commands/generate`, payload),
    getCycleStatus: (runId) =>
        api.get(`/simulation-runs/${runId}/command-cycle`),
    configureCycle: (runId, configuration = {}) =>
        api.put(`/simulation-runs/${runId}/command-cycle/configuration`, {
            mode: "AUTO",
            commandExpressionMode: "AUTO",
            policyProfile: "AUTO",
            mixStructuredWithPolicy: Boolean(configuration.policyEnabled),
            mixNaturalLanguage: Boolean(configuration.naturalLanguageEnabled),
            generationIntervalSeconds: Math.round(
                Number(configuration.replanIntervalMinutes ?? 5) * 60
            ),
            averageTasksPerRobot: Number(
                configuration.averageTasksPerRobot ?? 3.5
            ),
        }),
};

export const robotApi = {
    getAll: (warehouseId) =>
        api.get(
            warehouseId
                ? `/robots?warehouseId=${warehouseId}`
                : "/robots"
        ),

    get: (robotId) =>
        api.get(`/robots/${robotId}`),

    create: (payload) =>
        api.post("/robots", payload),

    delete: (robotId) =>
        api.delete(`/robots/${robotId}`),
};

export const taskApi = {
    getAll: () => api.get("/tasks"),
    get: (taskId) => api.get(`/tasks/${taskId}`),
};

export const robotSpecApi = {
    getAll: () => api.get("/robot-specs"),
};

export const warehouseApi = {
    getAll: async () => {
        const warehouses = await api.get("/warehouses");

        if (!Array.isArray(warehouses)) {
            return warehouses;
        }

        // 공용 데모는 Neo4j 계약의 기본형 창고(id=1)만 노출한다.
        // 사용자가 새로 만든 개인 창고는 계속 목록에 표시한다.
        return warehouses.filter(
            (warehouse) => Number(warehouse.id) === 1 || !warehouse.shared,
        );
    },
    getLayout: (warehouseId) =>
        api.get(`/warehouses/${warehouseId}/layout`),

    get: (warehouseId) =>
        api.get(`/warehouses/${warehouseId}`),

    createPersonalCopy: (templateWarehouseId) =>
        api.post(`/warehouses/${templateWarehouseId}/personal-copy`),

    createGuestPersonalCopy: (templateWarehouseId) =>
        api.post(`/warehouses/${templateWarehouseId}/guest-personal-copy`),

    // 지도 JSON 과 함께 창고를 만든다.
    // 노드·간선뿐 아니라 랙·충전소·로봇까지 백엔드가 만들어준다.
    importWarehouse: (payload) =>
        api.post("/warehouses/import", payload),

    updateLayout: (warehouseId, payload) =>
        api.put(`/warehouses/${warehouseId}/layout`, payload),

    update: (warehouseId, payload) =>
        api.patch(`/warehouses/${warehouseId}`, payload),

    remove: (warehouseId) =>
        api.delete(`/warehouses/${warehouseId}`),
};

export const operationApi = {
    /**
     * 운영 관리 화면 지표를 한 번에 받아온다.
     *
     * warehouseId 를 안 넘기면 전체 창고 기준으로 집계한다.
     */
    getDashboard: ({ warehouseId, startDate, endDate } = {}) => {
        const params = new URLSearchParams();

        if (warehouseId) {
            params.set("warehouseId", warehouseId);
        }
        if (startDate) {
            params.set("startDate", startDate);
        }
        if (endDate) {
            params.set("endDate", endDate);
        }

        const query = params.toString();

        return api.get(`/operations/dashboard${query ? `?${query}` : ""}`);
    },

    /**
     * 같은 조건의 작업을 자르지 않고 전부 받아온다.
     *
     * 대시보드는 최근 10건만 담기 때문에
     * 「전체 보기」 팝업을 열 때만 부른다.
     */
    getTasks: ({ warehouseId, startDate, endDate } = {}) => {
        const params = new URLSearchParams();

        if (warehouseId) {
            params.set("warehouseId", warehouseId);
        }
        if (startDate) {
            params.set("startDate", startDate);
        }
        if (endDate) {
            params.set("endDate", endDate);
        }

        const query = params.toString();

        return api.get(`/operations/tasks${query ? `?${query}` : ""}`);
    },
};
