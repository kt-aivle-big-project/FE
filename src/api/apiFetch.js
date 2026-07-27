const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

let refreshPromise = null;

const clearAuth = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("userId");
    localStorage.removeItem("name");
    localStorage.removeItem("email");
};

const redirectToLogin = () => {
    clearAuth();

    if (window.location.pathname !== "/login") {
        window.location.replace("/login");
    }
};

const refreshAccessToken = async () => {
    const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
    });

    if (!response.ok) {
        throw new Error("Access Token 재발급에 실패했습니다.");
    }

    const data = await response.json();

    if (!data.accessToken) {
        throw new Error("재발급 응답에 Access Token이 없습니다.");
    }

    localStorage.setItem("accessToken", data.accessToken);
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

const requestWithToken = (input, options, accessToken) => {
    const headers = new Headers(options.headers);

    if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }

    return fetch(input, {
        ...options,
        credentials: "include",
        headers,
    });
};

export const apiFetch = async (input, options = {}) => {
    const accessToken = localStorage.getItem("accessToken");
    let response = await requestWithToken(input, options, accessToken);

    if (response.status !== 401) {
        return response;
    }

    try {
        const newAccessToken = await getRefreshedAccessToken();
        response = await requestWithToken(input, options, newAccessToken);
        return response;
    } catch (error) {
        redirectToLogin();
        throw error;
    }
};

export const logout = async () => {
    try {
        await fetch(`${API_URL}/auth/logout`, {
            method: "POST",
            credentials: "include",
        });
    } finally {
        redirectToLogin();
    }
};
