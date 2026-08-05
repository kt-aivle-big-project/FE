import { useState } from "react";
import "../../styles/scenario/ScenarioDetail.css";
/**
 * API 연결 전 실행 이력 확인용 임시 데이터
 *
 * API 연결 후에는 scenario.executionHistory 또는
 * 실행 이력 조회 API의 응답으로 교체합니다.
 */
const MOCK_EXECUTION_HISTORY = [
    {
        id: 5,
        simulationRunId: "RUN-2026-0005",
        startedAt: "2026-07-28T10:12:35",
        status: "COMPLETED",
        duration: "00:04:21",
        executorName: "",
    },
    {
        id: 4,
        simulationRunId: "RUN-2026-0004",
        startedAt: "2026-07-28T09:45:10",
        status: "RUNNING",
        duration: "00:01:37",
        executorName: "",
    },
    {
        id: 3,
        simulationRunId: "RUN-2026-0003",
        startedAt: "2026-07-28T09:30:22",
        status: "COMPLETED",
        duration: "00:03:48",
        executorName: "",
    },
    {
        id: 2,
        simulationRunId: "RUN-2026-0002",
        startedAt: "2026-07-27T17:18:05",
        status: "FAILED",
        duration: "00:02:15",
        executorName: "",
    },
    {
        id: 1,
        simulationRunId: "RUN-2026-0001",
        startedAt: "2026-07-27T15:02:41",
        status: "COMPLETED",
        duration: "00:03:02",
        executorName: "",
    },
];

/**
 * API 연결 전 최근 재계획 결과 확인용 임시 데이터
 */
const MOCK_REPLAN_RESULT = {
    requestId: "OPT-REQ-2026-001",
    warehouseId: "WH-001",
    simulationRunId: "RUN-2026-0005",
    status: "SUCCESS",
    optimizationType: "PARTIAL_REOPTIMIZATION",
    reoptimizationReason: "ROBOT_FAILURE",
    triggerRobotId: "ROBOT-003",
    description:
        "ROBOT-003 고장으로 인해 영향을 받은 작업을 정상 로봇에 재배정하고 우회 경로를 생성했습니다.",
};

/**
 * 실행 상태를 화면에 표시할 정보로 변환합니다.
 */
const getExecutionStatus = (status) => {
    const statusMap = {
        COMPLETED: {
            label: "완료",
            symbol: "✓",
            className: "is-completed",
        },
        RUNNING: {
            label: "실행 중",
            symbol: "↻",
            className: "is-running",
        },
        FAILED: {
            label: "실패",
            symbol: "!",
            className: "is-failed",
        },
    };

    return (
        statusMap[status] ?? {
            label: status || "-",
            symbol: "",
            className: "is-default",
        }
    );
};

/**
 * 최적화 결과 상태를 화면 표시 정보로 변환합니다.
 */
const getOptimizationStatus = (status) => {
    const statusMap = {
        SUCCESS: {
            label: "성공",
            className: "is-success",
        },
        FAILED: {
            label: "실패",
            className: "is-failed",
        },
        PROCESSING: {
            label: "처리 중",
            className: "is-processing",
        },
        PENDING: {
            label: "대기",
            className: "is-pending",
        },
    };

    return (
        statusMap[status] ?? {
            label: status || "상태 없음",
            className: "is-default",
        }
    );
};

/**
 * 최적화 유형을 화면 표시용 이름으로 변환합니다.
 */
const getOptimizationTypeLabel = (type) => {
    const typeMap = {
        INITIAL_OPTIMIZATION: "초기 최적화",
        FULL_REOPTIMIZATION: "전체 재최적화",
        PARTIAL_REOPTIMIZATION: "부분 재최적화",
        ROUTE_REOPTIMIZATION: "경로 재최적화",
        TASK_REASSIGNMENT: "작업 재배정",
    };

    return typeMap[type] ?? type ?? "-";
};

/**
 * 재계획 사유를 화면 표시용 이름으로 변환합니다.
 */
const getReoptimizationReasonLabel = (reason) => {
    const reasonMap = {
        ROBOT_FAILURE: "로봇 고장",
        LOW_BATTERY: "배터리 부족",
        PATH_BLOCKED: "통로 차단",
        ORDER_INCREASE: "주문 증가",
        INVENTORY_SHORTAGE: "재고 부족",
        TASK_DELAY: "작업 지연",
        MANUAL_REQUEST: "관리자 요청",
    };

    return reasonMap[reason] ?? reason ?? "-";
};
/**
 * 시나리오 설정 페이지 오른쪽 상세 영역
 *
 * 별도 라우팅 없이 Scenario.jsx에서 선택한 시나리오를
 * props로 전달받아 표시합니다.
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
    };

    return (
        statusMap[status] ?? {
            label: status || "상태 없음",
            className: "is-default",
        }
    );
};

/**
 * 상세 화면에서 선택할 수 있는 시나리오 상태입니다.
 */
const SCENARIO_STATUS_OPTIONS = [
    { value: "DRAFT", label: "초안" },
    { value: "VALIDATING", label: "검증 중" },
    { value: "VALIDATED", label: "검증 완료" },
];

const getReplanMethodLabel = (method) => {
    const methodMap = {
        AFFECTED_TASKS_ONLY: "영향받은 작업만 재계획",
        ALL_TASKS: "전체 작업 재계획",
        PATH_ONLY: "경로만 재계산",
    };

    return methodMap[method] ?? method ?? "-";
};


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

function ScenarioDetail({
    scenario,
    onClose,
    onEdit,
    onDelete,
    onStatusChange,
}) {
    /**
     * 상세 상단의 상태 선택 메뉴 열림 여부입니다.
     *
     * Hooks는 조건문보다 먼저 호출해야 하므로
     * scenario 존재 여부를 확인하기 전에 선언합니다.
     */
    const [isStatusMenuOpen, setIsStatusMenuOpen] =
        useState(false);

    /**
     * 아직 선택한 시나리오가 없는 경우
     */
    if (!scenario) {
        return (
            <section className="scenario-detail-card scenario-detail-placeholder">
                <div className="scenario-detail-placeholder-icon">
                    ◇
                </div>

                <h2>시나리오를 선택해주세요.</h2>

                <p>
                    왼쪽 목록에서 확인할 시나리오를 선택하면
                    상세 정보가 표시됩니다.
                </p>
            </section>
        );
    }

    const status = getScenarioStatus(scenario.status);

    /**
     * 시나리오 조회 응답에 포함된 상품 목록입니다.
     *
     * 새로 입력한 상품은 백엔드 저장 전까지 productCode가 없을 수 있으므로
     * 빈 배열과 코드 미생성 상태를 모두 안전하게 처리합니다.
     */
    const products = Array.isArray(scenario.products)
        ? scenario.products
        : [];

    /**
     * 현재 시나리오의 수정 모달을 엽니다.
     */
    const handleEdit = () => {
        onEdit?.(scenario);
    };

    /**
     * 현재 시나리오를 삭제합니다.
     */
    const handleDelete = () => {
        onDelete?.(scenario);
    };

    /**
     * 상태 선택 메뉴를 열거나 닫습니다.
     */
    const handleToggleStatusMenu = () => {
        setIsStatusMenuOpen((previousOpen) => !previousOpen);
    };

    /**
     * 사용자가 선택한 상태로 시나리오 상태를 변경합니다.
     */
    const handleSelectStatus = (nextStatus) => {
        if (nextStatus !== scenario.status) {
            onStatusChange?.(scenario, nextStatus);
        }

        setIsStatusMenuOpen(false);
    };

    /**
     * 상세 화면을 닫고 목록 화면으로 돌아갑니다.
     */
    const handleClose = () => {
        onClose?.();
    };

    const handleRun = () => {
        console.log("실행할 시나리오:", scenario);
    };

    /**
 * API 데이터가 있으면 해당 데이터를 사용하고,
 * 없으면 화면 확인용 목업 데이터를 사용합니다.
 */
    const executionHistory =
        scenario.executionHistory ?? MOCK_EXECUTION_HISTORY;

    const replanResult = Object.prototype.hasOwnProperty.call(
        scenario,
        "replanResult"
    )
        ? scenario.replanResult
        : MOCK_REPLAN_RESULT;

    const optimizationStatus = getOptimizationStatus(
        replanResult?.status
    );

    const optimizationTypeLabel = getOptimizationTypeLabel(
        replanResult?.optimizationType
    );

    const reoptimizationReasonLabel =
        getReoptimizationReasonLabel(
            replanResult?.reoptimizationReason
        );
    return (
        <section className="scenario-detail-card">
            {/* 상세 상단 */}
            <header className="scenario-inline-detail-header">
                <div className="scenario-inline-title-area">
                    <div className="scenario-detail-title-icon">
                        ◇
                    </div>

                    <div className="scenario-inline-title-content">
                        <div className="scenario-detail-title-row">
                            <h2>{scenario.name}</h2>

                            <div
                                className="scenario-detail-status-control"
                                onBlur={(event) => {
                                    if (
                                        !event.currentTarget.contains(
                                            event.relatedTarget
                                        )
                                    ) {
                                        setIsStatusMenuOpen(false);
                                    }
                                }}
                            >
                                <button
                                    type="button"
                                    className={`scenario-status scenario-status-button ${status.className}`}
                                    onClick={handleToggleStatusMenu}
                                    aria-haspopup="listbox"
                                    aria-expanded={isStatusMenuOpen}
                                    aria-label={`현재 상태 ${status.label}. 상태 변경`}
                                >
                                    <span className="scenario-status-dot" />
                                    {status.label}
                                    <span
                                        className="scenario-status-arrow"
                                        aria-hidden="true"
                                    >
                                        ▾
                                    </span>
                                </button>

                                {isStatusMenuOpen && (
                                    <div
                                        className="scenario-status-menu"
                                        role="listbox"
                                        aria-label="시나리오 상태 선택"
                                    >
                                        {SCENARIO_STATUS_OPTIONS.map(
                                            (option) => {
                                                const isSelected =
                                                    scenario.status ===
                                                    option.value;

                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        className={`scenario-status-menu-option ${
                                                            isSelected
                                                                ? "is-selected"
                                                                : ""
                                                        }`}
                                                        role="option"
                                                        aria-selected={
                                                            isSelected
                                                        }
                                                        onClick={() =>
                                                            handleSelectStatus(
                                                                option.value
                                                            )
                                                        }
                                                    >
                                                        {option.label}
                                                    </button>
                                                );
                                            }
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="scenario-detail-sub-info">
                            <span>{scenario.scenarioId}</span>
                            <span>·</span>
                            <span>
                                최근 수정{" "}
                                {formatDateTime(scenario.updatedAt)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="scenario-detail-header-actions">
                    <button
                        type="button"
                        className="scenario-button scenario-button-secondary"
                        onClick={handleEdit}
                    >
                        수정
                    </button>

                    <button
                        type="button"
                        className="scenario-button scenario-button-danger"
                        onClick={handleDelete}
                    >
                        삭제
                    </button>

                    <button
                        type="button"
                        className="scenario-button scenario-button-primary"
                        onClick={handleRun}
                    >
                        시뮬레이션 실행
                    </button>

                    <button
                        type="button"
                        className="scenario-detail-close-button"
                        onClick={handleClose}
                        aria-label="시나리오 상세 닫기"
                    >
                        ×
                    </button>
                </div>
            </header>

            {/* 상세 본문 */}
            <div className="scenario-inline-detail-body">
                {/* =========================================================
    기본 정보
    적용 창고, 설명, 로봇 유형, 운영 설정을 하나로 표시
    ========================================================= */}
                <section className="scenario-detail-section">
                    <div className="scenario-detail-section-header">
                        <div>
                            <h3>기본 정보</h3>

                            <p>
                                시나리오의 적용 대상과 핵심 운영 설정을 확인합니다.
                            </p>
                        </div>
                    </div>

                    <div className="scenario-overview">
                        {/* 상단: 적용 창고 + 시나리오 설명 */}
                        <div className="scenario-overview-primary">
                            {/* 적용 창고 */}
                            <article className="scenario-overview-warehouse">
                                <span className="scenario-overview-label">
                                    적용 창고
                                </span>

                                <div className="scenario-overview-warehouse-value">
                                    <span
                                        className="scenario-overview-warehouse-icon"
                                        aria-hidden="true"
                                    >
                                        ▣
                                    </span>

                                    <strong>
                                        {scenario.warehouseName || "-"}
                                    </strong>
                                </div>
                            </article>

                            {/* 설명 */}
                            <article className="scenario-overview-description">
                                <span className="scenario-overview-label">
                                    설명
                                </span>

                                <p>
                                    {scenario.description ||
                                        "등록된 시나리오 설명이 없습니다."}
                                </p>
                            </article>
                        </div>

                        {/* 하단: 로봇 유형 + 배터리 및 재계획 설정 */}
                        <div className="scenario-overview-secondary">
                            {/* 로봇 유형 */}
                            <article className="scenario-overview-robot">
                                <div className="scenario-overview-block-header">
                                    <div>
                                        <span className="scenario-overview-label">
                                            로봇 유형
                                        </span>

                                        <p>
                                            시나리오에서 사용하는 작업 유형입니다.
                                        </p>
                                    </div>

                                    <span className="scenario-overview-count">
                                        {scenario.robotTypes?.length ?? 0}개
                                    </span>
                                </div>

                                {scenario.robotTypes?.length > 0 ? (
                                    <div className="scenario-overview-robot-list">
                                        {scenario.robotTypes.map((robotType) => (
                                            <span
                                                key={robotType}
                                                className="scenario-overview-robot-tag"
                                            >
                                                <span aria-hidden="true">◇</span>
                                                {robotType}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="scenario-overview-empty">
                                        등록된 로봇 유형이 없습니다.
                                    </p>
                                )}
                            </article>

                            {/* 배터리 및 재계획 설정 */}
                            <article className="scenario-overview-settings">
                                <div className="scenario-overview-block-header">
                                    <div>
                                        <span className="scenario-overview-label">
                                            배터리 및 재계획 설정
                                        </span>

                                        <p>
                                            로봇 운영 기준과 재계획 방식을 확인합니다.
                                        </p>
                                    </div>
                                </div>

                                <div className="scenario-overview-setting-grid">
                                    {/* 초기 배터리 */}
                                    <div className="scenario-overview-setting-item">
                                        <div className="scenario-overview-setting-heading">
                                            <span>초기 배터리</span>

                                            <strong>
                                                {scenario.initialBattery ?? 100}%
                                            </strong>
                                        </div>

                                        <div className="scenario-overview-progress">
                                            <span
                                                style={{
                                                    width: `${Math.min(
                                                        Math.max(
                                                            scenario.initialBattery ??
                                                            100,
                                                            0
                                                        ),
                                                        100
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* 충전 전환 기준 */}
                                    <div className="scenario-overview-setting-item">
                                        <div className="scenario-overview-setting-heading">
                                            <span>충전 전환 기준</span>

                                            <strong>
                                                {scenario.chargeThreshold ?? 20}%
                                            </strong>
                                        </div>

                                        <div className="scenario-overview-progress is-warning">
                                            <span
                                                style={{
                                                    width: `${Math.min(
                                                        Math.max(
                                                            scenario.chargeThreshold ??
                                                            20,
                                                            0
                                                        ),
                                                        100
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* 재계획 방식 */}
                                    <div className="scenario-overview-setting-item is-replan">
                                        <span>재계획 방식</span>

                                        <strong>
                                            {getReplanMethodLabel(
                                                scenario.replanMethod
                                            )}
                                        </strong>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="scenario-detail-section">
                    <div className="scenario-detail-section-header">
                        <div>
                            <h3>시나리오 상품</h3>
                            <p>시나리오에 포함된 상품을 확인합니다.</p>
                        </div>

                        <span className="scenario-detail-section-count">
                            {products.length}개
                        </span>
                    </div>

                    {products.length > 0 ? (
                        <div className="scenario-item-card-list">
                            {products.map((product, index) => (
                                <article
                                    key={
                                        product.productCode ??
                                        `${product.productName}-${index}`
                                    }
                                    className="scenario-item-card"
                                >
                                    <div className="scenario-item-card-icon">
                                        ▦
                                    </div>

                                    <div className="scenario-item-card-content">
                                        <strong>
                                            {product.productName}
                                        </strong>

                                        <span>
                                            {product.productCode ??
                                                "상품 코드 생성 예정"}
                                        </span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="scenario-item-empty">
                            <div className="scenario-item-empty-icon">
                                ▦
                            </div>

                            <strong>등록된 상품이 없습니다.</strong>

                            <p>
                                이 시나리오에 포함된 상품이 아직 없습니다.
                            </p>
                        </div>
                    )}
                </section>

                {/* 실행 이력 */}
                <section className="scenario-detail-section">
                    <div className="scenario-detail-section-header">
                        <div>
                            <h3>실행 이력</h3>
                            <p>
                                시나리오 실행 기록과 현재 상태를 확인합니다.
                            </p>
                        </div>

                        <span className="scenario-history-count">
                            최근 {executionHistory.length}건
                        </span>
                    </div>

                    {executionHistory.length > 0 ? (
                        <div className="scenario-history-table-wrapper">
                            <table className="scenario-history-table">
                                <thead>
                                    <tr>
                                        <th>실행 ID</th>
                                        <th>실행 시각</th>
                                        <th>상태</th>
                                        <th>소요 시간</th>
                                        <th>실행자</th>
                                        <th aria-label="작업" />
                                    </tr>
                                </thead>

                                <tbody>
                                    {executionHistory.map((history, index) => {
                                        const status = getExecutionStatus(
                                            history.status
                                        );

                                        return (
                                            <tr
                                                key={history.id ?? history.simulationRunId}
                                                className={
                                                    index === 0 ? "is-latest" : ""
                                                }
                                            >
                                                <td>
                                                    <strong className="scenario-history-run-id">
                                                        {history.simulationRunId}
                                                    </strong>
                                                </td>

                                                <td>
                                                    <span className="scenario-history-date">
                                                        {formatDateTime(
                                                            history.startedAt
                                                        )}
                                                    </span>
                                                </td>

                                                <td>
                                                    <span
                                                        className={`scenario-execution-status ${status.className}`}
                                                    >
                                                        <span aria-hidden="true">
                                                            {status.symbol}
                                                        </span>

                                                        {status.label}
                                                    </span>
                                                </td>

                                                <td>
                                                    <strong className="scenario-history-duration">
                                                        {history.duration || "-"}
                                                    </strong>
                                                </td>

                                                <td>
                                                    <span className="scenario-history-executor">
                                                        {history.executorName || "-"}
                                                    </span>
                                                </td>

                                                <td>
                                                    <button
                                                        type="button"
                                                        className="scenario-history-more-button"
                                                        aria-label={`${history.simulationRunId} 메뉴 열기`}
                                                        onClick={() =>
                                                            console.log(
                                                                "실행 이력 메뉴:",
                                                                history
                                                            )
                                                        }
                                                    >
                                                        ⋮
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="scenario-history-empty">
                            <div className="scenario-history-empty-icon">
                                ↻
                            </div>

                            <strong>실행 이력이 없습니다.</strong>

                            <p>
                                이 시나리오를 실행하면 실행 기록이 표시됩니다.
                            </p>
                        </div>
                    )}
                </section>

                {/* 재계획 결과 */}
                <section className="scenario-detail-section">
                    <div className="scenario-detail-section-header scenario-replan-section-header">
                        <div className="scenario-replan-section-title">
                            <span
                                className="scenario-replan-section-icon"
                                aria-hidden="true"
                            >
                                ▣
                            </span>

                            <div>
                                <h3>재계획 결과</h3>

                                <p>
                                    이상 상황 발생 후 수행된 최적화 결과를
                                    확인합니다.
                                </p>
                            </div>
                        </div>

                        <span className="scenario-replan-latest-badge">
                            <span aria-hidden="true">◷</span>
                            최근 결과
                        </span>
                    </div>

                    {replanResult ? (
                        <div className="scenario-replan-result">
                            {/* 핵심 결과 요약 */}
                            <div className="scenario-replan-highlight-grid">
                                {/* 상태 */}
                                <article className="scenario-replan-highlight-card">
                                    <span
                                        className={`scenario-replan-highlight-icon is-status ${optimizationStatus.className}`}
                                        aria-hidden="true"
                                    >
                                        ✓
                                    </span>

                                    <div className="scenario-replan-highlight-content">
                                        <span>상태</span>

                                        <strong
                                            className={`scenario-replan-highlight-value ${optimizationStatus.className}`}
                                        >
                                            {optimizationStatus.label}
                                        </strong>
                                    </div>
                                </article>

                                {/* 최적화 유형 */}
                                <article className="scenario-replan-highlight-card">
                                    <span
                                        className="scenario-replan-highlight-icon is-type"
                                        aria-hidden="true"
                                    >
                                        ⚙
                                    </span>

                                    <div className="scenario-replan-highlight-content">
                                        <span>최적화 유형</span>

                                        <strong className="scenario-replan-highlight-value is-primary">
                                            {optimizationTypeLabel}
                                        </strong>
                                    </div>
                                </article>

                                {/* 재계획 사유 */}
                                <article className="scenario-replan-highlight-card">
                                    <span
                                        className="scenario-replan-highlight-icon is-reason"
                                        aria-hidden="true"
                                    >
                                        !
                                    </span>

                                    <div className="scenario-replan-highlight-content">
                                        <span>재계획 사유</span>

                                        <strong className="scenario-replan-highlight-value">
                                            {reoptimizationReasonLabel}
                                        </strong>
                                    </div>
                                </article>

                                {/* 트리거 로봇 */}
                                <article className="scenario-replan-highlight-card">
                                    <span
                                        className="scenario-replan-highlight-icon is-robot"
                                        aria-hidden="true"
                                    >
                                        ◇
                                    </span>

                                    <div className="scenario-replan-highlight-content">
                                        <span>트리거 로봇</span>

                                        <strong className="scenario-replan-highlight-value is-robot">
                                            {replanResult.triggerRobotId || "-"}
                                        </strong>
                                    </div>
                                </article>
                            </div>

                            {/* 설명 + 실행 추적 정보 */}
                            <div className="scenario-replan-detail-grid">
                                {/* 결과 설명 */}
                                <article className="scenario-replan-description-card">
                                    <div className="scenario-replan-card-heading">
                                        <span
                                            className="scenario-replan-card-heading-icon"
                                            aria-hidden="true"
                                        >
                                            ≡
                                        </span>

                                        <h4>결과 설명</h4>
                                    </div>

                                    <div className="scenario-replan-description-content">
                                        <p>
                                            {replanResult.description ||
                                                "등록된 재계획 결과 설명이 없습니다."}
                                        </p>
                                    </div>
                                </article>

                                {/* 실행 추적 정보 */}
                                <article className="scenario-replan-trace-card">
                                    <div className="scenario-replan-card-heading">
                                        <span
                                            className="scenario-replan-card-heading-icon"
                                            aria-hidden="true"
                                        >
                                            ⇄
                                        </span>

                                        <h4>실행 추적 정보</h4>
                                    </div>

                                    <dl className="scenario-replan-trace-list">
                                        <div>
                                            <dt>
                                                <span
                                                    className="scenario-replan-trace-icon"
                                                    aria-hidden="true"
                                                >
                                                    ▣
                                                </span>

                                                요청 ID
                                            </dt>

                                            <dd>
                                                {replanResult.requestId || "-"}
                                            </dd>
                                        </div>

                                        <div>
                                            <dt>
                                                <span
                                                    className="scenario-replan-trace-icon"
                                                    aria-hidden="true"
                                                >
                                                    ▶
                                                </span>

                                                시뮬레이션 실행 ID
                                            </dt>

                                            <dd>
                                                {replanResult.simulationRunId || "-"}
                                            </dd>
                                        </div>

                                        <div>
                                            <dt>
                                                <span
                                                    className="scenario-replan-trace-icon"
                                                    aria-hidden="true"
                                                >
                                                    ⌂
                                                </span>

                                                창고 ID
                                            </dt>

                                            <dd>
                                                {replanResult.warehouseId || "-"}
                                            </dd>
                                        </div>

                    
                                    </dl>
                                </article>
                            </div>
                        </div>
                    ) : (
                        <div className="scenario-replan-empty">
                            <div className="scenario-replan-empty-icon">
                                ↻
                            </div>

                            <strong>재계획 결과가 없습니다.</strong>

                            <p>
                                재계획이 실행되면 최적화 결과가 표시됩니다.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </section>
    );
}

export default ScenarioDetail;