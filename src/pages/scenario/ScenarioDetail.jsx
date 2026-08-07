import "../../styles/scenario/ScenarioDetail.css";

/**
 * API 연결 전 최근 재계획 결과 확인용 임시 데이터
 * API 연결 후 scenario.replanResult 응답으로 교체합니다.
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

const getOptimizationStatus = (status) => {
    const statusMap = {
        SUCCESS: { label: "성공", className: "is-success" },
        FAILED: { label: "실패", className: "is-failed" },
        PROCESSING: { label: "처리 중", className: "is-processing" },
        PENDING: { label: "대기", className: "is-pending" },
    };

    return (
        statusMap[status] ?? {
            label: status || "상태 없음",
            className: "is-default",
        }
    );
};

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

    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    })
        .format(date)
        .replace(/\. /g, ".")
        .replace(".", "");
};

function ScenarioDetail({
    scenario,
    onClose,
    onEdit,
    onDelete,
}) {
    if (!scenario) {
        return (
            <section className="scenario-detail-card scenario-detail-placeholder">
                <div className="scenario-detail-placeholder-icon">◇</div>
                <h2>시나리오를 선택해주세요.</h2>
                <p>왼쪽 목록에서 시나리오를 선택하면 상세 정보가 표시됩니다.</p>
            </section>
        );
    }

    const replanResult = Object.prototype.hasOwnProperty.call(
        scenario,
        "replanResult"
    )
        ? scenario.replanResult
        : MOCK_REPLAN_RESULT;

    const optimizationStatus = getOptimizationStatus(replanResult?.status);

    const handleRun = () => {
        console.log("실행할 시나리오:", scenario);
    };

    const handleOpenReplanHistory = () => {
        const scenarioId = scenario.scenarioId || "";
        const target = scenarioId
            ? `/replan-history?scenarioId=${encodeURIComponent(scenarioId)}`
            : "/replan-history";

        window.location.assign(target);
    };

    return (
        <section className="scenario-detail-card">
            <header className="scenario-inline-detail-header">
                <div className="scenario-inline-title-area">
                    <div className="scenario-detail-title-icon" aria-hidden="true">
                        ◇
                    </div>

                    <div className="scenario-inline-title-content">
                        <div className="scenario-detail-title-row">
                            <h2>{scenario.name}</h2>
                        </div>

                        <div className="scenario-detail-sub-info">
                            <span>{scenario.scenarioId || "-"}</span>
                            <span>·</span>
                            <span>
                                최근 수정 {formatDateTime(scenario.updatedAt)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="scenario-detail-header-actions">
                    <button
                        type="button"
                        className="scenario-button scenario-button-secondary"
                        onClick={() => onEdit?.(scenario)}
                    >
                        수정
                    </button>

                    <button
                        type="button"
                        className="scenario-button scenario-button-danger"
                        onClick={() => onDelete?.(scenario)}
                    >
                        삭제
                    </button>

                    <button
                        type="button"
                        className="scenario-button scenario-button-primary"
                        onClick={handleRun}
                    >
                        실행
                    </button>

                    <button
                        type="button"
                        className="scenario-detail-close-button"
                        onClick={() => onClose?.()}
                        aria-label="시나리오 상세 닫기"
                    >
                        ×
                    </button>
                </div>
            </header>

            <div className="scenario-inline-detail-body">
                {/* 시나리오 정보 */}
                <section className="scenario-detail-section">
                    <div className="scenario-detail-section-header">
                        <div>
                            <h3>시나리오 정보</h3>
                            <p>현재 시나리오의 핵심 운영 조건입니다.</p>
                        </div>
                    </div>

                    <div className="scenario-info-card">
                        <div className="scenario-info-main">
                            <div className="scenario-info-warehouse">
                                <span className="scenario-info-label">적용 창고</span>
                                <strong>{scenario.warehouseName || "-"}</strong>
                            </div>

                            <div className="scenario-info-description">
                                <span className="scenario-info-label">설명</span>
                                <p>
                                    {scenario.description ||
                                        "등록된 시나리오 설명이 없습니다."}
                                </p>
                            </div>
                        </div>

                        <div className="scenario-info-divider" />

                        <div className="scenario-info-robot-area">
                            <div className="scenario-info-row-heading">
                                <span className="scenario-info-label">로봇 유형</span>
                                <span className="scenario-info-count">
                                    {scenario.robotTypes?.length ?? 0}개
                                </span>
                            </div>

                            {scenario.robotTypes?.length > 0 ? (
                                <div className="scenario-info-robot-list">
                                    {scenario.robotTypes.map((robotType) => (
                                        <span
                                            key={robotType}
                                            className="scenario-info-robot-tag"
                                        >
                                            ◇ {robotType}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <span className="scenario-info-empty">
                                    등록된 로봇 유형이 없습니다.
                                </span>
                            )}
                        </div>

                        <div className="scenario-info-setting-grid">
                            <article className="scenario-info-setting-item">
                                <span>초기 배터리</span>
                                <strong>{scenario.initialBattery ?? 100}%</strong>
                            </article>

                            <article className="scenario-info-setting-item">
                                <span>충전 전환 기준</span>
                                <strong>{scenario.chargeThreshold ?? 20}%</strong>
                            </article>

                            <article className="scenario-info-setting-item is-wide">
                                <span>재계획 방식</span>
                                <strong>
                                    {getReplanMethodLabel(scenario.replanMethod)}
                                </strong>
                            </article>
                        </div>
                    </div>
                </section>

                {/* 최근 재계획 */}
                <section className="scenario-detail-section">
                    <div className="scenario-detail-section-header scenario-replan-section-header">
                        <div>
                            <h3>최근 재계획</h3>
                            <p>가장 최근 수행된 재계획 결과입니다.</p>
                        </div>

                        <div className="scenario-replan-header-actions">
                            <span className="scenario-replan-latest-badge">
                                최근 결과
                            </span>

                            <button
                                type="button"
                                className="scenario-replan-all-button"
                                onClick={handleOpenReplanHistory}
                            >
                                전체 보기
                            </button>
                        </div>
                    </div>

                    {replanResult ? (
                        <div className="scenario-replan-compact">
                            <div className="scenario-replan-summary-grid">
                                <article className="scenario-replan-summary-item">
                                    <span>상태</span>
                                    <strong
                                        className={`scenario-replan-status ${optimizationStatus.className}`}
                                    >
                                        {optimizationStatus.label}
                                    </strong>
                                </article>

                                <article className="scenario-replan-summary-item">
                                    <span>재계획 유형</span>
                                    <strong>
                                        {getOptimizationTypeLabel(
                                            replanResult.optimizationType
                                        )}
                                    </strong>
                                </article>

                                <article className="scenario-replan-summary-item">
                                    <span>발생 사유</span>
                                    <strong>
                                        {getReoptimizationReasonLabel(
                                            replanResult.reoptimizationReason
                                        )}
                                    </strong>
                                </article>

                                <article className="scenario-replan-summary-item">
                                    <span>관련 로봇</span>
                                    <strong>
                                        {replanResult.triggerRobotId || "-"}
                                    </strong>
                                </article>
                            </div>

                            <div className="scenario-replan-message">
                                <span className="scenario-info-label">결과 설명</span>
                                <p>
                                    {replanResult.description ||
                                        "등록된 재계획 결과 설명이 없습니다."}
                                </p>
                            </div>

                            <div className="scenario-replan-meta">
                                <div>
                                    <span>실행 ID</span>
                                    <strong>
                                        {replanResult.simulationRunId || "-"}
                                    </strong>
                                </div>

                                <div>
                                    <span>요청 ID</span>
                                    <strong>{replanResult.requestId || "-"}</strong>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="scenario-replan-empty">
                            <strong>재계획 결과가 없습니다.</strong>
                            <p>재계획이 실행되면 최근 결과가 표시됩니다.</p>
                        </div>
                    )}
                </section>
            </div>
        </section>
    );
}

export default ScenarioDetail;