import { useEffect, useMemo, useState } from "react";
import {
    fulfillmentCommandApi,
    laroPlanApi,
} from "../../api/client";
import "../../styles/simulation/SimulationPanel.css";

// 화면 표시용 상태와 작업 유형 라벨을 관리한다.
const PLAN_STATUS_LABEL = {
    plan_validated: "계획 검증 완료",
    input_rejected: "명령 확인 필요",
    workflow_hold: "계획 보류",
};

const OPERATION_LABEL = {
    INBOUND: "입고",
    INBOUND_ITEM: "입고",
    OUTBOUND: "출고",
    OUTBOUND_ORDER: "출고",
    TRANSFER: "이동",
    RECOVERY: "복구",
};

// snake_case와 camelCase 응답을 모두 지원한다.
const field = (source, snakeCase, camelCase) =>
    source?.[snakeCase] ?? source?.[camelCase];

// 배열이 아닌 값은 빈 배열로 정규화한다.
const asArray = (value) => (Array.isArray(value) ? value : []);

const CYCLE_TO_WORKFLOW_STATE = {
    IDLE: "idle",
    CHECKING: "checking",
    GENERATING: "generating",
    PLANNING: "planning",
    REPLANNING: "planning",
    COMPLETE: "complete",
    ERROR: "error",
    STOPPED: "idle",
};

const WORKFLOW_BADGE = {
    idle: "대기",
    checking: "01 상태 확인",
    generating: "02 명령 생성",
    planning: "03 AI 계획",
    complete: "04 검증 완료",
    error: "오류",
};

const COMMAND_EXPRESSION_TOGGLES = [
    {
        key: "policyEnabled",
        label: "LLM 부가 명령",
        description: "우선순위나 작업 조건을 자연어로 덧붙입니다.",
        ratio: 30,
        tone: "policy",
    },
    {
        key: "naturalLanguageEnabled",
        label: "LLM 자체 명령",
        description: "사용자가 요청한 문장처럼 작업을 생성합니다.",
        ratio: 30,
        tone: "natural",
    },
];

// 사용자 화면에 노출하지 않을 내부 사전 점검 오류를 정의한다.
const HIDDEN_PREFLIGHT_PROBLEM = "REDIS_RUNTIME_NOT_INITIALIZED";

// 서버 상태 조회 주기를 한 곳에서 관리한다.
const PREFLIGHT_POLL_INTERVAL_MS = 3000;
const CYCLE_POLL_INTERVAL_MS = 1000;

const isHiddenPreflightProblem = (value) =>
    String(value ?? "").trim().startsWith(HIDDEN_PREFLIGHT_PROBLEM);

// 밀리초 단위 시간을 화면용 분/초 문자열로 변환한다.
const formatDuration = (milliseconds) => {
    if (!Number.isFinite(Number(milliseconds))) {
        return "-";
    }

    const totalSeconds = Math.round(Number(milliseconds) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
};

// 생성 시각을 한국어 로케일의 시:분:초 형식으로 표시한다.
const formatGeneratedAt = (value) => {
    if (!value) {
        return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
};

// 서버의 마지막 갱신 시각을 기준으로 현재 단계의 경과 시간을 계산한다.
const useElapsedSeconds = (active, serverUpdatedAt) => {
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    useEffect(() => {
        if (!active) {
            setElapsedSeconds(0);
            return undefined;
        }

        const parsed = Date.parse(serverUpdatedAt ?? "");
        const startedAt = Number.isFinite(parsed)
            ? Math.min(Date.now(), parsed)
            : Date.now();
        const update = () => {
            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            setElapsedSeconds(Math.max(0, elapsed));
        };

        update();
        const timerId = window.setInterval(update, 1000);

        return () => {
            window.clearInterval(timerId);
        };
    }, [active, serverUpdatedAt]);

    return elapsedSeconds;
};

// 로봇 이동 경로가 길면 앞뒤 노드만 남겨 간단하게 표시한다.
const compactRouteNodes = (robot) => {
    const steps = asArray(robot?.steps);
    const nodes = [field(robot, "initial_node", "initialNode")];

    steps.forEach((step) => {
        const node = field(step, "to_node", "toNode")
            ?? field(step, "node_id", "nodeId");

        if (node && nodes[nodes.length - 1] !== node) {
            nodes.push(node);
        }
    });

    const filtered = nodes.filter(Boolean);
    if (filtered.length <= 5) {
        return filtered;
    }

    return [...filtered.slice(0, 2), "…", ...filtered.slice(-2)];
};

function SimulationPanel({
    simulationRunId,
    onSimulatedTimeChange,
    commandExpressionMix,
    onCommandExpressionMixChange,
    onGeneratedCommandsChange,
}) {
    // 사전 점검, 자동 명령 생성, AI 계획 상태를 관리한다.
    const [preflight, setPreflight] = useState({
        state: "idle",
        data: null,
        error: "",
    });
    const [workflow, setWorkflow] = useState({
        state: "idle",
        generated: null,
        planResponse: null,
        error: "",
        errorStage: null,
    });
    const [selectedOperationId, setSelectedOperationId] = useState(null);
    const [cycleStatus, setCycleStatus] = useState(null);
    const [configurationError, setConfigurationError] = useState("");

    // LLM 명령 표현 설정이 바뀌면 현재 시뮬레이션 실행에 저장한다.
    useEffect(() => {
        let cancelled = false;

        if (!simulationRunId) {
            setConfigurationError("");
            return () => {
                cancelled = true;
            };
        }

        fulfillmentCommandApi.configureCycle(simulationRunId, {
            policyEnabled: commandExpressionMix?.policyEnabled === true,
            naturalLanguageEnabled:
                commandExpressionMix?.naturalLanguageEnabled === true,
        })
            .then(() => {
                if (!cancelled) setConfigurationError("");
            })
            .catch((error) => {
                if (!cancelled) {
                    setConfigurationError(
                        error.message ?? "명령 표현 방식을 저장하지 못했습니다."
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [
        simulationRunId,
        commandExpressionMix?.policyEnabled,
        commandExpressionMix?.naturalLanguageEnabled,
    ]);

    // AI 계획 실행 가능 여부를 주기적으로 확인한다.
    useEffect(() => {
        let cancelled = false;
        let timerId;

        // 실행 대상이 바뀌면 이전 워크플로와 선택 상태를 초기화한다.
        setWorkflow({
            state: "idle",
            generated: null,
            planResponse: null,
            error: "",
            errorStage: null,
        });
        setSelectedOperationId(null);

        if (!simulationRunId) {
            setPreflight({ state: "idle", data: null, error: "" });
            return () => {
                cancelled = true;
            };
        }

        const refreshPreflight = async () => {
            try {
                const data = await laroPlanApi.preflight(simulationRunId);
                if (!cancelled) {
                    setPreflight({
                        state: data?.ready ? "ready" : "blocked",
                        data,
                        error: "",
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    setPreflight({
                        state: "error",
                        data: null,
                        error: error.message,
                    });
                }
            }
        };

        setPreflight({ state: "loading", data: null, error: "" });
        refreshPreflight();
        timerId = window.setInterval(
            refreshPreflight,
            PREFLIGHT_POLL_INTERVAL_MS
        );

        return () => {
            cancelled = true;
            window.clearInterval(timerId);
        };
    }, [simulationRunId]);

    // 자동 명령 생성과 AI 계획 사이클 상태를 주기적으로 동기화한다.
    useEffect(() => {
        let cancelled = false;
        let timerId;

        const applyCycleStatus = (status) => {
            if (cancelled || !status) return;

            setCycleStatus(status);
            onSimulatedTimeChange?.(
                Math.floor(Number(status.simulatedTimeMs ?? 0) / 1000)
            );
            const generated = status.generated ?? null;
            const generatedCommands = asArray(generated?.frontView?.commands);

            // 현재 선택한 명령이 사라졌으면 첫 번째 명령을 선택한다.
            if (generatedCommands.length > 0) {
                setSelectedOperationId((current) =>
                    generatedCommands.some(
                        (command) => command.operationId === current
                    )
                        ? current
                        : generatedCommands[0].operationId
                );
            }
            setWorkflow((current) => ({
                state: CYCLE_TO_WORKFLOW_STATE[status.state] ?? "idle",

                // 현재 사이클이 실패하면 마지막 정상 생성 결과를 유지한다.
                generated:
                    status.generated
                    ?? (status.state === "ERROR" ? current.generated : null),

                // 계획 실패 시에도 마지막 정상 계획을 화면에 유지한다.
                planResponse:
                    status.planResponse
                    ?? (status.state === "ERROR" ? current.planResponse : null),

                error: status.error ?? "",
                errorStage: status.state === "ERROR" ? "cycle" : null,
            }));
        };

        const refresh = async () => {
            if (!simulationRunId) return;
            try {
                applyCycleStatus(
                    await fulfillmentCommandApi.getCycleStatus(simulationRunId)
                );
            } catch (error) {
                if (!cancelled) {
                    setWorkflow((current) => ({
                        ...current,
                        state: "error",
                        error: error.message ?? "자동 명령 생성 상태를 조회하지 못했습니다.",
                        errorStage: "cycle",
                    }));
                }
            }
        };

        if (!simulationRunId) {
            setCycleStatus(null);
            return () => {
                cancelled = true;
            };
        }

        refresh();
        timerId = window.setInterval(refresh, CYCLE_POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timerId);
        };
    }, [simulationRunId, onSimulatedTimeChange]);

    // 자동 생성 결과에서 화면에 필요한 명령 데이터를 추출한다.
    const generated = workflow.generated;
    const frontView = generated?.frontView;
    const summary = frontView?.summary;
    const commands = useMemo(
        () => asArray(frontView?.commands),
        [frontView?.commands],
    );
    const warnings = asArray(frontView?.warnings);
    const naturalLanguageRequest = String(
        field(generated?.planRequest, "user_command", "userCommand") ?? ""
    ).trim();

    // 생성된 명령 목록을 상위 시뮬레이션 화면과 동기화한다.
    useEffect(() => {
        onGeneratedCommandsChange?.(commands);
    }, [commands, onGeneratedCommandsChange]);

    // AI 계획 결과와 선택 명령에 연결된 로봇 정보를 계산한다.
    const result = workflow.planResponse?.result;
    const plan = result?.plan;
    const logicalOperations = asArray(
        field(plan, "logical_operations", "logicalOperations")
    );
    const robotPlans = asArray(plan?.robots);
    const planErrors = asArray(result?.errors);
    const frontendSummary = field(result, "frontend_summary", "frontendSummary");
    const planWarnings = asArray(frontendSummary?.warnings);

    // 내부 전용 오류는 제외하고 사용자에게 필요한 사전 점검 문제만 표시한다.
    const preflightProblemText = asArray(preflight.data?.problems)
        .filter((problem) => !isHiddenPreflightProblem(problem))
        .join(", ");
    const distinctWorkflowError = workflow.error
        && !isHiddenPreflightProblem(workflow.error)
        && workflow.error !== preflightProblemText
        ? workflow.error
        : "";

    const selectedCommand = commands.find(
        (command) => command.operationId === selectedOperationId
    ) ?? commands[0];
    const selectedLogicalOperation = logicalOperations.find(
        (operation) => field(operation, "operation_id", "operationId")
            === selectedCommand?.operationId
    );
    const selectedRobotId = field(
        selectedLogicalOperation,
        "assigned_robot_id",
        "assignedRobotId"
    );
    const selectedRobot = robotPlans.find(
        (robot) => field(robot, "robot_id", "robotId") === selectedRobotId
    );
    const selectedRouteNodes = useMemo(
        () => compactRouteNodes(selectedRobot),
        [selectedRobot]
    );

    // 현재 워크플로 상태에 따라 로딩 문구와 배지 스타일을 결정한다.
    const commandIsBusy = ["checking", "generating"].includes(workflow.state);
    const planIsBusy = workflow.state === "planning";
    const isBusy = commandIsBusy || planIsBusy;
    const policyExpressionEnabled = commandExpressionMix?.policyEnabled === true;
    const naturalLanguageExpressionEnabled = commandExpressionMix?.naturalLanguageEnabled === true;
    const workflowBadge = WORKFLOW_BADGE[workflow.state] ?? WORKFLOW_BADGE.idle;
    const workflowBadgeClass = workflow.state === "complete"
        ? "ready" : isBusy
            ? "planned" : workflow.state;
    const commandBusyLabel = workflow.state === "checking"
        ? "실행 조건을 확인하고 있습니다."
        : "재고와 빈 선반을 확인해 입출고 명령을 생성하고 있습니다.";
    const commandElapsedSeconds = useElapsedSeconds(
        commandIsBusy,
        cycleStatus?.updatedAt
    );
    const planElapsedSeconds = useElapsedSeconds(
        planIsBusy,
        cycleStatus?.updatedAt
    );

    return (
        <aside
            className="simulation-panel"
            aria-label="입출고 명령 및 AI 계획 패널"
        >
            <section className="simulation-panel-card">
                <header className="simulation-panel-header">
                    <div className="simulation-panel-header-copy">
                        <h2>AI PLAN</h2>
                        <p>자동 명령 생성과 실행 계획을 한 화면에서 확인합니다.</p>
                    </div>

                    <div className="simulation-panel-header-status">
                        <span
                            className={`simulation-status-chip ${workflowBadgeClass}`}
                            title="자동 명령 생성 및 AI 계획 진행 상태"
                        >
                            {workflowBadge}
                        </span>
                    </div>
                </header>

                <div className="simulation-panel-scroll">
                    {/* 기존 LLM 명령 표현 설정을 동일한 동작으로 제공한다. */}
                    <section className="simulation-panel-section">
                        <div className="simulation-panel-section-heading">
                            <h3>명령 생성 방식</h3>
                        </div>

                        <div
                            className="command-expression-options"
                            aria-label="LLM 명령 표현 설정"
                        >
                            {COMMAND_EXPRESSION_TOGGLES.map((option) => {
                                const enabled = commandExpressionMix?.[option.key] === true;
                                const tooltip = [
                                    `${option.label} · 현재 ${enabled ? "사용 중" : "사용 안 함"}`,
                                    option.description,
                                    `켜면 자동 생성 작업 중 약 ${option.ratio}%에 적용됩니다.`,
                                    `클릭하면 ${enabled ? "사용하지 않도록" : "사용하도록"} 바뀝니다.`,
                                ].join("\n");

                                return (
                                    <div
                                        className={`command-expression-option ${enabled ? "selected" : ""
                                            }`}
                                        key={option.key}
                                    >
                                        <div className="command-expression-copy">
                                            <strong>{option.label}</strong>
                                            <span>{option.description}</span>
                                            <small>약 {option.ratio}% 적용</small>
                                        </div>

                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={enabled}
                                            aria-label={option.label}
                                            data-tooltip={tooltip}
                                            className={`command-expression-switch ${option.tone} ${enabled ? "selected" : ""
                                                }`}
                                            onClick={() =>
                                                onCommandExpressionMixChange?.({
                                                    policyEnabled:
                                                        policyExpressionEnabled,
                                                    naturalLanguageEnabled:
                                                        naturalLanguageExpressionEnabled,
                                                    [option.key]: !enabled,
                                                })
                                            }
                                            disabled={isBusy}
                                        >
                                            <span />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {configurationError && (
                            <div className="command-expression-error">
                                {configurationError}
                            </div>
                        )}
                    </section>

                    {/* 기존 자연어 요청 값을 별도 자연어 명령 영역에 배치한다. */}
                    <section className="simulation-panel-section">
                        <div className="simulation-panel-section-heading compact">
                            <div>
                                <h3>자연어 명령·요청</h3>
                            </div>
                        </div>

                        {naturalLanguageRequest ? (
                            <div className="command-language-request">
                                <p>{naturalLanguageRequest}</p>
                            </div>
                        ) : (
                            <div className="simulation-panel-empty-state">
                                <strong>생성된 자연어 명령이 없습니다.</strong>
                                <span>
                                    자연어 명령을 사용하면 생성된 요청이 여기에 표시됩니다.
                                </span>
                            </div>
                        )}
                    </section>

                    {/* 생성된 입출고 명령 데이터와 선택 기능을 그대로 유지한다. */}
                    <section className="simulation-panel-section">
                        <div className="simulation-panel-section-heading">
                            <div>
                                <h3>생성된 입출고 명령</h3>
                            </div>

                            {generated && (
                                <div className="command-batch-meta">
                                    <span>{frontView?.mode ?? "AUTO"}</span>
                                    <span>
                                        {formatGeneratedAt(frontView?.generatedAt)}
                                    </span>
                                    <strong>{commands.length}건</strong>
                                </div>
                            )}
                        </div>

                        {commandIsBusy ? (
                            <div className="plan-loading command-loading" aria-live="polite">
                                <div className="plan-loading-dots" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                                <div className="plan-loading-copy">
                                    <strong>{commandElapsedSeconds}초 경과</strong>
                                    <p>{commandBusyLabel}</p>
                                    <small>품목 수와 재고 상태에 따라 시간이 더 걸릴 수 있습니다.</small>
                                </div>
                            </div>
                        ) : !simulationRunId ? (
                            <div className="simulation-panel-empty-state">
                                <strong>시뮬레이션 실행이 필요합니다.</strong>
                                <span>실행을 생성하면 입출고 명령을 확인할 수 있습니다.</span>
                            </div>
                        ) : !generated ? (
                            <div className="simulation-panel-empty-state">
                                <strong>시뮬레이션이 시작되면 입출고 명령을 자동 생성합니다.</strong>
                                <span>목적지 선반과 담당 로봇은 AI 계획에서 결정됩니다.</span>
                            </div>
                        ) : (
                            <>
                                <div className="simulation-metric-grid">
                                    <div className="simulation-metric-card">
                                        <span>입고</span>
                                        <strong>{summary?.generatedInboundCommands ?? 0}</strong>
                                        <small>BOX</small>
                                    </div>
                                    <div className="simulation-metric-card">
                                        <span>출고</span>
                                        <strong>{summary?.generatedOutboundCommands ?? 0}</strong>
                                        <small>BOX</small>
                                    </div>
                                    <div className="simulation-metric-card">
                                        <span>빈 선반 칸</span>
                                        <strong>{summary?.emptyStorageSlots ?? 0}</strong>
                                        <small>{summary?.totalStorageSlots ?? 0}</small>
                                    </div>
                                </div>

                                <div
                                    className="compact-operation-list"
                                    aria-label="생성된 입출고 명령 목록"
                                >
                                    {commands.map((command) => {
                                        const selected = command.operationId === selectedCommand?.operationId;
                                        const operationType = command.operationType;

                                        return (
                                            <button
                                                type="button"
                                                className={`compact-operation-row ${selected ? "selected" : ""}`}
                                                key={command.operationId}
                                                onClick={() => setSelectedOperationId(command.operationId)}
                                            >
                                                <span className={`operation-type-badge ${operationType?.toLowerCase()}`}>
                                                    {OPERATION_LABEL[operationType] ?? operationType}
                                                </span>
                                                <span className="operation-product">
                                                    <strong>{command.productName ?? command.productCode}</strong>
                                                    <small>{command.productCode}</small>
                                                </span>
                                                <span className="operation-quantity">
                                                    {command.boxCount ?? 1} BOX
                                                    <small>{command.quantity ?? 0} EA</small>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {warnings.length > 0 && (
                            <div className="plan-alert warning">
                                {warnings.join(" ")}
                            </div>
                        )}
                    </section>

                    {/* 사전 점검 상태와 AI 실행 계획 결과를 표시한다. */}
                    <section className="simulation-panel-section">
                        <div className="simulation-panel-section-heading">
                            <h3>AI 실행 계획</h3>
                            <span className={`simulation-status-chip ${preflight.state}`}>
                                {preflight.state === "ready" && "READY"}
                                {preflight.state === "loading" && "확인 중"}
                                {preflight.state === "blocked" && "NOT READY"}
                                {preflight.state === "error" && "연결 오류"}
                                {preflight.state === "idle" && "실행 대기"}
                            </span>
                        </div>

                        {preflight.state === "blocked" && preflightProblemText && (
                            <div className="plan-alert warning">
                                {preflightProblemText}
                            </div>
                        )}

                        {preflight.state === "error" && (
                            <div className="plan-alert error">
                                {preflight.error}
                            </div>
                        )}

                        {workflow.state === "error" && distinctWorkflowError && (
                            <div className="plan-alert error">
                                {distinctWorkflowError}
                            </div>
                        )}

                        {planIsBusy && (
                            <div className="plan-loading" aria-live="polite">
                                <div className="plan-loading-dots" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                </div>
                                <div className="plan-loading-copy">
                                    <strong>{planElapsedSeconds}초 경과</strong>
                                    <p>생성된 명령과 창고 실시간 상태로 AI 계획을 계산하고 있습니다.</p>
                                    <small>작업량과 로봇 상태에 따라 약 30초~1분 소요될 수 있습니다.</small>
                                </div>
                            </div>
                        )}

                        {!planIsBusy
                            && !result
                            && workflow.state !== "error"
                            && preflight.state !== "error" && (
                                <div className="simulation-panel-empty-state">
                                    <strong>생성된 AI 실행 계획이 없습니다.</strong>
                                    <span>
                                        입출고 명령이 생성되면 AI가 실행 계획을 계산합니다.
                                    </span>
                                </div>
                            )}

                        {result && (
                            <div className="plan-result" aria-live="polite">
                                <div className={`plan-result-status ${result.status}`}>
                                    <div>
                                        <span>계획 상태</span>
                                        <strong>{PLAN_STATUS_LABEL[result.status] ?? result.status}</strong>
                                    </div>
                                    <b>{field(result, "final_route", "finalRoute") ?? "-"}</b>
                                </div>

                                {plan && (
                                    <>
                                        <div className="simulation-metric-grid plan-metrics">
                                            <div className="simulation-metric-card">
                                                <span>계획 명령</span>
                                                <strong>{logicalOperations.length}</strong>
                                                <small>/ {commands.length}</small>
                                            </div>
                                            <div className="simulation-metric-card">
                                                <span>배정 로봇</span>
                                                <strong>{robotPlans.length}</strong>
                                                <small>대</small>
                                            </div>
                                            <div className="simulation-metric-card">
                                                <span>예상 완료</span>
                                                <strong className="metric-text">
                                                    {formatDuration(field(plan, "makespan_ms", "makespanMs"))}
                                                </strong>
                                            </div>
                                        </div>

                                        <div className="plan-identity compact">
                                            <span>계획 ID</span>
                                            <strong>{field(plan, "plan_id", "planId")}</strong>
                                        </div>

                                        <div
                                            className="compact-plan-list"
                                            aria-label="명령별 AI 배정 결과"
                                        >
                                            {commands.map((command) => {
                                                const logicalOperation = logicalOperations.find(
                                                    (operation) => field(operation, "operation_id", "operationId")
                                                        === command.operationId
                                                );
                                                const robotId = field(
                                                    logicalOperation,
                                                    "assigned_robot_id",
                                                    "assignedRobotId"
                                                );
                                                const selected =
                                                    command.operationId === selectedCommand?.operationId;

                                                return (
                                                    <button
                                                        type="button"
                                                        className={`compact-plan-row ${selected ? "selected" : ""}`}
                                                        key={command.operationId}
                                                        onClick={() => setSelectedOperationId(command.operationId)}
                                                    >
                                                        <span>
                                                            {OPERATION_LABEL[command.operationType]
                                                                ?? command.operationType}
                                                        </span>
                                                        <strong>{command.productCode}</strong>
                                                        <b className={robotId ? "assigned" : "deferred"}>
                                                            {robotId ?? "보류"}
                                                        </b>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}

                                {planWarnings.length > 0 && (
                                    <div className="plan-alert warning">
                                        {planWarnings.join(" ")}
                                    </div>
                                )}

                                {planErrors.length > 0 && (
                                    <div className="plan-alert error">
                                        {planErrors.map((error) => error.message).join(", ")}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </section>
        </aside>
    );
}

export default SimulationPanel;
