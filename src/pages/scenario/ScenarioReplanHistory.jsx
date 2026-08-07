import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { optimizationApi } from "../../api/client";
import "../../styles/scenario/ScenarioReplanHistory.css";

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
    if (!dateTime) {
        return "-";
    }

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

const normalizeHistoryList = (response) => {
    if (Array.isArray(response)) {
        return response;
    }

    if (Array.isArray(response?.content)) {
        return response.content;
    }

    if (Array.isArray(response?.items)) {
        return response.items;
    }

    return [];
};

function ScenarioReplanHistory() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const scenarioId = searchParams.get("scenarioId");
    const queryRunId = searchParams.get("simulationRunId");

    const [replanHistory, setReplanHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    // 상세 화면에서 넘긴 실행 ID를 우선 사용한다.
    // 실행 ID가 없으면 마지막으로 선택한 시나리오의 실행 ID를 보조적으로 사용한다.
    const simulationRunId = useMemo(() => {
        if (queryRunId) {
            return queryRunId;
        }

        const savedScenarioId = localStorage.getItem("selectedScenarioId");
        const savedRunId = localStorage.getItem("simulationRunId");

        if (
            scenarioId
            && savedScenarioId
            && String(savedScenarioId) !== String(scenarioId)
        ) {
            return null;
        }

        return savedRunId || null;
    }, [queryRunId, scenarioId]);

    useEffect(() => {
        let cancelled = false;

        const loadReplanHistory = async () => {
            if (!simulationRunId) {
                setReplanHistory([]);
                setErrorMessage("");
                return;
            }

            setIsLoading(true);
            setErrorMessage("");

            try {
                const response =
                    await optimizationApi.getReoptimizationHistories(
                        simulationRunId
                    );

                if (cancelled) {
                    return;
                }

                const histories = normalizeHistoryList(response)
                    .slice()
                    .sort(
                        (a, b) =>
                            new Date(b?.createdAt ?? 0).getTime()
                            - new Date(a?.createdAt ?? 0).getTime()
                    );

                setReplanHistory(histories);
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error("재계획 이력 조회 실패:", error);
                setReplanHistory([]);
                setErrorMessage(
                    error?.message ?? "재계획 이력을 불러오지 못했습니다."
                );
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        loadReplanHistory();

        return () => {
            cancelled = true;
        };
    }, [simulationRunId]);

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
                            ? `${scenarioId}번 시나리오에서 선택된 실행의 재계획 기록입니다.`
                            : "선택된 시뮬레이션 실행의 재계획 기록입니다."}
                    </p>

                    {simulationRunId && (
                        <span className="scenario-replan-history-run-chip">
                            실행 ID {simulationRunId}
                        </span>
                    )}
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
                    <span>최근 재계획</span>
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
                            최근 수행된 재계획부터 실제 API 응답 순서로 확인합니다.
                        </p>
                    </div>

                    <span className="scenario-replan-history-count">
                        총 {replanHistory.length}건
                    </span>
                </div>

                {isLoading ? (
                    <div className="scenario-replan-history-state">
                        <strong>재계획 이력을 불러오는 중입니다.</strong>
                        <p>잠시만 기다려주세요.</p>
                    </div>
                ) : errorMessage ? (
                    <div className="scenario-replan-history-state is-error">
                        <strong>재계획 이력을 불러오지 못했습니다.</strong>
                        <p>{errorMessage}</p>
                    </div>
                ) : !simulationRunId ? (
                    <div className="scenario-replan-history-empty">
                        <strong>조회할 실행 정보가 없습니다.</strong>
                        <p>
                            시나리오를 실행한 뒤 최근 재계획의 전체 보기를 열어주세요.
                        </p>
                    </div>
                ) : replanHistory.length > 0 ? (
                    <div className="scenario-replan-history-table-wrapper">
                        <table className="scenario-replan-history-table">
                            <thead>
                                <tr>
                                    <th>실행 시각</th>
                                    <th>상태</th>
                                    <th>발생 사유</th>
                                    <th>관련 로봇</th>
                                    <th>재배정 작업</th>
                                    <th>변경 경로</th>
                                    <th>창고 ID</th>
                                    <th>실행 ID</th>
                                    <th>요청 ID</th>
                                    <th>결과 ID</th>
                                    <th>결과 설명</th>
                                </tr>
                            </thead>

                            <tbody>
                                {replanHistory.map((history, index) => {
                                    const status = getStatusInfo(history.status);
                                    const reason =
                                        history.reason
                                        ?? history.reoptimizationReason;
                                    const taskAssignmentCount = Array.isArray(
                                        history.taskAssignments
                                    )
                                        ? history.taskAssignments.length
                                        : 0;
                                    const routeCount = Array.isArray(history.routes)
                                        ? history.routes.length
                                        : 0;

                                    return (
                                        <tr
                                            key={
                                                history.optimizationResultId
                                                ?? history.requestId
                                                ?? `${history.simulationRunId}-${index}`
                                            }
                                        >
                                            <td>
                                                {formatDateTime(history.createdAt)}
                                            </td>

                                            <td>
                                                <span
                                                    className={`scenario-replan-history-status ${status.className}`}
                                                >
                                                    {status.label}
                                                </span>
                                            </td>

                                            <td>
                                                {getReoptimizationReasonLabel(reason)}
                                            </td>

                                            <td>
                                                <strong>
                                                    {history.triggerRobotId ?? "-"}
                                                </strong>
                                            </td>

                                            <td>
                                                <span className="scenario-replan-history-count-value">
                                                    {taskAssignmentCount}건
                                                </span>
                                            </td>

                                            <td>
                                                <span className="scenario-replan-history-count-value">
                                                    {routeCount}개
                                                </span>
                                            </td>

                                            <td>{history.warehouseId ?? "-"}</td>
                                            <td>{history.simulationRunId ?? "-"}</td>
                                            <td>{history.requestId ?? "-"}</td>
                                            <td>
                                                {history.optimizationResultId ?? "-"}
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
                            이 실행에서 재계획이 수행되면 전체 기록이 표시됩니다.
                        </p>
                    </div>
                )}
            </section>
        </main>
    );
}

export default ScenarioReplanHistory;
