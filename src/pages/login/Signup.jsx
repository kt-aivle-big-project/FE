import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/login/LoginCommon.css";
import "../../styles/login/Signup.css";
import { UserIcon, EmailIcon, LockIcon, PasswordToggleIcon } from "../../components/icon";

const API_URL = "http://localhost:8080/api";

/*
 * 백엔드 API가 확정되면 이 부분만 수정
 *
 * 아이디 중복 확인 응답 예시:
 * { "available": true }
 *
 * 이메일 인증 성공 응답 예시:
 * { "verificationToken": "..." }
 */
const AUTH_ENDPOINTS = {
    checkUserid: `${API_URL}/auth/userid/check`,
    sendEmailCode: `${API_URL}/auth/email-verifications/send`,
    verifyEmailCode: `${API_URL}/auth/email-verifications/verify`,
    signup: `${API_URL}/auth/signup`,
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

// JSON 응답과 문자열 응답을 모두 처리  
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

    // 회원 기본 정보  
    const [name, setName] = useState("");
    const [userid, setUserid] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");

    // 아이디 중복 확인  
    const [useridCheck, setUseridCheck] = useState({
        status: "idle",
        message: "",
    });
    const [isCheckingUserid, setIsCheckingUserid] = useState(false);

    // 이메일 인증  
    const [verificationCode, setVerificationCode] = useState("");
    const [verificationToken, setVerificationToken] = useState("");
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isSendingCode, setIsSendingCode] = useState(false);
    const [isVerifyingCode, setIsVerifyingCode] = useState(false);
    const [codeTimeLeft, setCodeTimeLeft] = useState(0);
    const [resendTimeLeft, setResendTimeLeft] = useState(0);

    // 비밀번호 표시 여부  
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

    // 약관 동의  
    const [privacyAgree, setPrivacyAgree] = useState(false);
    const [serviceAgree, setServiceAgree] = useState(false);

    // 모달 및 요청 상태  
    const [termsModal, setTermsModal] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 각 입력 항목 아래에 표시할 오류  
    const [errors, setErrors] = useState({});

    // 입력값 검사 결과  
    const isAllAgreed = privacyAgree && serviceAgree;
    const isEmailVerified = Boolean(verificationToken);
    const isPasswordLengthValid = password.length >= 8 && password.length <= 24;
    const hasSpecialCharacters = [...password].filter((character) =>
        SPECIAL_CHARACTERS.includes(character)
    ).length >= 2;
    const isPasswordMatch = password === passwordConfirm;

    // 인증번호와 재전송 시간을 1초마다 감소  
    useEffect(() => {
        const timer = setInterval(() => {
            setCodeTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
            setResendTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    // 인증번호 유효시간이 끝나면 오류 표시  
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

    // 아이디를 수정하면 기존 중복 확인 결과 초기화  
    const handleUseridChange = (e) => {
        setUserid(e.target.value);
        setUseridCheck({ status: "idle", message: "" });
        setErrors((prev) => ({ ...prev, userid: "" }));
    };

    // 아이디 중복 확인  
    const handleCheckUserid = async () => {
        const normalizedUserid = userid.trim();

        if (!normalizedUserid) {
            setErrors((prev) => ({ ...prev, userid: "아이디를 입력해주세요." }));
            return;
        }

        if (!USERID_PATTERN.test(normalizedUserid)) {
            setErrors((prev) => ({
                ...prev,
                userid: "아이디는 영문, 숫자만 사용할 수 있습니다.",
            }));
            return;
        }

        setErrors((prev) => ({ ...prev, userid: "" }));

        try {
            setIsCheckingUserid(true);
            clearError("userid");
            setUseridCheck({ status: "idle", message: "" });

            const response = await fetch(
                AUTH_ENDPOINTS.checkUserid,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userid: normalizedUserid
                    }),
                });

            const data = await readResponse(response);

            if (!response.ok) {
                throw new Error(data.message || "아이디 중복 확인에 실패했습니다.");
            }

            if (typeof data.available !== "boolean") {
                throw new Error("아이디 중복 확인 응답 형식이 올바르지 않습니다.");
            }

            if (data.available) {
                setUseridCheck({
                    status: "available",
                    message: "사용 가능한 아이디입니다.",
                });
            } else {
                setUseridCheck({
                    status: "duplicate",
                    message: "이미 사용 중인 아이디입니다.",
                });
            }
        } catch (error) {
            console.error("아이디 중복 확인 실패:", error);

        } finally {
            setIsCheckingUserid(false);
        }
    };

    // 이메일 관련 인증 상태 초기화  
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

    // 이메일을 수정하면 기존 인증 결과 초기화  
    const handleEmailChange = (e) => {
        setEmail(e.target.value);
        resetEmailVerification();
    };

    // 인증 완료 후 이메일을 다시 수정할 때 사용  
    const handleChangeVerifiedEmail = () => {
        resetEmailVerification();
    };

    // 이메일 인증번호 발송  
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
                AUTH_ENDPOINTS.sendEmailCode,
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

            // 발송 성공 후 인증번호 입력창과 타이머 표시  
            setIsCodeSent(true);
            setVerificationCode("");
            setVerificationToken("");
            setCodeTimeLeft(CODE_EXPIRATION_SECONDS);
            setResendTimeLeft(RESEND_COOLDOWN_SECONDS);
        } catch (error) {
            console.error("인증번호 발송 실패:", error);

        } finally {
            setIsSendingCode(false);
        }
    };

    // 사용자가 입력한 인증번호 변경  
    const handleVerificationCodeChange = (e) => {
        const code = e.target.value.replace(/\D/g, "").slice(0, 6);

        setVerificationCode(code);
        clearError("verificationCode");
    };

    // 인증번호 확인  
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
                AUTH_ENDPOINTS.verifyEmailCode,
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

            // 토큰이 저장되면 이메일 인증 완료로 처리  
            setVerificationToken(data.verificationToken);
            setCodeTimeLeft(0);
            setResendTimeLeft(0);

        } catch (error) {
            console.error("이메일 인증 실패:", error);
            setVerificationToken("");

        } finally {
            setIsVerifyingCode(false);
        }
    };

    // 모두 동의 체크박스로 필수 약관 전체 변경  
    const handleAllAgree = (e) => {
        const checked = e.target.checked;

        setPrivacyAgree(checked);
        setServiceAgree(checked);
        clearError("agreement");
    };

    // 회원가입 요청 전 전체 입력값 검사  
    const validateSignupForm = () => {
        const nextErrors = {};

        if (!name.trim()) {
            nextErrors.name = "이름을 입력해주세요.";
        }

        if (!userid.trim()) {
            nextErrors.userid = "아이디를 입력해주세요.";
        } else if (!USERID_PATTERN.test(userid.trim())) {
            nextErrors.userid = "아이디는 영문, 숫자만 사용할 수 있습니다.";
        } else if (useridCheck.status !== "available") {
            nextErrors.userid = "아이디 중복 확인을 완료해주세요.";
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

    // 회원가입 요청  
    const handleSignup = async (e) => {
        e.preventDefault();

        if (!validateSignupForm()) return;

        const signupData = {
            name: name.trim(),
            userid: userid.trim(),
            email: email.trim().toLowerCase(),
            password,
            privacyAgreed: privacyAgree,
            emailVerificationToken: verificationToken,
        };

        try {
            setIsSubmitting(true);
            clearError("form");

            const response = await fetch(
                AUTH_ENDPOINTS.signup,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(signupData),
                });

            const data = await readResponse(response);

            if (!response.ok) {
                const allowedFields = [
                    "name",
                    "userid",
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

        } finally {
            setIsSubmitting(false);
        }
    };

    // 약관 모달 내용  
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
                            <p>이름, 아이디, 이메일, 비밀번호</p>
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
        <div className="login-page signup-page">
            <main className="login-card signup-card">
                {/* 로그인 화면으로 돌아가기 */}
                <button
                    type="button"
                    className="login-back-button"
                    onClick={() => navigate("/login")}
                >
                    <span aria-hidden="true">←</span>
                    로그인으로 돌아가기
                </button>

                {/* 회원가입 제목 */}
                <header className="login-header">
                    <h1 className="login-title">회원가입</h1>
                    <p className="login-description">
                        LARO 서비스를 이용할 계정을 만들어주세요.
                    </p>
                </header>

                <section className="login-content">
                    <form className="signup-form" onSubmit={handleSignup}>
                        {/* 회원가입 전체 오류 */}
                        {errors.form && (
                            <p
                                className="signup-verification-message signup-verification-message-error"
                                aria-live="polite"
                            >
                                {errors.form}
                            </p>
                        )}

                        {/* 이름 */}
                        <div className="signup-field">
                            <label htmlFor="name">이름</label>

                            <div className="signup-input-wrapper">
                                <span className="signup-input-icon">
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
                                <p className="signup-password-error">{errors.name}</p>
                            )}
                        </div>

                        {/* 아이디 및 중복 확인 */}
                        <div className="signup-field">
                            <label htmlFor="userid">아이디</label>

                            <div className="signup-verification-row">
                                <div className="signup-input-wrapper signup-verification-input">
                                    <span className="signup-input-icon">
                                        <UserIcon />
                                    </span>

                                    <input
                                        id="userid"
                                        type="text"
                                        value={userid}
                                        placeholder="아이디를 입력하세요"
                                        autoComplete="userid"
                                        disabled={useridCheck.status === "available"}
                                        onChange={handleUseridChange}
                                    />
                                </div>

                                <button
                                    type="button"
                                    className="signup-verification-button"
                                    onClick={handleCheckUserid}
                                    disabled={
                                        isCheckingUserid ||
                                        useridCheck.status === "available"
                                    }
                                >
                                    {isCheckingUserid
                                        ? "확인 중..."
                                        : useridCheck.status === "available"
                                            ? "확인 완료"
                                            : "중복 확인"}
                                </button>
                            </div>

                            {useridCheck.message && (
                                <p
                                    className={`signup-verification-message ${useridCheck.status === "available"
                                        ? "signup-verification-message-success"
                                        : "signup-verification-message-error"
                                        }`}
                                    aria-live="polite"
                                >
                                    {useridCheck.message}
                                </p>
                            )}

                            {errors.userid && (
                                <p className="signup-password-error">{errors.userid}</p>
                            )}
                        </div>

                        {/* 이메일 및 인증번호 발송 */}
                        <div className="signup-field">
                            <label htmlFor="signup-email">이메일</label>

                            <div className="signup-verification-row">
                                <div className="signup-input-wrapper signup-verification-input">
                                    <span className="signup-input-icon">
                                        <EmailIcon />
                                    </span>

                                    <input
                                        id="signup-email"
                                        type="email"
                                        value={email}
                                        placeholder="이메일을 입력하세요"
                                        autoComplete="email"
                                        disabled={isEmailVerified}
                                        onChange={handleEmailChange}
                                    />
                                </div>

                                {isEmailVerified ? (
                                    <button
                                        type="button"
                                        className="signup-verification-button"
                                        onClick={handleChangeVerifiedEmail}
                                    >
                                        이메일 변경
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="signup-verification-button"
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
                                <p className="signup-password-error">{errors.email}</p>
                            )}

                            {/* 인증번호가 발송된 경우에만 표시 */}
                            {isCodeSent && !isEmailVerified && (
                                <div className="signup-verification-area">
                                    <div className="signup-verification-row">
                                        <div className="signup-input-wrapper signup-verification-input">
                                            <input
                                                id="verification-code"
                                                type="text"
                                                className="signup-code-input"
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
                                            className="signup-verification-button"
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

                                    <p className="signup-verification-message signup-verification-message-sent">
                                        입력한 이메일로 인증번호를 발송했습니다. 남은 시간{" "}
                                        {formatTime(codeTimeLeft)}
                                    </p>
                                </div>
                            )}

                            {/* 이메일 인증 완료 */}
                            {isEmailVerified && (
                                <p
                                    className="signup-verification-message signup-verification-message-success"
                                    aria-live="polite"
                                >
                                    이메일 인증이 완료되었습니다.
                                </p>
                            )}

                            {errors.verificationCode && (
                                <p className="signup-password-error">
                                    {errors.verificationCode}
                                </p>
                            )}
                        </div>

                        {/* 비밀번호 */}
                        <div className="signup-field">
                            <label htmlFor="signup-password">비밀번호</label>

                            <div className="signup-input-wrapper">
                                <span className="signup-input-icon">
                                    <LockIcon />
                                </span>

                                <input
                                    id="signup-password"
                                    type={showPassword ? "text" : "password"}
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
                                    className="signup-password-toggle"
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
                                className={`signup-verification-message ${isPasswordLengthValid
                                    ? "signup-verification-message-sent"
                                    : ""
                                    }`}
                            >
                                {isPasswordLengthValid ? "✓" : "○"} 8~24자
                            </p>

                            <p
                                className={`signup-verification-message ${hasSpecialCharacters
                                    ? "signup-verification-message-sent"
                                    : ""
                                    }`}
                            >
                                {hasSpecialCharacters ? "✓" : "○"} 특수문자 2개 이상
                            </p>

                            {errors.password && (
                                <p className="signup-password-error">{errors.password}</p>
                            )}
                        </div>

                        {/* 비밀번호 확인 */}
                        <div className="signup-field">
                            <label htmlFor="password-confirm">비밀번호 확인</label>

                            <div className="signup-input-wrapper">
                                <span className="signup-input-icon">
                                    <LockIcon />
                                </span>

                                <input
                                    id="password-confirm"
                                    type={showPasswordConfirm ? "text" : "password"}
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
                                    className="signup-password-toggle"
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
                                <p className="signup-verification-message signup-verification-message-sent">
                                    ✓ 비밀번호가 일치합니다.
                                </p>
                            )}

                            {passwordConfirm && !isPasswordMatch && (
                                <p className="signup-password-error">
                                    비밀번호가 일치하지 않습니다.
                                </p>
                            )}

                            {errors.passwordConfirm && !passwordConfirm && (
                                <p className="signup-password-error">
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
                                <p className="signup-password-error">
                                    {errors.agreement}
                                </p>
                            )}
                        </section>

                        {/* 회원가입 */}
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