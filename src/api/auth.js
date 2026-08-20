
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
    localStorage.removeItem("loginType");
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

export const isGuestSession = () => {
    return localStorage.getItem("loginType") === "guest";
};

export const authHeaders = () => {
    const token = getAccessToken();

    if (!token) {
        return {};
    }

    return {
        Authorization: `Bearer ${token}`,
    };
};
