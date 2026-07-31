import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/login/LoginCommon.css";
import "../../styles/login/ForgotPassword.css";
import { UserIcon, EmailIcon, LockIcon, PasswordToggleIcon } from "../../components/icon";

const API_URL = "http://localhost:8080/api";

/*
 * 백엔드 API가 확정되면 이 부분만 수정
 *
 * 인증번호 확인 성공 응답 예시:
 * { "resetToken": "..." }
 */
const PASSWORD_RESET_ENDPOINTS = {
    sendCode: `${API_URL}/auth/password-reset/email/send`,
    verifyCode: `${API_URL}/auth/password-reset/email/verify`,
    resetPassword: `${API_URL}/auth/password-reset`,
};

const USERID_PATTERN = /^[a-zA-Z0-9]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?";

const CODE_EXPIRATION_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

// 초 단위를 04:59 형식으로 변환
const formatTime = (seconds) => {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
    const remainingSeconds = String(seconds % 60).padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
};

// JSON 응답과 문자열 응답을 JSON 응답과 문자열 응답을 모두 처리
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

    // 회원 정보
    const [userid, setUserid] = useState("");
    const [email, setEmail] = useState("");

    // 이메일 인증
    const [verificationCode, setVerificationCode] = useState("");
    const [resetToken, setResetToken] = useState("");
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);
    const [codeTimeLeft, setCodeTimeLeft] = useState(0);
    const [resendTimeLeft, setResendTimeLeft] = useState(0);

    // 새 비밀번호
    const [newPassword, setNewPassword] = useState("");
    const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);

    // 요청 상태
    const [isResetting, setIsResetting] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [errors, setErrors] = useState({});

    // 입력값 검사 결과
    const isEmailVerified = Boolean(resetToken);
    const isPasswordLengthValid = newPassword.length >= 8 && newPassword.length <= 24;
    const hasSpecialCharacter = [...newPassword].some((character) =>
        SPECIAL_CHARACTERS.includes(character)
    ).length >= 2;
    const isPasswordMatch = newPassword === newPasswordConfirm;

    // 인증번호와 재전송 시간을 1초마다 감소
    useEffect(() => {
        const timer = setInterval(() => {
            setCodeTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
            setResendTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    // 인증번호가 만료되면 오류 표시
    useEffect(() => {
        if (!isCodeSent || isEmailVerified || codeTimeLeft !== 0) return;

        setErrors((prev) => ({
            ...prev,
            verificationCode: "인증번호가 만료되었습니다. 인증번호를 재전송해주세요.",
        }));
    }, [codeTimeLeft, isCodeSent, isEmailVerified]);

    // 특정 입력 항목의 오류 제거
    const clearError = (field) => {
        setErrors((prev) => ({ ...prev, [field]: "" }));
    };

    // 회원 정보가 바뀌면 기존 인증 결과 초기화
    const resetVerification = () => {
        setVerificationCode("");
        setResetToken("");
        setIsCodeSent(false);
        setCodeTimeLeft(0);
        setResendTimeLeft(0);

        setErrors((prev) => ({
            ...prev,
            userid: "",
            email: "",
            verificationCode: "",
        }));
    };

    const handleUseridChange = (e) => {
        setUserid(e.target.value);
        resetVerification();
    };

    const handleEmailChange = (e) => {
        setEmail(e.target.value);
        resetVerification();
    };

    // 인증 완료 후 아이디와 이메일을 다시 수정
    const handleChangeAccountInfo = () => {
        resetVerification();
    };

    // 비밀번호 재설정 인증번호 발송
    const handleSendCode = async () => {
        const normalizedUserid = userid.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedUserid) {
            setErrors((prev) => ({ ...prev, userid: "아이디를 입력해주세요." }));
            return;
        }

        if (!USERID_PATTERN.test(normalizedUserid)) {
            setErrors((prev) => ({
                ...prev,
                userid: "아이디는 영문과 숫자만 사용할 수 있습니다.",
            }));
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
                userid: "",
                email: "",
                verificationCode: "",
                form: "",
            }));

            const response = await fetch(PASSWORD_RESET_ENDPOINTS.sendCode, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userid: normalizedUserid,
                    email: normalizedEmail,
                }),
            });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "인증번호 발송에 실패했습니다.");
            }

            // 발송 성공 후 인증번호 입력창과 타이머 표시
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

    // 인증번호는 숫자 6자리만 입력
    const handleVerificationCodeChange = (e) => {
        const code = e.target.value.replace(/\D/g, "").slice(0, 6);
        setVerificationCode(code);
        clearError("verificationCode");
    };

    // 인증번호 확인
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
                    userid: userid.trim(),
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

            // 토큰이 저장되면 새 비밀번호 입력 영역 표시
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

    // 새 비밀번호 입력값 검사
    const validateNewPassword = () => {
        const nextErrors = {};

        if (!isEmailVerified) {
            nextErrors.form = "이메일 인증을 완료해주세요.";
        }

        if (!newPassword) {
            nextErrors.newPassword = "새 비밀번호를 입력해주세요.";
        } else if (!isPasswordLengthValid) {
            nextErrors.newPassword = "비밀번호는 8자 이상 24자 이하로 입력해주세요.";
        } else if (!hasSpecialCharacter) {
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

    // 새 비밀번호로 변경
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
        <div className="login-page password-reset-page">
            <main className="login-card password-reset-card">
                {/* 비밀번호 변경 완료 화면 */}
                {isCompleted ? (
                    <>
                        <header className="login-header">
                            <div className="password-reset-complete-icon" aria-hidden="true">
                                ✓
                            </div>

                            <h1 className="login-title">비밀번호 변경 완료</h1>
                            <p className="login-description">
                                새로운 비밀번호로 로그인해주세요.
                            </p>
                        </header>

                        <section className="login-content">
                            <button
                                type="button"
                                className="login-button login-button-primary"
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
                            className="login-back-button"
                            onClick={() => navigate("/login")}
                        >
                            <span aria-hidden="true">←</span>
                            로그인으로 돌아가기
                        </button>

                        <header className="login-header">
                            <h1 className="login-title">비밀번호 찾기</h1>
                            <p className="login-description">
                                가입한 아이디와 이메일을 인증한 후 새 비밀번호를 설정해주세요.
                            </p>
                        </header>

                        <section className="login-content">
                            <form className="login-form" onSubmit={handleResetPassword}>
                                {/* 전체 요청 오류 */}
                                {errors.form && (
                                    <p
                                        className="login-field-message login-field-message-error"
                                        aria-live="polite"
                                    >
                                        {errors.form}
                                    </p>
                                )}

                                {/* 아이디 */}
                                <div className="login-field">
                                    <label htmlFor="password-reset-userid">아이디</label>

                                    <div className="login-input-wrapper">
                                        <span className="login-input-icon">
                                            <UserIcon />
                                        </span>

                                        <input
                                            id="password-reset-userid"
                                            type="text"
                                            value={userid}
                                            placeholder="아이디를 입력하세요"
                                            autoComplete="userid"
                                            disabled={isEmailVerified}
                                            onChange={handleUseridChange}
                                        />
                                    </div>

                                    {errors.userid && (
                                        <p className="login-field-message login-field-message-error">
                                            {errors.userid}
                                        </p>
                                    )}
                                </div>

                                {/* 이메일 및 인증번호 발송 */}
                                <div className="login-field">
                                    <label htmlFor="password-reset-email">이메일</label>

                                    <div className="login-action-row">
                                        <div className="login-input-wrapper">
                                            <span className="login-input-icon">
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
                                                className="login-button login-button-secondary login-action-button"
                                                onClick={handleChangeAccountInfo}
                                            >
                                                정보 변경
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="login-button login-button-secondary login-action-button"
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
                                        <p className="login-field-message login-field-message-error">
                                            {errors.email}
                                        </p>
                                    )}
                                </div>

                                {/* 인증번호 발송 후 표시 */}
                                {isCodeSent && !isEmailVerified && (
                                    <div className="login-field">
                                        <label htmlFor="password-reset-code">인증번호</label>

                                        <div className="login-action-row">
                                            <div className="login-input-wrapper">
                                                <input
                                                    id="password-reset-code"
                                                    type="text"
                                                    className="password-reset-code-input"
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
                                                className="login-button login-button-secondary login-action-button"
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

                                        <p className="login-field-message login-field-message-info">
                                            인증번호를 발송했습니다. 남은 시간 {formatTime(codeTimeLeft)}
                                        </p>

                                        {errors.verificationCode && (
                                            <p className="login-field-message login-field-message-error">
                                                {errors.verificationCode}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* 이메일 인증 완료 */}
                                {isEmailVerified && (
                                    <p
                                        className="login-field-message login-field-message-success"
                                        aria-live="polite"
                                    >
                                        ✓ 이메일 인증이 완료되었습니다.
                                    </p>
                                )}

                                {/* 인증 완료 후 새 비밀번호 표시 */}
                                {isEmailVerified && (
                                    <>
                                        <div className="password-reset-divider" />

                                        <div className="login-field">
                                            <label htmlFor="new-password">새 비밀번호</label>

                                            <div className="login-input-wrapper">
                                                <span className="login-input-icon">
                                                    <LockIcon />
                                                </span>

                                                <input
                                                    id="new-password"
                                                    type={showNewPassword ? "text" : "password"}
                                                    className="password-reset-password-input"
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
                                                    className="login-password-toggle"
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
                                                className={`login-field-message ${
                                                    isPasswordLengthValid
                                                        ? "login-field-message-info"
                                                        : ""
                                                }`}
                                            >
                                                {isPasswordLengthValid ? "✓" : "○"} 8~16자
                                            </p>

                                            <p
                                                className={`login-field-message ${
                                                    hasSpecialCharacter
                                                        ? "login-field-message-info"
                                                        : ""
                                                }`}
                                            >
                                                {hasSpecialCharacter ? "✓" : "○"} 특수문자 1개 이상
                                            </p>

                                            {errors.newPassword && (
                                                <p className="login-field-message login-field-message-error">
                                                    {errors.newPassword}
                                                </p>
                                            )}
                                        </div>

                                        <div className="login-field">
                                            <label htmlFor="new-password-confirm">
                                                새 비밀번호 확인
                                            </label>

                                            <div className="login-input-wrapper">
                                                <span className="login-input-icon">
                                                    <LockIcon />
                                                </span>

                                                <input
                                                    id="new-password-confirm"
                                                    type={
                                                        showNewPasswordConfirm
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    className="password-reset-password-input"
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
                                                    className="login-password-toggle"
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
                                                <p className="login-field-message login-field-message-info">
                                                    ✓ 비밀번호가 일치합니다.
                                                </p>
                                            )}

                                            {newPasswordConfirm && !isPasswordMatch && (
                                                <p className="login-field-message login-field-message-error">
                                                    비밀번호가 일치하지 않습니다.
                                                </p>
                                            )}

                                            {errors.newPasswordConfirm && !newPasswordConfirm && (
                                                <p className="login-field-message login-field-message-error">
                                                    {errors.newPasswordConfirm}
                                                </p>
                                            )}
                                        </div>

                                        <button
                                            type="submit"
                                            className="login-button login-button-primary"
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