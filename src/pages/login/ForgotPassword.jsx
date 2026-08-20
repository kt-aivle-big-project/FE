import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthCircuitBackground from "../../pages/login/AuthCircuitBackground";
import "../../styles/login/AuthCommon.css";
import "../../styles/login/ForgotPassword.css";
import { UserIcon, EmailIcon, LockIcon, PasswordToggleIcon } from "../../components/common/icon";
import { API_URL } from "../../api/config";

const PASSWORD_RESET_ENDPOINTS = {
    sendCode: `${API_URL}/auth/password-reset/email/send`,
    verifyCode: `${API_URL}/auth/password-reset/email/verify`,
    resetPassword: `${API_URL}/auth/password-reset`,
};

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

function ForgotPassword() {
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    const [verificationCode, setVerificationCode] = useState("");
    const [resetToken, setResetToken] = useState("");
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);
    const [codeTimeLeft, setCodeTimeLeft] = useState(0);
    const [resendTimeLeft, setResendTimeLeft] = useState(0);

    const [newPassword, setNewPassword] = useState("");
    const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);

    const [isResetting, setIsResetting] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [errors, setErrors] = useState({});

    const isEmailVerified = Boolean(resetToken);
    const isPasswordLengthValid = newPassword.length >= 8 && newPassword.length <= 24;
    const hasSpecialCharacters = [...newPassword].filter((character) =>
        SPECIAL_CHARACTERS.includes(character)
    ).length >= 2;
    const isPasswordMatch = newPassword === newPasswordConfirm;

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

    const resetVerification = () => {
        setVerificationCode("");
        setResetToken("");
        setIsCodeSent(false);
        setCodeTimeLeft(0);
        setResendTimeLeft(0);

        setErrors((prev) => ({
            ...prev,
            name: "",
            email: "",
            verificationCode: "",
        }));
    };

    const handleNameChange = (e) => {
        setName(e.target.value);
        resetVerification();
    };

    const handleEmailChange = (e) => {
        setEmail(e.target.value);
        resetVerification();
    };

    const handleChangeAccountInfo = () => {
        resetVerification();
    };

    const handleSendCode = async () => {
        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedName) {
            setErrors((prev) => ({ ...prev, name: "이름을 입력해주세요." }));
            return;
        }

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
                name: "",
                email: "",
                verificationCode: "",
                form: "",
            }));

            const response = await fetch(PASSWORD_RESET_ENDPOINTS.sendCode, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: normalizedName,
                    email: normalizedEmail,
                }),
            });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "인증번호 발송에 실패했습니다.");
            }

            setIsCodeSent(true);
            setVerificationCode("");
            setResetToken("");
            setCodeTimeLeft(CODE_EXPIRATION_SECONDS);
            setResendTimeLeft(RESEND_COOLDOWN_SECONDS);
        } catch (error) {
            console.error("인증번호 발송 실패:", error);

            setErrors((prev) => ({
                ...prev,
                form: "인증번호 발송 중 오류가 발생했습니다.",
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

            const response = await fetch(PASSWORD_RESET_ENDPOINTS.verifyCode, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    email: email.trim().toLowerCase(),
                    code: verificationCode,
                }),
            });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "인증번호가 일치하지 않습니다.");
            }

            if (!data.resetToken) {
                throw new Error("비밀번호 재설정 토큰이 응답에 없습니다.");
            }

            setResetToken(data.resetToken);
            setCodeTimeLeft(0);
            setResendTimeLeft(0);
            clearError("form");
        } catch (error) {
            console.error("인증번호 확인 실패:", error);
            setResetToken("");

            setErrors((prev) => ({
                ...prev,
                verificationCode: "인증번호 확인 중 오류가 발생했습니다.",
            }));
        } finally {
            setIsVerifyingCode(false);
        }
    };

    const validateNewPassword = () => {
        const nextErrors = {};

        if (!isEmailVerified) {
            nextErrors.form = "이메일 인증을 완료해주세요.";
        }

        if (!newPassword) {
            nextErrors.newPassword = "새 비밀번호를 입력해주세요.";
        } else if (!isPasswordLengthValid) {
            nextErrors.newPassword = "비밀번호는 8자 이상 24자 이하로 입력해주세요.";
        } else if (!hasSpecialCharacters) {
            nextErrors.newPassword = "비밀번호에 특수문자를 2개 이상 포함해주세요.";
        }

        if (!newPasswordConfirm) {
            nextErrors.newPasswordConfirm = "새 비밀번호 확인을 입력해주세요.";
        } else if (!isPasswordMatch) {
            nextErrors.newPasswordConfirm = "비밀번호가 일치하지 않습니다.";
        }

        setErrors((prev) => ({ ...prev, ...nextErrors }));
        return Object.keys(nextErrors).length === 0;
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();

        if (!validateNewPassword()) return;

        try {
            setIsResetting(true);
            clearError("form");

            const response = await fetch(PASSWORD_RESET_ENDPOINTS.resetPassword, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resetToken,
                    newPassword,
                }),
            });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "비밀번호 변경에 실패했습니다.");
            }

            setIsCompleted(true);
        } catch (error) {
            console.error("비밀번호 변경 실패:", error);

            setErrors((prev) => ({
                ...prev,
                form: "비밀번호 변경에 실패했습니다. 인증을 다시 진행해주세요.",
            }));
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="auth-page">
            <AuthCircuitBackground />

            <main className="auth-card">
                {/* 비밀번호 변경 완료 화면 */}
                {isCompleted ? (
                    <>
                        <header className="auth-header">
                            <div className="password-reset-complete-icon" aria-hidden="true">
                                ✓
                            </div>

                            <h1 className="auth-title">비밀번호 변경 완료</h1>
                            <p className="auth-description">
                                새로운 비밀번호로 로그인해주세요.
                            </p>
                        </header>

                        <section className="auth-content">
                            <button
                                type="button"
                                className="auth-button auth-button-primary"
                                onClick={() => navigate("/login")}
                            >
                                로그인하러 가기
                            </button>
                        </section>
                    </>
                ) : (
                    <>
                        {/* 로그인 화면으로 돌아가기 */}
                        <button
                            type="button"
                            className="auth-back-button"
                            onClick={() => navigate("/login")}
                        >
                            <span aria-hidden="true">←</span>
                            로그인으로 돌아가기
                        </button>

                        <header className="auth-header">
                            <h1 className="auth-title">비밀번호 찾기</h1>
                            <p className="auth-description">
                                가입한 이름과 이메일을 인증한 후 새 비밀번호를 설정해주세요.
                            </p>
                        </header>

                        <section className="auth-content">
                            <form className="auth-form" onSubmit={handleResetPassword}>
                                {/* 전체 요청 오류 */}
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
                                    <label htmlFor="password-reset-name">이름</label>

                                    <div className="auth-input-wrapper">
                                        <span className="auth-input-icon">
                                            <UserIcon />
                                        </span>

                                        <input
                                            id="password-reset-name"
                                            type="text"
                                            value={name}
                                            placeholder="가입한 이름을 입력하세요"
                                            autoComplete="name"
                                            disabled={isEmailVerified}
                                            onChange={handleNameChange}
                                        />
                                    </div>

                                    {errors.name && (
                                        <p className="auth-message auth-message-error">
                                            {errors.name}
                                        </p>
                                    )}
                                </div>

                                {/* 이메일 및 인증번호 발송 */}
                                <div className="auth-field">
                                    <label htmlFor="password-reset-email">이메일</label>

                                    <div className="auth-action-row">
                                        <div className="auth-input-wrapper">
                                            <span className="auth-input-icon">
                                                <EmailIcon />
                                            </span>

                                            <input
                                                id="password-reset-email"
                                                type="email"
                                                value={email}
                                                placeholder="가입한 이메일을 입력하세요"
                                                autoComplete="email"
                                                disabled={isEmailVerified}
                                                onChange={handleEmailChange}
                                            />
                                        </div>

                                        {isEmailVerified ? (
                                            <button
                                                type="button"
                                                className="auth-button auth-button-secondary auth-action-button"
                                                onClick={handleChangeAccountInfo}
                                            >
                                                정보 변경
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="auth-button auth-button-secondary auth-action-button"
                                                onClick={handleSendCode}
                                                disabled={isSendingCode || resendTimeLeft > 0}
                                            >
                                                {isSendingCode
                                                    ? "발송 중..."
                                                    : resendTimeLeft > 0
                                                      ? `${resendTimeLeft}초`
                                                      : isCodeSent
                                                        ? "재전송"
                                                        : "인증번호 받기"}
                                            </button>
                                        )}
                                    </div>

                                    {errors.email && (
                                        <p className="auth-message auth-message-error">
                                            {errors.email}
                                        </p>
                                    )}
                                </div>

                                {/* 인증번호 발송 후 표시 */}
                                {isCodeSent && !isEmailVerified && (
                                    <div className="auth-field">
                                        <label htmlFor="password-reset-code">인증번호</label>

                                        <div className="auth-action-row">
                                            <div className="auth-input-wrapper">
                                                <input
                                                    id="password-reset-code"
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
                                            인증번호를 발송했습니다. 남은 시간 {formatTime(codeTimeLeft)}
                                        </p>

                                        {errors.verificationCode && (
                                            <p className="auth-message auth-message-error">
                                                {errors.verificationCode}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* 이메일 인증 완료 */}
                                {isEmailVerified && (
                                    <p
                                        className="auth-message auth-message-success"
                                        aria-live="polite"
                                    >
                                        ✓ 이메일 인증이 완료되었습니다.
                                    </p>
                                )}

                                {/* 인증 완료 후 새 비밀번호 표시 */}
                                {isEmailVerified && (
                                    <>
                                        <div className="password-reset-divider" />

                                        <div className="auth-field">
                                            <label htmlFor="new-password">새 비밀번호</label>

                                            <div className="auth-input-wrapper">
                                                <span className="auth-input-icon">
                                                    <LockIcon />
                                                </span>

                                                <input
                                                    id="new-password"
                                                    type={showNewPassword ? "text" : "password"}
                                                    className="auth-password-input"
                                                    value={newPassword}
                                                    placeholder="새 비밀번호를 입력하세요"
                                                    autoComplete="new-password"
                                                    onChange={(e) => {
                                                        setNewPassword(e.target.value);
                                                        clearError("newPassword");
                                                    }}
                                                />

                                                <button
                                                    type="button"
                                                    className="auth-password-toggle"
                                                    onClick={() => setShowNewPassword((prev) => !prev)}
                                                    aria-label={
                                                        showNewPassword
                                                            ? "새 비밀번호 숨기기"
                                                            : "새 비밀번호 보기"
                                                    }
                                                    aria-pressed={showNewPassword}
                                                >
                                                    <PasswordToggleIcon visible={showNewPassword} />
                                                </button>
                                            </div>

                                            <p
                                                className={`auth-message ${
                                                    isPasswordLengthValid
                                                        ? "auth-message-info"
                                                        : ""
                                                }`}
                                            >
                                                {isPasswordLengthValid ? "✓" : "○"} 8~24자
                                            </p>

                                            <p
                                                className={`auth-message ${
                                                    hasSpecialCharacters
                                                        ? "auth-message-info"
                                                        : ""
                                                }`}
                                            >
                                                {hasSpecialCharacters ? "✓" : "○"} 특수문자 2개 이상
                                            </p>

                                            {errors.newPassword && (
                                                <p className="auth-message auth-message-error">
                                                    {errors.newPassword}
                                                </p>
                                            )}
                                        </div>

                                        <div className="auth-field">
                                            <label htmlFor="new-password-confirm">
                                                새 비밀번호 확인
                                            </label>

                                            <div className="auth-input-wrapper">
                                                <span className="auth-input-icon">
                                                    <LockIcon />
                                                </span>

                                                <input
                                                    id="new-password-confirm"
                                                    type={
                                                        showNewPasswordConfirm
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    className="auth-password-input"
                                                    value={newPasswordConfirm}
                                                    placeholder="새 비밀번호를 다시 입력하세요"
                                                    autoComplete="new-password"
                                                    onChange={(e) => {
                                                        setNewPasswordConfirm(e.target.value);
                                                        clearError("newPasswordConfirm");
                                                    }}
                                                />

                                                <button
                                                    type="button"
                                                    className="auth-password-toggle"
                                                    onClick={() =>
                                                        setShowNewPasswordConfirm((prev) => !prev)
                                                    }
                                                    aria-label={
                                                        showNewPasswordConfirm
                                                            ? "새 비밀번호 확인 숨기기"
                                                            : "새 비밀번호 확인 보기"
                                                    }
                                                    aria-pressed={showNewPasswordConfirm}
                                                >
                                                    <PasswordToggleIcon
                                                        visible={showNewPasswordConfirm}
                                                    />
                                                </button>
                                            </div>

                                            {newPasswordConfirm && isPasswordMatch && (
                                                <p className="auth-message auth-message-info">
                                                    ✓ 비밀번호가 일치합니다.
                                                </p>
                                            )}

                                            {newPasswordConfirm && !isPasswordMatch && (
                                                <p className="auth-message auth-message-error">
                                                    비밀번호가 일치하지 않습니다.
                                                </p>
                                            )}

                                            {errors.newPasswordConfirm && !newPasswordConfirm && (
                                                <p className="auth-message auth-message-error">
                                                    {errors.newPasswordConfirm}
                                                </p>
                                            )}
                                        </div>

                                        <button
                                            type="submit"
                                            className="auth-button auth-button-primary"
                                            disabled={isResetting}
                                        >
                                            {isResetting ? "변경 중..." : "비밀번호 변경"}
                                        </button>
                                    </>
                                )}
                            </form>
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}

export default ForgotPassword;
