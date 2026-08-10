import { useEffect, useMemo, useState } from "react";
import ScenarioDetail from "./ScenarioDetail";
import ScenarioCreatePanel from "./ScenarioCreatePanel";
import { scenarioApi } from "../../api/client";
import "../../styles/scenario/Scenario.css";

// 상태 옵션
const STATUS_OPTIONS = [
    { value: "ALL", label: "전체 상태" },
    { value: "DRAFT", label: "초안" },
    { value: "VALIDATING", label: "검증 중" },
    { value: "VALIDATED", label: "검증 완료" },
];

// 사용자가 직접 변경할 수 있는 시나리오 상태
const SCENARIO_STATUS_OPTIONS = STATUS_OPTIONS.filter(
    (option) => option.value !== "ALL"
);

// 정렬 옵션
const SORT_OPTIONS = [
    { value: "UPDATED_DESC", label: "최근 수정 순" },
    { value: "UPDATED_ASC", label: "오래된 수정 순" },
];

const PAGE_SIZE = 10;

// 시나리오 상태 표시 정보
const SCENARIO_STATUS_MAP = {
    DRAFT: {
        label: "초안",
        className: "is-draft",
    },
    VALIDATING: {
        label: "검증 중",
        className: "is-validating",
    },
    VALIDATED: {
        label: "검증 완료",
        className: "is-validated",
    },
};

// 날짜 표시 형식
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

// 시나리오 상태를 화면 표시 정보로 변환
const getScenarioStatus = (status) =>
    SCENARIO_STATUS_MAP[status] ?? {
        label: status || "-",
        className: "is-default",
    };

// ISO 날짜를 화면 표시용 형식으로 변환
const formatDateTime = (dateTime) => {
    if (!dateTime) return "-";

    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) return "-";

    return DATE_TIME_FORMATTER.format(date)
        .replace(/\. /g, ".")
        .replace(".", "");
};

// 정렬에 사용할 수정 시간 반환
const getUpdatedTime = (scenario) => {
    const time = Date.parse(scenario.updatedAt);
    return Number.isNaN(time) ? 0 : time;
};

function Scenario() {
    const [scenarios, setScenarios] = useState([]);
    const [isScenarioPanelOpen, setIsScenarioPanelOpen] = useState(false);
    const [editingScenarioId, setEditingScenarioId] = useState(null);
    const [openMenuScenarioId, setOpenMenuScenarioId] = useState(null);
    const [selectedScenarioId, setSelectedScenarioId] = useState(null);
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [sortOption, setSortOption] = useState("UPDATED_DESC");
    const [currentPage, setCurrentPage] = useState(1);

    // 백엔드에서 전체 시나리오 목록 조회
    useEffect(() => {
        const loadScenarios = async () => {
            try {
                const response = await scenarioApi.getAll();

                if (!Array.isArray(response)) {
                    throw new Error("시나리오 목록 응답이 배열이 아닙니다.");
                }

                setScenarios(response);
                console.log("시나리오 목록 조회 성공:", response);
                
            } catch (error) {
                console.error("시나리오 목록 조회 실패:", error);
                setScenarios([]);
            }
        };

        loadScenarios();
    }, []);

    // 검색, 상태 필터, 정렬 결과를 계산한다.
    const filteredScenarios = useMemo(() => {
        const normalizedSearchText = searchText.trim().toLowerCase();

        const result = scenarios.filter((scenario) => {
            const searchableText = [
                scenario.scenarioName,
                scenario.id,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesSearch =
                !normalizedSearchText ||
                searchableText.includes(normalizedSearchText);

            const matchesStatus =
                statusFilter === "ALL" ||
                scenario.status === statusFilter;

            return matchesSearch && matchesStatus;
        });

        // 수정일 기준 오름차순 또는 내림차순 정렬
        const sortDirection =
            sortOption === "UPDATED_ASC" ? 1 : -1;

        return [...result].sort(
            (firstScenario, secondScenario) =>
                (getUpdatedTime(firstScenario) -
                    getUpdatedTime(secondScenario)) *
                sortDirection
        );
    }, [scenarios, searchText, statusFilter, sortOption]);

    // 전체 페이지 수 계산
    const totalPages = Math.max(
        1,
        Math.ceil(filteredScenarios.length / PAGE_SIZE)
    );

    // 현재 페이지가 범위를 벗어나면 마지막 페이지 사용
    const safeCurrentPage = Math.min(currentPage, totalPages);

    // 현재 페이지에 표시할 시나리오 목록
    const currentScenarios = filteredScenarios.slice(
        (safeCurrentPage - 1) * PAGE_SIZE,
        safeCurrentPage * PAGE_SIZE
    );

    // 선택한 시나리오 조회
    const selectedScenario =
        scenarios.find(
            (scenario) => scenario.id === selectedScenarioId
        ) ?? null;

    // 수정할 시나리오 조회
    const editingScenario =
        scenarios.find(
            (scenario) => scenario.id === editingScenarioId
        ) ?? null;

    // 검색어 변경
    const handleSearchChange = (event) => {
        setSearchText(event.target.value);
        setCurrentPage(1);
    };

    // 상태 필터 변경
    const handleStatusChange = (event) => {
        setStatusFilter(event.target.value);
        setCurrentPage(1);
    };

    // 정렬 조건 변경
    const handleSortChange = (event) => {
        setSortOption(event.target.value);
        setCurrentPage(1);
    };

    // 검색 및 필터 초기화
    const handleResetFilter = () => {
        setSearchText("");
        setStatusFilter("ALL");
        setSortOption("UPDATED_DESC");
        setCurrentPage(1);
    };

    // 시나리오 생성 패널 열기
    const handleCreateScenario = () => {
        setOpenMenuScenarioId(null);
        setEditingScenarioId(null);
        setSelectedScenarioId(null);
        setIsScenarioPanelOpen(true);
    };

    // 시나리오 수정 패널 열기
    const handleEditScenario = (scenario) => {
        setOpenMenuScenarioId(null);
        setEditingScenarioId(scenario.id);
        setIsScenarioPanelOpen(true);
    };

    // 시나리오 생성/수정 패널 닫기
    const handleCloseScenarioPanel = () => {
        setIsScenarioPanelOpen(false);
        setEditingScenarioId(null);
    };

    // 시나리오 생성/수정
    const handleScenarioSubmit = async (submittedData) => {
        const isEditMode = editingScenarioId !== null;

        try {
            if (isEditMode) {
                await scenarioApi.update(
                    editingScenarioId,
                    submittedData
                );

                console.log("시나리오 수정 성공:", submittedData);
            } else {
                const createdScenario =
                    await scenarioApi.create(submittedData);

                // 백엔드에서 생성된 id가 있어야 생성 성공으로 처리한다.
                if (!createdScenario || createdScenario.id == null) {
                    throw new Error(
                        "시나리오 생성 API 응답이 올바르지 않습니다."
                    );
                }

                console.log("시나리오 생성 성공:", createdScenario);
            }

            // 저장 성공 후 백엔드의 최신 목록을 다시 조회한다.
            const response = await scenarioApi.getAll();

            if (!Array.isArray(response)) {
                throw new Error("시나리오 목록 응답이 배열이 아닙니다.");
            }

            setScenarios(response);

            if (isEditMode) {
                setSelectedScenarioId(editingScenarioId);
            } else {
                setSelectedScenarioId(null);
                setCurrentPage(1);
            }

            handleCloseScenarioPanel();
        } catch (error) {
            console.error(
                isEditMode
                    ? "시나리오 수정 실패:"
                    : "시나리오 생성 실패:",
                error
            );

            alert(
                error.message ??
                    (isEditMode
                        ? "시나리오 수정에 실패했습니다."
                        : "시나리오 생성에 실패했습니다.")
            );
        }
    };

    // 시나리오 삭제
    const handleDeleteScenario = async (scenario) => {
        setOpenMenuScenarioId(null);

        const shouldDelete = window.confirm(
            `“${scenario.scenarioName}” 시나리오를 삭제할까요?`
        );

        if (!shouldDelete) {
            return;
        }

        try {
            await scenarioApi.delete(scenario.id);

            // 삭제 성공 후 백엔드의 최신 목록을 다시 조회한다.
            const response = await scenarioApi.getAll();

            if (!Array.isArray(response)) {
                throw new Error("시나리오 목록 응답이 배열이 아닙니다.");
            }

            setScenarios(response);

            if (selectedScenarioId === scenario.id) {
                setSelectedScenarioId(null);
            }

            setCurrentPage(1);

            console.log("시나리오 삭제 성공:", scenario);
        } catch (error) {
            console.error("시나리오 삭제 실패:", error);

            alert(
                error.message ??
                    "시나리오 삭제에 실패했습니다."
            );
        }
    };

    // 시나리오 상태 변경
    const handleScenarioStatusChange = (
        scenario,
        nextStatus
    ) => {
        const now = new Date().toISOString();

        setScenarios((previousScenarios) =>
            previousScenarios.map((item) =>
                item.id === scenario.id
                    ? {
                        ...item,
                        status: nextStatus,
                        updatedAt: now,
                    }
                    : item
            )
        );

        setOpenMenuScenarioId(null);
        setCurrentPage(1);
    };

    // 더보기 메뉴 열기 또는 닫기
    const handleToggleScenarioMenu = (scenarioId) => {
        setOpenMenuScenarioId((previousScenarioId) =>
            previousScenarioId === scenarioId
                ? null
                : scenarioId
        );
    };

    // 선택한 시나리오 상세 표시
    const handleScenarioClick = (scenarioId) => {
        setOpenMenuScenarioId(null);
        setIsScenarioPanelOpen(false);
        setEditingScenarioId(null);
        setSelectedScenarioId(scenarioId);
    };

    // 상세 화면 닫기
    const handleCloseDetail = () => {
        setSelectedScenarioId(null);
    };

    const pageStart =
        filteredScenarios.length === 0
            ? 0
            : (safeCurrentPage - 1) * PAGE_SIZE + 1;

    const pageEnd = Math.min(
        safeCurrentPage * PAGE_SIZE,
        filteredScenarios.length
    );

    return (
        <main className="scenario-page">
            <div
                className={`scenario-workspace ${
                    isScenarioPanelOpen || selectedScenario
                        ? "has-side-panel"
                        : "is-list-only"
                }`}
            >
                {/* 왼쪽 시나리오 목록 */}
                <section className="scenario-list-card">
                    {/* 페이지 상단 */}
                    <header className="scenario-list-header">
                        <div className="scenario-list-heading">
                            <h1>시나리오 목록</h1>

                            <p>
                                시나리오를 선택해 상세 설정을 확인합니다.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="scenario-button scenario-button-primary"
                            onClick={handleCreateScenario}
                        >
                            <span aria-hidden="true">＋</span>
                            새 시나리오
                        </button>
                    </header>

                    {/* 검색 및 필터 */}
                    <div className="scenario-list-toolbar">
                        <div className="scenario-search">
                            <span
                                className="scenario-search-icon"
                                aria-hidden="true"
                            >
                                ⌕
                            </span>

                            <input
                                type="search"
                                value={searchText}
                                placeholder="시나리오명, ID 검색"
                                onChange={handleSearchChange}
                                aria-label="시나리오 검색"
                            />
                        </div>

                        <select
                            className="scenario-filter-select"
                            value={statusFilter}
                            onChange={handleStatusChange}
                            aria-label="시나리오 상태 필터"
                        >
                            {STATUS_OPTIONS.map((option) => (
                                <option
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </option>
                            ))}
                        </select>

                        <select
                            className="scenario-filter-select"
                            value={sortOption}
                            onChange={handleSortChange}
                            aria-label="시나리오 정렬"
                        >
                            {SORT_OPTIONS.map((option) => (
                                <option
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </option>
                            ))}
                        </select>

                        <button
                            type="button"
                            className="scenario-reset-button"
                            onClick={handleResetFilter}
                        >
                            초기화
                        </button>
                    </div>

                    {/* 목록 개수 */}
                    <div className="scenario-list-count">
                        총 <strong>{filteredScenarios.length}</strong>개의
                        시나리오
                    </div>

                    {/* 시나리오 테이블 */}
                    <div className="scenario-table-wrapper">
                        <table className="scenario-table">
                            <thead>
                                <tr>
                                    <th>시나리오</th>
                                    <th>상태</th>
                                    <th>최근 수정</th>
                                    <th aria-label="작업" />
                                </tr>
                            </thead>

                            <tbody>
                                {currentScenarios.length > 0 ? (
                                    currentScenarios.map((scenario) => {
                                        const status = getScenarioStatus(scenario.status);
                                        const isSelected = scenario.id === selectedScenarioId;

                                        return (
                                            <tr
                                                key={scenario.id}
                                                className={isSelected ? "is-selected" : ""}
                                                onClick={() => handleScenarioClick(scenario.id)}
                                            >
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="scenario-name-button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleScenarioClick(scenario.id);
                                                        }}
                                                    >
                                                        <span className="scenario-row-icon">
                                                            ◇
                                                        </span>

                                                        <span className="scenario-name-content">
                                                            <strong>
                                                                {scenario.scenarioName}
                                                            </strong>

                                                            <small>
                                                                #{scenario.id}
                                                            </small>
                                                        </span>
                                                    </button>
                                                </td>

                                                <td>
                                                    <span
                                                        className={`scenario-status ${status.className}`}
                                                    >
                                                        <span
                                                            className="scenario-status-dot"
                                                            aria-hidden="true"
                                                        />

                                                        {status.label}
                                                    </span>
                                                </td>

                                                <td>
                                                    <span className="scenario-date">
                                                        {formatDateTime(scenario.updatedAt)}
                                                    </span>
                                                </td>

                                                <td>
                                                    <div
                                                        className="scenario-row-menu-wrapper"
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="scenario-more-button"
                                                            aria-label={`${scenario.scenarioName} 메뉴 열기`}
                                                            aria-haspopup="menu"
                                                            aria-expanded={openMenuScenarioId === scenario.id}
                                                            onClick={() => handleToggleScenarioMenu(scenario.id)}
                                                        >
                                                            ⋮
                                                        </button>

                                                        {openMenuScenarioId ===
                                                            scenario.id && (
                                                                <div
                                                                    className="scenario-row-menu"
                                                                    role="menu"
                                                                    aria-label={`${scenario.scenarioName} 작업 메뉴`}
                                                                >
                                                                    <div className="scenario-row-status-menu">
                                                                        <span className="scenario-row-menu-label">
                                                                            상태 변경
                                                                        </span>

                                                                        {SCENARIO_STATUS_OPTIONS.map(
                                                                            (option) => {
                                                                                const isCurrentStatus = scenario.status === option.value;

                                                                                return (
                                                                                    <button
                                                                                        key={option.value}
                                                                                        type="button"
                                                                                        className={`scenario-row-menu-button ${isCurrentStatus
                                                                                            ? "is-active"
                                                                                            : ""
                                                                                            }`}
                                                                                        role="menuitemradio"
                                                                                        aria-checked={isCurrentStatus}
                                                                                        disabled={isCurrentStatus}
                                                                                        onClick={() => handleScenarioStatusChange(
                                                                                            scenario,
                                                                                            option.value
                                                                                        )}
                                                                                    >
                                                                                        {option.label}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        className="scenario-row-menu-button"
                                                                        role="menuitem"
                                                                        onClick={() => handleEditScenario(scenario)}
                                                                    >
                                                                        수정
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        className="scenario-row-menu-button is-danger"
                                                                        role="menuitem"
                                                                        onClick={() => handleDeleteScenario(scenario)}
                                                                    >
                                                                        삭제
                                                                    </button>
                                                                </div>
                                                            )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            className="scenario-empty"
                                        >
                                            <div className="scenario-empty-icon">
                                                ◇
                                            </div>

                                            <strong>
                                                {scenarios.length === 0
                                                    ? "등록된 시나리오가 없습니다."
                                                    : "검색 결과가 없습니다."}
                                            </strong>

                                            <p>
                                                {scenarios.length === 0
                                                    ? "새 시나리오를 생성해 시작해보세요."
                                                    : "검색어나 필터 조건을 다시 확인해주세요."}
                                            </p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* 페이지네이션 */}
                    <footer className="scenario-list-footer">
                        <span>
                            {filteredScenarios.length === 0
                                ? "0개 표시"
                                : `${pageStart}-${pageEnd} / ${filteredScenarios.length}`}
                        </span>

                        <div className="scenario-pagination">
                            <button
                                type="button"
                                disabled={safeCurrentPage === 1}
                                onClick={() => setCurrentPage((previousPage) =>
                                    Math.max(
                                        1,
                                        previousPage - 1
                                    ))}
                                aria-label="이전 페이지"
                            >
                                ‹
                            </button>

                            {Array.from(
                                { length: totalPages },
                                (_, index) => index + 1
                            ).map((pageNumber) => (
                                <button
                                    type="button"
                                    key={pageNumber}
                                    className={
                                        pageNumber === safeCurrentPage
                                            ? "is-active"
                                            : ""
                                    }
                                    onClick={() => setCurrentPage(pageNumber)}
                                >
                                    {pageNumber}
                                </button>
                            ))}

                            <button
                                type="button"
                                disabled={
                                    safeCurrentPage === totalPages
                                }
                                onClick={() => setCurrentPage((previousPage) =>
                                    Math.min(
                                        totalPages,
                                        previousPage + 1
                                    ))}
                                aria-label="다음 페이지"
                            >
                                ›
                            </button>
                        </div>
                    </footer>
                </section>

                {/* 오른쪽 시나리오 생성/수정 또는 상세 영역 */}
                {isScenarioPanelOpen ? (
                    <ScenarioCreatePanel
                        key={editingScenario?.id ?? "create"}
                        mode={editingScenario ? "edit" : "create"}
                        initialScenario={editingScenario}
                        onClose={handleCloseScenarioPanel}
                        onSubmit={handleScenarioSubmit}
                    />
                ) : (
                    selectedScenario && (
                        <ScenarioDetail
                            scenario={selectedScenario}
                            onClose={handleCloseDetail}
                            onEdit={handleEditScenario}
                            onDelete={handleDeleteScenario}
                            onStatusChange={
                                handleScenarioStatusChange
                            }
                        />
                    )
                )}
            </div>
        </main>
    );
}

export default Scenario;