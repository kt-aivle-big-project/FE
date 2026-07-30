import { useNavigate } from "react-router-dom";
import laroLogo from "../../assets/logo/laro_logo.png";
import "../../styles/login/LoginCommon.css";
import "../../styles/login/LoginSelect.css";

function EmailIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m4 7 8 6 8-6" />
        </svg>
    );
}

function GoogleIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="#4285F4"
                d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.37Z"
            />
            <path
                fill="#34A853"
                d="M12 22c2.7 0 4.96-.89 6.62-2.4l-3.24-2.52c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.06v2.6A10 10 0 0 0 12 22Z"
            />
            <path
                fill="#FBBC05"
                d="M6.4 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.32-1.92v-2.6H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.52l3.34-2.6Z"
            />
            <path
                fill="#EA4335"
                d="M12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.6c.8-2.36 3-4.12 5.6-4.12Z"
            />
        </svg>
    );
}

function LoginSelect() {
    const navigate = useNavigate();

    const handleEmailLogin = () => {
        navigate("/login");
    };

    const handleGoogleLogin = () => {
        alert("Google 로그인 연동 준비 중입니다.");
    };

    const handleGuestLogin = () => {
        localStorage.setItem("loginType", "guest");
        navigate("/simulation");
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
                        안녕하세요LARO입니다라로는로봇최적화및창고운영시뮬레이션이가능합니디자인보느라임시로작성했습니다라로소개글나중에수정필요합니다이부분넣을지말지도정해야합니다
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
                        계속 진행하면 이용약관 및 개인정보 처리방침에
                        동의하는 것으로 간주됩니다.
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