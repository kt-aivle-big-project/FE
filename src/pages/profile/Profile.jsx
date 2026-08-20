import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { userAccountApi } from "../../api/client";
import { clearAuth } from "../../api/auth";
import "../../styles/profile/Profile.css";

const INITIAL_PROFILE = {
    name: "",
    email: "",
    createdAt: "-",
};

const maskName = (value) => {
    const characters = Array.from(String(value ?? "").trim());

    if (characters.length === 0) return "사용자";
    if (characters.length === 1) return "*";
    if (characters.length === 2) return `${characters[0]}*`;

    return `${characters[0]}${"*".repeat(characters.length - 2)}${characters.at(-1)}`;
};

const maskEmail = (email) => {
    const value = String(email ?? "").trim();
    const atIndex = value.lastIndexOf("@");

    if (atIndex <= 0 || atIndex === value.length - 1) {
        return value;
    }

    const local = value.slice(0, atIndex);
    const domain = value.slice(atIndex + 1);

    if (local.length === 1) {
        return `${local[0]}***@${domain}`;
    }

    const visibleLength = Math.min(2, local.length);
    const visible = local.slice(0, visibleLength);
    const maskedLength = Math.max(local.length - visibleLength, 3);

    return `${visible}${"*".repeat(maskedLength)}@${domain}`;
};

function Profile() {
    const navigate = useNavigate();

    const [profile, setProfile] = useState(INITIAL_PROFILE);
    const [name, setName] = useState(profile.name);

    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");

    const profileInitial =
        profile.name?.trim().charAt(0).toUpperCase() || "U";

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const data = await userAccountApi.getProfile();
                setProfile((prev) => ({ ...prev, ...data }));
                setName(data.name ?? "");
            } catch {
                console.error("사용자 정보 조회 실패");
                alert("사용자 정보를 불러오지 못했습니다.");
            }
        };
        fetchProfile();
    }, []);

    const handleNameChange = (event) => {
        setName(event.target.value);
    };

    const handleProfileSubmit = async (event) => {
        event.preventDefault();

        const trimmedName = name.trim();

        if (!trimmedName) {
            alert("이름을 입력해주세요.");
            return;
        }

        try {
            const updatedProfile = await userAccountApi.updateProfile(trimmedName);
            setProfile((prev) => ({ ...prev, ...updatedProfile }));
            alert("사용자 정보가 수정되었습니다.");
        } catch {
            console.error("사용자 정보 수정 실패");
            alert("사용자 정보 수정에 실패했습니다.");
        }
    };

    const handlePasswordChange = (event) => {
        const { name: fieldName, value } = event.target;

        setPasswordForm((prev) => ({
            ...prev,
            [fieldName]: value,
        }));
    };

    const handlePasswordSubmit = async (event) => {
        event.preventDefault();

        const {
            currentPassword,
            newPassword,
            confirmPassword,
        } = passwordForm;

        if (!currentPassword || !newPassword || !confirmPassword) {
            alert("비밀번호를 모두 입력해주세요.");
            return;
        }

        if (newPassword !== confirmPassword) {
            alert("새 비밀번호가 일치하지 않습니다.");
            return;
        }

        if (currentPassword === newPassword) {
            alert("현재 비밀번호와 다른 비밀번호를 입력해주세요.");
            return;
        }

        try {
            await userAccountApi.changePassword(currentPassword, newPassword);
            alert("비밀번호가 변경되었습니다.");
        } catch {
            console.error("비밀번호 변경 실패");
            alert("비밀번호 변경에 실패했습니다.");
        } finally {
            setPasswordForm({
                currentPassword: "",
                newPassword: "",
                confirmPassword: "",
            });
        }
    };

    const openDeleteModal = () => {
        setDeletePassword("");
        setIsDeleteModalOpen(true);
    };

    const closeDeleteModal = () => {
        setDeletePassword("");
        setIsDeleteModalOpen(false);
    };

    const handleDeleteAccount = async () => {
        if (!deletePassword) {
            alert("현재 비밀번호를 입력해주세요.");
            return;
        }

        try {
            await userAccountApi.withdraw(deletePassword);
            clearAuth();
            alert("회원 탈퇴가 완료되었습니다.");
            navigate("/login", { replace: true });
        } catch {
            console.error("회원 탈퇴 실패");
            alert("회원 탈퇴에 실패했습니다.");
        } finally {
            setDeletePassword("");
        }
    };

    return (
        <main className="profile-page">
            <header className="profile-header">
                <div>
                    <h1 className="profile-title">내 프로필</h1>
                    <p className="profile-description">
                        계정 정보와 보안 설정을 관리합니다.
                    </p>
                </div>
            </header>

            <div className="profile-content">
                {/* 기본 정보 */}
                <section className="profile-section">
                    <div className="profile-section-header">
                        <div>
                            <h2>기본 정보</h2>
                            <p>현재 계정의 기본 정보를 확인하고 수정합니다.</p>
                        </div>
                    </div>

                    <div className="profile-summary">
                        <div className="profile-avatar" aria-hidden="true">
                            {profileInitial}
                        </div>

                        <div className="profile-summary-info">
                            <strong>{maskName(profile.name)}</strong>
                            <span>{maskEmail(profile.email)}</span>
                        </div>
                    </div>

                    <form
                        className="profile-form"
                        onSubmit={handleProfileSubmit}
                    >
                        <div className="profile-field">
                            <label htmlFor="profile-name">이름</label>

                            <input
                                id="profile-name"
                                type="text"
                                value={name}
                                onChange={handleNameChange}
                                maxLength={30}
                            />
                        </div>

                        <div className="profile-field">
                            <label htmlFor="profile-email">이메일</label>

                            <div className="profile-field-content">
                                <input
                                    id="profile-email"
                                    type="text"
                                    value={maskEmail(profile.email)}
                                    disabled
                                />

                                <small>
                                    로그인에 사용되는 이메일은 변경할 수 없습니다.
                                </small>
                            </div>
                        </div>

                        <div className="profile-field">
                            <span className="profile-field-label">가입일</span>

                            <div className="profile-static-value">
                                {profile.createdAt}
                            </div>
                        </div>

                        <div className="profile-actions">
                            <button
                                type="submit"
                                className="profile-button profile-button-primary"
                            >
                                정보 수정
                            </button>
                        </div>
                    </form>
                </section>

                {/* 비밀번호 변경 */}
                <section className="profile-section">
                    <div className="profile-section-header">
                        <div>
                            <h2>비밀번호 변경</h2>
                            <p>
                                계정 보안을 위해 안전한 비밀번호를 사용해주세요.
                            </p>
                        </div>
                    </div>

                    <form
                        className="profile-form"
                        onSubmit={handlePasswordSubmit}
                    >
                        <div className="profile-field">
                            <label htmlFor="current-password">
                                현재 비밀번호
                            </label>

                            <input
                                id="current-password"
                                name="currentPassword"
                                type="password"
                                value={passwordForm.currentPassword}
                                onChange={handlePasswordChange}
                                autoComplete="current-password"
                                placeholder="현재 비밀번호를 입력하세요"
                            />
                        </div>

                        <div className="profile-field">
                            <label htmlFor="new-password">
                                새 비밀번호
                            </label>

                            <input
                                id="new-password"
                                name="newPassword"
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={handlePasswordChange}
                                autoComplete="new-password"
                                placeholder="새 비밀번호를 입력하세요"
                            />
                        </div>

                        <div className="profile-field">
                            <label htmlFor="confirm-password">
                                새 비밀번호 확인
                            </label>

                            <input
                                id="confirm-password"
                                name="confirmPassword"
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={handlePasswordChange}
                                autoComplete="new-password"
                                placeholder="새 비밀번호를 다시 입력하세요"
                            />
                        </div>

                        <div className="profile-actions">
                            <button
                                type="submit"
                                className="profile-button profile-button-primary"
                            >
                                비밀번호 변경
                            </button>
                        </div>
                    </form>
                </section>

                {/* 계정 관리 */}
                <section className="profile-section profile-danger-section">
                    <div className="profile-danger-content">
                        <div>
                            <h2>회원 탈퇴</h2>
                            <p>
                                탈퇴 후에는 계정을 사용할 수 없으며 삭제된 계정은 복구할 수 없습니다.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="profile-button profile-button-danger"
                            onClick={openDeleteModal}
                        >
                            회원 탈퇴
                        </button>
                    </div>
                </section>
            </div>

            {/* 회원 탈퇴 확인 모달 */}
            {isDeleteModalOpen && (
                <div
                    className="profile-modal-backdrop"
                    onMouseDown={closeDeleteModal}
                >
                    <div
                        className="profile-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-account-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="profile-modal-header">
                            <h2 id="delete-account-title">회원 탈퇴</h2>

                            <button
                                type="button"
                                className="profile-modal-close"
                                onClick={closeDeleteModal}
                                aria-label="회원 탈퇴 창 닫기"
                            >
                                ×
                            </button>
                        </div>

                        <div className="profile-modal-body">
                            <p className="profile-modal-warning">
                                정말 계정을 탈퇴하시겠습니까?
                            </p>

                            <p className="profile-modal-description">
                                탈퇴 후에는 계정을 복구할 수 없습니다.
                                계속하려면 현재 비밀번호를 입력해주세요.
                            </p>

                            <div className="profile-modal-field">
                                <label htmlFor="delete-password">
                                    현재 비밀번호
                                </label>

                                <input
                                    id="delete-password"
                                    type="password"
                                    value={deletePassword}
                                    onChange={(event) =>
                                        setDeletePassword(event.target.value)
                                    }
                                    autoComplete="current-password"
                                    placeholder="현재 비밀번호를 입력하세요"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="profile-modal-actions">
                            <button
                                type="button"
                                className="profile-button profile-button-secondary"
                                onClick={closeDeleteModal}
                            >
                                취소
                            </button>

                            <button
                                type="button"
                                className="profile-button profile-button-danger"
                                onClick={handleDeleteAccount}
                            >
                                회원 탈퇴
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

export default Profile;
