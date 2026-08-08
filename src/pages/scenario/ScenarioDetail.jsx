import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { optimizationApi, fulfillmentCommandApi, } from "../../api/client";
import "../../styles/scenario/ScenarioDetail.css";

// AI 실행 이력 임시 데이터
const MOCK_AI_CYCLE_STATUS = {
    state: "COMPLETE",
    planningMode: "AUTO",
    simulatedTimeMs: 163000,
    updatedAt: "2026-08-08T17:30:00",

    generated: {
        planRequest: {
            userCommand:
                "출고 작업을 우선 처리하고, 로봇별 작업량과 이동 거리를 고려해 효율적으로 배정해줘.",
        },

        frontView: {
            mode: "AUTO",
            generatedAt: "2026-08-08T17:27:15",

            summary: {
                generatedInboundCommands: 2,
                generatedOutboundCommands: 4,

                totalStorageLocations: 20,
                totalStorageSlots: 60,
                occupiedStorageSlots: 37,
                emptyStorageSlots: 23,

                availableOutboundBoxes: 18,
                excludedReservedBoxes: 2,

                totalInventoryUnits: 2481,

                generatedInboundUnits: 72,
                generatedOutboundUnits: 168,
            },

            commands: [
                {
                    sequence: 1,
                    operationId: "OP-001",
                    operationType: "OUTBOUND",

                    productId: 101,
                    productCode: "PD-001",
                    productName: "콜라 355ml",
                    category: "음료",

                    quantity: 24,
                    quantityUnit: "EA",
                    unitsPerBox: 24,
                    boxCount: 1,

                    priority: 1,

                    source: {
                        label: "RACK-A04",
                        nodeCode: "N-A04",
                    },

                    destination: {
                        label: "OUT-01",
                        nodeCode: "N-OUT01",
                    },

                    warehouseProductUnitsBefore: 144,
                    warehouseProductUnitsAfter: 120,
                },

                {
                    sequence: 2,
                    operationId: "OP-002",
                    operationType: "INBOUND",

                    productId: 102,
                    productCode: "PD-002",
                    productName: "생수 500ml",
                    category: "음료",

                    quantity: 48,
                    quantityUnit: "EA",
                    unitsPerBox: 24,
                    boxCount: 2,

                    priority: 2,

                    source: {
                        label: "IN-01",
                        nodeCode: "N-IN01",
                    },

                    destination: {
                        label: "RACK-B08",
                        nodeCode: "N-B08",
                    },

                    warehouseProductUnitsBefore: 96,
                    warehouseProductUnitsAfter: 144,
                },

                {
                    sequence: 3,
                    operationId: "OP-003",
                    operationType: "OUTBOUND",

                    productId: 103,
                    productCode: "PD-003",
                    productName: "지퍼백 중형",
                    category: "생활용품",

                    quantity: 100,
                    quantityUnit: "EA",
                    unitsPerBox: 100,
                    boxCount: 1,

                    priority: 1,

                    source: {
                        label: "RACK-C12",
                        nodeCode: "N-C12",
                    },

                    destination: {
                        label: "OUT-01",
                        nodeCode: "N-OUT01",
                    },

                    warehouseProductUnitsBefore: 320,
                    warehouseProductUnitsAfter: 220,
                },

                {
                    sequence: 4,
                    operationId: "OP-004",
                    operationType: "OUTBOUND",

                    productId: 104,
                    productCode: "PD-004",
                    productName: "후르츠잼 그레이 L",
                    category: "식품",

                    quantity: 24,
                    quantityUnit: "EA",
                    unitsPerBox: 24,
                    boxCount: 1,

                    priority: 2,

                    source: {
                        label: "RACK-D03",
                        nodeCode: "N-D03",
                    },

                    destination: {
                        label: "OUT-02",
                        nodeCode: "N-OUT02",
                    },

                    warehouseProductUnitsBefore: 96,
                    warehouseProductUnitsAfter: 72,
                },

                {
                    sequence: 5,
                    operationId: "OP-005",
                    operationType: "INBOUND",

                    productId: 105,
                    productCode: "PD-005",
                    productName: "박스 테이프",
                    category: "포장재",

                    quantity: 24,
                    quantityUnit: "EA",
                    unitsPerBox: 24,
                    boxCount: 1,

                    priority: 3,

                    source: {
                        label: "IN-02",
                        nodeCode: "N-IN02",
                    },

                    destination: {
                        label: "RACK-E06",
                        nodeCode: "N-E06",
                    },

                    warehouseProductUnitsBefore: 48,
                    warehouseProductUnitsAfter: 72,
                },

                {
                    sequence: 6,
                    operationId: "OP-006",
                    operationType: "OUTBOUND",

                    productId: 106,
                    productCode: "PD-006",
                    productName: "스낵 박스",
                    category: "식품",

                    quantity: 20,
                    quantityUnit: "EA",
                    unitsPerBox: 20,
                    boxCount: 1,

                    priority: 2,

                    source: {
                        label: "RACK-F09",
                        nodeCode: "N-F09",
                    },

                    destination: {
                        label: "OUT-02",
                        nodeCode: "N-OUT02",
                    },

                    warehouseProductUnitsBefore: 80,
                    warehouseProductUnitsAfter: 60,
                },
            ],
        },
    },

    planResponse: {
        result: {
            status: "plan_validated",
            finalRoute: "OPTIMIZED",

            frontendSummary: {
                warnings: [],
            },

            errors: [],

            plan: {
                planId: "PLAN-DEMO-001",
                planVersion: 1,
                planKind: "INITIAL",

                makespanMs: 163000,

                logicalOperations: [
                    {
                        operationId: "OP-001",
                        operationType: "OUTBOUND",
                        assignedRobotId: 10001,
                    },
                    {
                        operationId: "OP-002",
                        operationType: "INBOUND",
                        assignedRobotId: 10002,
                    },
                    {
                        operationId: "OP-003",
                        operationType: "OUTBOUND",
                        assignedRobotId: 10003,
                    },
                    {
                        operationId: "OP-004",
                        operationType: "OUTBOUND",
                        assignedRobotId: 10001,
                    },
                    {
                        operationId: "OP-005",
                        operationType: "INBOUND",
                        assignedRobotId: 10002,
                    },
                    {
                        operationId: "OP-006",
                        operationType: "OUTBOUND",
                        assignedRobotId: 10003,
                    },
                ],

                robots: [
                    {
                        robotId: 10001,
                        initialNode: "N-01",
                        finishAtMs: 138000,

                        steps: [
                            {
                                stepId: "STEP-001",
                                sequence: 1,
                                stepType: "MOVE",

                                startAtMs: 0,
                                endAtMs: 28000,

                                fromNode: "N-01",
                                toNode: "N-A04",

                                distanceM: 92.4,
                            },
                            {
                                stepId: "STEP-002",
                                sequence: 2,
                                stepType: "SERVICE",

                                startAtMs: 28000,
                                endAtMs: 48000,

                                nodeId: "N-A04",
                                serviceKind: "PICKUP",
                                distanceM: 0,
                            },
                            {
                                stepId: "STEP-003",
                                sequence: 3,
                                stepType: "MOVE",

                                startAtMs: 48000,
                                endAtMs: 82000,

                                fromNode: "N-A04",
                                toNode: "N-OUT01",

                                distanceM: 110.8,
                            },
                            {
                                stepId: "STEP-004",
                                sequence: 4,
                                stepType: "WAIT",

                                startAtMs: 82000,
                                endAtMs: 90000,

                                nodeId: "N-OUT01",
                                distanceM: 0,
                            },
                            {
                                stepId: "STEP-005",
                                sequence: 5,
                                stepType: "SERVICE",

                                startAtMs: 90000,
                                endAtMs: 108000,

                                nodeId: "N-OUT01",
                                serviceKind: "DROP",
                                distanceM: 0,
                            },
                            {
                                stepId: "STEP-006",
                                sequence: 6,
                                stepType: "MOVE",

                                startAtMs: 108000,
                                endAtMs: 138000,

                                fromNode: "N-OUT01",
                                toNode: "N-D03",

                                distanceM: 74.2,
                            },
                        ],
                    },

                    {
                        robotId: 10002,
                        initialNode: "N-02",
                        finishAtMs: 149000,

                        steps: [
                            {
                                stepId: "STEP-101",
                                sequence: 1,
                                stepType: "MOVE",

                                startAtMs: 0,
                                endAtMs: 31000,

                                fromNode: "N-02",
                                toNode: "N-IN01",

                                distanceM: 84.6,
                            },
                            {
                                stepId: "STEP-102",
                                sequence: 2,
                                stepType: "SERVICE",

                                startAtMs: 31000,
                                endAtMs: 51000,

                                nodeId: "N-IN01",
                                serviceKind: "PICKUP",
                                distanceM: 0,
                            },
                            {
                                stepId: "STEP-103",
                                sequence: 3,
                                stepType: "MOVE",

                                startAtMs: 51000,
                                endAtMs: 94000,

                                fromNode: "N-IN01",
                                toNode: "N-B08",

                                distanceM: 125.7,
                            },
                            {
                                stepId: "STEP-104",
                                sequence: 4,
                                stepType: "SERVICE",

                                startAtMs: 94000,
                                endAtMs: 112000,

                                nodeId: "N-B08",
                                serviceKind: "DROP",
                                distanceM: 0,
                            },
                            {
                                stepId: "STEP-105",
                                sequence: 5,
                                stepType: "MOVE",

                                startAtMs: 112000,
                                endAtMs: 149000,

                                fromNode: "N-B08",
                                toNode: "N-E06",

                                distanceM: 93.1,
                            },
                        ],
                    },

                    {
                        robotId: 10003,
                        initialNode: "N-03",
                        finishAtMs: 163000,

                        steps: [
                            {
                                stepId: "STEP-201",
                                sequence: 1,
                                stepType: "MOVE",

                                startAtMs: 0,
                                endAtMs: 35000,

                                fromNode: "N-03",
                                toNode: "N-C12",

                                distanceM: 101.5,
                            },
                            {
                                stepId: "STEP-202",
                                sequence: 2,
                                stepType: "SERVICE",

                                startAtMs: 35000,
                                endAtMs: 56000,

                                nodeId: "N-C12",
                                serviceKind: "PICKUP",
                                distanceM: 0,
                            },
                            {
                                stepId: "STEP-203",
                                sequence: 3,
                                stepType: "MOVE",

                                startAtMs: 56000,
                                endAtMs: 105000,

                                fromNode: "N-C12",
                                toNode: "N-OUT01",

                                distanceM: 138.3,
                            },
                            {
                                stepId: "STEP-204",
                                sequence: 4,
                                stepType: "WAIT",

                                startAtMs: 105000,
                                endAtMs: 114000,

                                nodeId: "N-OUT01",
                                distanceM: 0,
                            },
                            {
                                stepId: "STEP-205",
                                sequence: 5,
                                stepType: "SERVICE",

                                startAtMs: 114000,
                                endAtMs: 133000,

                                nodeId: "N-OUT01",
                                serviceKind: "DROP",
                                distanceM: 0,
                            },
                            {
                                stepId: "STEP-206",
                                sequence: 6,
                                stepType: "MOVE",

                                startAtMs: 133000,
                                endAtMs: 163000,

                                fromNode: "N-OUT01",
                                toNode: "N-F09",

                                distanceM: 88.7,
                            },
                        ],
                    },
                ],
            },
        },
    },
};

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

const formatSimulationTime = (milliseconds) => {
    if (!Number.isFinite(Number(milliseconds))) {
        return "-";
    }

    const totalSeconds = Math.max(
        0,
        Math.floor(Number(milliseconds) / 1000)
    );
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
            //if (!simulationRunId) {
            //    setCycleStatus(null);
            //    setPlanError("");
            //    return;
            //}

            try {
                setPlanLoading(true);
                setPlanError("");

                //const response =
                //    await fulfillmentCommandApi.getCycleStatus(
                //        simulationRunId
                //    );

                // 임시 데이터 지우면 같이 지우기
                const response = MOCK_AI_CYCLE_STATUS;
                setCycleStatus(response);

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
    const generated = cycleStatus?.generated ?? null;
    const frontView = generated?.frontView ?? null;
    const summary = frontView?.summary ?? null;

    const logicalOperations = asArray(
        field(
            plan,
            "logical_operations",
            "logicalOperations"
        )
    );

    const robotPlans = asArray(plan?.robots);
    const generatedCommands = asArray(frontView?.commands);

    const planId = field(
        plan,
        "plan_id",
        "planId"
    );

    const planVersion = field(
        plan,
        "plan_version",
        "planVersion"
    );

    const makespanMs = field(
        plan,
        "makespan_ms",
        "makespanMs"
    );

    const finalRoute = field(
        planResult,
        "final_route",
        "finalRoute"
    );

    const frontendSummary = field(
        planResult,
        "frontend_summary",
        "frontendSummary"
    );

    const planWarnings = asArray(frontendSummary?.warnings);
    const planErrors = asArray(planResult?.errors);

    const naturalLanguageRequest = String(
        field(
            generated?.planRequest,
            "user_command",
            "userCommand"
        ) ?? ""
    ).trim();

    const generatedAt =
        frontView?.generatedAt ??
        frontView?.generated_at ??
        cycleStatus?.updatedAt ??
        null;

    const commandMode =
        frontView?.mode ??
        cycleStatus?.planningMode ??
        "AUTO";

    const planCoverage =
        generatedCommands.length > 0
            ? Math.min(
                100,
                Math.round(
                    (logicalOperations.length /
                        generatedCommands.length) *
                    100
                )
            )
            : 0;

    const unassignedOperationCount = logicalOperations.filter(
        (operation) =>
            field(
                operation,
                "assigned_robot_id",
                "assignedRobotId"
            ) == null
    ).length;

    // 로봇별 배정 작업 수, 이동 거리, 완료 예정 시간을 계산한다.
    const robotPlanSummary = useMemo(
        () =>
            robotPlans.map((robot) => {
                const robotId = field(
                    robot,
                    "robot_id",
                    "robotId"
                );

                const assignedTaskCount =
                    logicalOperations.filter(
                        (operation) =>
                            String(
                                field(
                                    operation,
                                    "assigned_robot_id",
                                    "assignedRobotId"
                                )
                            ) === String(robotId)
                    ).length;

                const steps = asArray(robot?.steps);

                const totalDistance = steps.reduce(
                    (sum, step) =>
                        sum +
                        Number(
                            field(
                                step,
                                "distance_m",
                                "distanceM"
                            ) ?? 0
                        ),
                    0
                );

                return {
                    robotId,
                    assignedTaskCount,
                    totalDistance,
                    finishAtMs: field(
                        robot,
                        "finish_at_ms",
                        "finishAtMs"
                    ),
                };
            }),
        [robotPlans, logicalOperations]
    );

    const totalDistance = robotPlanSummary.reduce(
        (sum, robot) =>
            sum + Number(robot.totalDistance ?? 0),
        0
    );

    const hasRouteSteps = robotPlans.some(
        (robot) => asArray(robot?.steps).length > 0
    );

    // AI가 생성한 작업과 로봇 배정 결과를 한 행으로 묶는다.
    const operationPlanRows = useMemo(
        () =>
            generatedCommands.map((command) => {
                const operationId =
                    command.operationId ??
                    command.operation_id;

                const logicalOperation =
                    logicalOperations.find(
                        (operation) =>
                            String(
                                field(
                                    operation,
                                    "operation_id",
                                    "operationId"
                                )
                            ) === String(operationId)
                    );

                const source =
                    command.source ?? {};
                const destination =
                    command.destination ?? {};

                const sourceLabel =
                    source.label ??
                    source.nodeCode ??
                    source.node_code ??
                    source.facilityCode ??
                    source.facility_code ??
                    (
                        source.storageLocationId ??
                        source.storage_location_id
                    ) ??
                    "-";

                const destinationLabel =
                    destination.label ??
                    destination.nodeCode ??
                    destination.node_code ??
                    destination.facilityCode ??
                    destination.facility_code ??
                    (
                        destination.storageLocationId ??
                        destination.storage_location_id
                    ) ??
                    "-";

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
                    quantity:
                        command.quantity ?? 0,
                    quantityUnit:
                        command.quantityUnit ??
                        command.quantity_unit ??
                        "EA",
                    boxCount:
                        command.boxCount ??
                        command.box_count ??
                        0,
                    sourceLabel,
                    destinationLabel,
                    robotId: field(
                        logicalOperation,
                        "assigned_robot_id",
                        "assignedRobotId"
                    ),
                    inventoryBefore:
                        command.warehouseProductUnitsBefore ??
                        command.warehouse_product_units_before,
                    inventoryAfter:
                        command.warehouseProductUnitsAfter ??
                        command.warehouse_product_units_after,
                };
            }),
        [generatedCommands, logicalOperations]
    );

    const operationPreviewRows =
        operationPlanRows.slice(0, 4);

    // 전체 로봇의 step을 합쳐 MOVE / WAIT / SERVICE 실행 시간을 계산한다.
    const routeAnalysis = useMemo(() => {
        const initial = {
            MOVE: { count: 0, durationMs: 0 },
            WAIT: { count: 0, durationMs: 0 },
            SERVICE: { count: 0, durationMs: 0 },
        };

        robotPlans.forEach((robot) => {
            asArray(robot?.steps).forEach((step) => {
                const stepType = String(
                    field(
                        step,
                        "step_type",
                        "stepType"
                    ) ?? ""
                ).toUpperCase();

                if (!initial[stepType]) {
                    return;
                }

                const startAt = Number(
                    field(
                        step,
                        "start_at_ms",
                        "startAtMs"
                    ) ?? 0
                );

                const endAt = Number(
                    field(
                        step,
                        "end_at_ms",
                        "endAtMs"
                    ) ?? startAt
                );

                initial[stepType].count += 1;
                initial[stepType].durationMs +=
                    Math.max(0, endAt - startAt);
            });
        });

        return initial;
    }, [robotPlans]);

    const planStatusLabel =
        planResult?.status === "plan_validated"
            ? "계획 검증 완료"
            : planResult?.status ??
            plan?.status ??
            "계획 생성";

    // 경로 대기·충전 step과 최근 재계획을 이벤트 요약으로 조합한다.
    const reportEvents = useMemo(() => {
        const events = [];

        robotPlans.forEach((robot) => {
            const robotId = field(
                robot,
                "robot_id",
                "robotId"
            );

            asArray(robot?.steps).forEach((step) => {
                const stepType = String(
                    field(
                        step,
                        "step_type",
                        "stepType"
                    ) ?? ""
                ).toUpperCase();

                const serviceKind = String(
                    field(
                        step,
                        "service_kind",
                        "serviceKind"
                    ) ?? ""
                ).toUpperCase();

                const startAtMs = Number(
                    field(
                        step,
                        "start_at_ms",
                        "startAtMs"
                    ) ?? 0
                );

                const node =
                    field(step, "node_id", "nodeId") ??
                    field(step, "to_node", "toNode") ??
                    "-";

                if (stepType === "WAIT") {
                    events.push({
                        id: `wait-${robotId}-${startAtMs}`,
                        type: "WAIT",
                        label: "경로 대기",
                        time: formatSimulationTime(startAtMs),
                        robotId,
                        location: node,
                        description: `${formatRobotId(robotId)}가 ${node}에서 경로 진행을 대기했습니다.`,
                        sortValue: startAtMs,
                    });
                }

                if (stepType === "SERVICE" && serviceKind === "CHARGE") {
                    events.push({
                        id: `charge-${robotId}-${startAtMs}`,
                        type: "CHARGE",
                        label: "충전 수행",
                        time: formatSimulationTime(startAtMs),
                        robotId,
                        location: node,
                        description: `${formatRobotId(robotId)}가 ${node}에서 충전을 수행했습니다.`,
                        sortValue: startAtMs,
                    });
                }
            });
        });

        if (replanResult) {
            const reason =
                replanResult.reason ??
                replanResult.reoptimizationReason;

            events.push({
                id:
                    replanResult.optimizationResultId ??
                    replanResult.requestId ??
                    "latest-replan",
                type: "REPLAN",
                label: "재계획",
                time: formatDateTime(replanResult.createdAt),
                robotId: replanResult.triggerRobotId,
                location: null,
                description:
                    replanResult.description ||
                    `${getReoptimizationReasonLabel(reason)} 사유로 재계획이 수행되었습니다.`,
                sortValue:
                    Date.parse(replanResult.createdAt ?? "") ||
                    Number.MAX_SAFE_INTEGER,
            });
        }

        return events
            .sort(
                (left, right) =>
                    Number(right.sortValue ?? 0) -
                    Number(left.sortValue ?? 0)
            )
            .slice(0, 4);
    }, [robotPlans, replanResult]);

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
                                AI 입력부터 계획, 로봇 배정, 경로와 이벤트까지 한 번에 확인합니다.
                            </p>
                        </div>
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
                        <div className="scenario-ai-report scenario-ai-report-two-column">
                            {/* 1행: 실행 정보 / AI 입력 */}
                            <div className="scenario-ai-report-row">
                                <article className="scenario-ai-report-panel scenario-ai-report-identity">
                                    <div className="scenario-ai-report-section-title">
                                        <span>AI EXECUTION REPORT</span>
                                        <strong>실행 리포트</strong>
                                    </div>

                                    <div className="scenario-ai-report-plan-heading">
                                        <div>
                                            <strong>
                                                PLAN
                                                {planVersion != null
                                                    ? ` v${planVersion}`
                                                    : ""}
                                            </strong>
                                            <span>{planId ?? "-"}</span>
                                        </div>

                                        <span
                                            className={`scenario-ai-plan-status ${
                                                planResult?.status === "plan_validated"
                                                    ? "is-success"
                                                    : "is-default"
                                            }`}
                                        >
                                            {planStatusLabel}
                                        </span>
                                    </div>

                                    <div className="scenario-ai-report-meta-line">
                                        <span>실행 #{simulationRunId ?? "-"}</span>
                                        <span>{commandMode}</span>
                                        <span>
                                            {generatedAt
                                                ? formatDateTime(generatedAt)
                                                : "-"}
                                        </span>
                                    </div>
                                </article>

                                <article className="scenario-ai-report-panel scenario-ai-input-panel">
                                    <div className="scenario-ai-report-section-title">
                                        <span>AI INPUT</span>
                                        <strong>
                                            {naturalLanguageRequest
                                                ? "AI 입력 명령"
                                                : "AI 입력 조건"}
                                        </strong>
                                    </div>

                                    <p className="scenario-ai-input-command">
                                        {naturalLanguageRequest ||
                                            "시뮬레이션의 재고, 작업 및 로봇 상태를 기반으로 입출고 작업을 자동 생성했습니다."}
                                    </p>

                                    <div className="scenario-ai-input-meta">
                                        <span>
                                            생성 <strong>{generatedCommands.length}건</strong>
                                        </span>
                                        <span>
                                            입고{" "}
                                            <strong>
                                                {summary?.generatedInboundCommands ?? 0}건
                                            </strong>
                                        </span>
                                        <span>
                                            출고{" "}
                                            <strong>
                                                {summary?.generatedOutboundCommands ?? 0}건
                                            </strong>
                                        </span>
                                    </div>
                                </article>
                            </div>

                            {/* 2행: 계획 요약 / 검증 */}
                            <div className="scenario-ai-report-row">
                                <article className="scenario-ai-report-panel">
                                    <div className="scenario-ai-report-section-title">
                                        <span>PLAN OVERVIEW</span>
                                        <strong>계획 요약</strong>
                                    </div>

                                    <div className="scenario-ai-compact-metrics">
                                        <div>
                                            <span>계획 반영</span>
                                            <strong>
                                                {logicalOperations.length}
                                                {" / "}
                                                {generatedCommands.length}
                                            </strong>
                                            <small>{planCoverage}%</small>
                                        </div>

                                        <div>
                                            <span>투입 로봇</span>
                                            <strong>{robotPlans.length}대</strong>
                                        </div>

                                        <div>
                                            <span>예상 완료</span>
                                            <strong>{formatDuration(makespanMs)}</strong>
                                        </div>

                                        <div>
                                            <span>총 이동거리</span>
                                            <strong>
                                                {hasRouteSteps
                                                    ? `${totalDistance.toFixed(1)}m`
                                                    : "-"}
                                            </strong>
                                        </div>
                                    </div>
                                </article>

                                <article className="scenario-ai-report-panel scenario-ai-validation-panel">
                                    <div className="scenario-ai-report-section-title">
                                        <span>VALIDATION</span>
                                        <strong>계획 검증</strong>
                                    </div>

                                    <div className="scenario-ai-compact-metrics">
                                        <div>
                                            <span>계획 상태</span>
                                            <strong
                                                className={
                                                    planResult?.status ===
                                                    "plan_validated"
                                                        ? "is-success"
                                                        : ""
                                                }
                                            >
                                                {planStatusLabel}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>미배정</span>
                                            <strong>
                                                {unassignedOperationCount}건
                                            </strong>
                                        </div>

                                        <div>
                                            <span>경고</span>
                                            <strong>
                                                {planWarnings.length > 0
                                                    ? `${planWarnings.length}건`
                                                    : "없음"}
                                            </strong>
                                        </div>

                                        <div>
                                            <span>오류</span>
                                            <strong>
                                                {planErrors.length > 0
                                                    ? `${planErrors.length}건`
                                                    : "없음"}
                                            </strong>
                                        </div>
                                    </div>

                                    <div className="scenario-ai-validation-result">
                                        <span>최종 결과</span>
                                        <strong>{finalRoute ?? "-"}</strong>
                                    </div>
                                </article>
                            </div>

                            {/* 3행: 작업 계획 / 로봇 배정 */}
                            <div className="scenario-ai-report-row scenario-ai-report-row-table">
                                <article className="scenario-ai-report-panel">
                                    <div className="scenario-ai-report-section-title scenario-ai-report-section-title-row">
                                        <div>
                                            <span>OPERATION PLAN</span>
                                            <strong>작업 실행 계획</strong>
                                        </div>
                                        <small>
                                            {operationPlanRows.length} TASKS
                                        </small>
                                    </div>

                                    {operationPreviewRows.length > 0 ? (
                                        <>
                                            <div className="scenario-ai-report-table-wrap">
                                                <table className="scenario-ai-report-table scenario-ai-operation-table scenario-ai-report-table-compact">
                                                    <thead>
                                                        <tr>
                                                            <th>작업</th>
                                                            <th>수량</th>
                                                            <th>이동</th>
                                                            <th>담당</th>
                                                        </tr>
                                                    </thead>

                                                    <tbody>
                                                        {operationPreviewRows.map(
                                                            (operation, index) => (
                                                                <tr
                                                                    key={
                                                                        operation.operationId ??
                                                                        index
                                                                    }
                                                                >
                                                                    <td>
                                                                        <div className="scenario-ai-operation-name">
                                                                            <span
                                                                                className={`scenario-ai-operation-badge ${
                                                                                    operation.operationType
                                                                                        ?.toLowerCase() ??
                                                                                    ""
                                                                                }`}
                                                                            >
                                                                                {OPERATION_LABEL[
                                                                                    operation.operationType
                                                                                ] ??
                                                                                    operation.operationType ??
                                                                                    "작업"}
                                                                            </span>
                                                                            <strong>
                                                                                {
                                                                                    operation.productName
                                                                                }
                                                                            </strong>
                                                                        </div>
                                                                    </td>

                                                                    <td>
                                                                        <strong>
                                                                            {
                                                                                operation.quantity
                                                                            }{" "}
                                                                            {
                                                                                operation.quantityUnit
                                                                            }
                                                                        </strong>
                                                                    </td>

                                                                    <td>
                                                                        <span className="scenario-ai-route-cell">
                                                                            {
                                                                                operation.sourceLabel
                                                                            }
                                                                            <b>→</b>
                                                                            {
                                                                                operation.destinationLabel
                                                                            }
                                                                        </span>
                                                                    </td>

                                                                    <td>
                                                                        <strong className="scenario-ai-assigned-robot">
                                                                            {operation.robotId != null
                                                                                ? formatRobotId(
                                                                                    operation.robotId
                                                                                )
                                                                                : "보류"}
                                                                        </strong>
                                                                    </td>
                                                                </tr>
                                                            )
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {operationPlanRows.length > 4 && (
                                                <div className="scenario-ai-report-more">
                                                    +{" "}
                                                    {operationPlanRows.length - 4}
                                                    개 작업이 더 있습니다.
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="scenario-ai-plan-list-empty">
                                            표시할 작업 계획이 없습니다.
                                        </div>
                                    )}
                                </article>

                                <article className="scenario-ai-report-panel">
                                    <div className="scenario-ai-report-section-title scenario-ai-report-section-title-row">
                                        <div>
                                            <span>ROBOT ASSIGNMENT</span>
                                            <strong>로봇 배정 분석</strong>
                                        </div>
                                        <small>
                                            {robotPlanSummary.length} ROBOTS
                                        </small>
                                    </div>

                                    {robotPlanSummary.length > 0 ? (
                                        <div className="scenario-ai-report-table-wrap">
                                            <table className="scenario-ai-report-table scenario-ai-report-table-compact">
                                                <thead>
                                                    <tr>
                                                        <th>로봇</th>
                                                        <th>작업</th>
                                                        <th>거리</th>
                                                        <th>완료</th>
                                                    </tr>
                                                </thead>

                                                <tbody>
                                                    {robotPlanSummary.map(
                                                        (robot, index) => (
                                                            <tr
                                                                key={
                                                                    robot.robotId ??
                                                                    index
                                                                }
                                                            >
                                                                <td>
                                                                    <strong>
                                                                        {formatRobotId(
                                                                            robot.robotId
                                                                        )}
                                                                    </strong>
                                                                </td>
                                                                <td>
                                                                    {robot.assignedTaskCount}건
                                                                </td>
                                                                <td>
                                                                    {robot.totalDistance.toFixed(
                                                                        1
                                                                    )}
                                                                    m
                                                                </td>
                                                                <td>
                                                                    {formatDuration(
                                                                        robot.finishAtMs
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="scenario-ai-plan-list-empty">
                                            배정된 로봇 계획이 없습니다.
                                        </div>
                                    )}
                                </article>
                            </div>

                            {/* 4행: 경로 분석 / 이벤트 */}
                            <div className="scenario-ai-report-row">
                                <article className="scenario-ai-report-panel">
                                    <div className="scenario-ai-report-section-title">
                                        <span>ROUTE ANALYSIS</span>
                                        <strong>실행 경로 분석</strong>
                                    </div>

                                    <div className="scenario-ai-route-list">
                                        {["MOVE", "WAIT", "SERVICE"].map(
                                            (stepType) => (
                                                <div
                                                    className="scenario-ai-route-list-row"
                                                    key={stepType}
                                                >
                                                    <span>{stepType}</span>
                                                    <strong>
                                                        {
                                                            routeAnalysis[
                                                                stepType
                                                            ].count
                                                        }
                                                        회
                                                    </strong>
                                                    <small>
                                                        {formatDuration(
                                                            routeAnalysis[
                                                                stepType
                                                            ].durationMs
                                                        )}
                                                    </small>
                                                </div>
                                            )
                                        )}
                                    </div>

                                    <div className="scenario-ai-route-total">
                                        <span>총 이동거리</span>
                                        <strong>
                                            {hasRouteSteps
                                                ? `${totalDistance.toFixed(1)}m`
                                                : "-"}
                                        </strong>
                                    </div>
                                </article>

                                <article className="scenario-ai-report-panel scenario-ai-event-panel">
                                    <div className="scenario-ai-report-section-title scenario-ai-report-section-title-row">
                                        <div>
                                            <span>EVENT</span>
                                            <strong>실행 이벤트</strong>
                                        </div>
                                        <small>{reportEvents.length} EVENTS</small>
                                    </div>

                                    {reportEvents.length > 0 ? (
                                        <div className="scenario-ai-event-list">
                                            {reportEvents.map((event) => (
                                                <div
                                                    className="scenario-ai-event-item"
                                                    key={event.id}
                                                >
                                                    <div className="scenario-ai-event-time">
                                                        {event.time}
                                                    </div>

                                                    <div className="scenario-ai-event-content">
                                                        <div>
                                                            <strong>
                                                                {event.label}
                                                            </strong>
                                                            <span
                                                                className={`scenario-ai-event-type is-${String(
                                                                    event.type
                                                                ).toLowerCase()}`}
                                                            >
                                                                {event.type}
                                                            </span>
                                                        </div>

                                                        <p>
                                                            {event.description}
                                                        </p>

                                                        {(event.robotId != null ||
                                                            event.location) && (
                                                            <small>
                                                                {event.robotId != null
                                                                    ? formatRobotId(
                                                                        event.robotId
                                                                    )
                                                                    : ""}
                                                                {event.robotId != null &&
                                                                event.location
                                                                    ? " · "
                                                                    : ""}
                                                                {event.location ?? ""}
                                                            </small>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="scenario-ai-event-empty">
                                            <strong>특이 이벤트 없음</strong>
                                            <p>
                                                현재 계획에서 확인된 대기,
                                                충전 또는 재계획 이벤트가 없습니다.
                                            </p>
                                        </div>
                                    )}
                                </article>
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
