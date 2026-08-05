import { useNavigate } from "react-router-dom";
import laroLogo from "../../assets/logo/laro_logo.png";
import "../../styles/login/LoginCommon.css";
import "../../styles/login/LoginSelect.css";
import { EmailIcon, LockIcon, GoogleIcon } from "../../components/icon";
import { API_URL } from "../../api/config";

function LoginSelect() {
    const navigate = useNavigate();

    const handleEmailLogin = () => {
        navigate("/login");
    };

    const handleGoogleLogin = () => {
        alert("Google 로그인 연동 준비 중입니다.");
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
            navigate("/simulation", {replace: true,});

        } catch (error) {
            console.error("게스트 로그인 실패:", error);
            alert(error instanceof Error ? error.message : "게스트 로그인 중 오류가 발생했습니다.");
        }
    };

    const handleSignup = () => {
        navigate("/signup");
    };

    return (
        <div className="login-page">
            <main className="login-card">
                <header className="login-header">
                    <img
                        src={laroLogo}
                        alt="LARO 창고 시뮬레이션 플랫폼"
                        className="login-logo"
                    />

                    <p className="login-description">
                        안녕하세요 LARO 입니다
                    </p>
                </header>

                <section className="login-content">
                    <div className="login-select-buttons">
                        <button
                            type="button"
                            className="login-button login-button-primary"
                            onClick={handleEmailLogin}
                        >
                            <span className="login-button-icon login-select-email-icon">
                                <EmailIcon />
                            </span>

                            이메일로 계속하기
                        </button>

                        <button
                            type="button"
                            className="login-button login-button-secondary"
                            onClick={handleGoogleLogin}
                        >
                            <span className="login-button-icon login-select-google-icon">
                                <GoogleIcon />
                            </span>

                            Google로 계속하기
                        </button>
                    </div>

                    <button
                        type="button"
                        className="login-text-button login-select-guest"
                        onClick={handleGuestLogin}
                    >
                        게스트로 둘러보기
                        <span aria-hidden="true">→</span>
                    </button>

                    <p className="login-select-policy">
                        계속 진행하면 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
                    </p>
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

export default LoginSelect;