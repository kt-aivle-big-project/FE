import { useState } from "react";
import { useNavigate } from "react-router-dom";
import laroLogo from "../../assets/logo/laro_logo.png";
import "../../styles/login/LoginCommon.css";
import "../../styles/login/Signup.css";

const API_URL = "http://localhost:8080/api";


// Icon svg
function UserIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
    );
}

function EmailIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M4 7l8 6 8-6" />
        </svg>
    );
}

function LockIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
    );
}

function PasswordToggleIcon({ visible }) {
    if (visible) {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 3l18 18" />
                <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9 5 9 5a15.4 15.4 0 0 1-2.1 2.6" />
                <path d="M6.6 6.6C4.4 8 3 10 3 10s3.5 5 9 5c1.1 0 2.1-.2 3-.5" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5Z" />
            <circle cx="12" cy="12" r="2.5" />
        </svg>
    );
}

function Signup() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");

    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    const [privacyAgree, setPrivacyAgree] = useState("disagree");
    const [serviceAgree, setServiceAgree] = useState("disagree");

    const [termsModal, setTermsModal] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const isAllAgreed = privacyAgree === "agree" && serviceAgree === "agree";

    const handleAllAgree = (e) => {
        const value = e.target.checked
            ? "agree"
            : "disagree";

        setPrivacyAgree(value);
        setServiceAgree(value);
    };

    const validateSignupForm = () => {
        if (
            !name.trim() ||
            !email.trim() ||
            !password.trim() ||
            !passwordConfirm.trim()
        ) {
            alert("모든 항목을 입력해주세요.");
            return false;
        }

        if (password !== passwordConfirm) {
            alert("비밀번호가 일치하지 않습니다.");
            return false;
        }

        if (privacyAgree !== "agree") {
            alert("개인정보 수집 및 이용 약관에 동의해주세요.");
            return false;
        }

        if (serviceAgree !== "agree") {
            alert("서비스 이용 약관에 동의해주세요.");
            return false;
        }

        return true;
    };

    const handleSignup = async (e) => {
        e.preventDefault();

        if (!validateSignupForm()) {
            return;
        }

        const signupData = {
            name: name.trim(),
            email: email.trim(),
            password,
            privacyAgreed: privacyAgree === "agree",
        };

        try {
            setIsSubmitting(true);

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

                throw new Error(
                    errorMessage ||
                    "회원가입에 실패했습니다."
                );
            }

            alert("회원가입이 완료되었습니다.");
            navigate("/login");

        } catch (error) {
            console.error("회원가입 실패:", error);
            alert(error.message || "회원가입 중 오류가 발생했습니다.");

        } finally {
            setIsSubmitting(false);
        }
    };

    const getTermsContent = () => {
        if (termsModal === "privacy") {
            return {
                title: "개인정보 수집 및 이용",
                content: (
                    <>
                        <p>LARO는 회원가입 및 서비스 제공을 위해 아래의 개인정보를 수집·이용합니다.</p>

                        <div className="terms-section">
                            <h3>1. 수집 항목</h3>
                            <p>이름, 이메일, 비밀번호</p>
                        </div>

                        <div className="terms-section">
                            <h3>2. 수집 목적</h3>
                            <p>회원 식별, 로그인 인증, 사용자 관리, 창고 시뮬레이션 서비스 제공</p>
                        </div>

                        <div className="terms-section">
                            <h3>3. 보유 및 이용 기간</h3>
                            <p>회원 탈퇴 시까지 보관하며, 관련 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관합니다.</p>
                        </div>

                        <div className="terms-section">
                            <h3>4. 동의 거부 안내</h3>
                            <p>개인정보 수집 및 이용에 동의하지 않을 수 있으나, 동의하지 않을 경우 회원가입이 제한됩니다.</p>
                        </div>
                    </>
                ),
            };
        }

        if (termsModal === "service") {
            return {
                title: "서비스 이용 약관",
                content: (
                    <>
                        <p>LARO 창고 시뮬레이션 운영 플랫폼 이용을 위한 기본 약관입니다.</p>

                        <div className="terms-section">
                            <h3>1. 서비스 목적</h3>
                            <p>LARO는 창고, 로봇, 작업, 이벤트 정보를 기반으로 디지털 트윈 시뮬레이션과 운영 관리 기능을 제공합니다.</p>
                        </div>

                        <div className="terms-section">
                            <h3>2. 사용자 책임</h3>
                            <p>사용자는 정확한 정보를 입력해야 하며, 시스템 테스트 및 시뮬레이션 결과를 목적에 맞게 사용해야 합니다.</p>
                        </div>

                        <div className="terms-section">
                            <h3>3. 서비스 제한</h3>
                            <p>비정상적인 접근, 시스템 장애 유발, 허가되지 않은 데이터 사용이 확인될 경우 서비스 이용이 제한될 수 있습니다.</p>
                        </div>
                    </>
                ),
            };
        }

        return null;
    };

    const modalContent = getTermsContent();

    return (
        <div className="login-page signup-page">
            <main className="login-card signup-card">
                <button
                    type="button"
                    className="login-back-button"
                    onClick={() => navigate("/login")}
                >
                    <span aria-hidden="true">←</span>
                    로그인으로 돌아가기
                </button>

                <header className="login-header">
                    <h1 className="login-title">
                        회원가입
                    </h1>

                    <p className="login-description">
                        LARO 서비스를 이용할 계정을 만들어주세요.
                    </p>
                </header>

                <section className="login-content">
                    <form
                        className="signup-form"
                        onSubmit={handleSignup}
                    >
                        <div className="signup-field">
                            <label htmlFor="name">
                                이름
                            </label>

                            <div className="signup-input-wrapper">
                                <span className="signup-input-icon">
                                    <UserIcon />
                                </span>

                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    placeholder="이름을 입력하세요"
                                    onChange={(e) => setName(e.target.value)}
                                    autoComplete="name"
                                />
                            </div>
                        </div>

                        <div className="signup-field">
                            <label htmlFor="signup-email">
                                이메일
                            </label>

                            <div className="signup-input-wrapper">
                                <span className="signup-input-icon">
                                    <EmailIcon />
                                </span>

                                <input
                                    id="signup-email"
                                    type="email"
                                    value={email}
                                    placeholder="이메일을 입력하세요"
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div className="signup-field">
                            <label htmlFor="signup-password">
                                비밀번호
                            </label>

                            <div className="signup-input-wrapper">
                                <span className="signup-input-icon">
                                    <LockIcon />
                                </span>

                                <input
                                    id="signup-password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    placeholder="비밀번호를 입력하세요"
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="new-password"
                                />

                                <button
                                    type="button"
                                    className="signup-password-toggle"
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                                    aria-pressed={showPassword}
                                >
                                    <PasswordToggleIcon visible={showPassword} />
                                </button>
                            </div>
                        </div>

                        <div className="signup-field">
                            <label htmlFor="password-confirm">
                                비밀번호 확인
                            </label>

                            <div className="signup-input-wrapper">
                                <span className="signup-input-icon">
                                    <LockIcon />
                                </span>

                                <input
                                    id="password-confirm"
                                    type={showPasswordConfirm ? "text" : "password"}
                                    value={passwordConfirm}
                                    placeholder="비밀번호를 다시 입력하세요"
                                    onChange={(e) => setPasswordConfirm(e.target.value)}
                                    autoComplete="new-password"
                                />

                                <button
                                    type="button"
                                    className="signup-password-toggle"
                                    onClick={() => setShowPasswordConfirm((prev) => !prev)}
                                    aria-label={showPasswordConfirm ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
                                    aria-pressed={showPasswordConfirm}
                                >
                                    <PasswordToggleIcon visible={showPasswordConfirm} />
                                </button>
                            </div>

                            {passwordConfirm &&
                                password !==
                                passwordConfirm && (
                                    <p
                                        className="signup-password-error"
                                        aria-live="polite"
                                    >
                                        비밀번호가 일치하지 않습니다.
                                    </p>
                                )}
                        </div>

                        <section className="signup-agree-box">
                            <label className="signup-all-agree">
                                <input
                                    type="checkbox"
                                    checked={isAllAgreed}
                                    onChange={handleAllAgree}
                                />

                                <span>
                                    모두 동의합니다.
                                </span>
                            </label>

                            <p className="signup-agree-description">
                                아래 필수 약관을 확인하고 동의해주세요.
                            </p>

                            <div className="signup-agree-list">
                                <div className="signup-agree-item">
                                    <div className="signup-agree-item-header">
                                        <div>
                                            <h3>[필수] 개인정보 수집 및 이용</h3>
                                            <p>개인정보 수집 및 이용에 동의합니다.</p>
                                        </div>

                                        <button
                                            type="button"
                                            className="signup-terms-link"
                                            onClick={() => setTermsModal("privacy")}
                                        >
                                            약관 읽기
                                        </button>
                                    </div>

                                    <div className="signup-radio-group">
                                        <label>
                                            <input
                                                type="radio"
                                                name="privacyAgree"
                                                value="disagree"
                                                checked={privacyAgree === "disagree"}
                                                onChange={(e) => setPrivacyAgree(e.target.value)}
                                            />
                                            <span>
                                                동의 안 함
                                            </span>
                                        </label>

                                        <label>
                                            <input
                                                type="radio"
                                                name="privacyAgree"
                                                value="agree"
                                                checked={
                                                    privacyAgree ===
                                                    "agree"
                                                }
                                                onChange={(e) =>
                                                    setPrivacyAgree(
                                                        e.target
                                                            .value
                                                    )
                                                }
                                            />
                                            <span>동의함</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="signup-agree-item">
                                    <div className="signup-agree-item-header">
                                        <div>
                                            <h3>
                                                [필수] 서비스
                                                이용 약관
                                            </h3>

                                            <p>
                                                LARO 서비스 이용
                                                약관에
                                                동의합니다.
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            className="signup-terms-link"
                                            onClick={() =>
                                                setTermsModal(
                                                    "service"
                                                )
                                            }
                                        >
                                            약관 읽기
                                        </button>
                                    </div>

                                    <div className="signup-radio-group">
                                        <label>
                                            <input
                                                type="radio"
                                                name="serviceAgree"
                                                value="disagree"
                                                checked={
                                                    serviceAgree ===
                                                    "disagree"
                                                }
                                                onChange={(e) =>
                                                    setServiceAgree(
                                                        e.target
                                                            .value
                                                    )
                                                }
                                            />
                                            <span>
                                                동의 안 함
                                            </span>
                                        </label>

                                        <label>
                                            <input
                                                type="radio"
                                                name="serviceAgree"
                                                value="agree"
                                                checked={
                                                    serviceAgree ===
                                                    "agree"
                                                }
                                                onChange={(e) =>
                                                    setServiceAgree(
                                                        e.target
                                                            .value
                                                    )
                                                }
                                            />
                                            <span>동의함</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <button
                            type="submit"
                            className="login-button login-button-primary"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "처리 중..." : "회원가입"}
                        </button>
                    </form>
                </section>

                <footer className="login-footer">
                    <span>
                        이미 계정이 있으신가요?
                    </span>

                    <button
                        type="button"
                        onClick={() => navigate("/login")}
                    >
                        로그인
                    </button>
                </footer>
            </main>

            {termsModal && modalContent && (
                <div
                    className="terms-modal-overlay"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) {
                            setTermsModal(null);
                        }
                    }}
                >
                    <div
                        className="terms-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="terms-modal-title"
                    >
                        <header className="terms-modal-header">
                            <h2 id="terms-modal-title">
                                {modalContent.title}
                            </h2>

                            <button
                                type="button"
                                className="terms-modal-close"
                                onClick={() => setTermsModal(null)}
                                aria-label="약관 창 닫기"
                            >
                                ✕
                            </button>
                        </header>

                        <div
                            className="terms-modal-content"
                            tabIndex="0"
                        >
                            {modalContent.content}
                        </div>

                        <footer className="terms-modal-actions">
                            <button
                                type="button"
                                className="terms-confirm-button"
                                onClick={() => setTermsModal(null)}
                            >
                                확인
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Signup;