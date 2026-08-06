import { useState } from "react";
import { useNavigate } from "react-router-dom";
import laroLogo from "../../assets/laro/laro_logo.png";
import laroBackground from "../../assets/laro/laro_background.png";
import "../../styles/login/LoginCommon.css";
import "../../styles/login/Login.css";
import { EmailIcon, LockIcon, PasswordToggleIcon } from "../../components/common/icon";

const API_URL = "http://localhost:8080/api";

function Login() {
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();

        if (!email.trim() || !password.trim()) {
            alert("아이디와 비밀번호를 입력해주세요.");
            return;
        }

        // 백엔드로 전달
        const loginData = {
            email: email.trim(),
            password: password,
        };

        try {
            const response = await fetch(
                `${API_URL}/auth/login`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(loginData),
                }
            );

            if (!response.ok) {
                const errorMessage = await response.text();
                throw new Error(errorMessage || "아이디 또는 비밀번호가 올바르지 않습니다.");
            }

            // 백엔드 응답 JSON
            const data = await response.json();

            // 저장
            localStorage.setItem("accessToken", data.accessToken);
            localStorage.setItem("name", data.name);
            localStorage.setItem("email", data.email);

            console.log("로그인 사용자:", data);

            alert("로그인되었습니다.");
            navigate("/simulation");

        } catch (error) {
            console.error("로그인 실패:", error);

            alert(error.message || "로그인 중 오류가 발생했습니다.");
        }
    };

    const handleSignup = () => {
        navigate("/signup");
    };

    const handleBack = () => {
        navigate("/");
    };

    return (
        <div
            className="login-page"
            style={{ backgroundImage: `url(${laroBackground})`, }}
        >
            <main className="login-card">
                <button
                    type="button"
                    className="login-back-button"
                    onClick={handleBack}
                >
                    <span aria-hidden="true">←</span>
                    로그인 방식 선택
                </button>

                <header className="login-header">
                    <img
                        src={laroLogo}
                        alt="LARO 창고 시뮬레이션 플랫폼"
                        className="login-logo"
                    />
                </header>

                <section className="login-content">
                    <form
                        className="login-form"
                        onSubmit={handleLogin}
                    >
                        <div className="login-field">
                            <label htmlFor="email">
                                아이디
                            </label>

                            <div className="login-input-wrapper">
                                <span className="login-input-icon">
                                    <EmailIcon />
                                </span>

                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    placeholder="아이디를 입력하세요"
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        <div className="login-field">
                            <div className="login-label-row">
                                <label htmlFor="password">
                                    비밀번호
                                </label>

                                <button
                                    type="button"
                                    className="login-find-password"
                                    onClick={() => navigate("/password")}
                                >
                                    비밀번호 찾기
                                </button>
                            </div>

                            <div className="login-input-wrapper">
                                <span className="login-input-icon">
                                    <LockIcon />
                                </span>

                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className="login-password-input"
                                    value={password}
                                    placeholder="비밀번호를 입력하세요"
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="new-password"
                                />

                                <button
                                    type="button"
                                    className="login-password-toggle"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                                    aria-pressed={showPassword}
                                >
                                    <PasswordToggleIcon visible={showPassword} />
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="login-button login-button-primary"
                        >
                            로그인
                        </button>
                    </form>
                </section>

                <footer className="login-footer">
                    <span>아직 계정이 없으신가요?</span>

                    <button
                        type="button"
                        onClick={handleSignup}
                    >
                        회원가입
                    </button>
                </footer>
            </main>
        </div>
    );
}

export default Login;
