import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Signup.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

function Signup() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [privacyAgreed, setPrivacyAgreed] = useState(false);

    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    const handleSignup = async (e) => {
        e.preventDefault();

        if (!name.trim() || !email.trim() || !password.trim() || !passwordConfirm.trim()) {
            alert("모든 항목을 입력해주세요.");
            return;
        }

        if (password !== passwordConfirm) {
            alert("비밀번호가 일치하지 않습니다.");
            return;
        }

        // 백엔드로 전달
        if (!privacyAgreed) {
            alert("개인정보 수집 및 이용에 동의해 주세요.");
            return;
        }

        const signupData = {
            name: name.trim(),
            email: email.trim(),
            password: password,
            privacyAgreed,
        };

        try {
            const response = await fetch(
                `${API_URL}/auth/signup`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(signupData),
                }
            );

            if (!response.ok) {
                const errorMessage = await response.text();
                throw new Error(errorMessage || "회원가입에 실패했습니다.");
            }

            alert("회원가입이 완료되었습니다.");
            navigate("/login");

        } catch (error) {
            console.error("회원가입 실패:", error);
            alert(error.message || "회원가입 중 오류가 발생했습니다.");
        }
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

                <form className="signup-form" onSubmit={handleSignup}>
                    <div className="signup-input-group">
                        <label htmlFor="name">이름</label>

                        <div className="signup-input-wrapper">
                            <span className="signup-input-icon">👩🏻</span>

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
                        <label htmlFor="signup-email">이메일</label>

                        <div className="signup-input-wrapper">
                            <span className="signup-input-icon">✉️</span>

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
                        <label htmlFor="signup-password">비밀번호</label>

                        <div className="signup-input-wrapper">
                            <span className="signup-input-icon">🔢</span>

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
                        <label htmlFor="password-confirm">비밀번호 확인</label>

                        <div className="signup-input-wrapper">
                            <span className="signup-input-icon">🔢</span>

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

                    <label className="privacy-agreement">
                        <input
                            type="checkbox"
                            checked={privacyAgreed}
                            onChange={(e) =>
                                setPrivacyAgreed(e.target.checked)
                            }
                        />
                        <span>개인정보 수집 및 이용에 동의합니다. (필수)</span>
                    </label>

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
