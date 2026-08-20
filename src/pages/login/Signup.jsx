import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/login/AuthCommon.css";
import "../../styles/login/Signup.css";
import { UserIcon, EmailIcon, LockIcon, PasswordToggleIcon } from "../../components/common/icon";
import { API_URL } from "../../api/config";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPECIAL_CHARACTERS = "~!@#$%^&*()_+-=[]{};':\"\\|,.<>/?";

const CODE_EXPIRATION_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

const formatTime = (seconds) => {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const remainingSeconds = String(seconds % 60).padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
};

const readResponse = async (response) => {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        return response.json();
    }

    const message = await response.text();
    return { message };
};

function Signup() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");

    const [verificationCode, setVerificationCode] = useState("");
    const [verificationToken, setVerificationToken] = useState("");
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);
    const [codeTimeLeft, setCodeTimeLeft] = useState(0);
    const [resendTimeLeft, setResendTimeLeft] = useState(0);

    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    const [privacyAgree, setPrivacyAgree] = useState(false);
    const [serviceAgree, setServiceAgree] = useState(false);

    const [termsModal, setTermsModal] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [errors, setErrors] = useState({});

    const isAllAgreed = privacyAgree && serviceAgree;
    const isEmailVerified = Boolean(verificationToken);
    const isPasswordLengthValid = password.length >= 8 && password.length <= 24;
    const hasSpecialCharacters = [...password].filter((character) =>
        SPECIAL_CHARACTERS.includes(character)
    ).length >= 2;
    const isPasswordMatch = password === passwordConfirm;

    useEffect(() => {
        const timer = setInterval(() => {
            setCodeTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
            setResendTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!isCodeSent || isEmailVerified || codeTimeLeft !== 0) return;

        setErrors((prev) => ({
            ...prev,
            verificationCode: "인증번호가 만료되었습니다. 인증번호를 재전송해주세요.",
        }));
    }, [codeTimeLeft, isCodeSent, isEmailVerified]);

    const clearError = (field) => {
        setErrors((prev) => ({ ...prev, [field]: "" }));
    };

    const resetEmailVerification = () => {
        setVerificationCode("");
        setVerificationToken("");
        setIsCodeSent(false);
        setCodeTimeLeft(0);
        setResendTimeLeft(0);

        setErrors((prev) => ({
            ...prev,
            email: "",
            verificationCode: "",
        }));
    };

    const handleEmailChange = (e) => {
        setEmail(e.target.value);
        resetEmailVerification();
    };

    const handleChangeVerifiedEmail = () => {
        resetEmailVerification();
    };

    const handleSendVerificationCode = async () => {
        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
            setErrors((prev) => ({ ...prev, email: "이메일을 입력해주세요." }));
            return;
        }

        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            setErrors((prev) => ({
                ...prev,
                email: "올바른 이메일 형식으로 입력해주세요.",
            }));
            return;
        }

        try {
            setIsSendingCode(true);

            setErrors((prev) => ({
                ...prev,
                email: "",
                verificationCode: "",
            }));

            const response = await fetch(
                `${API_URL}/auth/email/send`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: normalizedEmail
                    }),
                });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "인증번호 발송에 실패했습니다.");
            }

            setIsCodeSent(true);
            setVerificationCode("");
            setVerificationToken("");
            setCodeTimeLeft(CODE_EXPIRATION_SECONDS);
            setResendTimeLeft(RESEND_COOLDOWN_SECONDS);
        } catch (error) {
            console.error("인증번호 발송 실패:", error);
            setErrors((prev) => ({
                ...prev,
                email: error.message || "인증번호 발송에 실패했습니다.",
            }));

        } finally {
            setIsSendingCode(false);
        }
    };

    const handleVerificationCodeChange = (e) => {
        const code = e.target.value.replace(/\D/g, "").slice(0, 6);

        setVerificationCode(code);
        clearError("verificationCode");
    };

    const handleVerifyCode = async () => {
        const normalizedEmail = email.trim().toLowerCase();

        if (codeTimeLeft <= 0) {
            setErrors((prev) => ({
                ...prev,
                verificationCode: "인증번호가 만료되었습니다. 다시 발송해주세요.",
            }));
            return;
        }

        if (verificationCode.length !== 6) {
            setErrors((prev) => ({
                ...prev,
                verificationCode: "6자리 인증번호를 입력해주세요.",
            }));
            return;
        }

        try {
            setIsVerifyingCode(true);
            clearError("verificationCode");

            const response = await fetch(
                `${API_URL}/auth/email/verify`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: normalizedEmail,
                        code: verificationCode,
                    }),
                });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "인증번호가 일치하지 않습니다.");
            }

            if (!data.verificationToken) {
                throw new Error("이메일 인증 완료 토큰이 응답에 없습니다.");
            }

            setVerificationToken(data.verificationToken);
            setCodeTimeLeft(0);
            setResendTimeLeft(0);

        } catch (error) {
            console.error("이메일 인증 실패:", error);
            setVerificationToken("");
            setErrors((prev) => ({
                ...prev,
                verificationCode: error.message || "인증번호 확인에 실패했습니다.",
            }));

        } finally {
            setIsVerifyingCode(false);
        }
    };

    const handleAllAgree = (e) => {
        const checked = e.target.checked;

        setPrivacyAgree(checked);
        setServiceAgree(checked);
        clearError("agreement");
    };

    const validateSignupForm = () => {
        const nextErrors = {};

        if (!name.trim()) {
            nextErrors.name = "이름을 입력해주세요.";
        }

        if (!email.trim()) {
            nextErrors.email = "이메일을 입력해주세요.";
        } else if (!EMAIL_PATTERN.test(email.trim())) {
            nextErrors.email = "올바른 이메일 형식으로 입력해주세요.";
        } else if (!isEmailVerified) {
            nextErrors.email = "이메일 인증을 완료해주세요.";
        }

        if (!password) {
            nextErrors.password = "비밀번호를 입력해주세요.";
        } else if (!isPasswordLengthValid) {
            nextErrors.password = "비밀번호는 8자 이상 24자 이하로 입력해주세요.";
        } else if (!hasSpecialCharacters) {
            nextErrors.password = "비밀번호에 특수문자를 2개 이상 포함해주세요.";
        }

        if (!passwordConfirm) {
            nextErrors.passwordConfirm = "비밀번호 확인을 입력해주세요.";
        } else if (!isPasswordMatch) {
            nextErrors.passwordConfirm = "비밀번호가 일치하지 않습니다.";
        }

        if (!privacyAgree || !serviceAgree) {
            nextErrors.agreement = "필수 약관에 모두 동의해주세요.";
        }

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSignup = async (e) => {
        e.preventDefault();

        if (!validateSignupForm()) return;

        const signupData = {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            privacyAgreed: privacyAgree,
            serviceAgreed: serviceAgree,
            emailVerificationToken: verificationToken,
        };

        try {
            setIsSubmitting(true);
            clearError("form");

            const response = await fetch(
                `${API_URL}/auth/signup`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(signupData),
                });

            const data = await readResponse(response);

            if (!response.ok) {
                const allowedFields = [
                    "name",
                    "email",
                    "password",
                    "passwordConfirm",
                    "agreement",
                ];

                if (allowedFields.includes(data.field)) {
                    setErrors((prev) => ({
                        ...prev,
                        [data.field]: data.message || "입력값을 확인해주세요.",
                    }));
                } else {
                    setErrors((prev) => ({
                        ...prev,
                        form: data.message || "회원가입에 실패했습니다.",
                    }));
                }

                return;
            }

            alert("회원가입이 완료되었습니다.");
            navigate("/login");
        } catch (error) {
            console.error("회원가입 실패:", error);
            setErrors((prev) => ({
                ...prev,
                form: error.message || "회원가입 처리 중 오류가 발생했습니다.",
            }));

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
                        <p>
                            LARO는 회원가입 및 서비스 제공을 위해 아래의 개인정보를 수집·이용합니다.
                        </p>

                        <div className="terms-section">
                            <h3>1. 수집 항목</h3>
                            <p>이름, 이메일, 비밀번호</p>
                        </div>

                        <div className="terms-section">
                            <h3>2. 수집 목적</h3>
                            <p>
                                회원 식별, 로그인 인증, 사용자 관리 창고 시뮬레이션 서비스 제공
                            </p>
                        </div>

                        <div className="terms-section">
                            <h3>3. 보유 및 이용 기간</h3>
                            <p>
                                회원 탈퇴 시까지 보관하며, 관련 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관합니다.
                            </p>
                        </div>

                        <div className="terms-section">
                            <h3>4. 동의 거부 안내</h3>
                            <p>
                                개인정보 수집 및 이용에 동의하지 않을 수 있으나, 동의하지 않을 경우 회원가입이 제한됩니다.
                            </p>
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
                        <p>
                            LARO 창고 시뮬레이션 운영 플랫폼 이용을 위한 기본 약관입니다.
                        </p>

                        <div className="terms-section">
                            <h3>1. 서비스 목적</h3>
                            <p>
                                LARO는 창고, 로봇, 작업, 이벤트 정보를 기반으로 디지털 트윈 시뮬레이션과 운영 관리 기능을 제공합니다.
                            </p>
                        </div>

                        <div className="terms-section">
                            <h3>2. 사용자 책임</h3>
                            <p>
                                사용자는 정확한 정보를 입력해야 하며, 시스템 테스트 및 시뮬레이션 결과를 목적에 맞게 사용해야 합니다.
                            </p>
                        </div>

                        <div className="terms-section">
                            <h3>3. 서비스 제한</h3>
                            <p>
                                비정상적인 접근, 시스템 장애 유발, 허가되지 않은 데이터 사용이 확인될 경우 서비스 이용이 제한될 수 있습니다.
                            </p>
                        </div>
                    </>
                ),
            };
        }

        return null;
    };

    const modalContent = getTermsContent();

    return (
        <div className="auth-page signup-page">
            <main className="auth-card signup-card">
                {/* 로그인 화면으로 돌아가기 */}
                <button
                    type="button"
                    className="auth-back-button"
                    onClick={() => navigate("/login")}
                >
                    <span aria-hidden="true">←</span>
                    로그인으로 돌아가기
                </button>

                {/* 회원가입 제목 */}
                <header className="auth-header">
                    <h1 className="auth-title">회원가입</h1>
                    <p className="auth-description">
                        이메일 인증을 완료하고 LARO 계정을 만들어주세요.
                    </p>
                </header>

                <section className="auth-content">
                    <form className="auth-form" onSubmit={handleSignup}>
                        {/* 회원가입 전체 오류 */}
                        {errors.form && (
                            <p
                                className="auth-message auth-message-error"
                                aria-live="polite"
                            >
                                {errors.form}
                            </p>
                        )}

                        {/* 이름 */}
                        <div className="auth-field">
                            <label htmlFor="name">이름</label>

                            <div className="auth-input-wrapper">
                                <span className="auth-input-icon">
                                    <UserIcon />
                                </span>

                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    placeholder="이름을 입력하세요"
                                    autoComplete="name"
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        clearError("name");
                                    }}
                                />
                            </div>

                            {errors.name && (
                                <p className="auth-message auth-message-error">{errors.name}</p>
                            )}
                        </div>

                        {/* 이메일 및 인증번호 발송 */}
                        <div className="auth-field">
                            <label htmlFor="signup-email">이메일</label>

                            <div className="auth-action-row">
                                <div className="auth-input-wrapper">
                                    <span className="auth-input-icon">
                                        <EmailIcon />
                                    </span>

                                    <input
                                        id="signup-email"
                                        type="email"
                                        value={email}
                                        placeholder="로그인에 사용할 이메일을 입력하세요"
                                        autoComplete="email"
                                        disabled={isEmailVerified}
                                        onChange={handleEmailChange}
                                    />
                                </div>

                                {isEmailVerified ? (
                                    <button
                                        type="button"
                                        className="auth-button auth-button-secondary auth-action-button"
                                        onClick={handleChangeVerifiedEmail}
                                    >
                                        이메일 변경
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="auth-button auth-button-secondary auth-action-button"
                                        onClick={handleSendVerificationCode}
                                        disabled={isSendingCode || resendTimeLeft > 0}
                                    >
                                        {isSendingCode
                                            ? "발송 중..."
                                            : resendTimeLeft > 0
                                                ? `${resendTimeLeft}초 후 재전송`
                                                : isCodeSent
                                                    ? "재전송"
                                                    : "인증번호 받기"}
                                    </button>
                                )}
                            </div>

                            {errors.email && (
                                <p className="auth-message auth-message-error">{errors.email}</p>
                            )}

                            {/* 인증번호가 발송된 경우에만 표시 */}
                            {isCodeSent && !isEmailVerified && (
                                <div className="signup-verification-area">
                                    <div className="auth-action-row">
                                        <div className="auth-input-wrapper">
                                            <input
                                                id="verification-code"
                                                type="text"
                                                className="auth-code-input"
                                                value={verificationCode}
                                                placeholder="6자리 인증번호 입력"
                                                inputMode="numeric"
                                                maxLength={6}
                                                autoComplete="one-time-code"
                                                disabled={codeTimeLeft <= 0}
                                                onChange={handleVerificationCodeChange}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className="auth-button auth-button-secondary auth-action-button"
                                            onClick={handleVerifyCode}
                                            disabled={
                                                isVerifyingCode ||
                                                verificationCode.length !== 6 ||
                                                codeTimeLeft <= 0
                                            }
                                        >
                                            {isVerifyingCode ? "확인 중..." : "인증하기"}
                                        </button>
                                    </div>

                                    <p className="auth-message auth-message-info">
                                        입력한 이메일로 인증번호를 발송했습니다. 남은 시간{" "}
                                        {formatTime(codeTimeLeft)}
                                    </p>
                                </div>
                            )}

                            {/* 이메일 인증 완료 */}
                            {isEmailVerified && (
                                <p
                                    className="auth-message auth-message-success"
                                    aria-live="polite"
                                >
                                    이메일 인증이 완료되었습니다.
                                </p>
                            )}

                            {errors.verificationCode && (
                                <p className="auth-message auth-message-error">
                                    {errors.verificationCode}
                                </p>
                            )}
                        </div>

                        {/* 비밀번호 */}
                        <div className="auth-field">
                            <label htmlFor="signup-password">비밀번호</label>

                            <div className="auth-input-wrapper">
                                <span className="auth-input-icon">
                                    <LockIcon />
                                </span>

                                <input
                                    id="signup-password"
                                    type={showPassword ? "text" : "password"}
                                    className="auth-password-input"
                                    value={password}
                                    placeholder="비밀번호를 입력하세요"
                                    autoComplete="new-password"
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        clearError("password");
                                    }}
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
                                >
                                    <PasswordToggleIcon visible={showPassword} />
                                </button>
                            </div>

                            {/* 비밀번호 조건 실시간 안내 */}
                            <p
                                className={`auth-message ${isPasswordLengthValid
                                    ? "auth-message-info"
                                    : ""
                                    }`}
                            >
                                {isPasswordLengthValid ? "✓" : "○"} 8~24자
                            </p>

                            <p
                                className={`auth-message ${hasSpecialCharacters
                                    ? "auth-message-info"
                                    : ""
                                    }`}
                            >
                                {hasSpecialCharacters ? "✓" : "○"} 특수문자 2개 이상
                            </p>

                            {errors.password && (
                                <p className="auth-message auth-message-error">{errors.password}</p>
                            )}
                        </div>

                        {/* 비밀번호 확인 */}
                        <div className="auth-field">
                            <label htmlFor="password-confirm">비밀번호 확인</label>

                            <div className="auth-input-wrapper">
                                <span className="auth-input-icon">
                                    <LockIcon />
                                </span>

                                <input
                                    id="password-confirm"
                                    type={showPasswordConfirm ? "text" : "password"}
                                    className="auth-password-input"
                                    value={passwordConfirm}
                                    placeholder="비밀번호를 다시 입력하세요"
                                    autoComplete="new-password"
                                    onChange={(e) => {
                                        setPasswordConfirm(e.target.value);
                                        clearError("passwordConfirm");
                                    }}
                                />

                                <button
                                    type="button"
                                    className="auth-password-toggle"
                                    onClick={() =>
                                        setShowPasswordConfirm((prev) => !prev)
                                    }
                                    aria-label={
                                        showPasswordConfirm
                                            ? "비밀번호 확인 숨기기"
                                            : "비밀번호 확인 보기"
                                    }
                                    aria-pressed={showPasswordConfirm}
                                >
                                    <PasswordToggleIcon
                                        visible={showPasswordConfirm}
                                    />
                                </button>
                            </div>

                            {passwordConfirm && isPasswordMatch && (
                                <p className="auth-message auth-message-info">
                                    ✓ 비밀번호가 일치합니다.
                                </p>
                            )}

                            {passwordConfirm && !isPasswordMatch && (
                                <p className="auth-message auth-message-error">
                                    비밀번호가 일치하지 않습니다.
                                </p>
                            )}

                            {errors.passwordConfirm && !passwordConfirm && (
                                <p className="auth-message auth-message-error">
                                    {errors.passwordConfirm}
                                </p>
                            )}
                        </div>

                        {/* 필수 약관 */}
                        <section className="signup-agree-box">
                            <label className="signup-all-agree">
                                <input
                                    type="checkbox"
                                    checked={isAllAgreed}
                                    onChange={handleAllAgree}
                                />
                                <span>모두 동의합니다.</span>
                            </label>

                            <p className="signup-agree-description">
                                아래 필수 약관을 확인하고 동의해주세요.
                            </p>

                            <div className="signup-agree-list">
                                {/* 개인정보 수집 및 이용 */}
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
                                                type="checkbox"
                                                checked={privacyAgree}
                                                onChange={(e) => {
                                                    setPrivacyAgree(e.target.checked);
                                                    clearError("agreement");
                                                }}
                                            />
                                            <span>동의함</span>
                                        </label>
                                    </div>
                                </div>

                                {/* 서비스 이용 약관 */}
                                <div className="signup-agree-item">
                                    <div className="signup-agree-item-header">
                                        <div>
                                            <h3>[필수] 서비스 이용 약관</h3>
                                            <p>LARO 서비스 이용 약관에 동의합니다.</p>
                                        </div>

                                        <button
                                            type="button"
                                            className="signup-terms-link"
                                            onClick={() => setTermsModal("service")}
                                        >
                                            약관 읽기
                                        </button>
                                    </div>

                                    <div className="signup-radio-group">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={serviceAgree}
                                                onChange={(e) => {
                                                    setServiceAgree(e.target.checked);
                                                    clearError("agreement");
                                                }}
                                            />
                                            <span>동의함</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {errors.agreement && (
                                <p className="auth-message auth-message-error">
                                    {errors.agreement}
                                </p>
                            )}
                        </section>

                        {/* 회원가입 */}
                        <button
                            type="submit"
                            className="auth-button auth-button-primary"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "처리 중..." : "회원가입"}
                        </button>
                    </form>
                </section>

                <footer className="auth-footer">
                    <span>이미 계정이 있으신가요?</span>
                    <button type="button" onClick={() => navigate("/login")}>
                        로그인
                    </button>
                </footer>
            </main>

            {/* 약관 상세 모달 */}
            {termsModal && modalContent && (
                <div
                    className="terms-modal-overlay"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setTermsModal(null);
                    }}
                >
                    <div
                        className="terms-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="terms-modal-title"
                    >
                        <header className="terms-modal-header">
                            <h2 id="terms-modal-title">{modalContent.title}</h2>

                            <button
                                type="button"
                                className="terms-modal-close"
                                onClick={() => setTermsModal(null)}
                                aria-label="약관 창 닫기"
                            >
                                ✕
                            </button>
                        </header>

                        <div className="terms-modal-content" tabIndex="0">
                            {modalContent.content}
                        </div>

                        <footer className="terms-modal-actions">
                            <button
                                type="button"
                                className="auth-button auth-button-primary terms-confirm-button"
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
