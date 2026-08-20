import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/simulation/Simulation.css";

import WarehouseSVG from "../../components/warehouse/viewer/WarehouseSVG";
import SimulationPanel from "../../components/simulation/SimulationPanel";
import SimulationTaskList from "../../components/simulation/SimulationTaskList";
import SimulationRobotList from "../../components/simulation/SimulationRobotList";
import SimulationEventList from "../../components/simulation/SimulationEventList";
import useRobotAvoidanceTracker from "../../hooks/useRobotAvoidanceTracker";

import useStompSubscriptions from "../../hooks/useStompSubscriptions";
import { TOPICS } from "../../api/config";
import {
    simulationRunApi,
    warehouseApi,
    robotApi,
    fulfillmentCommandApi,
    scenarioApi,
} from "../../api/client";
import { isGuestSession } from "../../api/auth";


const DEFAULT_WAREHOUSE_ID = 1;

const WAREHOUSE_ID_KEY = "selectedWarehouseId";

const RUN_ID_KEY = "simulationRunId";

const SCENARIO_ID_KEY = "selectedScenarioId";

const COMMAND_EXPRESSION_MIX_KEY = "simulationCommandExpressionMixV3";
const DEFAULT_COMMAND_EXPRESSION_MIX = {
    policyEnabled: false,
    naturalLanguageEnabled: false,
    replanIntervalMinutes: 5,
    averageTasksPerRobot: 3.5,
};

// 패널 리사이즈 최소 크기
const RESIZE_HANDLE_SIZE = 8;
const MIN_VIEW_WIDTH = 520;
const CONTROLBAR_MIN_WIDTH_GAP = 8;
const MIN_PANEL_WIDTH = 320;
const MIN_MAIN_HEIGHT = 360;
const MIN_LIST_HEIGHT = 230;
const MIN_LIST_WIDTH = 260;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// 제어바의 실제 내용 폭을 기준으로 지도 영역의 최소 너비를 계산한다.
// 제목/요약/제어 버튼이 한 줄로 유지되는 범위보다 작게는 리사이즈되지 않는다.
const getControlbarMinWidth = (layoutElement) => {
    const controlbar = layoutElement?.querySelector(".simulation-controlbar");

    if (!controlbar) {
        return MIN_VIEW_WIDTH;
    }

    const title = controlbar.querySelector(".simulation-controlbar-title");
    const summary = controlbar.querySelector(".simulation-controlbar-summary");
    const actions = controlbar.querySelector(".simulation-controlbar-actions");
    const controlbarStyle = window.getComputedStyle(controlbar);
    const actionsStyle = actions ? window.getComputedStyle(actions) : null;

    const horizontalPadding =
        (Number.parseFloat(controlbarStyle.paddingLeft) || 0)
        + (Number.parseFloat(controlbarStyle.paddingRight) || 0);

    const getLogicalWidth = (element) => {
        if (!element) {
            return 0;
        }

        // offsetWidth/scrollWidth는 transform: scale()의 영향을 받지 않는 CSS px 값이다.
        return Math.max(element.offsetWidth, element.scrollWidth);
    };

    // summary의 margin-left:auto는 남는 공간 전체로 계산되므로 최소 폭에 포함하면 안 된다.
    // actions의 고정 margin-left만 실제 컨텐츠 간격으로 더한다.
    const actionsMarginLeft = Number.parseFloat(actionsStyle?.marginLeft) || 0;
    const contentWidth =
        getLogicalWidth(title)
        + getLogicalWidth(summary)
        + getLogicalWidth(actions)
        + actionsMarginLeft;

    return Math.max(
        MIN_VIEW_WIDTH,
        Math.ceil(horizontalPadding + contentWidth + CONTROLBAR_MIN_WIDTH_GAP)
    );
};

const loadCommandExpressionMix = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(COMMAND_EXPRESSION_MIX_KEY));
        const replanIntervalMinutes = Number(saved?.replanIntervalMinutes);
        const averageTasksPerRobot = Number(saved?.averageTasksPerRobot);
        return {
            policyEnabled: saved?.policyEnabled === true,
            naturalLanguageEnabled: saved?.naturalLanguageEnabled === true,
            replanIntervalMinutes: [3, 5, 10].includes(replanIntervalMinutes)
                ? replanIntervalMinutes
                : DEFAULT_COMMAND_EXPRESSION_MIX.replanIntervalMinutes,
            averageTasksPerRobot:
                averageTasksPerRobot >= 1 && averageTasksPerRobot <= 5
                    ? averageTasksPerRobot
                    : DEFAULT_COMMAND_EXPRESSION_MIX.averageTasksPerRobot,
        };
    } catch {
        return DEFAULT_COMMAND_EXPRESSION_MIX;
    }
};

const STATUS_LABEL = {
    CREATED: "대기",
    RUNNING: "실행",
    PAUSED: "일시정지",
    QUIESCING: "안전 노드 정지 중",
    REPLANNING: "재계획",
    PENDING_ACTIVATION: "새 계획 전환 대기",
    COMPLETED: "완료",
    STOPPED: "중지",
    FAILED: "실패",
};

// 이보다 짧은 충돌 회피 대기는 실제 시간표에는 유지하되 화면 상태는 바꾸지 않는다.
// 100ms 상태 갱신 사이에 기본/적재/대기 이미지가 연속으로 바뀌는 깜빡임을 막는다.
const MIN_VISIBLE_WAIT_MS = 500;

const LOW_BATTERY_EVENT_ACTIVE_ROBOT_STATUSES = new Set([
    "ASSIGNED",
    "MOVING",
    "WORKING",
    "BUSY",
    "IN_PROGRESS",
    "SERVICING",
    "PICKING",
    "DROPPING",
    "LOADING",
    "UNLOADING",
]);

const MANUAL_LOW_BATTERY_EVENT_SOURCE = "MANUAL_LOW_BATTERY_INJECTION";

const isManualLowBatteryRecovered = (event, robot) => {
    if (!robot || event.source !== MANUAL_LOW_BATTERY_EVENT_SOURCE) {
        return false;
    }

    const status = String(robot.status ?? "").toUpperCase();
    const activity = String(robot.activity ?? "").toUpperCase();
    const serviceKind = String(robot.service_kind ?? "").toUpperCase();
    const battery = Number(robot.battery);
    const chargingThreshold = Number(event.chargingThreshold);

    if (
        status === "CHARGING"
        || activity === "CHARGING"
        || serviceKind === "CHARGE"
    ) {
        return true;
    }

    return status === "IDLE"
        && Number.isFinite(battery)
        && Number.isFinite(chargingThreshold)
        && battery > chargingThreshold;
};

const toRobotView = (state) => {
    const isMoving = Boolean(state.nextNodeCode);
    const hasAuthoritativeMovement = Boolean(state.movementStepId)
        && state.movementProgress !== null
        && state.movementProgress !== undefined
        && Number.isFinite(Number(state.movementProgress));
    const displayNodeCode = hasAuthoritativeMovement
        ? state.currentNodeCode
        : isMoving
            ? state.nextNodeCode
            : state.currentNodeCode;
    const hasWaitWindow = state.estimatedResumeAtMillis !== null
        && state.estimatedResumeAtMillis !== undefined
        && state.waitStartedAtMillis !== null
        && state.waitStartedAtMillis !== undefined;
    const waitDurationMillis = hasWaitWindow
        ? Number(state.estimatedResumeAtMillis)
            - Number(state.waitStartedAtMillis)
        : Number.NaN;
    const isShortTrafficWait = state.activity === "WAITING"
        && Number.isFinite(waitDurationMillis)
        && waitDurationMillis >= 0
        && waitDurationMillis < MIN_VISIBLE_WAIT_MS
        && !String(state.waitingReason ?? "").includes("배터리");
    const activity = isShortTrafficWait && state.carryingLoad
        ? state.taskType === "INBOUND"
            ? "PUTAWAY"
            : state.taskType === "OUTBOUND"
                ? "RELOCATION"
                : state.status
        : isShortTrafficWait
            ? state.status
            : state.activity ?? state.status;

    return {
        robot_id: state.robotId,
        robot_code: `R${state.robotId}`,
        node_id: displayNodeCode,
        from_node_code: hasAuthoritativeMovement
            ? state.currentNodeCode
            : displayNodeCode,
        to_node_code: hasAuthoritativeMovement
            ? state.nextNodeCode
            : displayNodeCode,
        movement_step_id: hasAuthoritativeMovement
            ? state.movementStepId
            : null,
        movement_start_at_ms: state.movementStartAtMillis,
        movement_end_at_ms: state.movementEndAtMillis,
        simulation_time_ms: state.simulationTimeMillis,
        movement_progress: hasAuthoritativeMovement
            ? Number(state.movementProgress)
            : null,
        arrival_in_seconds: hasAuthoritativeMovement
            ? Number(state.arrivalInSeconds ?? 0)
            : null,
        movement_snapshot_received_at: performance.now(),

        battery: state.batteryLevel,
        status: state.status,
        activity,
        current_task_id: state.currentTaskId,
        task_type: state.taskType,
        service_kind: state.serviceKind,
        service_progress: state.serviceProgress,
        carrying_load: Boolean(state.carryingLoad),
        waiting_reason: isShortTrafficWait
            ? null
            : state.waitingReason ?? null,
        waiting_node_code: isShortTrafficWait
            ? null
            : state.waitingNodeCode ?? null,
        blocking_robot_id: isShortTrafficWait
            ? null
            : state.blockingRobotId ?? null,
        wait_started_at_ms: isShortTrafficWait
            ? null
            : state.waitStartedAtMillis ?? null,
        estimated_resume_at_ms: isShortTrafficWait
            ? null
            : state.estimatedResumeAtMillis ?? null,
    };
};

const mergeRobotStateBatch = (previousRobots, incomingByRobotId) => {
    if (incomingByRobotId.size === 0) {
        return previousRobots;
    }

    const knownRobotIds = new Set(
        previousRobots.map((robot) => robot.robot_id)
    );
    let changed = false;

    const merged = previousRobots.map((robot) => {
        const incoming = incomingByRobotId.get(robot.robot_id);

        if (!incoming) {
            return robot;
        }

        const previousTime = Number(robot.simulation_time_ms);
        const incomingTime = Number(incoming.simulation_time_ms);
        if (
            Number.isFinite(previousTime)
            && Number.isFinite(incomingTime)
            && incomingTime < previousTime
        ) {
            return robot;
        }

        changed = true;
        return { ...robot, ...incoming };
    });

    const added = [];
    incomingByRobotId.forEach((incoming, robotId) => {
        if (!knownRobotIds.has(robotId)) {
            added.push(incoming);
        }
    });

    if (!changed && added.length === 0) {
        return previousRobots;
    }

    return added.length === 0 ? merged : [...merged, ...added];
};

function Simulation() {
    const navigate = useNavigate();

    /* =========================================================
       상단 헤더 - 시뮬레이션 실행
    ========================================================= */

    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouseId, setSelectedWarehouseIdState] = useState(() => {
        const saved = localStorage.getItem(WAREHOUSE_ID_KEY);
        return saved ? Number(saved) : DEFAULT_WAREHOUSE_ID;
    });

    const setSelectedWarehouseId = (warehouseId) => {
        localStorage.setItem(WAREHOUSE_ID_KEY, String(warehouseId));
        setSelectedWarehouseIdState(warehouseId);
    };

    const [scenarios, setScenarios] = useState([]);
    const [selectedScenarioId, setSelectedScenarioIdState] = useState(() => {
        const saved = localStorage.getItem(SCENARIO_ID_KEY);
        return saved ? Number(saved) : null;
    });

    const setSelectedScenarioId = (scenarioId) => {
        if (scenarioId) {
            localStorage.setItem(SCENARIO_ID_KEY, String(scenarioId));
        } else {
            localStorage.removeItem(SCENARIO_ID_KEY);
        }
        setSelectedScenarioIdState(scenarioId);
    };

    const [simulationSpeed, setSimulationSpeed] = useState(1);
    const [simulationStatus, setSimulationStatus] = useState("대기");
    const [simulationTime, setSimulationTime] = useState(0);
    const [isInjectingLowBattery, setIsInjectingLowBattery] = useState(false);
    const [hasActiveAiPlan, setHasActiveAiPlan] = useState(false);

    const [commandExpressionMix, setCommandExpressionMixState] = useState(
        loadCommandExpressionMix
    );

    const setCommandExpressionMix = (mix) => {
        const replanIntervalMinutes = Number(mix?.replanIntervalMinutes);
        const averageTasksPerRobot = Number(mix?.averageTasksPerRobot);
        const normalized = {
            policyEnabled: mix?.policyEnabled === true,
            naturalLanguageEnabled: mix?.naturalLanguageEnabled === true,
            replanIntervalMinutes: [3, 5, 10].includes(replanIntervalMinutes)
                ? replanIntervalMinutes
                : commandExpressionMix.replanIntervalMinutes,
            averageTasksPerRobot:
                averageTasksPerRobot >= 1 && averageTasksPerRobot <= 5
                    ? averageTasksPerRobot
                    : commandExpressionMix.averageTasksPerRobot,
        };
        localStorage.setItem(COMMAND_EXPRESSION_MIX_KEY, JSON.stringify(normalized));
        setCommandExpressionMixState(normalized);
    };

    // 새로고침해도 같은 실행을 이어서 쓰도록 localStorage 에 보관한다.
    // (새 실행이 생기면 그 실행에 등록해둔 작업들이 누락되기 때문)
    const [simulationRunId, setSimulationRunIdState] = useState(() => {
        const saved = localStorage.getItem(RUN_ID_KEY);
        return saved ? Number(saved) : null;
    });
    const [simulationExecutionVersion, setSimulationExecutionVersion] = useState(null);

    const setSimulationRunId = (runId) => {
        setHasActiveAiPlan(false);

        if (runId) {
            localStorage.setItem(RUN_ID_KEY, String(runId));
        } else {
            localStorage.removeItem(RUN_ID_KEY);
            setSimulationExecutionVersion(null);
        }

        setSimulationRunIdState(runId);

        // 같은 탭의 Sidebar에도 실행 ID 변경을 알린다.
        window.dispatchEvent(
            new CustomEvent("simulation-run-change", {
                detail: { runId: runId ?? null },
            })
        );
    };

    const [taskList, setTaskList] = useState([]);
    const [eventList, setEventList] = useState([]);
    const [generatedCommands, setGeneratedCommands] = useState([]);

    /* =========================================================
       화면 패널 리사이즈
    ========================================================= */

    const workspaceRef = useRef(null);
    const mainLayoutRef = useRef(null);
    const listLayoutRef = useRef(null);
    const activeResizeRef = useRef(null);

    const [panelWidth, setPanelWidth] = useState(400);
    const [viewMinWidth, setViewMinWidth] = useState(MIN_VIEW_WIDTH);
    const [mainHeight, setMainHeight] = useState(700);
    const [listWidths, setListWidths] = useState({
        task: null,
        robot: null,
        event: null,
    });

    // 드래그 중 텍스트 선택을 막고 포인터 이동량만 레이아웃 상태에 반영한다.
    useEffect(() => {
        const handlePointerMove = (event) => {
            const resize = activeResizeRef.current;

            if (!resize) {
                return;
            }

            if (resize.type === "panel") {
                // pointer 좌표는 화면 px이므로 responsive frame의 scale을 제거해 CSS px로 환산한다.
                const deltaX = (event.clientX - resize.startX) / resize.scaleX;
                const maxPanelWidth = Math.max(
                    MIN_PANEL_WIDTH,
                    resize.containerWidth - resize.minViewWidth - RESIZE_HANDLE_SIZE
                );

                setPanelWidth(
                    clamp(
                        resize.startPanelWidth - deltaX,
                        MIN_PANEL_WIDTH,
                        maxPanelWidth
                    )
                );
                return;
            }

            if (resize.type === "main-height") {
                const deltaY = (event.clientY - resize.startY) / resize.scaleY;
                const maxMainHeight = Math.max(
                    MIN_MAIN_HEIGHT,
                    resize.workspaceHeight - MIN_LIST_HEIGHT - RESIZE_HANDLE_SIZE
                );

                setMainHeight(
                    clamp(
                        resize.startMainHeight + deltaY,
                        MIN_MAIN_HEIGHT,
                        maxMainHeight
                    )
                );
                return;
            }

            const deltaX = (event.clientX - resize.startX) / resize.scaleX;

            if (resize.type === "task-robot") {
                const task = clamp(
                    resize.startTaskWidth + deltaX,
                    MIN_LIST_WIDTH,
                    resize.pairWidth - MIN_LIST_WIDTH
                );

                const robot = resize.pairWidth - task;
                const totalWidth = resize.pairWidth + resize.eventWidth;

                setListWidths({
                    task: task / totalWidth,
                    robot: robot / totalWidth,
                    event: resize.eventWidth / totalWidth,
                });
                return;
            }

            if (resize.type === "robot-event") {
                const robot = clamp(
                    resize.startRobotWidth + deltaX,
                    MIN_LIST_WIDTH,
                    resize.pairWidth - MIN_LIST_WIDTH
                );

                const eventWidth = resize.pairWidth - robot;
                const totalWidth = resize.taskWidth + resize.pairWidth;

                setListWidths({
                    task: resize.taskWidth / totalWidth,
                    robot: robot / totalWidth,
                    event: eventWidth / totalWidth,
                });
            }
        };

        const handlePointerUp = () => {
            if (!activeResizeRef.current) {
                return;
            }

            activeResizeRef.current = null;
            document.body.classList.remove("simulation-is-resizing");
            document.body.style.removeProperty("cursor");
        };

        // 창 크기가 바뀌어도 최소 폭/높이 범위를 벗어나지 않도록 현재 크기를 보정한다.
        const handleWindowResize = () => {
            if (window.innerWidth <= 1180) {
                return;
            }

            if (mainLayoutRef.current) {
                const minViewWidth = getControlbarMinWidth(mainLayoutRef.current);
                setViewMinWidth(minViewWidth);

                const maxPanelWidth = Math.max(
                    MIN_PANEL_WIDTH,
                    mainLayoutRef.current.clientWidth
                        - minViewWidth
                        - RESIZE_HANDLE_SIZE
                );

                setPanelWidth((current) =>
                    clamp(current, MIN_PANEL_WIDTH, maxPanelWidth)
                );
            }

            if (workspaceRef.current) {
                const maxMainHeight = Math.max(
                    MIN_MAIN_HEIGHT,
                    workspaceRef.current.clientHeight
                        - MIN_LIST_HEIGHT
                        - RESIZE_HANDLE_SIZE
                );

                setMainHeight((current) =>
                    clamp(current, MIN_MAIN_HEIGHT, maxMainHeight)
                );
            }
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        window.addEventListener("resize", handleWindowResize);

        const resizeFrame = window.requestAnimationFrame(handleWindowResize);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
            window.removeEventListener("resize", handleWindowResize);
            window.cancelAnimationFrame(resizeFrame);
            document.body.classList.remove("simulation-is-resizing");
            document.body.style.removeProperty("cursor");
        };
    }, []);

    const startPanelResize = (event) => {
        if (!mainLayoutRef.current) {
            return;
        }

        const panel = mainLayoutRef.current.querySelector(".simulation-panel");

        if (!panel) {
            return;
        }

        const layoutRect = mainLayoutRef.current.getBoundingClientRect();
        const layoutWidth = mainLayoutRef.current.offsetWidth;
        const scaleX = layoutWidth > 0 ? layoutRect.width / layoutWidth : 1;
        const minViewWidth = getControlbarMinWidth(mainLayoutRef.current);

        // JS clamp뿐 아니라 Grid 자체에도 같은 최소 폭을 적용한다.
        // 드래그 상태가 빠르게 갱신돼도 제어바 아래로 패널이 침범하지 않는다.
        setViewMinWidth(minViewWidth);

        activeResizeRef.current = {
            type: "panel",
            startX: event.clientX,
            startPanelWidth: panel.offsetWidth,
            containerWidth: mainLayoutRef.current.clientWidth,
            minViewWidth,
            scaleX: scaleX > 0 ? scaleX : 1,
        };

        document.body.classList.add("simulation-is-resizing");
        document.body.style.cursor = "col-resize";
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const startMainHeightResize = (event) => {
        if (!workspaceRef.current || !mainLayoutRef.current) {
            return;
        }

        const workspaceRect = workspaceRef.current.getBoundingClientRect();
        const workspaceHeight = workspaceRef.current.offsetHeight;
        const scaleY = workspaceHeight > 0
            ? workspaceRect.height / workspaceHeight
            : 1;

        activeResizeRef.current = {
            type: "main-height",
            startY: event.clientY,
            startMainHeight: mainLayoutRef.current.offsetHeight,
            workspaceHeight: workspaceRef.current.clientHeight,
            scaleY: scaleY > 0 ? scaleY : 1,
        };

        document.body.classList.add("simulation-is-resizing");
        document.body.style.cursor = "row-resize";
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const startListResize = (type, event) => {
        if (!listLayoutRef.current) {
            return;
        }

        const task = listLayoutRef.current.querySelector(".simulation-task-list");
        const robot = listLayoutRef.current.querySelector(".simulation-robot-list");
        const eventListElement = listLayoutRef.current.querySelector(".simulation-event-list");

        if (!task || !robot || !eventListElement) {
            return;
        }

        const layoutRect = listLayoutRef.current.getBoundingClientRect();
        const layoutWidth = listLayoutRef.current.offsetWidth;
        const scaleX = layoutWidth > 0 ? layoutRect.width / layoutWidth : 1;

        const taskWidth = task.offsetWidth;
        const robotWidth = robot.offsetWidth;
        const eventWidth = eventListElement.offsetWidth;

        activeResizeRef.current = type === "task-robot"
            ? {
                type,
                startX: event.clientX,
                startTaskWidth: taskWidth,
                pairWidth: taskWidth + robotWidth,
                eventWidth,
                scaleX: scaleX > 0 ? scaleX : 1,
            }
            : {
                type,
                startX: event.clientX,
                startRobotWidth: robotWidth,
                pairWidth: robotWidth + eventWidth,
                taskWidth,
                scaleX: scaleX > 0 ? scaleX : 1,
            };

        document.body.classList.add("simulation-is-resizing");
        document.body.style.cursor = "col-resize";
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    useEffect(() => {
        setGeneratedCommands([]);
    }, [simulationRunId, selectedWarehouseId]);

    /* =========================================================
       백엔드 초기 데이터 로딩
    ========================================================= */

    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const list = await warehouseApi.getAll();

                if (!Array.isArray(list) || list.length === 0) {
                    return;
                }

                setWarehouses(list);

                const exists = list.some(
                    (warehouse) => warehouse.id === selectedWarehouseId
                );

                if (!exists) {
                    setSelectedWarehouseId(list[0].id);
                }
            } catch (error) {
                console.warn("창고 목록 조회 실패", error.message);
            }
        };

        loadWarehouses();
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadScenarios = async () => {
            if (!selectedWarehouseId) {
                setScenarios([]);
                return;
            }

            try {
                const list = await scenarioApi.getAll(selectedWarehouseId);

                if (cancelled) return;

                const items = (Array.isArray(list) ? list : []).filter(
                    (scenario) =>
                        Number(scenario.warehouseId) === Number(selectedWarehouseId)
                );
                setScenarios(items);

                setSelectedScenarioIdState((current) => {
                    const exists = items.some(
                        (scenario) => scenario.id === current
                    );

                    if (exists) return current;

                    const next = items[0]?.id ?? null;

                    if (next) {
                        localStorage.setItem(SCENARIO_ID_KEY, String(next));
                    } else {
                        localStorage.removeItem(SCENARIO_ID_KEY);
                    }

                    return next;
                });
            } catch (error) {
                if (cancelled) return;
                console.warn("시나리오 목록 조회 실패", error.message);
                setScenarios([]);
            }
        };

        loadScenarios();

        return () => {
            cancelled = true;
        };
    }, [selectedWarehouseId]);

    const handleScenarioChange = (event) => {
        const value = event.target.value;
        const scenarioId = value ? Number(value) : null;

        setSelectedScenarioId(scenarioId);

        const scenario = scenarios.find((item) => item.id === scenarioId);

        if (scenario?.simulationSpeed) {
            setSimulationSpeed(Number(scenario.simulationSpeed));
        }
    };

    useEffect(() => {
        if (simulationRunId) {
            return;
        }

        loadRestingRobots(selectedWarehouseId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedWarehouseId]);

    const formatSimulationTime = (totalSeconds) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map((value) => String(value).padStart(2, "0"))
            .join(":");
    };

    const handleWarehouseChange = (warehouseId) => {
        const nextId = Number(warehouseId);

        if (nextId === selectedWarehouseId) {
            return;
        }

        if (simulationRunId) {
            const confirmed = window.confirm(
                "창고를 바꾸면 진행 중인 시뮬레이션이 해제됩니다.\n계속할까요?"
            );

            if (!confirmed) {
                return;
            }
        }

        setSimulationRunId(null);
        setSimulationStatus("대기");
        setSimulationTime(0);
        setTaskList([]);
        setEventList([]);
        setScenarios([]);
        setSelectedScenarioId(null);
        setSelectedWarehouseId(nextId);
        loadRestingRobots(nextId);
    };

    const fetchRegisteredRobots = async (warehouseId) => {
        const [registeredRobotList, layout] = await Promise.all([
            robotApi.getAll(warehouseId),
            warehouseApi.getLayout(warehouseId),
        ]);

        const nodeCodeById = new Map(
            (layout.nodes ?? []).map((node) => [node.id, node.nodeCode])
        );

        return (registeredRobotList ?? [])
            .map((robot) => ({
                robot_id: robot.id,
                robot_code: `R${robot.id}`,
                node_id: nodeCodeById.get(robot.nodeId),
                battery: robot.battery,
                status: "IDLE",
            }))
            .filter((robot) => robot.node_id);
    };

    const loadRestingRobots = async (warehouseId) => {
        if (!warehouseId) {
            return;
        }

        try {
            setRobotList(await fetchRegisteredRobots(warehouseId));
        } catch (error) {
            console.warn("로봇 초기 배치 조회 실패", error.message);
            setRobotList([]);
        }
    };

    /**
     * 실행 스냅샷에 없는 로봇을 목록에 채워 넣는다.
     *
     * 실행이 만들어진 뒤에 창고에 로봇을 추가하면 그 실행의 Redis 스냅샷에는
     * 새 로봇이 없어 목록에서 빠진다. 등록된 로봇을 함께 읽어
     * 스냅샷에 없는 로봇만 대기 상태로 덧붙인다.
     */
    const mergeRegisteredRobots = async (warehouseId, snapshotRobots) => {
        if (!warehouseId) {
            return;
        }

        try {
            const registered = await fetchRegisteredRobots(warehouseId);
            const knownIds = new Set(
                (snapshotRobots ?? []).map((robot) => robot.robotId)
            );
            const missing = registered.filter(
                (robot) => !knownIds.has(robot.robot_id)
            );

            if (missing.length === 0) {
                return;
            }

            setRobotList((previous) => [...previous, ...missing]);
        } catch (error) {
            console.warn("등록 로봇 병합 실패", error.message);
        }
    };

    const handleSpeedChange = async (speed) => {
        setSimulationSpeed(speed);

        if (!simulationRunId) {
            return;
        }

        try {
            await simulationRunApi.changeSpeed(simulationRunId, speed);
        } catch (error) {
            console.error("배속 변경 실패:", error);
            alert(error.message ?? "배속을 변경하지 못했습니다.");
        }
    };

    /* =========================================================
       시뮬레이션 제어
    ========================================================= */

    const reloadTasks = async (runId) => {
        try {
            const runTasks = await simulationRunApi.getTasks(runId);
            setTaskList(Array.isArray(runTasks) ? runTasks : []);
        } catch (error) {
            console.warn("작업 목록 조회 실패", error.message);
            setTaskList([]);
        }
    };

    // 재진입 시 현재 위치를 즉시 배치해 충전소에서 튀는 애니메이션을 막는다.
    const restoreRuntime = async (runId) => {
        try {
            const snapshot = await simulationRunApi.getRobotStates(runId);
            if (typeof snapshot?.executionVersion === "number") {
                setSimulationExecutionVersion(snapshot.executionVersion);
            }

            // BE 재시작 시 메모리 기반 AI 시간표를 복구할 수 없으므로 백엔드는
            // 남아 있던 실행을 STOPPED로 정리한다. 브라우저 localStorage에 그 ID가
            // 남아 있어도 중간 Redis 위치를 기본 위치처럼 다시 그리지 않는다.
            if (snapshot?.status === "STOPPED") {
                setSimulationRunId(null);
                setSimulationStatus("대기");
                setSimulationTime(0);
                setTaskList([]);
                await loadRestingRobots(selectedWarehouseId);
                return;
            }

            if (snapshot?.robots?.length) {
                setRobotList(snapshot.robots.map(toRobotView));
                await mergeRegisteredRobots(
                    selectedWarehouseId,
                    snapshot.robots
                );
            } else {
                await loadRestingRobots(selectedWarehouseId);
            }

            if (snapshot?.status) {
                setSimulationStatus(
                    STATUS_LABEL[snapshot.status] ?? snapshot.status
                );
            }

            // 백엔드 시뮬 시각으로 실행 시간을 맞춘다 (0초부터 다시 세지 않도록)
            if (typeof snapshot?.elapsedMillis === "number") {
                setSimulationTime(Math.floor(snapshot.elapsedMillis / 1000));
            }
        } catch (error) {
            console.warn("시뮬레이션 상태 복구 실패", error.message);
        }
    };

    useEffect(() => {
        if (simulationRunId) {
            reloadTasks(simulationRunId);
            restoreRuntime(simulationRunId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [simulationRunId]);

    /**
     * 실행 컨테이너만 만든다. 입출고 명령은 시작 후 0분·5분·10분에
     * 백엔드 command cycle이 재고를 읽어 자동 생성한다.
     */
    const buildCreatePayload = ({
        warehouseId = selectedWarehouseId,
        scenarioId = selectedScenarioId,
    } = {}) => {
        return {
            warehouseId,
            simulationSpeed: Number(simulationSpeed),
            scenarioId: scenarioId ?? null,
        };
    };

    const getCopiedWarehouseId = (copyResponse) => {
        const warehouseId =
            copyResponse?.warehouseId
            ?? copyResponse?.personalWarehouseId
            ?? copyResponse?.id
            ?? copyResponse;
        const numericWarehouseId = Number(warehouseId);

        if (!Number.isFinite(numericWarehouseId)) {
            throw new Error(
                "개인 창고 복제 응답에서 warehouseId를 확인할 수 없습니다."
            );
        }

        return numericWarehouseId;
    };

    /**
     * 공유 템플릿은 직접 실행할 수 없으므로 로그인 유형에 맞는 개인 복사본으로
     * 전환한다. 템플릿에서 선택한 시나리오는 복사본의 scenarioCode/name과
     * 다시 매칭해 동일한 실행 설정을 유지한다.
     */
    const resolveSimulationTarget = async () => {
        let warehouse = warehouses.find(
            (item) => Number(item.id) === Number(selectedWarehouseId)
        );

        if (!warehouse) {
            warehouse = await warehouseApi.get(selectedWarehouseId);
        }

        let warehouseId = Number(warehouse.id ?? selectedWarehouseId);
        let copied = false;
        const selectedScenario = scenarios.find(
            (scenario) => Number(scenario.id) === Number(selectedScenarioId)
        );

        if (warehouse.shared === true) {
            copied = true;
            const copyResponse = isGuestSession()
                ? await warehouseApi.createGuestPersonalCopy(warehouseId)
                : await warehouseApi.createPersonalCopy(warehouseId);

            warehouseId = getCopiedWarehouseId(copyResponse);

            const copiedWarehouseResponse = await warehouseApi.get(warehouseId);
            const copiedWarehouse = {
                ...copiedWarehouseResponse,
                id: warehouseId,
                shared: false,
            };

            setWarehouses((currentWarehouses) => [
                copiedWarehouse,
                ...currentWarehouses.filter(
                    (item) => Number(item.id) !== warehouseId
                ),
            ]);
            setSelectedWarehouseId(warehouseId);
            setSimulationRunId(null);
        }

        const copiedScenariosResponse = await scenarioApi.getAll(warehouseId);
        const copiedScenarios = Array.isArray(copiedScenariosResponse)
            ? copiedScenariosResponse
            : [];

        if (copiedScenarios.length === 0) {
            throw new Error("선택한 창고에 실행 가능한 시나리오가 없습니다.");
        }

        const matchedScenario = copiedScenarios.find(
            (scenario) =>
                selectedScenario?.scenarioCode
                && scenario.scenarioCode === selectedScenario.scenarioCode
        ) ?? copiedScenarios.find(
            (scenario) =>
                selectedScenario?.scenarioName
                && scenario.scenarioName === selectedScenario.scenarioName
        ) ?? copiedScenarios.find(
            (scenario) => Number(scenario.id) === Number(selectedScenarioId)
        ) ?? copiedScenarios[0];

        const scenarioId = Number(matchedScenario.id ?? matchedScenario.scenarioId);

        if (!Number.isFinite(scenarioId)) {
            throw new Error(
                "개인 창고의 시나리오 응답에서 scenarioId를 확인할 수 없습니다."
            );
        }

        setScenarios(copiedScenarios);
        setSelectedScenarioId(scenarioId);

        return { warehouseId, scenarioId, copied };
    };

    const validateSettings = () => {
        return Boolean(selectedWarehouseId);
    };

    const handleNewRun = async () => {
        if (!validateSettings()) {
            return;
        }

        const confirmed = window.confirm(
            "현재 작업을 버리고 새 시뮬레이션을 만듭니다.\n계속할까요?"
        );

        if (!confirmed) {
            return;
        }

        try {
            const simulationTarget = await resolveSimulationTarget();

            // 이 창고에서 돌고 있는 시뮬레이션을 모두 중지한다.
            // (다른 탭이나 이전 세션에서 실행 중인 것까지 정리해야
            //  새 실행을 시작할 수 있다 - 창고당 1개만 활성 가능)
            try {
                await simulationRunApi.stopActive(simulationTarget.warehouseId);
            } catch (error) {
                console.warn("기존 시뮬레이션 중지 실패", error.message);
            }

            isPausedRef.current = false;
            setSimulationRunId(null);
            setTaskList([]);
            setEventList([]);
            setSimulationTime(0);
            setSimulationStatus("대기");
            await loadRestingRobots(simulationTarget.warehouseId);

            const payload = buildCreatePayload(simulationTarget);
            console.log("새 시뮬레이션 생성 요청:", payload);

            const created = await simulationRunApi.create(payload);
            const runId = created.simulationRunId;

            setSimulationRunId(runId);
            setSimulationExecutionVersion(created.executionVersion ?? null);
            await reloadTasks(runId);

            console.log(
                `%c새 시뮬레이션 생성 완료 - 실행 ID = ${runId}`,
                "font-size:14px;font-weight:bold;color:#16a34a"
            );
        } catch (error) {
            console.error("새 시뮬레이션 생성 실패:", error);
            alert(error.message ?? "새 시뮬레이션을 만들지 못했습니다.");
        }
    };

    /**
     * 저장된 실행 ID 를 "시작 가능한 상태"로 정리해서 돌려준다.
     *
     * - 대기(CREATED)        그대로 사용
     * - 완료/실패            이전 실행을 정리하고 새 실행 생성
     * - 중지                 버리고 새로 만들도록 null
     * - 실행 중/일시정지      화면 상태만 맞추고 "ALREADY_RUNNING"
     *
     * localStorage 에 어제 실행이 남아 있어도 에러 없이 이어갈 수 있게 한다.
     */
    const resolveStartableRunId = async () => {
        if (!simulationRunId) {
            return null;
        }

        let current;

        try {
            current = await simulationRunApi.getStatus(simulationRunId);
            setSimulationExecutionVersion(current.executionVersion ?? null);
        } catch (error) {
            // 실행이 삭제됐거나 조회 실패 - 새로 만든다
            console.warn("기존 시뮬레이션 조회 실패 - 새로 만듭니다.", error.message);
            setSimulationRunId(null);
            return null;
        }

        switch (current.status) {
            case "CREATED":
                return simulationRunId;

            case "COMPLETED":
            case "FAILED":
                console.log("이전 실행이 종료돼 있어 정리 후 새 실행을 만듭니다.");
                await simulationRunApi.reset(simulationRunId);
                setSimulationRunId(null);
                return null;

            case "RUNNING":
                setSimulationStatus("실행");
                isPausedRef.current = false;
                return "ALREADY_RUNNING";

            case "PAUSED":
                await handleResume();
                return "ALREADY_RUNNING";

            case "QUIESCING":
            case "REPLANNING":
            case "PENDING_ACTIVATION":
                setSimulationStatus(STATUS_LABEL[current.status]);
                isPausedRef.current = false;
                return "ALREADY_RUNNING";

            default:
                // STOPPED 등 - 사용자가 끝낸 실행이므로 새로 만든다
                setSimulationRunId(null);
                setTaskList([]);
                return null;
        }
    };

    const handleStart = async () => {
        if (simulationStatus === "일시정지") {
            await handleResume();
            return;
        }

        if (!validateSettings()) {
            return;
        }

        try {
            const simulationTarget = await resolveSimulationTarget();
            const createPayload = buildCreatePayload(simulationTarget);

            if (simulationTarget.copied) {
                await loadRestingRobots(simulationTarget.warehouseId);
            }

            // 시작 가능한 실행이 있으면 재사용하고, 초기화·종료된 실행이면 새로 만든다.
            //
            // 다만 저장된 실행이 이미 끝났거나 중지된 상태일 수 있으므로
            // (예: 어제 실행을 localStorage 가 기억하고 있는 경우)
            // 상태를 확인해서 시작 가능한 형태로 맞춘다.
            let runId = simulationTarget.copied
                ? null
                : await resolveStartableRunId();

            if (runId === "ALREADY_RUNNING") {
                return;
            }

            if (runId) {
                console.log(`기존 시뮬레이션 재사용: runId=${runId}`);
            } else {
                console.log("시뮬레이션 생성 요청:", createPayload);
                const created = await simulationRunApi.create(createPayload);
                runId = created.simulationRunId;
                setSimulationExecutionVersion(created.executionVersion ?? null);
            }

            // 시작 직후 실행되는 0분 명령부터 화면에서 고른 표현 방식을 사용한다.
            await fulfillmentCommandApi.configureCycle(
                runId,
                commandExpressionMix
            );
            const started = await simulationRunApi.start(runId);

            setSimulationRunId(runId);
            setSimulationExecutionVersion(started.executionVersion ?? null);
            setSimulationStatus(STATUS_LABEL[started.status] ?? "실행");
            isPausedRef.current = false;

            console.log(
                `%c시뮬레이션 실행 ID = ${runId}`,
                "font-size:14px;font-weight:bold;color:#2563eb"
            );

            const snapshot = await simulationRunApi.getRobotStates(runId);

            if (snapshot?.robots?.length) {
                setRobotList(snapshot.robots.map(toRobotView));
                await mergeRegisteredRobots(
                    simulationTarget.warehouseId,
                    snapshot.robots
                );
            }

            // 이 실행의 작업 목록으로 교체한다.
            // (이전 실행의 작업이나 목업 데이터가 남지 않도록)
            await reloadTasks(runId);
        } catch (error) {
            console.error("시뮬레이션 시작 실패:", error);
            alert(error.message ?? "시뮬레이션을 시작하지 못했습니다.");
        }
    };

    const handlePause = async () => {
        if (simulationStatus !== "실행") {
            return;
        }

        if (!simulationRunId) {
            isPausedRef.current = true;
            setSimulationStatus("일시정지");
            return;
        }

        try {
            const paused = await simulationRunApi.pause(simulationRunId);

            isPausedRef.current = true;
            setSimulationStatus(STATUS_LABEL[paused.status] ?? "일시정지");
        } catch (error) {
            console.error("시뮬레이션 일시정지 실패:", error);
            alert(error.message ?? "일시정지에 실패했습니다.");
        }
    };

    const handleResume = async () => {
        if (!simulationRunId) {
            isPausedRef.current = false;
            setSimulationStatus("실행");
            return;
        }

        try {
            const resumed = await simulationRunApi.resume(simulationRunId);

            isPausedRef.current = false;
            setSimulationStatus(STATUS_LABEL[resumed.status] ?? "실행");
        } catch (error) {
            console.error("시뮬레이션 재개 실패:", error);
            alert(error.message ?? "시뮬레이션을 재개하지 못했습니다.");
        }
    };

    const handleReset = async () => {
        isPausedRef.current = false;

        if (simulationRunId) {
            try {
                await simulationRunApi.reset(simulationRunId);
                setSimulationRunId(null);
            } catch (error) {
                console.error("시뮬레이션 초기화 실패:", error);
            }
        }

        // 재고는 현재 수량을 유지하고 이전 실행의 입·출고 작업 및 화면 표시만 정리한다.
        // 다음 시작에서는 현재 재고를 기준으로 새 명령 배치를 만든다.
        setTaskList([]);
        setGeneratedCommands([]);
        setEventList([]);

        await loadRestingRobots(selectedWarehouseId);

        // 다음 시작은 새 실행 ID로 현재 재고 기준 명령을 생성한다.
        setSimulationStatus("대기");
        setSimulationTime(0);
    };

    // 작업 중 AI 로봇 한 대의 playback 배터리를 시나리오 충전 기준까지 낮춘다.
    // 백엔드가 현재 단계를 끝낸 안전 노드에서 LOW_BATTERY 재계획을 시작한다.
    const handleLowBatteryEvent = async () => {
        if (!simulationRunId || simulationStatus !== "실행") {
            alert("실행 중인 AI 시뮬레이션에서만 배터리 부족 이벤트를 발생시킬 수 있습니다.");
            return;
        }

        try {
            setIsInjectingLowBattery(true);
            const injected = await simulationRunApi.injectLowBattery(
                simulationRunId
            );

            setEventList((previousEvents) => [
                {
                    id: `low-battery-${simulationRunId}-${injected.robotId}-${Date.now()}`,
                    eventType: "LOW_BATTERY",
                    level: "WARNING",
                    description:
                        `R${injected.robotId} 배터리 ${injected.previousBatteryLevel}% → `
                        + `${injected.batteryLevel}%. 현재 단계를 마친 안전 노드에서 재계획합니다.`,
                    robotId: injected.robotId,
                    taskId: injected.currentTaskId,
                    simulationTimeMillis: injected.simulationClockMillis,
                    occurredAt: new Date().toISOString(),
                    status: "PENDING",
                    source: MANUAL_LOW_BATTERY_EVENT_SOURCE,
                    chargingThreshold: injected.batteryLevel,
                },
                ...previousEvents,
            ]);
        } catch (error) {
            console.error("배터리 부족 이벤트 발생 실패:", error);
            alert(error.message ?? "배터리 부족 이벤트를 발생시키지 못했습니다.");
        } finally {
            setIsInjectingLowBattery(false);
        }
    };

    const handleStop = async () => {
        if (!simulationRunId) {
            return;
        }

        const confirmed = window.confirm(
            "시뮬레이션을 중지합니다.\n" +
            "중지한 실행은 다시 시작할 수 없고, 새 작업을 만들어야 합니다.\n\n" +
            "계속할까요?"
        );

        if (!confirmed) {
            return;
        }

        try {
            await simulationRunApi.stop(simulationRunId);
        } catch (error) {
            console.error("시뮬레이션 중지 실패:", error);
            // 이미 종료된 실행일 수 있으므로 화면 정리는 계속 진행한다
        }

        isPausedRef.current = false;

        // 실행 ID 를 버려야 다음에 새 실행이 만들어진다.
        // (localStorage 에서도 제거된다)
        setSimulationRunId(null);

        setTaskList([]);
        setEventList([]);
        setSimulationTime(0);
        setSimulationStatus("중지");
        loadRestingRobots(selectedWarehouseId);

        console.log("시뮬레이션 중지 완료 - 새 작업을 생성해주세요.");
    };

    /* =========================================================
       로봇 / 실시간 구독
    ========================================================= */

    const [robotList, setRobotList] = useState([]);
    const hasWorkingRobot = robotList.some((robot) => {
        const taskId = robot.current_task_id
            ?? robot.currentTaskId
            ?? robot.task_id
            ?? robot.taskId;
        const status = String(robot.activity ?? robot.status ?? "").toUpperCase();

        return taskId !== null
            && taskId !== undefined
            && taskId !== ""
            && LOW_BATTERY_EVENT_ACTIVE_ROBOT_STATUSES.has(status);
    });
    const canInjectLowBattery = Boolean(
        simulationRunId
        && simulationStatus === "실행"
        && hasActiveAiPlan
        && hasWorkingRobot
        && !isInjectingLowBattery
    );
    const lowBatteryEventTitle = isInjectingLowBattery
        ? "배터리 부족 이벤트를 처리하고 있습니다."
        : !simulationRunId || simulationStatus !== "실행"
            ? "시뮬레이션 실행 중에 사용할 수 있습니다."
            : !hasActiveAiPlan
                ? "AI 실행 계획이 활성화되면 사용할 수 있습니다."
                : !hasWorkingRobot
                    ? "작업 중인 로봇이 있을 때 사용할 수 있습니다."
                    : "작업 중 로봇 한 대를 충전 기준까지 낮추고 안전 노드에서 재계획합니다.";
    const pendingRobotStatesRef = useRef(new Map());
    const robotUpdateFrameRef = useRef(null);
    const activeRobotRunIdRef = useRef(simulationRunId);
    activeRobotRunIdRef.current = simulationRunId;

    useEffect(() => {
        const pendingStates = pendingRobotStatesRef.current;
        pendingStates.clear();
        if (robotUpdateFrameRef.current !== null) {
            window.cancelAnimationFrame(robotUpdateFrameRef.current);
            robotUpdateFrameRef.current = null;
        }

        return () => {
            pendingStates.clear();
            if (robotUpdateFrameRef.current !== null) {
                window.cancelAnimationFrame(robotUpdateFrameRef.current);
                robotUpdateFrameRef.current = null;
            }
        };
    }, [simulationRunId]);

    // 제어바의 카운트/상태 문구가 바뀌어 필요한 폭이 달라지면 즉시 최소 폭을 다시 맞춘다.
    useEffect(() => {
        if (window.innerWidth <= 1180 || !mainLayoutRef.current) {
            return undefined;
        }

        const frame = window.requestAnimationFrame(() => {
            if (!mainLayoutRef.current) {
                return;
            }

            const minViewWidth = getControlbarMinWidth(mainLayoutRef.current);
            const maxPanelWidth = Math.max(
                MIN_PANEL_WIDTH,
                mainLayoutRef.current.clientWidth
                    - minViewWidth
                    - RESIZE_HANDLE_SIZE
            );

            setViewMinWidth(minViewWidth);
            setPanelWidth((current) =>
                clamp(current, MIN_PANEL_WIDTH, maxPanelWidth)
            );
        });

        return () => window.cancelAnimationFrame(frame);
    }, [generatedCommands.length, taskList.length, robotList.length]);

    const isPausedRef = useRef(false);
    const isSimulationRunning =
        simulationStatus === "실행"
        || simulationStatus === "재계획";

    const {
        avoidanceStates,
        avoidanceEvents,
    } = useRobotAvoidanceTracker(
        robotList,
        isSimulationRunning,
    );

    // 버튼으로 만든 로컬 이벤트는 DB Event ID가 없으므로 서버의 resolve API
    // 대상이 아니다. 해당 로봇이 실제 CHARGE 단계에 진입하거나 충전을 마치면
    // 화면 이벤트도 같은 시점에 해결 상태로 전환한다.
    useEffect(() => {
        if (robotList.length === 0) {
            return;
        }

        const robotById = new Map(
            robotList.map((robot) => [Number(robot.robot_id), robot])
        );

        setEventList((previousEvents) => {
            let changed = false;
            const resolvedAt = new Date().toISOString();
            const nextEvents = previousEvents.map((event) => {
                if (
                    event.status !== "PENDING"
                    || event.source !== MANUAL_LOW_BATTERY_EVENT_SOURCE
                ) {
                    return event;
                }

                const robot = robotById.get(Number(event.robotId));
                if (!isManualLowBatteryRecovered(event, robot)) {
                    return event;
                }

                changed = true;
                return {
                    ...event,
                    status: "RESOLVED",
                    resolvedAt,
                };
            });

            return changed ? nextEvents : previousEvents;
        });
    }, [robotList]);

    // 같은 tick에 연속으로 도착하는 로봇 상태를 한 프레임에 모아 반영한다.
    // 로봇별 메시지마다 창고 SVG 전체를 다시 렌더링하지 않도록 하기 위함이다.
    const applyRobotState = (state) => {
        const incoming = toRobotView(state);
        const pendingStates = pendingRobotStatesRef.current;
        const pendingPrevious = pendingStates.get(incoming.robot_id);
        const previousTime = Number(pendingPrevious?.simulation_time_ms);
        const incomingTime = Number(incoming.simulation_time_ms);

        if (
            pendingPrevious
            && Number.isFinite(previousTime)
            && Number.isFinite(incomingTime)
            && incomingTime < previousTime
        ) {
            return;
        }

        pendingStates.set(incoming.robot_id, incoming);

        if (robotUpdateFrameRef.current !== null) {
            return;
        }

        const batchRunId = simulationRunId;
        robotUpdateFrameRef.current = window.requestAnimationFrame(() => {
            robotUpdateFrameRef.current = null;

            if (activeRobotRunIdRef.current !== batchRunId) {
                pendingRobotStatesRef.current.clear();
                return;
            }

            const batch = new Map(pendingRobotStatesRef.current);
            pendingRobotStatesRef.current.clear();
            setRobotList((previousRobots) =>
                mergeRobotStateBatch(previousRobots, batch)
            );
        });
    };

    // 백엔드 TaskResponse 형태를 그대로 보관한다. (SimulationTaskList 가 같은 형태를 읽는다)
    const applyTask = (task) => {
        // /topic/tasks 는 모든 실행의 작업을 뿌리므로
        // 지금 보고 있는 실행의 작업만 화면에 반영한다.
        if (task.simulationRunId !== simulationRunId) {
            return;
        }

        setTaskList((prevTasks) => {
            const exists = prevTasks.some((item) => item.id === task.id);

            if (!exists) {
                return [task, ...prevTasks];
            }

            return prevTasks.map((item) =>
                item.id === task.id ? { ...item, ...task } : item
            );
        });
    };

    const applyEvent = (event) => {
        setEventList((prevEvents) => {
            const exists = prevEvents.some((item) => item.id === event.id);

            if (!exists) {
                return [event, ...prevEvents];
            }

            return prevEvents.map((item) =>
                item.id === event.id ? { ...item, ...event } : item
            );
        });
    };

    const subscriptions = simulationRunId
        ? {
            [TOPICS.runRobots(simulationRunId)]: applyRobotState,
            [TOPICS.TASKS]: applyTask,
            [TOPICS.EVENTS]: applyEvent,
            [TOPICS.SIMULATION_RUNS]: (run) => {
                if (run.simulationRunId !== simulationRunId) {
                    return;
                }
                if (
                    typeof simulationExecutionVersion === "number"
                    && typeof run.executionVersion === "number"
                    && run.executionVersion !== simulationExecutionVersion
                ) {
                    return;
                }

                setSimulationStatus(STATUS_LABEL[run.status] ?? run.status);

                // 완료되어도 실행 ID는 유지한다.
                // 초기화 후 다시 시작하면 0분 자동 명령 배치부터 새로 시작한다.
                // (STOPPED 는 사용자가 명시적으로 끝낸 것이므로 새 실행을 만든다)
                if (run.status === "STOPPED") {
                    setSimulationRunId(null);
                }
            },
        }
        : {};

    const { connected } = useStompSubscriptions(
        subscriptions,
        Boolean(simulationRunId)
    );

    return (
        <div className="simulation-wrapper">

            {/* 상단 헤더 */}
            <header className="simulation-header">
                <div className="simulation-topbar">
                    <div className="simulation-topbar-left">
                        <div className="simulation-topbar-title">
                            <h2>시뮬레이션 실행</h2>
                        </div>

                        {/* 시나리오 선택 */}
                        <div className="simulation-topbar-selector scenario">
                            <span className="simulation-topbar-label">시나리오 선택</span>
                            <select
                                value={selectedScenarioId ?? ""}
                                onChange={handleScenarioChange}
                                disabled={scenarios.length === 0}
                                aria-label="시나리오 선택"
                            >
                                {scenarios.length === 0 ? (
                                    <option value="">
                                        등록된 시나리오가 없습니다
                                    </option>
                                ) : (
                                    scenarios.map((scenario) => (
                                        <option
                                            key={scenario.id}
                                            value={scenario.id}
                                        >
                                            {scenario.scenarioName}
                                            {scenario.scenarioCode
                                                ? ` (${scenario.scenarioCode})`
                                                : ""}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* 창고 선택 */}
                        <div className="simulation-topbar-selector">
                            <span className="simulation-topbar-label">창고 선택</span>
                            <select
                                value={selectedWarehouseId}
                                onChange={(e) => handleWarehouseChange(e.target.value)}
                                disabled={warehouses.length === 0}
                                aria-label="창고 선택"
                            >
                                {warehouses.length === 0 ? (
                                    <option value={selectedWarehouseId}>
                                        불러오는 중...
                                    </option>
                                ) : (
                                    warehouses.map((warehouse) => (
                                        <option
                                            key={warehouse.id}
                                            value={warehouse.id}
                                        >
                                            {warehouse.name}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                    </div>

                    <div className="simulation-topbar-right">
                        {/* 시뮬레이션 시간 */}
                        <div className="simulation-topbar-metric">
                            <span>시뮬레이션 시간</span>
                            <strong>{formatSimulationTime(simulationTime)}</strong>
                        </div>

                        {/* 현재 시스템 상태 */}
                        <div className="simulation-topbar-metric">
                            <div className="simulation-topbar-status-header">
                                <span>시스템 상태</span>

                                {simulationRunId && (
                                    <small className="simulation-topbar-connection">
                                        {connected ? "실시간 연결" : "연결 대기"}
                                    </small>
                                )}
                            </div>

                            <strong className="simulation-topbar-status">
                                {simulationStatus}
                            </strong>
                        </div>

                        {/* 사용자 정보 */}
                        <div className="simulation-topbar-user">
                            <button
                                type="button"
                                className="simulation-topbar-user"
                                onClick={() => navigate("/profile")}
                                aria-label="내 프로필로 이동"
                            >
                                <span className="simulation-topbar-avatar">A</span>
                                <strong>admin</strong>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div
                ref={workspaceRef}
                className="simulation-workspace"
                style={{
                    "--simulation-main-height": `${mainHeight}px`,
                }}
            >
                {/* 창고 지도 / AI 패널 */}
                <div
                    ref={mainLayoutRef}
                    className="simulation-main-layout"
                    style={{
                        "--simulation-view-min-width": `${viewMinWidth}px`,
                        "--simulation-panel-width": `${panelWidth}px`,
                    }}
                >
                    <main className="simulation-view">
                        <div className="simulation-controlbar">
                            <div className="simulation-controlbar-title">
                                <strong>WAREHOUSE LIVE VIEW</strong>
                            </div>

                            <div className="simulation-controlbar-summary">
                                <span
                                    className={`simulation-plan-badge ${
                                        generatedCommands.length > 0 ? "active" : ""
                                    }`}
                                >
                                    AI PLAN {generatedCommands.length > 0 ? "ACTIVE" : "READY"}
                                </span>
                                <span>{taskList.length} TASKS</span>
                                <span>{robotList.length} ROBOTS</span>
                            </div>

                            <div className="simulation-controlbar-actions">
                                <select
                                    className="simulation-header-speed"
                                    value={simulationSpeed}
                                    onChange={(e) =>
                                        handleSpeedChange(Number(e.target.value))
                                    }
                                    aria-label="시뮬레이션 실행 속도"
                                >
                                    <option value={0.5}>0.5배</option>
                                    <option value={1}>1배</option>
                                    <option value={2}>2배</option>
                                    <option value={3}>3배</option>
                                </select>

                                <button
                                    type="button"
                                    className="simulation-header-button start"
                                    onClick={handleStart}
                                    title="현재 작업으로 시뮬레이션을 실행합니다"
                                >
                                    ▶ 시작
                                </button>
                                <button
                                    type="button"
                                    className="simulation-header-button"
                                    onClick={handlePause}
                                    title="현재 작업을 잠시 멈춥니다"
                                >
                                    Ⅱ 일시정지
                                </button>
                                <button
                                    type="button"
                                    className="simulation-header-button"
                                    onClick={handleReset}
                                    title="현재 작업을 처음부터 다시 실행합니다"
                                >
                                    ↻ 초기화
                                </button>
                                <button
                                    type="button"
                                    className="simulation-header-button low-battery"
                                    onClick={handleLowBatteryEvent}
                                    disabled={!canInjectLowBattery}
                                    title={lowBatteryEventTitle}
                                >
                                    {isInjectingLowBattery
                                        ? "처리 중…"
                                        : "⚡ 배터리 부족 발생"}
                                </button>
                                <button
                                    type="button"
                                    className="simulation-header-button new-run"
                                    onClick={handleNewRun}
                                    title="현재 작업을 버리고 지금 설정으로 새로운 작업을 생성합니다"
                                >
                                    새 작업
                                </button>
                                <button
                                    type="button"
                                    className="simulation-header-button stop"
                                    onClick={handleStop}
                                    disabled={!simulationRunId}
                                    title="이 실행을 완전히 종료합니다. 다시 시작하려면 새 작업을 만들어야 합니다."
                                >
                                    ■ 중지
                                </button>
                            </div>
                        </div>

                        <div className="simulation-view-content">
                            <WarehouseSVG
                                warehouseId={selectedWarehouseId}
                                robots={robotList}
                                tasks={taskList}
                                generatedCommands={generatedCommands}
                                avoidanceStates={avoidanceStates}
                                isRunning={isSimulationRunning}
                            />
                        </div>
                    </main>

                    <div
                        className="simulation-resize-handle simulation-resize-handle-vertical"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="창고 지도와 AI 패널 너비 조절"
                        onPointerDown={startPanelResize}
                    />

                    <SimulationPanel
                        simulationRunId={simulationRunId}
                        onSimulatedTimeChange={setSimulationTime}
                        commandExpressionMix={commandExpressionMix}
                        onCommandExpressionMixChange={setCommandExpressionMix}
                        onGeneratedCommandsChange={setGeneratedCommands}
                        onPlanActiveChange={setHasActiveAiPlan}
                    />
                </div>

                <div
                    className="simulation-resize-handle simulation-resize-handle-horizontal"
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="지도 영역과 목록 영역 높이 조절"
                    onPointerDown={startMainHeightResize}
                />

                {/* 작업 / 로봇 / 이벤트 목록 */}
                <div
                    ref={listLayoutRef}
                    className="simulation-list-layout"
                    style={{
                        "--simulation-task-list-width": listWidths.task
                            ? `${listWidths.task}fr`
                            : "1fr",
                        "--simulation-robot-list-width": listWidths.robot
                            ? `${listWidths.robot}fr`
                            : "1fr",
                        "--simulation-event-list-width": listWidths.event
                            ? `${listWidths.event}fr`
                            : "1fr",
                    }}
                >
                    <SimulationTaskList taskList={taskList} />

                    <div
                        className="simulation-resize-handle simulation-resize-handle-list"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="작업 목록과 로봇 목록 너비 조절"
                        onPointerDown={(event) =>
                            startListResize("task-robot", event)
                        }
                    />

                    <SimulationRobotList robotList={robotList} />

                    <div
                        className="simulation-resize-handle simulation-resize-handle-list"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="로봇 목록과 이벤트 목록 너비 조절"
                        onPointerDown={(event) =>
                            startListResize("robot-event", event)
                        }
                    />

                    <SimulationEventList
                        eventList={[
                            ...avoidanceEvents,
                            ...eventList,
                        ]}
                    />
                </div>
            </div>
        </div>
    );
}

export default Simulation;
