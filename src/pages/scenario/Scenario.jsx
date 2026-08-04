import { useMemo, useState } from "react";
import ScenarioDetail from "./ScenarioDetail";
import ScenarioCreateModal from "./ScenarioCreateModal";
import "../../styles/scenario/Scenario.css";
/**
 * API 연결 전 시나리오 목록 확인용 임시 데이터
 *
 * 상세 영역에서도 같은 데이터를 사용하기 때문에
 * 목록용 정보와 상세용 정보를 한 객체 안에 함께 작성합니다.
 */
const INITIAL_SCENARIOS = [
    {
        id: 1,
        scenarioId: "SCN-2026-001",
        name: "성수기 피킹 집중 시나리오",
        description:
            "성수기 주문 증가 상황에서 출고 작업 처리 속도와 로봇 운영 효율을 확인하는 시나리오입니다.",
        warehouseId: "WH-001",
        warehouseName: "A-1 센터 (서울)",
        status: "VALIDATED",
        robotTypes: ["입고", "출고", "보충"],
        initialBattery: 100,
        chargeThreshold: 20,
        replanMethod: "AFFECTED_TASKS_ONLY",
        itemCount: 3,
        createdAt: "2026-07-28T10:10:00",
        updatedAt: "2026-08-03T13:20:00",
        items: [
            {
                id: 1,
                itemCode: "ITEM-BEARING",
                itemName: "산업용 베어링",
                quantity: 40,
                priority: "HIGH",
            },
            {
                id: 2,
                itemCode: "ITEM-MOTOR",
                itemName: "소형 구동 모터",
                quantity: 24,
                priority: "NORMAL",
            },
            {
                id: 3,
                itemCode: "ITEM-SENSOR",
                itemName: "거리 감지 센서",
                quantity: 30,
                priority: "NORMAL",
            },
        ],
    },
    {
        id: 2,
        scenarioId: "SCN-2026-002",
        name: "통로 혼잡 대응 시나리오",
        description:
            "통로 혼잡 또는 점유 이벤트가 발생했을 때 경로를 재계산하고 작업을 다시 배정하는 시나리오입니다.",
        warehouseId: "WH-001",
        warehouseName: "A-1 센터 (서울)",
        status: "VALIDATING",
        robotTypes: ["출고", "재배치"],
        initialBattery: 90,
        chargeThreshold: 25,
        replanMethod: "PATH_ONLY",
        itemCount: 2,
        createdAt: "2026-07-27T15:30:00",
        updatedAt: "2026-08-02T16:40:00",
        items: [
            {
                id: 1,
                itemCode: "ITEM-BOX-A",
                itemName: "A형 포장 박스",
                quantity: 20,
                priority: "HIGH",
            },
            {
                id: 2,
                itemCode: "ITEM-PART-01",
                itemName: "자동차 부품 A",
                quantity: 16,
                priority: "NORMAL",
            },
        ],
    },
    {
        id: 3,
        scenarioId: "SCN-2026-003",
        name: "저배터리 충전 전환 시나리오",
        description:
            "로봇 배터리가 설정값 이하로 내려갔을 때 충전 작업으로 전환되는지 확인하는 시나리오입니다.",
        warehouseId: "WH-002",
        warehouseName: "B-1 센터 (대전)",
        status: "DRAFT",
        robotTypes: ["출고", "충전"],
        initialBattery: 60,
        chargeThreshold: 30,
        replanMethod: "AFFECTED_TASKS_ONLY",
        itemCount: 1,
        createdAt: "2026-08-01T09:00:00",
        updatedAt: "2026-08-02T11:15:00",
        items: [
            {
                id: 1,
                itemCode: "ITEM-BATTERY",
                itemName: "보조 배터리 모듈",
                quantity: 10,
                priority: "HIGH",
            },
        ],
    },
    {
        id: 4,
        scenarioId: "SCN-2026-004",
        name: "재고 부족 보충 시나리오",
        description:
            "출고 예정 품목의 재고가 부족한 경우 보충 작업이 생성되는지 확인하는 시나리오입니다.",
        warehouseId: "WH-002",
        warehouseName: "B-1 센터 (대전)",
        status: "VALIDATED",
        robotTypes: ["보충", "재배치"],
        initialBattery: 100,
        chargeThreshold: 20,
        replanMethod: "ALL_TASKS",
        itemCount: 1,
        createdAt: "2026-07-29T13:00:00",
        updatedAt: "2026-08-01T17:05:00",
        items: [
            {
                id: 1,
                itemCode: "ITEM-GEAR",
                itemName: "산업용 기어",
                quantity: 50,
                priority: "NORMAL",
            },
        ],
    },
    {
        id: 5,
        scenarioId: "SCN-2026-005",
        name: "신규 품목 입고 시나리오",
        description:
            "새로운 품목이 입고될 때 적절한 보관 위치가 선택되는지 확인하는 시나리오입니다.",
        warehouseId: "WH-003",
        warehouseName: "C-1 센터 (광주)",
        status: "ARCHIVED",
        robotTypes: ["입고", "재배치"],
        initialBattery: 100,
        chargeThreshold: 20,
        replanMethod: "AFFECTED_TASKS_ONLY",
        itemCount: 1,
        createdAt: "2026-07-25T10:30:00",
        updatedAt: "2026-07-31T14:30:00",
        items: [
            {
                id: 1,
                itemCode: "ITEM-NEW-01",
                itemName: "신규 부품 A",
                quantity: 70,
                priority: "LOW",
            },
        ],
    },
    {
        id: 6,
        scenarioId: "SCN-2026-006",
        name: "주문 급증 대응 시나리오",
        description:
            "짧은 시간 안에 주문이 집중되는 상황에서 작업 배정과 처리 효율을 확인하는 시나리오입니다.",
        warehouseId: "WH-001",
        warehouseName: "A-1 센터 (서울)",
        status: "VALIDATED",
        robotTypes: ["출고", "보충", "충전"],
        initialBattery: 95,
        chargeThreshold: 20,
        replanMethod: "ALL_TASKS",
        itemCount: 2,
        createdAt: "2026-07-24T10:00:00",
        updatedAt: "2026-07-30T10:10:00",
        items: [
            {
                id: 1,
                itemCode: "ITEM-ORDER-01",
                itemName: "긴급 주문 품목 A",
                quantity: 100,
                priority: "HIGH",
            },
            {
                id: 2,
                itemCode: "ITEM-ORDER-02",
                itemName: "긴급 주문 품목 B",
                quantity: 80,
                priority: "HIGH",
            },
        ],
    },
];

/**
 * 상태 선택 옵션
 */
const STATUS_OPTIONS = [
    { value: "ALL", label: "전체 상태" },
    { value: "DRAFT", label: "초안" },
    { value: "VALIDATING", label: "검증 중" },
    { value: "VALIDATED", label: "검증 완료" },
    { value: "ARCHIVED", label: "보관됨" },
];

/**
 * 정렬 옵션
 */
const SORT_OPTIONS = [
    { value: "UPDATED_DESC", label: "최근 수정 순" },
    { value: "UPDATED_ASC", label: "오래된 수정 순" },
];

/**
 * 시나리오 상태를 화면 표시 정보로 변환합니다.
 */
const getScenarioStatus = (status) => {
    const statusMap = {
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
        ARCHIVED: {
            label: "보관됨",
            className: "is-archived",
        },
    };

    return (
        statusMap[status] ?? {
            label: status,
            className: "is-default",
        }
    );
};

/**
 * ISO 날짜를 화면 표시용 형식으로 변환합니다.
 */
const formatDateTime = (dateTime) => {
    if (!dateTime) return "-";

    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    })
        .format(new Date(dateTime))
        .replace(/\. /g, ".")
        .replace(".", "");
};

function Scenario() {
    /**
     * API 연결 후에는 setScenarios에 조회 결과를 저장합니다.
     */
    const [scenarios, setScenarios] = useState(INITIAL_SCENARIOS);

    /**
     * 생성/수정 모달의 열림 상태입니다.
     */
    const [isScenarioModalOpen, setIsScenarioModalOpen] =
        useState(false);

    /**
     * 수정 중인 시나리오 ID입니다.
     * null이면 새 시나리오 생성 모드입니다.
     */
    const [editingScenarioId, setEditingScenarioId] =
        useState(null);

    /**
     * 현재 선택된 시나리오 ID입니다.
     *
     * 첫 화면에서는 목록만 가운데에 표시하기 위해
     * 선택값을 null로 시작합니다.
     */
    const [selectedScenarioId, setSelectedScenarioId] =
        useState(null);

    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [sortOption, setSortOption] = useState("UPDATED_DESC");

    /**
     * 현재는 페이지네이션 UI만 확인할 수 있도록 구성합니다.
     */
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;

    /**
     * 검색, 상태 필터, 정렬 결과를 계산합니다.
     */
    const filteredScenarios = useMemo(() => {
        const normalizedSearchText = searchText.trim().toLowerCase();

        const result = scenarios.filter((scenario) => {
            const matchesSearch =
                !normalizedSearchText ||
                scenario.name
                    .toLowerCase()
                    .includes(normalizedSearchText) ||
                scenario.scenarioId
                    .toLowerCase()
                    .includes(normalizedSearchText) ||
                scenario.warehouseName
                    .toLowerCase()
                    .includes(normalizedSearchText);

            const matchesStatus =
                statusFilter === "ALL" ||
                scenario.status === statusFilter;

            return matchesSearch && matchesStatus;
        });

        return [...result].sort((firstScenario, secondScenario) => {
            switch (sortOption) {
                case "UPDATED_ASC":
                    return (
                        new Date(firstScenario.updatedAt) -
                        new Date(secondScenario.updatedAt)
                    );

                case "NAME_ASC":
                    return firstScenario.name.localeCompare(
                        secondScenario.name,
                        "ko"
                    );

                case "NAME_DESC":
                    return secondScenario.name.localeCompare(
                        firstScenario.name,
                        "ko"
                    );

                case "UPDATED_DESC":
                default:
                    return (
                        new Date(secondScenario.updatedAt) -
                        new Date(firstScenario.updatedAt)
                    );
            }
        });
    }, [scenarios, searchText, statusFilter, sortOption]);

    /**
     * 전체 페이지 수를 계산합니다.
     */
    const totalPages = Math.max(
        1,
        Math.ceil(filteredScenarios.length / pageSize)
    );

    /**
     * 검색이나 필터 변경으로 현재 페이지가 범위를 벗어나면
     * 마지막 페이지를 사용합니다.
     */
    const safeCurrentPage = Math.min(currentPage, totalPages);

    /**
     * 현재 페이지에 표시할 시나리오 데이터입니다.
     */
    const currentScenarios = filteredScenarios.slice(
        (safeCurrentPage - 1) * pageSize,
        safeCurrentPage * pageSize
    );

    /**
     * 선택한 시나리오 ID를 이용해 상세 데이터를 찾습니다.
     */
    const selectedScenario =
        scenarios.find(
            (scenario) => scenario.id === selectedScenarioId
        ) ?? null;

    /**
     * 수정 모달에 전달할 현재 시나리오입니다.
     */
    const editingScenario =
        scenarios.find(
            (scenario) => scenario.id === editingScenarioId
        ) ?? null;

    /**
     * 검색어 변경
     */
    const handleSearchChange = (event) => {
        setSearchText(event.target.value);
        setCurrentPage(1);
    };

    /**
     * 상태 필터 변경
     */
    const handleStatusChange = (event) => {
        setStatusFilter(event.target.value);
        setCurrentPage(1);
    };

    /**
     * 정렬 조건 변경
     */
    const handleSortChange = (event) => {
        setSortOption(event.target.value);
        setCurrentPage(1);
    };

    /**
     * 검색 및 필터 초기화
     */
    const handleResetFilter = () => {
        setSearchText("");
        setStatusFilter("ALL");
        setSortOption("UPDATED_DESC");
        setCurrentPage(1);
    };

    /**
     * 새 시나리오 입력 팝업을 엽니다.
     */
    const handleCreateScenario = () => {
        setEditingScenarioId(null);
        setIsScenarioModalOpen(true);
    };

    /**
     * 선택한 시나리오의 수정 팝업을 엽니다.
     */
    const handleEditScenario = (scenario) => {
        setEditingScenarioId(scenario.id);
        setIsScenarioModalOpen(true);
    };

    /**
     * 생성/수정 팝업을 닫습니다.
     */
    const handleCloseScenarioModal = () => {
        setIsScenarioModalOpen(false);
        setEditingScenarioId(null);
    };

    /**
     * 팝업에서 전달받은 값을 생성 또는 수정 상태에 반영합니다.
     */
    const handleScenarioSubmit = (submittedData) => {
        const now = new Date().toISOString();

        if (editingScenarioId !== null) {
            setScenarios((previousScenarios) =>
                previousScenarios.map((scenario) =>
                    scenario.id === editingScenarioId
                        ? {
                            ...scenario,
                            ...submittedData,
                            itemCount: submittedData.items.length,
                            updatedAt: now,
                        }
                        : scenario
                )
            );

            /**
             * 수정한 값이 열린 상세 화면에 즉시 반영되도록
             * 선택 상태를 유지합니다.
             */
            setSelectedScenarioId(editingScenarioId);
            handleCloseScenarioModal();
            return;
        }

        const nextId =
            scenarios.reduce(
                (maximumId, scenario) =>
                    Math.max(maximumId, Number(scenario.id) || 0),
                0
            ) + 1;

        const nextScenarioNumber =
            scenarios.reduce((maximumNumber, scenario) => {
                const matchedNumber = Number(
                    String(scenario.scenarioId)
                        .split("-")
                        .at(-1)
                );

                return Number.isNaN(matchedNumber)
                    ? maximumNumber
                    : Math.max(maximumNumber, matchedNumber);
            }, 0) + 1;

        const newScenario = {
            id: nextId,
            scenarioId: `SCN-2026-${String(
                nextScenarioNumber
            ).padStart(3, "0")}`,
            ...submittedData,
            status: "DRAFT",
            itemCount: submittedData.items.length,
            createdAt: now,
            updatedAt: now,
            executionHistory: [],
            replanResult: null,
        };

        setScenarios((previousScenarios) => [
            newScenario,
            ...previousScenarios,
        ]);

        /**
         * 저장 직후 생성한 시나리오의 상세 화면을 엽니다.
         */
        setSelectedScenarioId(newScenario.id);
        setCurrentPage(1);
        handleCloseScenarioModal();
    };

    /**
     * 선택한 시나리오를 삭제합니다.
     */
    const handleDeleteScenario = (scenario) => {
        const shouldDelete = window.confirm(
            `“${scenario.name}” 시나리오를 삭제할까요?`
        );

        if (!shouldDelete) {
            return;
        }

        setScenarios((previousScenarios) =>
            previousScenarios.filter(
                (item) => item.id !== scenario.id
            )
        );

        setSelectedScenarioId(null);
        setCurrentPage(1);
    };

    /**
     * 선택한 시나리오를 오른쪽 상세 영역에 표시합니다.
     */
    const handleScenarioClick = (scenarioId) => {
        setSelectedScenarioId(scenarioId);
    };

    /**
     * 상세 화면을 닫고 목록만 표시합니다.
     */
    const handleCloseDetail = () => {
        setSelectedScenarioId(null);
    };

    return (
        <main className="scenario-page">
            <div
                className={`scenario-workspace ${
                    selectedScenario
                        ? "has-detail"
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
                                placeholder="시나리오명, ID, 창고 검색"
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
                                        const status =
                                            getScenarioStatus(
                                                scenario.status
                                            );

                                        const isSelected =
                                            scenario.id ===
                                            selectedScenarioId;

                                        return (
                                            <tr
                                                key={scenario.id}
                                                className={
                                                    isSelected
                                                        ? "is-selected"
                                                        : ""
                                                }
                                                onClick={() =>
                                                    handleScenarioClick(
                                                        scenario.id
                                                    )
                                                }
                                            >
                                                <td>
                                                    <button
                                                        type="button"
                                                        className="scenario-name-button"
                                                        onClick={(event) => {
                                                            /**
                                                             * 버튼 클릭 이벤트가 행까지 전달되어
                                                             * 같은 함수가 두 번 실행되지 않도록 막습니다.
                                                             */
                                                            event.stopPropagation();

                                                            handleScenarioClick(
                                                                scenario.id
                                                            );
                                                        }}
                                                    >
                                                        <span className="scenario-row-icon">
                                                            ◇
                                                        </span>

                                                        <span className="scenario-name-content">
                                                            <strong>
                                                                {
                                                                    scenario.name
                                                                }
                                                            </strong>

                                                            <small>
                                                                {
                                                                    scenario.scenarioId
                                                                }
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
                                                        {formatDateTime(
                                                            scenario.updatedAt
                                                        )}
                                                    </span>
                                                </td>

                                                <td>
                                                    <button
                                                        type="button"
                                                        className="scenario-more-button"
                                                        aria-label={`${scenario.name} 메뉴 열기`}
                                                        onClick={(event) => {
                                                            /**
                                                             * 더보기 버튼 클릭 시 상세 선택 이벤트가
                                                             * 발생하지 않도록 행 클릭을 차단합니다.
                                                             */
                                                            event.stopPropagation();

                                                            console.log(
                                                                "시나리오 메뉴:",
                                                                scenario
                                                            );
                                                        }}
                                                    >
                                                        ⋮
                                                    </button>
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
                                                검색 결과가 없습니다.
                                            </strong>

                                            <p>
                                                검색어나 필터 조건을 다시
                                                확인해주세요.
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
                                : `${(safeCurrentPage - 1) *
                                pageSize +
                                1
                                }-${Math.min(
                                    safeCurrentPage * pageSize,
                                    filteredScenarios.length
                                )} / ${filteredScenarios.length}`}
                        </span>

                        <div className="scenario-pagination">
                            <button
                                type="button"
                                disabled={safeCurrentPage === 1}
                                onClick={() =>
                                    setCurrentPage((previousPage) =>
                                        Math.max(
                                            1,
                                            previousPage - 1
                                        )
                                    )
                                }
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
                                    setCurrentPage((previousPage) =>
                                        Math.min(
                                            totalPages,
                                            previousPage + 1
                                        )
                                    )
                                }
                                aria-label="다음 페이지"
                            >
                                ›
                            </button>
                        </div>
                    </footer>
                </section>

                {/* 오른쪽 시나리오 상세 영역 */}
                {selectedScenario && (
                    <ScenarioDetail
                        scenario={selectedScenario}
                        onClose={handleCloseDetail}
                        onEdit={handleEditScenario}
                        onDelete={handleDeleteScenario}
                    />
                )}
            </div>

            {/* 시나리오 생성/수정 모달 */}
            {isScenarioModalOpen && (
                <ScenarioCreateModal
                    key={editingScenario?.id ?? "create"}
                    mode={editingScenario ? "edit" : "create"}
                    initialScenario={editingScenario}
                    onClose={handleCloseScenarioModal}
                    onSubmit={handleScenarioSubmit}
                />
            )}
        </main>
    );
}

export default Scenario;