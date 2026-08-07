import { useNavigate, useSearchParams } from "react-router-dom";
import "../../styles/scenario/ScenarioReplanHistory.css";

/**
 * API 연결 전 화면 확인용 임시 재계획 이력입니다.
 * 실제 API 연결 후 조회 응답으로 교체하면 됩니다.
 */
const MOCK_REPLAN_HISTORY = [
    {
        id: 1,
        requestId: "OPT-REQ-2026-005",
        simulationRunId: "RUN-2026-0005",
        createdAt: "2026-08-07T13:42:00",
        status: "SUCCESS",
        optimizationType: "PARTIAL_REOPTIMIZATION",
        reoptimizationReason: "ROBOT_FAILURE",
        triggerRobotId: "ROBOT-003",
        description:
            "ROBOT-003 고장으로 인해 영향을 받은 작업을 정상 로봇에 재배정하고 우회 경로를 생성했습니다.",
    },
    {
        id: 2,
        requestId: "OPT-REQ-2026-004",
        simulationRunId: "RUN-2026-0004",
        createdAt: "2026-08-07T11:18:00",
        status: "SUCCESS",
        optimizationType: "ROUTE_REOPTIMIZATION",
        reoptimizationReason: "PATH_BLOCKED",
        triggerRobotId: "ROBOT-002",
        description:
            "통로 차단 구간을 제외하고 대체 이동 경로를 계산했습니다.",
    },
    {
        id: 3,
        requestId: "OPT-REQ-2026-003",
        simulationRunId: "RUN-2026-0003",
        createdAt: "2026-08-06T16:05:00",
        status: "FAILED",
        optimizationType: "TASK_REASSIGNMENT",
        reoptimizationReason: "LOW_BATTERY",
        triggerRobotId: "ROBOT-004",
        description:
            "배터리 부족으로 작업 재배정을 시도했으나 할당 가능한 로봇이 없어 실패했습니다.",
    },
];

const getStatusInfo = (status) => {
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
            label: status || "-",
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

const formatDateTime = (dateTime) => {
    if (!dateTime) return "-";

    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).format(date);
};

function ScenarioReplanHistory() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const scenarioId = searchParams.get("scenarioId");

    /**
     * API 연결 후에는 이 부분을 서버 응답으로 교체합니다.
     */
    const replanHistory = MOCK_REPLAN_HISTORY;

    const successCount = replanHistory.filter(
        (history) => history.status === "SUCCESS"
    ).length;

    const failedCount = replanHistory.filter(
        (history) => history.status === "FAILED"
    ).length;

    const handleBack = () => {
        navigate("/scenario");
    };

    return (
        <main className="scenario-replan-history-page">
            {/* 페이지 상단 */}
            <header className="scenario-replan-history-header">
                <div>
                    <button
                        type="button"
                        className="scenario-replan-history-back"
                        onClick={handleBack}
                    >
                        ← 시나리오로 돌아가기
                    </button>

                    <h1>재계획 히스토리</h1>

                    <p>
                        {scenarioId
                            ? `${scenarioId} 시나리오의 전체 재계획 기록입니다.`
                            : "시나리오에서 수행된 전체 재계획 기록입니다."}
                    </p>
                </div>
            </header>

            {/* 요약 */}
            <section className="scenario-replan-history-summary">
                <article className="scenario-replan-history-summary-card">
                    <span>전체 재계획</span>
                    <strong>{replanHistory.length}</strong>
                </article>

                <article className="scenario-replan-history-summary-card">
                    <span>성공</span>
                    <strong className="is-success">{successCount}</strong>
                </article>

                <article className="scenario-replan-history-summary-card">
                    <span>실패</span>
                    <strong className="is-failed">{failedCount}</strong>
                </article>

                <article className="scenario-replan-history-summary-card">
                    <span>최근 실행</span>
                    <strong className="is-date">
                        {formatDateTime(replanHistory[0]?.createdAt)}
                    </strong>
                </article>
            </section>

            {/* 전체 이력 */}
            <section className="scenario-replan-history-content">
                <div className="scenario-replan-history-content-header">
                    <div>
                        <h2>전체 재계획 기록</h2>
                        <p>
                            최근 수행된 재계획부터 순서대로 확인할 수 있습니다.
                        </p>
                    </div>

                    <span className="scenario-replan-history-count">
                        총 {replanHistory.length}건
                    </span>
                </div>

                {replanHistory.length > 0 ? (
                    <div className="scenario-replan-history-table-wrapper">
                        <table className="scenario-replan-history-table">
                            <thead>
                                <tr>
                                    <th>실행 시각</th>
                                    <th>상태</th>
                                    <th>재계획 유형</th>
                                    <th>발생 사유</th>
                                    <th>관련 로봇</th>
                                    <th>실행 ID</th>
                                    <th>요청 ID</th>
                                    <th>결과 설명</th>
                                </tr>
                            </thead>

                            <tbody>
                                {replanHistory.map((history) => {
                                    const status = getStatusInfo(
                                        history.status
                                    );

                                    return (
                                        <tr key={history.id}>
                                            <td>
                                                {formatDateTime(
                                                    history.createdAt
                                                )}
                                            </td>

                                            <td>
                                                <span
                                                    className={`scenario-replan-history-status ${status.className}`}
                                                >
                                                    {status.label}
                                                </span>
                                            </td>

                                            <td>
                                                {getOptimizationTypeLabel(
                                                    history.optimizationType
                                                )}
                                            </td>

                                            <td>
                                                {getReoptimizationReasonLabel(
                                                    history.reoptimizationReason
                                                )}
                                            </td>

                                            <td>
                                                <strong>
                                                    {history.triggerRobotId ||
                                                        "-"}
                                                </strong>
                                            </td>

                                            <td>
                                                {history.simulationRunId ||
                                                    "-"}
                                            </td>

                                            <td>
                                                {history.requestId || "-"}
                                            </td>

                                            <td className="scenario-replan-history-description">
                                                {history.description || "-"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="scenario-replan-history-empty">
                        <strong>재계획 이력이 없습니다.</strong>
                        <p>
                            재계획이 수행되면 이곳에 전체 기록이 표시됩니다.
                        </p>
                    </div>
                )}
            </section>
        </main>
    );
}

export default ScenarioReplanHistory;