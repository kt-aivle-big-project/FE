import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";

function Login() {
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = (e) => {
        e.preventDefault();

        // 추후 백엔드 로그인 API 연결
        console.log("email:", email);
        console.log("password:", password);
        
        navigate("/simulation");
    };

    const handleSignup = () => {
        navigate("/signup");
    };

    return (
        <div className="login-page">
            <div className="login-box">
                <div className="login-logo">
                    <h1>LARO</h1>
                    <p>창고 시뮬레이션 운영 플랫폼</p>
                </div>

                <form className="login-form" onSubmit={handleLogin}>
                    <div className="login-input-group">

                        <label htmlFor="email">
                            이메일
                        </label>

                        <div className="login-input-wrapper">
                            <span className="login-input-icon">
                                ✉️
                            </span>

                            <input
                                id="email"
                                type="email"
                                value={email}
                                placeholder="이메일을 입력하세요"
                                onChange={(e) =>
                                    setEmail(e.target.value)
                                }
                                autoComplete="off"
                            />
                        </div>
                    </div>


                    <div className="login-input-group">
                        <label htmlFor="password">
                            비밀번호
                        </label>

                        <div className="login-input-wrapper">
                            <span className="login-input-icon">
                                🔢
                            </span>

                            <input
                                id="password"
                                type={
                                    showPassword
                                        ? "text"
                                        : "password"
                                }
                                value={password}
                                placeholder="비밀번호를 입력하세요"
                                onChange={(e) =>
                                    setPassword(e.target.value)
                                }
                                autoComplete="new-password"
                            />

                            <button
                                type="button"
                                className="password-view-button"
                                onClick={() =>
                                    setShowPassword(
                                        !showPassword
                                    )
                                }
                            >
                                {showPassword ? "숨김" : "보기"}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="login-button"
                    >
                        로그인
                    </button>
                </form>

                <button
                    type="button"
                    className="password-find-button"
                >
                    비밀번호 찾기
                </button>


                <div className="login-divider">
                    <div className="signup-area">
                        <p>아직 계정이 없으신가요?</p>
                    </div>
                    <button
                        type="button"
                        className="signup-button"
                        onClick={handleSignup}
                    >
                        회원가입
                    </button>
                </div>

            </div>
        </div>
    );
}

export default Login;