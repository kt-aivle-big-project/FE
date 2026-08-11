import { useEffect, useState } from "react";
import "../../styles/common/Footer.css";

const PRIVACY_POLICY = [
    {
        title: "제1조 (총칙)",
        content: (
            <>
                <p>
                    LARO(이하 "회사")는 보주체의 자유와 권리 보호를 위하여 「개인정보 보호법」 및 관계 법령을 준수하며, 개인정보를 적법하고 안전하게 처리합니다.
                </p>
                <p>
                    회사는 개인정보 처리에 관한 기준과 절차를 명확히 안내하고, 개인정보와 관련한 고충을 신속하고 원활하게 처리하기 위하여 본 개인정보처리방침을 수립·공개합니다.
                </p>
            </>
        ),
    },
    {
        title: "제2조 (개인정보의 처리 목적, 수집 항목 및 보유기간)",
        content: (
            <>
                <p>
                    회사는 다음의 목적을 위하여 최소한의 개인정보만을 수집·이용합니다.
                </p>

                <div className="footer-policy-table-wrap">
                    <table className="footer-policy-table">
                        <thead>
                            <tr>
                                <th>처리 목적</th>
                                <th>수집 항목</th>
                                <th>보유 및 이용기간</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>회원 식별 및 로그인 서비스 제공</td>
                                <td>이메일 주소</td>
                                <td>회원 탈퇴 시까지</td>
                            </tr>
                            <tr>
                                <td>회원 정보 및 계정 관리</td>
                                <td>이름, 이메일 주소</td>
                                <td>회원 탈퇴 시까지</td>
                            </tr>
                            <tr>
                                <td>이메일 인증 및 계정 확인</td>
                                <td>이메일 주소</td>
                                <td>회원 탈퇴 시까지</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <p>
                    회사는 개인정보를 위 목적 이외의 용도로 이용하지 않으며, 처리 목적이 변경되는 경우 「개인정보 보호법」에 따라 별도의 동의를 받습니다.
                </p>
            </>
        ),
    },
    {
        title: "제3조 (개인정보의 파기 절차 및 방법)",
        content: (
            <>
                <p>
                    회사는 개인정보 보유기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 해당 개인정보를 파기합니다.
                </p>
                <ul>
                    <li>파기 절차: 처리 목적이 달성되거나 보유기간이 종료된 개인정보를 확인한 후 파기합니다.</li>
                    <li>파기 방법: 전자적 파일 형태의 개인정보는 복구할 수 없는 방법으로 영구 삭제합니다.</li>
                </ul>
            </>
        ),
    },
    {
        title: "제4조 (개인정보의 제3자 제공)",
        content: (
            <>
                <p>
                    운영팀은 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.
                </p>
                <p>
                    다만, 법령에 특별한 규정이 있는 경우에 한하여 예외적으로 제공할 수 있습니다.
                </p>
            </>
        ),
    },
    {
        title: "제5조 (개인정보 처리의 위탁)",
        content: (
            <>
                <p>
                    회사는 개인정보 처리와 관련하여 외부에 개인정보 처리업무를 위탁하지 않습니다.
                </p>
                <p>
                    향후 개인정보 처리업무의 위탁이 발생하는 경우, 관련 법령에 따라 위탁 사실을 공개하고 필요한 사항을 안내하겠습니다.
                </p>
            </>
        ),
    },
    {
        title: "제6조 (정보주체의 권리·의무 및 행사방법)",
        content: (
            <>
                <p>
                    정보주체는 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.
                </p>
                <p>
                    권리 행사는 서면 또는 전자우편을 통해 가능하며, 회사는 지체 없이 조치합니다.
                </p>
                <p>
                    회사는 요청자가 본인 또는 정당한 대리인인지 확인할 수 있습니다.
                </p>
            </>
        ),
    },
    {
        title: "제7조 (개인정보의 안전성 확보조치)",
        content: (
            <>
                <p>운영팀은 개인정보를 안전하게 관리하기 위하여 다음과 같은 보호조치를 시행합니다.</p>
                <ul>
                    <li>관리적 조치: 개인정보 접근 인원 최소화 및 내부 관리 절차 운영</li>
                    <li>기술적 조치: 접근권한 관리 및 계정 보호 조치</li>
                    <li>물리적 조치: 개인정보 접근 통제</li>
                </ul>
            </>
        ),
    },
    {
        title: "제8조 (개인정보 보호책임자)",
        content: (
            <>
                <div className="footer-policy-table-wrap">
                    <table className="footer-policy-table footer-policy-contact-table">
                        <tbody>
                            <tr>
                                <th>담당 부서</th>
                                <td>KT 인재실</td>
                            </tr>
                            <tr>
                                <th>이메일</th>
                                <td>KTAIVLE@kt.com</td>
                            </tr>
                            <tr>
                                <th>전화번호</th>
                                <td>02-3495-5050</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </>
        ),
    },
    {
        title: "제9조 (권익침해 구제방법)",
        content: (
            <>
                <p>
                    정보주체는 개인정보 침해로 인한 피해 구제를 위하여 아래 기관에 상담 또는 분쟁조정을 신청할 수 있습니다.                </p>
                <ul>
                    <li>개인정보분쟁조정위원회: https://www.kopico.go.kr</li>
                    <li>개인정보침해신고센터: https://privacy.kisa.or.kr</li>
                </ul>
            </>
        ),
    },
    {
        title: "제10조 (개인정보처리방침의 고지)",
        content: (
            <p>
                본 개인정보처리방침은 2026. 8. 10부터 적용됩니다.
            </p>
        ),
    },
];

function PolicyModal({ onClose }) {
    const title = "개인정보처리방침";
    const description = "LARO의 개인정보 처리 및 보호에 관한 사항을 안내합니다.";

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    return (
        <div
            className="footer-modal-overlay"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <section
                className="footer-policy-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="footer-policy-title"
            >
                <header className="footer-policy-header">
                    <div>
                        <h2 id="footer-policy-title">{title}</h2>
                        <p>{description}</p>
                    </div>

                    <button
                        type="button"
                        className="footer-policy-close-icon"
                        onClick={onClose}
                        aria-label={`${title} 닫기`}
                    >
                        ×
                    </button>
                </header>

                <div className="footer-policy-content">
                    {PRIVACY_POLICY.map((section) => (
                        <section className="footer-policy-section" key={section.title}>
                            <h3>{section.title}</h3>
                            {section.content}
                        </section>
                    ))}
                </div>
            </section>
        </div>
    );
}

export default function Footer() {
    const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

    return (
        <>
            <footer className="app-footer">
                <div className="app-footer-brand">
                    <strong className="app-footer-logo">LARO</strong>
                    <span className="app-footer-description">
                        Digital Twin 기반 자율 창고 운영 시스템
                    </span>
                </div>

                <div className="app-footer-meta">
                    <div className="app-footer-links">
                        <button
                            type="button"
                            onClick={() => setIsPrivacyOpen(true)}
                        >
                            개인정보처리방침
                        </button>
                    </div>

                    <span className="app-footer-copyright">
                        © 2026 KT AIVLE School. All rights reserved.
                    </span>
                </div>
            </footer>

            {isPrivacyOpen && (
                <PolicyModal onClose={() => setIsPrivacyOpen(false)} />
            )}
        </>
    );
}
