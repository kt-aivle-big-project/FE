import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { optimizationApi, fulfillmentCommandApi, } from "../../api/client";
import "../../styles/scenario/ScenarioDetail.css";

const SCENARIO_ID_KEY = "selectedScenarioId";
const RUN_ID_KEY = "simulationRunId";

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

const field = (source, snakeCase, camelCase) =>
    source?.[snakeCase] ?? source?.[camelCase];

const asArray = (value) =>
    Array.isArray(value) ? value : [];

const formatDuration = (milliseconds) => {
    if (!Number.isFinite(Number(milliseconds))) {
        return "-";
    }

    const totalSeconds = Math.round(
        Number(milliseconds) / 1000
    );

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return minutes > 0
        ? `${minutes}분 ${seconds}초`
        : `${seconds}초`;
};

const OPERATION_LABEL = {
    INBOUND: "입고",
    INBOUND_ITEM: "입고",
    OUTBOUND: "출고",
    OUTBOUND_ORDER: "출고",
    TRANSFER: "이동",
    RECOVERY: "복구",
};

const formatRobotId = (robotId) => {
    if (robotId === null || robotId === undefined || robotId === "") {
        return "-";
    }

    const value = String(robotId);
    return /^R/i.test(value) ? value : `R${value}`;
};

// 시나리오 응답에 실행 ID가 있으면 우선 사용하고,
// 없으면 마지막으로 실행한 시나리오와 localStorage의 실행 ID를 연결한다.
const resolveSimulationRunId = (scenario) => {
    if (!scenario) {
        return null;
    }

    const directRunId =
        scenario.latestSimulationRunId ??
        scenario.simulationRunId ??
        null;

    if (directRunId !== null && directRunId !== undefined) {
        return directRunId;
    }

    const savedScenarioId = localStorage.getItem(SCENARIO_ID_KEY);
    const savedRunId = localStorage.getItem(RUN_ID_KEY);

    if (
        savedRunId
        && String(savedScenarioId) === String(scenario.id)
    ) {
        return savedRunId;
    }

    return null;
};

const getHistoryItems = (response) => {
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

function ScenarioDetail({
    scenario,
    onClose,
    onEdit,
    onDelete,
}) {
    const navigate = useNavigate();

    // 실행 이력
    const [cycleStatus, setCycleStatus] = useState(null);
    const [planLoading, setPlanLoading] = useState(false);
    const [planError, setPlanError] = useState("");

    // 재계획
    const [replanResult, setReplanResult] = useState(null);
    const [replanLoading, setReplanLoading] = useState(false);
    const [replanError, setReplanError] = useState("");

    const storedScenarioId = localStorage.getItem("selectedScenarioId");
    const storedSimulationRunId = localStorage.getItem("simulationRunId");

    // Scenario 응답에 실행 ID가 있으면 우선 사용하고,
    // 없으면 마지막으로 실행한 동일 시나리오의 실행 ID를 사용한다.
    const simulationRunId =
        scenario?.latestSimulationRunId ??
        scenario?.simulationRunId ??
        (
            String(storedScenarioId) === String(scenario?.id)
                ? storedSimulationRunId
                : null
        );

    // 시뮬레이션 실행에서 생성된 AI 실행 계획을 조회한다.
    useEffect(() => {
        let cancelled = false;

        const loadExecutionPlan = async () => {
            if (!simulationRunId) {
                setCycleStatus(null);
                setPlanError("");
                return;
            }

            try {
                setPlanLoading(true);
                setPlanError("");

                const response =
                    await fulfillmentCommandApi.getCycleStatus(
                        simulationRunId
                    );

                if (cancelled) {
                    return;
                }

                setCycleStatus(response ?? null);
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error(
                    "AI 실행 계획 조회 실패:",
                    error
                );

                setCycleStatus(null);
                setPlanError(
                    error.message ??
                    "AI 실행 계획을 불러오지 못했습니다."
                );
            } finally {
                if (!cancelled) {
                    setPlanLoading(false);
                }
            }
        };

        loadExecutionPlan();

        return () => {
            cancelled = true;
        };
    }, [simulationRunId]);

    const planResult =
        cycleStatus?.planResponse?.result ?? null;

    const plan = planResult?.plan ?? null;

    const logicalOperations = asArray(
        field(
            plan,
            "logical_operations",
            "logicalOperations"
        )
    );

    const robotPlans = asArray(plan?.robots);

    const generatedCommands = asArray(
        cycleStatus?.generated?.frontView?.commands
    );

    const planId = field(
        plan,
        "plan_id",
        "planId"
    );

    const makespanMs = field(
        plan,
        "makespan_ms",
        "makespanMs"
    );

    // 상세 화면에서는 너무 길어지지 않도록 최근 명령 4개만 표시한다.
    const executionAssignments = useMemo(
        () =>
            generatedCommands
                .map((command) => {
                    const operationId =
                        command.operationId ??
                        command.operation_id;

                    const logicalOperation =
                        logicalOperations.find(
                            (operation) =>
                                field(
                                    operation,
                                    "operation_id",
                                    "operationId"
                                ) === operationId
                        );

                    return {
                        operationId,
                        operationType:
                            command.operationType ??
                            command.operation_type,
                        productName:
                            command.productName ??
                            command.product_name ??
                            command.productCode ??
                            command.product_code ??
                            "-",
                        productCode:
                            command.productCode ??
                            command.product_code ??
                            "",
                        robotId: field(
                            logicalOperation,
                            "assigned_robot_id",
                            "assignedRobotId"
                        ),
                    };
                })
                .slice(0, 4),
        [generatedCommands, logicalOperations]
    );

    // 현재 시나리오의 마지막 실행 ID를 기준으로 재계획 이력을 조회한다.
    useEffect(() => {
        let cancelled = false;

        if (!scenario?.id || !simulationRunId) {
            setReplanResult(null);
            setReplanLoading(false);
            setReplanError("");
            return () => {
                cancelled = true;
            };
        }

        const loadReplanHistory = async () => {
            setReplanLoading(true);
            setReplanError("");

            try {
                const response =
                    await optimizationApi.getReoptimizationHistories(
                        simulationRunId
                    );

                if (cancelled) {
                    return;
                }

                const histories = getHistoryItems(response)
                    .slice()
                    .sort((left, right) => {
                        const leftTime =
                            Date.parse(left?.createdAt ?? "") || 0;
                        const rightTime =
                            Date.parse(right?.createdAt ?? "") || 0;

                        return rightTime - leftTime;
                    });

                setReplanResult(histories[0] ?? null);
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error("재계획 이력 조회 실패:", error);
                setReplanResult(null);
                setReplanError(
                    error.message ?? "재계획 이력을 불러오지 못했습니다."
                );
            } finally {
                if (!cancelled) {
                    setReplanLoading(false);
                }
            }
        };

        loadReplanHistory();

        return () => {
            cancelled = true;
        };
    }, [scenario?.id, simulationRunId]);

    if (!scenario) {
        return (
            <section className="scenario-detail-card scenario-detail-placeholder">
                <div className="scenario-detail-placeholder-icon">◇</div>
                <h2>시나리오를 선택해주세요.</h2>
                <p>왼쪽 목록에서 시나리오를 선택하면 상세 정보가 표시됩니다.</p>
            </section>
        );
    }

    const optimizationStatus =
        getOptimizationStatus(replanResult?.status);

    const replanReason =
        replanResult?.reason ??
        replanResult?.reoptimizationReason;

    const changedRouteCount = Array.isArray(replanResult?.routes)
        ? replanResult.routes.length
        : 0;

    const reassignedTaskCount = Array.isArray(
        replanResult?.taskAssignments
    )
        ? replanResult.taskAssignments.length
        : 0;

    // 선택한 시나리오를 Simulation에서 자동 선택한 뒤 실행 화면으로 이동한다.
    const handleRun = () => {
        if (!scenario.id) {
            return;
        }

        localStorage.setItem(
            SCENARIO_ID_KEY,
            String(scenario.id)
        );

        // 이전 실행을 그대로 복원하지 않고 선택한 시나리오로 새 실행을 준비한다.
        localStorage.removeItem(RUN_ID_KEY);

        navigate("/simulation");
    };

    const handleOpenReplanHistory = () => {
        const scenarioId = scenario.id ?? "";

        const params = new URLSearchParams();

        if (scenarioId) {
            params.set("scenarioId", String(scenarioId));
        }

        if (simulationRunId) {
            params.set(
                "simulationRunId",
                String(simulationRunId)
            );
        }

        navigate(`/replan-history?${params.toString()}`);
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
                            <h2>{scenario.scenarioName}</h2>
                        </div>

                        <div className="scenario-detail-sub-info">
                            <span>{scenario.scenarioCode || "-"}</span>
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

                        <div className="scenario-info-setting-grid">
                            <article className="scenario-info-setting-item">
                                <span>초기 배터리</span>
                                <strong>{scenario.initialBattery ?? 100}%</strong>
                            </article>

                            <article className="scenario-info-setting-item">
                                <span>충전 전환 기준</span>
                                <strong>{scenario.chargingThreshold ?? 20}%</strong>
                            </article>

                            <article className="scenario-info-setting-item">
                                <span>투입 로봇</span>
                                <strong>{scenario.robotCount ?? "-"}대</strong>
                            </article>

                            <article className="scenario-info-setting-item">
                                <span>재생 배속</span>
                                <strong>{scenario.simulationSpeed ?? 1}배</strong>
                            </article>

                            <article className="scenario-info-setting-item">
                                <span>자동 재계획</span>
                                <strong>
                                    {scenario.autoReplan ? "사용" : "사용 안 함"}
                                </strong>
                            </article>

                            <article className="scenario-info-setting-item">
                                <span>장애물 발생</span>
                                <strong>
                                    {scenario.obstacleEnabled ? "포함" : "미포함"}
                                </strong>
                            </article>
                        </div>
                    </div>
                </section>

                {/* AI 실행 계획 */}
                <section className="scenario-detail-section">
                    <div className="scenario-detail-section-header scenario-ai-plan-section-header">
                        <div>
                            <h3>최근 AI 실행 계획</h3>
                            <p>
                                가장 최근에 생성된 AI 작업 배정 및 실행 계획입니다.
                            </p>
                        </div>

                        {planResult && (
                            <span
                                className={`scenario-ai-plan-status ${planResult.status === "plan_validated"
                                        ? "is-success"
                                        : "is-default"
                                    }`}
                            >
                                {planResult.status === "plan_validated"
                                    ? "계획 검증 완료"
                                    : planResult.status ?? "계획 생성"}
                            </span>
                        )}
                    </div>

                    {planLoading ? (
                        <div className="scenario-ai-plan-empty">
                            <strong>
                                AI 실행 계획을 불러오는 중입니다.
                            </strong>
                            <p>
                                최근 시뮬레이션 실행 결과를 확인하고 있습니다.
                            </p>
                        </div>
                    ) : planError ? (
                        <div className="scenario-ai-plan-empty is-error">
                            <strong>
                                AI 실행 계획을 불러오지 못했습니다.
                            </strong>
                            <p>{planError}</p>
                        </div>
                    ) : plan ? (
                        <div className="scenario-ai-plan-card">

                            {/* AI 계획 요약 */}
                            <div className="scenario-ai-plan-summary-grid">
                                <article className="scenario-ai-plan-summary-item">
                                    <span>계획 명령</span>

                                    <div>
                                        <strong>
                                            {logicalOperations.length}
                                        </strong>
                                        <small>건</small>
                                    </div>
                                </article>

                                <article className="scenario-ai-plan-summary-item">
                                    <span>배정 로봇</span>

                                    <div>
                                        <strong>
                                            {robotPlans.length}
                                        </strong>
                                        <small>대</small>
                                    </div>
                                </article>

                                <article className="scenario-ai-plan-summary-item">
                                    <span>예상 완료</span>

                                    <strong className="scenario-ai-plan-duration">
                                        {formatDuration(makespanMs)}
                                    </strong>
                                </article>
                            </div>

                            {/* Plan ID */}
                            <div className="scenario-ai-plan-id">
                                <span>PLAN ID</span>

                                <strong>
                                    {planId ?? "-"}
                                </strong>
                            </div>

                            {/* 명령별 로봇 배정 */}
                            <div className="scenario-ai-plan-assignments">
                                <div className="scenario-ai-plan-list-header">
                                    <div>
                                        <strong>작업 배정</strong>
                                        <p>
                                            AI가 생성한 최근 작업별 로봇 배정입니다.
                                        </p>
                                    </div>

                                    {generatedCommands.length > 4 && (
                                        <span>
                                            총 {generatedCommands.length}건
                                        </span>
                                    )}
                                </div>

                                {executionAssignments.length > 0 ? (
                                    <div className="scenario-ai-plan-list">
                                        {executionAssignments.map(
                                            (assignment, index) => (
                                                <div
                                                    className="scenario-ai-plan-row"
                                                    key={
                                                        assignment.operationId ??
                                                        index
                                                    }
                                                >
                                                    <span
                                                        className={`scenario-ai-operation-badge ${assignment.operationType
                                                                ?.toLowerCase() ??
                                                            ""
                                                            }`}
                                                    >
                                                        {OPERATION_LABEL[
                                                            assignment.operationType
                                                        ] ??
                                                            assignment.operationType ??
                                                            "작업"}
                                                    </span>

                                                    <div className="scenario-ai-plan-product">
                                                        <strong>
                                                            {
                                                                assignment.productName
                                                            }
                                                        </strong>

                                                        {assignment.productCode && (
                                                            <small>
                                                                {
                                                                    assignment.productCode
                                                                }
                                                            </small>
                                                        )}
                                                    </div>

                                                    <div className="scenario-ai-plan-robot">
                                                        <span>담당 로봇</span>

                                                        <strong
                                                            className={
                                                                assignment.robotId
                                                                    ? "is-assigned"
                                                                    : "is-pending"
                                                            }
                                                        >
                                                            {assignment.robotId ??
                                                                "보류"}
                                                        </strong>
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                ) : (
                                    <div className="scenario-ai-plan-list-empty">
                                        표시할 작업 배정이 없습니다.
                                    </div>
                                )}
                            </div>

                            {/* 실행 ID */}
                            <div className="scenario-ai-plan-footer">
                                <span>실행 ID</span>
                                <strong>
                                    {simulationRunId ?? "-"}
                                </strong>
                            </div>
                        </div>
                    ) : (
                        <div className="scenario-ai-plan-empty">
                            <strong>
                                AI 실행 계획이 없습니다.
                            </strong>

                            <p>
                                이 시나리오를 실행하면 생성된 AI 계획이 표시됩니다.
                            </p>
                        </div>
                    )}
                </section>

                {/* 최근 재계획 */}
                <section className="scenario-detail-section">
                    <div className="scenario-detail-section-header scenario-replan-section-header">
                        <div>
                            <h3>최근 재계획</h3>
                            <p>
                                가장 최근 실행에서 수행된 재계획 결과입니다.
                            </p>
                        </div>

                        <div className="scenario-replan-header-actions">
                            <span className="scenario-replan-latest-badge">
                                최근 결과
                            </span>

                            <button
                                type="button"
                                className="scenario-replan-all-button"
                                onClick={handleOpenReplanHistory}
                                title={
                                    simulationRunId
                                        ? "재계획 전체 이력 보기"
                                        : "연결된 시뮬레이션 실행이 없습니다."
                                }
                            >
                                전체 보기
                            </button>
                        </div>
                    </div>

                    {replanLoading ? (
                        <div className="scenario-replan-empty">
                            <strong>재계획 이력을 불러오는 중입니다.</strong>
                            <p>잠시만 기다려주세요.</p>
                        </div>
                    ) : replanError ? (
                        <div className="scenario-replan-empty is-error">
                            <strong>재계획 이력을 불러오지 못했습니다.</strong>
                            <p>{replanError}</p>
                        </div>
                    ) : replanResult ? (
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
                                    <span>발생 사유</span>
                                    <strong>
                                        {getReoptimizationReasonLabel(
                                            replanReason
                                        )}
                                    </strong>
                                </article>

                                <article className="scenario-replan-summary-item">
                                    <span>관련 로봇</span>
                                    <strong>
                                        {formatRobotId(
                                            replanResult.triggerRobotId
                                        )}
                                    </strong>
                                </article>

                                <article className="scenario-replan-summary-item">
                                    <span>실행 창고</span>
                                    <strong>
                                        {replanResult.warehouseId != null
                                            ? `창고 #${replanResult.warehouseId}`
                                            : "-"}
                                    </strong>
                                </article>

                                <article className="scenario-replan-summary-item">
                                    <span>재배정 작업</span>
                                    <strong>
                                        {reassignedTaskCount}건
                                    </strong>
                                </article>

                                <article className="scenario-replan-summary-item">
                                    <span>변경 경로</span>
                                    <strong>
                                        {changedRouteCount}개
                                    </strong>
                                </article>
                            </div>

                            <div className="scenario-replan-message">
                                <span className="scenario-info-label">
                                    결과 설명
                                </span>
                                <p>
                                    {replanResult.description ||
                                        "등록된 재계획 결과 설명이 없습니다."}
                                </p>
                            </div>

                            <div className="scenario-replan-meta">
                                <div>
                                    <span>실행 ID</span>
                                    <strong>
                                        {replanResult.simulationRunId ?? "-"}
                                    </strong>
                                </div>

                                <div>
                                    <span>요청 ID</span>
                                    <strong>
                                        {replanResult.requestId ?? "-"}
                                    </strong>
                                </div>

                                <div>
                                    <span>결과 ID</span>
                                    <strong>
                                        {replanResult.optimizationResultId ?? "-"}
                                    </strong>
                                </div>

                                <div>
                                    <span>수행 일시</span>
                                    <strong>
                                        {formatDateTime(
                                            replanResult.createdAt
                                        )}
                                    </strong>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="scenario-replan-empty">
                            <strong>재계획 결과가 없습니다.</strong>
                            <p>
                                이 시나리오를 실행하고 재계획이 수행되면 최근 결과가 표시됩니다.
                            </p>
                        </div>
                    )}
                </section>
            </div>
        </section>
    );
}

export default ScenarioDetail;
