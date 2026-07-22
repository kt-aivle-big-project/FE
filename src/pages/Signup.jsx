import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/signup.css";

function Signup() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");

    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    const handleSignup = (e) => {
        e.preventDefault();

        if (password !== passwordConfirm) {
            alert("비밀번호가 일치하지 않습니다.");
            return;
        }

        // 추후 회원가입 API 연결
        console.log("name:", name);
        console.log("email:", email);
        console.log("password:", password);
    };

    const handleLogin = () => {
        navigate("/login");
    };

    return (
        <div className="signup-page">
            <div className="signup-box">
                <div className="signup-logo">
                    <h1>LARO</h1>
                    <p>창고 시뮬레이션 운영 플랫폼</p>
                </div>

                <form className="signup-form" onSubmit={handleSignup}
                >

                    <div className="signup-input-group">
                        <label htmlFor="name">
                            이름
                        </label>

                        <div className="signup-input-wrapper">
                            <span className="signup-input-icon">
                                👩🏻
                            </span>

                            <input
                                id="name"
                                type="text"
                                value={name}
                                placeholder="이름을 입력하세요"
                                onChange={(e) =>
                                    setName(e.target.value)
                                }
                            />
                        </div>
                    </div>

                    <div className="signup-input-group">
                        <label htmlFor="signup-email">
                            이메일
                        </label>

                        <div className="signup-input-wrapper">
                            <span className="signup-input-icon">
                                ✉️
                            </span>

                            <input
                                id="signup-email"
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

                    <div className="signup-input-group">
                        <label htmlFor="signup-password">
                            비밀번호
                        </label>

                        <div className="signup-input-wrapper">
                            <span className="signup-input-icon">
                                🔢
                            </span>

                            <input
                                id="signup-password"
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
                                className="signup-password-view-button"
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

                    <div className="signup-input-group">
                        <label htmlFor="password-confirm">
                            비밀번호 확인
                        </label>

                        <div className="signup-input-wrapper">
                            <span className="signup-input-icon">
                                🔢
                            </span>

                            <input
                                id="password-confirm"
                                type={
                                    showPasswordConfirm
                                        ? "text"
                                        : "password"
                                }
                                value={passwordConfirm}
                                placeholder="비밀번호를 다시 입력하세요"
                                onChange={(e) =>
                                    setPasswordConfirm(
                                        e.target.value
                                    )
                                }
                            />

                            <button
                                type="button"
                                className="signup-password-view-button"
                                onClick={() =>
                                    setShowPasswordConfirm(
                                        !showPasswordConfirm
                                    )
                                }
                            >
                                {showPasswordConfirm
                                    ? "숨김"
                                    : "보기"}
                            </button>
                        </div>

                        {passwordConfirm &&
                            password !== passwordConfirm && (
                                <p className="password-error">
                                    비밀번호가 일치하지 않습니다.
                                </p>
                            )}
                    </div>

                    <button
                        type="submit"
                        className="signup-submit-button"
                    >
                        회원가입
                    </button>
                </form>

                <div className="signup-divider">
                    <span>이미 계정이 있으신가요?</span>
                </div>

                <button
                    type="button"
                    className="signup-login-button"
                    onClick={handleLogin}
                >
                    로그인
                </button>

            </div>
        </div>
    );
}

export default Signup;