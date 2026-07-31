import { useEffect, useMemo, useRef, useState } from "react";
import ScenarioDetail from "./ScenarioDetail";
import ScenarioFormModal from "./ScenarioFormModal";
import {
    INITIAL_SCENARIOS,
    MOCK_WAREHOUSES,
    PAGE_SIZE_OPTIONS,
    STATUS_LABELS,
    formatDateTime,
    getStatusClassName,
} from "./scenarioMockData";
import "../../styles/scenario/Scenario.css";

function Scenario() {
    const [scenario, setScenario] = useState(INITIAL_SCENARIOS);
    const [selectedScenarioId, setSelectedScenarioId] = useState(1);
    const [searchKeyword, setSearchKeyword] = useState("");
    const [sortDirection, setSortDirection] = useState("desc");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);
    const [openedMenuId, setOpenedMenuId] = useState(null);
    const [modalState, setModalState] = useState({
        open: false,
        mode: "create",
        scenario: null,
    });

    const menuAreaRef = useRef(null);

    const selectedScenario =
        scenario.find(
            (scenario) => scenario.id === selectedScenarioId
        ) || null;

    const selectedWarehouse = selectedScenario
        ? MOCK_WAREHOUSES.find(
              (warehouse) =>
                  warehouse.id === selectedScenario.warehouseId
          ) || null
        : null;

    const filteredScenario = useMemo(() => {
        const normalizedKeyword = searchKeyword.trim().toLowerCase();

        return [...scenario]
            .filter((scenario) =>
                scenario.name.toLowerCase().includes(normalizedKeyword)
            )
            .sort((first, second) => {
                if (first.favorite !== second.favorite) {
                    return first.favorite ? -1 : 1;
                }

                const dateDifference =
                    new Date(first.updatedAt) -
                    new Date(second.updatedAt);

                return sortDirection === "asc"
                    ? dateDifference
                    : -dateDifference;
            });
    }, [scenario, searchKeyword, sortDirection]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredScenario.length / pageSize)
    );

    const safeCurrentPage = Math.min(currentPage, totalPages);

    const currentScenario = filteredScenario.slice(
        (safeCurrentPage - 1) * pageSize,
        safeCurrentPage * pageSize
    );

    const pageNumbers = useMemo(() => {
        const maxVisiblePages = 5;
        let startPage = Math.max(
            1,
            safeCurrentPage - Math.floor(maxVisiblePages / 2)
        );
        let endPage = Math.min(
            totalPages,
            startPage + maxVisiblePages - 1
        );

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(
                1,
                endPage - maxVisiblePages + 1
            );
        }

        return Array.from(
            { length: endPage - startPage + 1 },
            (_, index) => startPage + index
        );
    }, [safeCurrentPage, totalPages]);

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    useEffect(() => {
        const closeMenu = (event) => {
            if (
                menuAreaRef.current &&
                !menuAreaRef.current.contains(event.target)
            ) {
                setOpenedMenuId(null);
            }
        };

        document.addEventListener("mousedown", closeMenu);
        return () => document.removeEventListener("mousedown", closeMenu);
    }, []);

    const selectScenario = (scenarioId) => {
        setSelectedScenarioId(scenarioId);
        setOpenedMenuId(null);
    };

    const openCreateModal = () => {
        setOpenedMenuId(null);
        setModalState({
            open: true,
            mode: "create",
            scenario: null,
        });
    };

    const openEditModal = (scenario) => {
        setOpenedMenuId(null);
        setModalState({
            open: true,
            mode: "edit",
            scenario,
        });
    };

    const closeModal = () => {
        setModalState({
            open: false,
            mode: "create",
            scenario: null,
        });
    };

    const saveScenario = (formData) => {
        if (
            modalState.mode === "edit" &&
            modalState.scenario
        ) {
            setScenario((previous) =>
                previous.map((scenario) =>
                    scenario.id === modalState.scenario.id
                        ? {
                              ...scenario,
                              ...formData,
                              updatedAt: new Date().toISOString(),
                          }
                        : scenario
                )
            );
        } else {
            const nextId =
                Math.max(
                    0,
                    ...scenario.map((scenario) => scenario.id)
                ) + 1;

            const newScenario = {
                id: nextId,
                ...formData,
                status: "DRAFT",
                favorite: false,
                updatedAt: new Date().toISOString(),
                runHistory: [],
            };

            setScenario((previous) => [
                newScenario,
                ...previous,
            ]);
            setSelectedScenarioId(nextId);
            setCurrentPage(1);
        }

        closeModal();
    };

    const toggleFavorite = (scenarioId) => {
        setScenario((previous) =>
            previous.map((scenario) =>
                scenario.id === scenarioId
                    ? {
                          ...scenario,
                          favorite: !scenario.favorite,
                      }
                    : scenario
            )
        );
    };

    const duplicateScenario = (scenario) => {
        const nextId =
            Math.max(
                0,
                ...scenario.map((item) => item.id)
            ) + 1;

        const duplicatedScenario = {
            ...scenario,
            id: nextId,
            name: `${scenario.name} 복사본`,
            status: "DRAFT",
            favorite: false,
            updatedAt: new Date().toISOString(),
            runHistory: [],
        };

        setScenario((previous) => [
            duplicatedScenario,
            ...previous,
        ]);
        setSelectedScenarioId(nextId);
        setCurrentPage(1);
        setOpenedMenuId(null);
    };

    const deleteScenario = (scenarioId) => {
        const targetScenario = scenario.find(
            (scenario) => scenario.id === scenarioId
        );

        if (!targetScenario) return;

        const confirmed = window.confirm(
            `"${targetScenario.name}" 시나리오를 삭제할까요?`
        );

        if (!confirmed) return;

        setScenario((previous) =>
            previous.filter(
                (scenario) => scenario.id !== scenarioId
            )
        );

        setSelectedScenarioId((previous) =>
            previous === scenarioId ? null : previous
        );

        setOpenedMenuId(null);
    };

    const handleRunScenario = () => {
        if (!selectedScenario) return;

        window.alert(
            `"${selectedScenario.name}" 실행 기능은 API 연동 후 연결합니다.`
        );
    };

    const handleOpenResult = (run) => {
        window.alert(
            `${run.simulationId} 결과 화면은 API 연동 후 연결합니다.`
        );
    };

    return (
        <section className="scenario-page">
            <div
                className={`scenario-workspace ${
                    selectedScenario ? "has-detail" : ""
                }`}
            >
                {/* 시나리오 목록 */}
                <div className="scenario-list-card">
                    <header className="scenario-list-header">
                        <div>
                            <h1>시나리오</h1>
                            <p>
                                창고 운영 시뮬레이션에 사용할 시나리오를
                                관리합니다.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="scenario-button is-primary"
                            onClick={openCreateModal}
                        >
                            ＋ 새 시나리오
                        </button>
                    </header>

                    <div className="scenario-list-toolbar">
                        <label className="scenario-search">
                            <input
                                type="search"
                                value={searchKeyword}
                                placeholder="시나리오명 검색"
                                onChange={(event) => {
                                    setSearchKeyword(event.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                            <span aria-hidden="true">⌕</span>
                        </label>
                    </div>

                    <div className="scenario-table-wrap">
                        <table className="scenario-table">
                            <thead>
                                <tr>
                                    <th className="is-favorite-column">
                                        <span className="scenario-sr-only">
                                            즐겨찾기
                                        </span>
                                    </th>
                                    <th>시나리오명</th>
                                    <th>상태</th>
                                    <th>
                                        <button
                                            type="button"
                                            className="scenario-sort-button"
                                            onClick={() =>
                                                setSortDirection(
                                                    (previous) =>
                                                        previous === "desc"
                                                            ? "asc"
                                                            : "desc"
                                                )
                                            }
                                        >
                                            최종 수정일{" "}
                                            {sortDirection === "desc"
                                                ? "↓"
                                                : "↑"}
                                        </button>
                                    </th>
                                    <th className="is-menu-column">
                                        <span className="scenario-sr-only">
                                            메뉴
                                        </span>
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {currentScenario.length > 0 ? (
                                    currentScenario.map((scenario) => (
                                        <tr
                                            key={scenario.id}
                                            className={
                                                selectedScenarioId ===
                                                scenario.id
                                                    ? "is-selected"
                                                    : ""
                                            }
                                            onClick={() =>
                                                selectScenario(
                                                    scenario.id
                                                )
                                            }
                                        >
                                            <td>
                                                <button
                                                    type="button"
                                                    className={`scenario-favorite-button ${
                                                        scenario.favorite
                                                            ? "is-active"
                                                            : ""
                                                    }`}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        toggleFavorite(
                                                            scenario.id
                                                        );
                                                    }}
                                                    aria-label={
                                                        scenario.favorite
                                                            ? "즐겨찾기 해제"
                                                            : "즐겨찾기 추가"
                                                    }
                                                >
                                                    {scenario.favorite
                                                        ? "★"
                                                        : "☆"}
                                                </button>
                                            </td>

                                            <td>
                                                <button
                                                    type="button"
                                                    className="scenario-name-button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        selectScenario(
                                                            scenario.id
                                                        );
                                                    }}
                                                >
                                                    {scenario.name}
                                                </button>
                                            </td>

                                            <td>
                                                <span
                                                    className={`scenario-status ${getStatusClassName(
                                                        scenario.status
                                                    )}`}
                                                >
                                                    {
                                                        STATUS_LABELS[
                                                            scenario.status
                                                        ]
                                                    }
                                                </span>
                                            </td>

                                            <td>
                                                {formatDateTime(
                                                    scenario.updatedAt
                                                )}
                                            </td>

                                            <td
                                                className="scenario-menu-cell"
                                                ref={
                                                    openedMenuId ===
                                                    scenario.id
                                                        ? menuAreaRef
                                                        : null
                                                }
                                            >
                                                <button
                                                    type="button"
                                                    className="scenario-menu-button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setOpenedMenuId(
                                                            (previous) =>
                                                                previous ===
                                                                scenario.id
                                                                    ? null
                                                                    : scenario.id
                                                        );
                                                    }}
                                                    aria-label="시나리오 메뉴"
                                                >
                                                    ⋮
                                                </button>

                                                {openedMenuId ===
                                                    scenario.id && (
                                                    <div
                                                        className="scenario-row-menu"
                                                        onClick={(event) =>
                                                            event.stopPropagation()
                                                        }
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                selectScenario(
                                                                    scenario.id
                                                                )
                                                            }
                                                        >
                                                            상세 보기
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                openEditModal(
                                                                    scenario
                                                                )
                                                            }
                                                        >
                                                            수정 및 상태 변경
                                                        </button>
                                                        
                                                        <button
                                                            type="button"
                                                            className="is-danger"
                                                            onClick={() =>
                                                                deleteScenario(
                                                                    scenario.id
                                                                )
                                                            }
                                                        >
                                                            삭제
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td
                                            colSpan="5"
                                            className="scenario-table-empty"
                                        >
                                            검색 결과가 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* 목록 하단 페이지 정보와 페이지 번호 */}
                    <footer className="scenario-pagination">
                        <div className="scenario-pagination-info">
                            <span>
                                총 {filteredScenario.length}개
                            </span>
                            <strong>
                                {safeCurrentPage} / {totalPages}페이지
                            </strong>
                        </div>

                        <div className="scenario-pagination-buttons">
                            <button
                                type="button"
                                disabled={safeCurrentPage === 1}
                                onClick={() => setCurrentPage(1)}
                                aria-label="첫 페이지"
                            >
                                «
                            </button>
                            <button
                                type="button"
                                disabled={safeCurrentPage === 1}
                                onClick={() =>
                                    setCurrentPage((previous) =>
                                        Math.max(1, previous - 1)
                                    )
                                }
                                aria-label="이전 페이지"
                            >
                                ‹
                            </button>

                            {pageNumbers.map((pageNumber) => (
                                <button
                                    key={pageNumber}
                                    type="button"
                                    className={
                                        safeCurrentPage === pageNumber
                                            ? "is-active"
                                            : ""
                                    }
                                    onClick={() =>
                                        setCurrentPage(pageNumber)
                                    }
                                >
                                    {pageNumber}
                                </button>
                            ))}

                            <button
                                type="button"
                                disabled={
                                    safeCurrentPage === totalPages
                                }
                                onClick={() =>
                                    setCurrentPage((previous) =>
                                        Math.min(
                                            totalPages,
                                            previous + 1
                                        )
                                    )
                                }
                                aria-label="다음 페이지"
                            >
                                ›
                            </button>
                            <button
                                type="button"
                                disabled={
                                    safeCurrentPage === totalPages
                                }
                                onClick={() =>
                                    setCurrentPage(totalPages)
                                }
                                aria-label="마지막 페이지"
                            >
                                »
                            </button>
                        </div>

                        <select
                            value={pageSize}
                            onChange={(event) => {
                                setPageSize(
                                    Number(event.target.value)
                                );
                                setCurrentPage(1);
                            }}
                            aria-label="페이지당 항목 수"
                        >
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <option key={size} value={size}>
                                    {size}개씩
                                </option>
                            ))}
                        </select>
                    </footer>
                </div>

                {selectedScenario && (
                    <ScenarioDetail
                        scenario={selectedScenario}
                        warehouse={selectedWarehouse}
                        onEdit={() =>
                            openEditModal(selectedScenario)
                        }
                        onClose={() =>
                            setSelectedScenarioId(null)
                        }
                        onRun={handleRunScenario}
                        onOpenResult={handleOpenResult}
                    />
                )}
            </div>

            <ScenarioFormModal
                open={modalState.open}
                mode={modalState.mode}
                scenario={modalState.scenario}
                warehouses={MOCK_WAREHOUSES}
                onClose={closeModal}
                onSave={saveScenario}
            />
        </section>
    );
}

export default Scenario;
