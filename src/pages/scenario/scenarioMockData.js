import scenarioSnapshot from "../../data/scenarios.json";
import "../../styles/scenario/Scenario.css";

/* API 연동 전 화면 구성을 확인하기 위한 목업 창고 데이터 */
export const MOCK_WAREHOUSES = [
    {
        id: "WH-001",
        name: "대전 제1창고",
        zoneCount: 4,
        storageLocationCount: 120,
        productCount: 12,
        inventoryCount: 1240,
        chargingStationCount: 2,
        bufferNodeCount: scenarioSnapshot.buffer_nodes?.length ?? 0,
    },
    {
        id: "WH-002",
        name: "대전 제2창고",
        zoneCount: 6,
        storageLocationCount: 180,
        productCount: 20,
        inventoryCount: 2130,
        chargingStationCount: 3,
        bufferNodeCount: 3,
    },
    {
        id: "WH-003",
        name: "광주 물류창고",
        zoneCount: 5,
        storageLocationCount: 150,
        productCount: 16,
        inventoryCount: 1750,
        chargingStationCount: 2,
        bufferNodeCount: 2,
    },
];

export const STATUS_OPTIONS = [
    { value: "DRAFT", label: "초안" },
    { value: "VALIDATING", label: "검증 중" },
    { value: "VALIDATED", label: "검증 완료" },
    { value: "ARCHIVED", label: "보관됨" },
];

export const TASK_TYPE_OPTIONS = [
    { value: "INBOUND", label: "입고" },
    { value: "OUTBOUND", label: "출고" },
    { value: "LOADING", label: "적재" },
    { value: "RELOCATION", label: "재배치" },
    { value: "REPLENISHMENT", label: "보충" },
    { value: "CHARGING", label: "충전" },
];

export const PRIORITY_OPTIONS = [
    { value: "PRIORITY", label: "우선순위 우선" },
    { value: "DEADLINE", label: "마감시간 우선" },
    { value: "PRIORITY_THEN_DEADLINE", label: "우선순위 → 마감시간 순" },
    { value: "FIFO", label: "선입선출" },
];

export const REPLAN_METHOD_OPTIONS = [
    { value: "AFFECTED_TASKS_ONLY", label: "영향받은 작업만 재계획" },
    { value: "ALL_TASKS", label: "전체 작업 재계획" },
    { value: "PATH_ONLY", label: "경로만 재계산" },
];

export const REPLAN_EVENT_OPTIONS = [
    { value: "EDGE_CONGESTED", label: "통로 혼잡" },
    { value: "EDGE_BLOCKED", label: "통로 차단" },
    { value: "EDGE_OCCUPIED", label: "통로 점유" },
    { value: "ROBOT_FAILURE", label: "로봇 고장" },
    { value: "LOW_BATTERY", label: "배터리 부족" },
    { value: "TASK_DELAY", label: "작업 지연" },
];

export const EVENT_TYPE_OPTIONS = [
    { value: "NEW_ORDER", label: "신규 주문" },
    { value: "EDGE_CONGESTED", label: "통로 혼잡" },
    { value: "EDGE_BLOCKED", label: "통로 차단" },
    { value: "EDGE_OCCUPIED", label: "통로 점유" },
    { value: "ROBOT_FAILURE", label: "로봇 고장" },
    { value: "LOW_BATTERY", label: "배터리 부족" },
];

export const PAGE_SIZE_OPTIONS = [5, 10, 20];

export const STATUS_LABELS = Object.fromEntries(
    STATUS_OPTIONS.map((option) => [option.value, option.label])
);
export const TASK_TYPE_LABELS = Object.fromEntries(
    TASK_TYPE_OPTIONS.map((option) => [option.value, option.label])
);
export const PRIORITY_LABELS = Object.fromEntries(
    PRIORITY_OPTIONS.map((option) => [option.value, option.label])
);
export const REPLAN_METHOD_LABELS = Object.fromEntries(
    REPLAN_METHOD_OPTIONS.map((option) => [option.value, option.label])
);
export const REPLAN_EVENT_LABELS = Object.fromEntries(
    REPLAN_EVENT_OPTIONS.map((option) => [option.value, option.label])
);
export const EVENT_TYPE_LABELS = Object.fromEntries(
    EVENT_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

const SNAPSHOT_EVENT_MAP = {
    new_order: "NEW_ORDER",
    edge_congested: "EDGE_CONGESTED",
    edge_blocked: "EDGE_BLOCKED",
    edge_occupied: "EDGE_OCCUPIED",
    robot_failure: "ROBOT_FAILURE",
    low_battery: "LOW_BATTERY",
};

/* scenario.json의 이벤트를 시나리오 폼에서 사용하는 값으로 변환 */
const SNAPSHOT_EVENT_TYPES = [
    ...new Set(
        (scenarioSnapshot.events ?? [])
            .map((event) => SNAPSHOT_EVENT_MAP[event.type])
            .filter(Boolean)
    ),
];

const DEFAULT_REPLAN_EVENTS = SNAPSHOT_EVENT_TYPES.filter(
    (eventType) => eventType !== "NEW_ORDER"
);

export const EMPTY_FORM = {
    name: "",
    description: "",
    warehouseId: scenarioSnapshot.warehouse_id || "WH-001",
    status: "DRAFT",
    taskTypes: ["INBOUND", "OUTBOUND", "CHARGING"],
    minimumOperationBatteryPct: 40,
    chargeThresholdPct: 20,
    autoReplanEnabled: true,
    priorityPolicy: "PRIORITY_THEN_DEADLINE",
    replanMethod: "AFFECTED_TASKS_ONLY",
    replanEvents: DEFAULT_REPLAN_EVENTS,
    eventTypes: SNAPSHOT_EVENT_TYPES,
};

/* API 연동 전 목록, 상세, 페이지네이션을 확인하기 위한 목업 시나리오 */
export const INITIAL_SCENARIOS = [
    {
        id: 1,
        name: "기본 창고 운영 시나리오",
        description: "입고·출고·충전 작업을 포함한 기본 운영 시나리오입니다.",
        warehouseId: scenarioSnapshot.warehouse_id || "WH-001",
        status: "VALIDATED",
        favorite: true,
        taskTypes: [
            "INBOUND",
            "OUTBOUND",
            "LOADING",
            "RELOCATION",
            "REPLENISHMENT",
            "CHARGING",
        ],
        minimumOperationBatteryPct: 40,
        chargeThresholdPct: 20,
        autoReplanEnabled: true,
        priorityPolicy: "PRIORITY_THEN_DEADLINE",
        replanMethod: "AFFECTED_TASKS_ONLY",
        replanEvents: ["EDGE_CONGESTED", "EDGE_OCCUPIED", "LOW_BATTERY"],
        eventTypes:
            SNAPSHOT_EVENT_TYPES.length > 0
                ? SNAPSHOT_EVENT_TYPES
                : ["NEW_ORDER", "EDGE_CONGESTED", "EDGE_OCCUPIED"],
        updatedAt: scenarioSnapshot.captured_at || "2026-07-31T09:00:00",
        runHistory: [
            {
                simulationId: scenarioSnapshot.simulation_id || "SIM001",
                executedAt: scenarioSnapshot.captured_at || "2026-07-31T09:00:00",
                status: "완료",
                totalTasks: 12,
                completedTasks: 11,
                failedTasks: 1,
            },
            {
                simulationId: "SIM000",
                executedAt: "2026-07-29T15:30:00",
                status: "완료",
                totalTasks: 10,
                completedTasks: 10,
                failedTasks: 0,
            },
        ],
    },
    {
        id: 2,
        name: "통로 혼잡 대응 시나리오",
        description: "혼잡 또는 점유 통로 발생 시 경로 재계산을 확인합니다.",
        warehouseId: "WH-001",
        status: "VALIDATING",
        favorite: false,
        taskTypes: ["OUTBOUND", "RELOCATION", "CHARGING"],
        minimumOperationBatteryPct: 45,
        chargeThresholdPct: 20,
        autoReplanEnabled: true,
        priorityPolicy: "DEADLINE",
        replanMethod: "PATH_ONLY",
        replanEvents: ["EDGE_CONGESTED", "EDGE_BLOCKED", "EDGE_OCCUPIED"],
        eventTypes: ["EDGE_CONGESTED", "EDGE_BLOCKED", "EDGE_OCCUPIED"],
        updatedAt: "2026-07-30T16:20:00",
        runHistory: [
            {
                simulationId: "SIM010",
                executedAt: "2026-07-30T14:10:00",
                status: "중단",
                totalTasks: 8,
                completedTasks: 5,
                failedTasks: 3,
            },
        ],
    },
    {
        id: 3,
        name: "저배터리 충전 전환 시나리오",
        description: "배터리 임계치에 따라 충전 작업이 생성되는지 확인합니다.",
        warehouseId: "WH-002",
        status: "DRAFT",
        favorite: true,
        taskTypes: ["OUTBOUND", "CHARGING"],
        minimumOperationBatteryPct: 50,
        chargeThresholdPct: 25,
        autoReplanEnabled: true,
        priorityPolicy: "PRIORITY",
        replanMethod: "AFFECTED_TASKS_ONLY",
        replanEvents: ["LOW_BATTERY"],
        eventTypes: ["LOW_BATTERY"],
        updatedAt: "2026-07-30T11:45:00",
        runHistory: [],
    },
    {
        id: 4,
        name: "입고 적치 최적화 시나리오",
        description: "입고 상품의 적치 위치 후보와 이동 순서를 확인합니다.",
        warehouseId: "WH-002",
        status: "VALIDATED",
        favorite: false,
        taskTypes: ["INBOUND", "LOADING", "RELOCATION"],
        minimumOperationBatteryPct: 35,
        chargeThresholdPct: 15,
        autoReplanEnabled: false,
        priorityPolicy: "FIFO",
        replanMethod: "AFFECTED_TASKS_ONLY",
        replanEvents: [],
        eventTypes: ["NEW_ORDER"],
        updatedAt: "2026-07-29T17:00:00",
        runHistory: [
            {
                simulationId: "SIM021",
                executedAt: "2026-07-29T16:20:00",
                status: "완료",
                totalTasks: 14,
                completedTasks: 14,
                failedTasks: 0,
            },
        ],
    },
    {
        id: 5,
        name: "재고 보충 집중 시나리오",
        description: "피킹 구역의 재고 부족 상황과 보충 작업 흐름을 확인합니다.",
        warehouseId: "WH-003",
        status: "VALIDATING",
        favorite: false,
        taskTypes: ["RELOCATION", "REPLENISHMENT", "CHARGING"],
        minimumOperationBatteryPct: 45,
        chargeThresholdPct: 20,
        autoReplanEnabled: true,
        priorityPolicy: "PRIORITY_THEN_DEADLINE",
        replanMethod: "AFFECTED_TASKS_ONLY",
        replanEvents: ["TASK_DELAY", "LOW_BATTERY"],
        eventTypes: ["NEW_ORDER", "LOW_BATTERY", "ROBOT_FAILURE"],
        updatedAt: "2026-07-28T13:10:00",
        runHistory: [],
    },
    {
        id: 6,
        name: "로봇 고장 대응 시나리오",
        description: "작업 수행 중 로봇 고장이 발생했을 때 작업을 재배정합니다.",
        warehouseId: "WH-003",
        status: "DRAFT",
        favorite: false,
        taskTypes: ["INBOUND", "OUTBOUND", "RELOCATION", "CHARGING"],
        minimumOperationBatteryPct: 40,
        chargeThresholdPct: 20,
        autoReplanEnabled: true,
        priorityPolicy: "PRIORITY",
        replanMethod: "ALL_TASKS",
        replanEvents: ["ROBOT_FAILURE", "TASK_DELAY"],
        eventTypes: ["ROBOT_FAILURE", "LOW_BATTERY"],
        updatedAt: "2026-07-27T09:30:00",
        runHistory: [
            {
                simulationId: "SIM032",
                executedAt: "2026-07-27T08:55:00",
                status: "실패",
                totalTasks: 7,
                completedTasks: 3,
                failedTasks: 4,
            },
        ],
    },
    {
        id: 7,
        name: "출고 우선순위 검증 시나리오",
        description: "긴급 주문과 일반 주문의 우선순위 처리 순서를 비교합니다.",
        warehouseId: "WH-001",
        status: "VALIDATED",
        favorite: false,
        taskTypes: ["OUTBOUND", "LOADING", "CHARGING"],
        minimumOperationBatteryPct: 40,
        chargeThresholdPct: 20,
        autoReplanEnabled: true,
        priorityPolicy: "PRIORITY_THEN_DEADLINE",
        replanMethod: "AFFECTED_TASKS_ONLY",
        replanEvents: ["TASK_DELAY"],
        eventTypes: ["NEW_ORDER"],
        updatedAt: "2026-07-26T18:40:00",
        runHistory: [
            {
                simulationId: "SIM040",
                executedAt: "2026-07-26T17:50:00",
                status: "완료",
                totalTasks: 18,
                completedTasks: 17,
                failedTasks: 1,
            },
        ],
    },
    {
        id: 8,
        name: "전체 작업 통합 시나리오",
        description: "모든 작업 유형과 예외 이벤트를 한 번에 검증합니다.",
        warehouseId: "WH-002",
        status: "ARCHIVED",
        favorite: false,
        taskTypes: TASK_TYPE_OPTIONS.map((option) => option.value),
        minimumOperationBatteryPct: 50,
        chargeThresholdPct: 25,
        autoReplanEnabled: true,
        priorityPolicy: "DEADLINE",
        replanMethod: "ALL_TASKS",
        replanEvents: REPLAN_EVENT_OPTIONS.map((option) => option.value),
        eventTypes: EVENT_TYPE_OPTIONS.map((option) => option.value),
        updatedAt: "2026-07-25T12:00:00",
        runHistory: [],
    },
];

export const formatDateTime = (dateTime) => {
    if (!dateTime) return "-";

    return new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(dateTime));
};

export const getStatusClassName = (status) => {
    const classNames = {
        DRAFT: "is-draft",
        VALIDATING: "is-validating",
        VALIDATED: "is-validated",
        ARCHIVED: "is-archived",
    };

    return classNames[status] || "is-draft";
};

