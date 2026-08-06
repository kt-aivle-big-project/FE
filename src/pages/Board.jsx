import { useMemo, useState } from "react";
import "../styles/board.css";

const BOARD_TABS = [
    { id: "notice", label: "공지사항" },
    { id: "manual", label: "사용 매뉴얼" },
];

/**
 * 공지사항.
 *
 * 관리자가 사용자에게 알리는 글이라 화면에서 추가·수정·삭제하지 않는다.
 * 그래서 DB 가 아니라 여기서 관리한다. 공지를 바꾸려면 이 배열을 고친다.
 *
 * pinned 를 true 로 두면 번호 대신 "공지"로 표시된다.
 */
const NOTICES = [
    {
        id: 1,
        category: "필독",
        title: "LARO 서비스 이용 안내",
        author: "관리자",
        date: "2026.08.05",
        pinned: true,
        content:
            "LARO는 창고 운영, 로봇 관리, 시뮬레이션 및 작업 최적화를 지원하는 서비스입니다. 서비스 이용 전 창고와 로봇 정보를 먼저 등록해 주세요.",
    },
    {
        id: 2,
        category: "업데이트",
        title: "AI 시뮬레이션 기능 업데이트 안내",
        author: "관리자",
        date: "2026.08.04",
        pinned: true,
        content:
            "AI 계획 생성, 작업 배정, 충돌 검증 및 재계획 기능이 업데이트되었습니다. 시뮬레이션 메뉴에서 확인할 수 있습니다.",
    },
    {
        id: 3,
        category: "점검",
        title: "정기 점검 예정 안내",
        author: "관리자",
        date: "2026.08.01",
        pinned: false,
        content:
            "서비스 안정화를 위한 정기 점검이 예정되어 있습니다. 점검 시간에는 일부 기능 이용이 제한될 수 있습니다.",
    },
    {
        id: 4,
        category: "안내",
        title: "창고 설계 데이터 등록 방법",
        author: "관리자",
        date: "2026.07.30",
        pinned: false,
        content:
            "창고 메뉴에서 창고를 생성한 뒤 노드, 통로, 랙, 입출고장 및 충전소 정보를 등록할 수 있습니다.",
    },
];

const MANUALS = [
    {
        id: 1,
        title: "시뮬레이션 시작",
        description:
            "창고와 로봇을 선택하고 시뮬레이션을 실행하는 방법입니다.",
        steps: [
            "시뮬레이션 메뉴로 이동합니다.",
            "실행할 창고를 선택합니다.",
            "작업 또는 자연어 명령을 입력합니다.",
            "계획 생성 결과를 확인한 뒤 시작 버튼을 누릅니다.",
        ],
    },
    {
        id: 2,
        title: "창고 등록 및 수정",
        description:
            "창고 지도와 시설 정보를 등록하고 수정하는 방법입니다.",
        steps: [
            "창고 메뉴에서 신규 창고 등록을 선택합니다.",
            "창고명과 기본 정보를 입력합니다.",
            "랙, 통로, 충전소, 입고장과 출고장을 배치합니다.",
            "저장 후 지도 검증 결과를 확인합니다.",
        ],
    },
    {
        id: 3,
        title: "로봇 관리",
        description:
            "로봇 상태와 배터리, 현재 위치를 확인하는 방법입니다.",
        steps: [
            "로봇 메뉴로 이동합니다.",
            "대상 창고를 선택합니다.",
            "로봇 상태, 배터리와 현재 작업을 확인합니다.",
            "고장 또는 충전이 필요한 로봇을 점검합니다.",
        ],
    },
    {
        id: 4,
        title: "재계획 실행",
        description:
            "고장이나 장애물 발생 시 계획을 다시 생성하는 방법입니다.",
        steps: [
            "시뮬레이션 이벤트에서 문제 상황을 확인합니다.",
            "재계획 버튼을 선택합니다.",
            "변경된 로봇 배정과 경로를 검토합니다.",
            "검증 통과 후 재계획을 적용합니다.",
        ],
    },
];

function Board() {
    const [activeTab, setActiveTab] = useState("notice");
    const [keyword, setKeyword] = useState("");
    const [selectedNotice, setSelectedNotice] = useState(null);

    const filteredNotices = useMemo(() => {
        const normalizedKeyword = keyword.trim().toLowerCase();

        if (!normalizedKeyword) {
            return NOTICES;
        }

        return NOTICES.filter((notice) =>
            `${notice.category} ${notice.title} ${notice.author}`
                .toLowerCase()
                .includes(normalizedKeyword)
        );
    }, [keyword]);

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        setSelectedNotice(null);
    };

    return (
        <section className="board-page">
            <header className="board-page-header">
                <div>
                    <p className="board-eyebrow">LARO SUPPORT</p>
                    <h1>지원센터</h1>
                    <p>
                        공지사항과 사용 매뉴얼을 확인할 수 있습니다.
                    </p>
                </div>
            </header>

            <div
                className="board-tabs"
                role="tablist"
                aria-label="지원센터 메뉴"
            >
                {BOARD_TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        className={`board-tab ${
                            activeTab === tab.id ? "is-active" : ""
                        }`}
                        onClick={() => handleTabChange(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "notice" && (
                <div className="board-panel">
                    {selectedNotice ? (
                        <article className="notice-detail">
                            <div className="notice-detail-heading">
                                <div>
                                    <span className="notice-category">
                                        {selectedNotice.category}
                                    </span>

                                    <h2>{selectedNotice.title}</h2>

                                    <p>
                                        {selectedNotice.author} ·{" "}
                                        {selectedNotice.date}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    className="board-secondary-button"
                                    onClick={() =>
                                        setSelectedNotice(null)
                                    }
                                >
                                    목록으로
                                </button>
                            </div>

                            <div className="notice-detail-content">
                                {selectedNotice.content}
                            </div>
                        </article>
                    ) : (
                        <>
                            <div className="board-toolbar">
                                <div>
                                    <h2>공지사항</h2>
                                    <p>
                                        서비스 주요 소식과 점검 내용을
                                        확인합니다.
                                    </p>
                                </div>

                                <label className="board-search">
                                    <span className="sr-only">
                                        공지사항 검색
                                    </span>

                                    <input
                                        type="search"
                                        value={keyword}
                                        onChange={(event) =>
                                            setKeyword(event.target.value)
                                        }
                                        placeholder="제목 또는 분류 검색"
                                    />
                                </label>
                            </div>

                            <div className="board-table-wrapper">
                                <table className="board-table">
                                    <thead>
                                        <tr>
                                            <th>번호</th>
                                            <th>분류</th>
                                            <th>제목</th>
                                            <th>작성자</th>
                                            <th>작성일</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {filteredNotices.length > 0 ? (
                                            filteredNotices.map(
                                                (notice) => (
                                                    <tr key={notice.id}>
                                                        <td>
                                                            {notice.pinned
                                                                ? "공지"
                                                                : notice.id}
                                                        </td>

                                                        <td>
                                                            <span className="notice-category">
                                                                {
                                                                    notice.category
                                                                }
                                                            </span>
                                                        </td>

                                                        <td className="board-title-cell">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setSelectedNotice(
                                                                        notice
                                                                    )
                                                                }
                                                            >
                                                                {
                                                                    notice.title
                                                                }
                                                            </button>
                                                        </td>

                                                        <td>
                                                            {notice.author}
                                                        </td>

                                                        <td>
                                                            {notice.date}
                                                        </td>
                                                    </tr>
                                                )
                                            )
                                        ) : (
                                            <tr>
                                                <td
                                                    className="board-empty"
                                                    colSpan="5"
                                                >
                                                    검색 결과가 없습니다.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === "manual" && (
                <div className="board-panel">
                    <div className="board-toolbar">
                        <div>
                            <h2>사용 매뉴얼</h2>
                            <p>
                                주요 기능별 이용 순서를 확인합니다.
                            </p>
                        </div>
                    </div>

                    <div className="manual-grid">
                        {MANUALS.map((manual) => (
                            <article
                                className="manual-card"
                                key={manual.id}
                            >
                                <span className="manual-number">
                                    {String(manual.id).padStart(2, "0")}
                                </span>

                                <h3>{manual.title}</h3>
                                <p>{manual.description}</p>

                                <ol>
                                    {manual.steps.map((step, index) => (
                                        <li key={step}>
                                            <span>{index + 1}</span>
                                            {step}
                                        </li>
                                    ))}
                                </ol>
                            </article>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

export default Board;
