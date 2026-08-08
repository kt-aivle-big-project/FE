import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthCircuitBackground from "../../pages/login/AuthCircuitBackground";
import "../../styles/login/AuthCommon.css";
import "../../styles/login/Login.css";
import { EmailIcon, LockIcon, PasswordToggleIcon } from "../../components/common/icon";
import { API_URL } from "../../api/config";

function Login() {
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoginLoading, setIsLoginLoading] = useState(false);
    const [isGuestLoading, setIsGuestLoading] = useState(false);

    const handleLogin = async (event) => {
        event.preventDefault();

        if (!email.trim() || !password.trim()) {
            alert("이메일과 비밀번호를 입력해주세요.");
            return;
        }

        setIsLoginLoading(true);

        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email: email.trim(),
                    password,
                }),
            });

            const data = await response
                .json()
                .catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    data.message || "이메일 또는 비밀번호가 올바르지 않습니다.",
                );
            }

            const accessToken = data.accessToken || data.access_token || data.token;

            if (accessToken) {
                localStorage.setItem("accessToken", accessToken);
            }

            if (data.name) {
                localStorage.setItem("name", data.name);
            }

            if (data.email) {
                localStorage.setItem("email", data.email);
            }

            navigate("/simulation", { replace: true });
        } catch (error) {
            console.error("로그인 실패:", error);
            alert(
                error instanceof Error
                    ? error.message
                    : "로그인 중 오류가 발생했습니다.",
            );
        } finally {
            setIsLoginLoading(false);
        }
    };

    const handleGuestLogin = async () => {
        try {
            const response = await fetch(
                `${API_URL}/auth/guest`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    credentials: "include",
                });

            const data = await response
                .json()
                .catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || "게스트 로그인에 실패했습니다.");
            }

            const accessToken = data.accessToken || data.access_token || data.token;

            if (accessToken) {
                localStorage.setItem("accessToken", accessToken);
            }

            localStorage.setItem("loginType", "guest");
            navigate("/simulation", { replace: true, });

        } catch (error) {
            console.error("게스트 로그인 실패:", error);
            alert(error instanceof Error ? error.message : "게스트 로그인 중 오류가 발생했습니다.");
        }
    };

    const isLoading = isLoginLoading || isGuestLoading;

    return (
        <div className="auth-page">
            <AuthCircuitBackground />

            <main className="auth-card">
                <section className="auth-content">
                    <div className="login-brand">
                        <h1 className="login-brand-name">LARO</h1>

                        <p className="login-brand-description">
                            <strong>L</strong>LM{" "}
                            <strong>A</strong>utonomous{" "}
                            <strong>R</strong>obot{" "}
                            <strong>O</strong>rchestration
                        </p>
                    </div>

                    <form
                        className="auth-form"
                        onSubmit={handleLogin}
                    >
                        <div className="auth-field">
                            <label htmlFor="email">
                                이메일
                            </label>

                            <div className="auth-input-wrapper">
                                <span className="auth-input-icon">
                                    <EmailIcon />
                                </span>

                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    placeholder="이메일을 입력하세요"
                                    onChange={(event) => setEmail(event.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="auth-field">
                            <div className="login-label-row">
                                <label htmlFor="password">
                                    비밀번호
                                </label>

                                <button
                                    type="button"
                                    className="login-find-password"
                                    onClick={() => navigate("/password")}
                                    disabled={isLoading}
                                >
                                    비밀번호 찾기
                                </button>
                            </div>

                            <div className="auth-input-wrapper">
                                <span className="auth-input-icon">
                                    <LockIcon />
                                </span>

                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className="auth-password-input"
                                    value={password}
                                    placeholder="비밀번호를 입력하세요"
                                    onChange={(event) => setPassword(event.target.value)}
                                    autoComplete="new-password"
                                    disabled={isLoading}
                                />

                                <button
                                    type="button"
                                    className="auth-password-toggle"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    aria-label={
                                        showPassword
                                            ? "비밀번호 숨기기"
                                            : "비밀번호 보기"
                                    }
                                    aria-pressed={showPassword}
                                    disabled={isLoading}
                                >
                                    <PasswordToggleIcon visible={showPassword} />
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="auth-button auth-button-primary"
                            disabled={isLoading}
                        >
                            {isLoginLoading ? "로그인 중..." : "로그인"}
                        </button>
                    </form>

                    <div
                        className="login-divider"
                        role="separator"
                        aria-label="또는"
                    >
                        <span>또는</span>
                    </div>

                    <button
                        type="button"
                        className="auth-button login-guest-button"
                        onClick={handleGuestLogin}
                        disabled={isLoading}
                    >
                        {isGuestLoading
                            ? "게스트 로그인 중..."
                            : "게스트로 둘러보기"}
                    </button>

                    <p className="login-select-policy">
                        계속 진행하면 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
                    </p>
                </section>

                <footer className="auth-footer">
                    <span>아직 계정이 없으신가요?</span>

                    <button
                        type="button"
                        onClick={() => navigate("/signup")}
                        disabled={isLoading}
                    >
                        회원가입
                    </button>
                </footer>

            </main>
        </div>
    );
}

export default Login;
