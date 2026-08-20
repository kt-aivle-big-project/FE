import { useEffect, useMemo, useState } from "react";
import ScenarioDetail from "./ScenarioDetail";
import ScenarioCreatePanel from "./ScenarioCreatePanel";
import { scenarioApi, warehouseApi } from "../../api/client";
import "../../styles/scenario/Scenario.css";

const SORT_OPTIONS = [
    { value: "UPDATED_DESC", label: "최근 수정 순" },
    { value: "UPDATED_ASC", label: "오래된 수정 순" },
];

const PAGE_SIZE = 10;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});


const formatDateTime = (dateTime) => {
    if (!dateTime) return "-";

    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) return "-";

    return DATE_TIME_FORMATTER.format(date)
        .replace(/\. /g, ".")
        .replace(".", "");
};

const getUpdatedTime = (scenario) => {
    const time = Date.parse(scenario.updatedAt);
    return Number.isNaN(time) ? 0 : time;
};

function Scenario() {
    const [scenarios, setScenarios] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [isScenarioPanelOpen, setIsScenarioPanelOpen] = useState(false);
    const [editingScenarioId, setEditingScenarioId] = useState(null);
    const [openMenuScenarioId, setOpenMenuScenarioId] = useState(null);
    const [selectedScenarioId, setSelectedScenarioId] = useState(null);
    const [searchText, setSearchText] = useState("");
    const [sortOption, setSortOption] = useState("UPDATED_DESC");
    const [currentPage, setCurrentPage] = useState(1);

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

    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const response = await warehouseApi.getAll();

                if (!Array.isArray(response)) {
                    throw new Error("창고 목록 응답이 배열이 아닙니다.");
                }

                setWarehouses(response);
            } catch (error) {
                console.error("창고 목록 조회 실패:", error);
                setWarehouses([]);
            }
        };

        loadWarehouses();
    }, []);

    const filteredScenarios = useMemo(() => {
        const normalizedSearchText = searchText.trim().toLowerCase();

        const result = scenarios.filter((scenario) => {
            const searchableText = [
                scenario.scenarioName,
                scenario.id,
                scenario.warehouseName,
                scenario.warehouseId,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const matchesSearch =
                !normalizedSearchText ||
                searchableText.includes(normalizedSearchText);

            return matchesSearch;
        });

        const sortDirection =
            sortOption === "UPDATED_ASC" ? 1 : -1;

        return [...result].sort(
            (firstScenario, secondScenario) =>
                (getUpdatedTime(firstScenario) -
                    getUpdatedTime(secondScenario)) *
                sortDirection
        );
    }, [scenarios, searchText, sortOption]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredScenarios.length / PAGE_SIZE)
    );

    const safeCurrentPage = Math.min(currentPage, totalPages);

    const currentScenarios = filteredScenarios.slice(
        (safeCurrentPage - 1) * PAGE_SIZE,
        safeCurrentPage * PAGE_SIZE
    );

    const selectedScenario =
        scenarios.find(
            (scenario) => scenario.id === selectedScenarioId
        ) ?? null;

    const editingScenario =
        scenarios.find(
            (scenario) => scenario.id === editingScenarioId
        ) ?? null;

    const handleSearchChange = (event) => {
        setSearchText(event.target.value);
        setCurrentPage(1);
    };


    const handleSortChange = (event) => {
        setSortOption(event.target.value);
        setCurrentPage(1);
    };

    const handleResetFilter = () => {
        setSearchText("");
        setSortOption("UPDATED_DESC");
        setCurrentPage(1);
    };

    const handleCreateScenario = () => {
        setOpenMenuScenarioId(null);
        setEditingScenarioId(null);
        setSelectedScenarioId(null);
        setIsScenarioPanelOpen(true);
    };

    const handleEditScenario = (scenario) => {
        setOpenMenuScenarioId(null);
        setEditingScenarioId(scenario.id);
        setIsScenarioPanelOpen(true);
    };

    const handleCloseScenarioPanel = () => {
        setIsScenarioPanelOpen(false);
        setEditingScenarioId(null);
    };

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

                if (!createdScenario || createdScenario.id == null) {
                    throw new Error(
                        "시나리오 생성 API 응답이 올바르지 않습니다."
                    );
                }

                console.log("시나리오 생성 성공:", createdScenario);
            }

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

    const handleToggleScenarioMenu = (scenarioId) => {
        setOpenMenuScenarioId((previousScenarioId) =>
            previousScenarioId === scenarioId
                ? null
                : scenarioId
        );
    };

    const handleScenarioClick = (scenarioId) => {
        setOpenMenuScenarioId(null);
        setIsScenarioPanelOpen(false);
        setEditingScenarioId(null);
        setSelectedScenarioId(scenarioId);
    };

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
                                    <th>최근 수정</th>
                                    <th aria-label="작업" />
                                </tr>
                            </thead>

                            <tbody>
                                {currentScenarios.length > 0 ? (
                                    currentScenarios.map((scenario) => {
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
                                            colSpan={3}
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
                        warehouses={warehouses}
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
