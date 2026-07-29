// 로그인 시 저장한 인증 정보를 다루는 유틸

const TOKEN_KEY = "accessToken";

export const getAccessToken = () => {
    return localStorage.getItem(TOKEN_KEY);
};

export const setAccessToken = (token) => {
    if (!token) {
        return;
    }
    localStorage.setItem(TOKEN_KEY, token);
};

export const clearAuth = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("userId");
    localStorage.removeItem("name");
    localStorage.removeItem("email");
};

export const redirectToLogin = () => {
    clearAuth();

    if (window.location.pathname !== "/login") {
        window.location.replace("/login");
    }
};

export const isLoggedIn = () => {
    return Boolean(getAccessToken());
};

// 인증 헤더 (토큰이 없으면 빈 객체)
export const authHeaders = () => {
    const token = getAccessToken();

    if (!token) {
        return {};
    }

    return {
        Authorization: `Bearer ${token}`,
    };
};
