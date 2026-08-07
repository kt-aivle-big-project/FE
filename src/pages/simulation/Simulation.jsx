import { useEffect, useRef, useState } from "react";
import "../../styles/simulation/Simulation.css";

import WarehouseSVG from "../../components/warehouse/viewer/WarehouseSVG";
import SimulationPanel from "./SimulationPanel";
import SimulationTask from "./SimulationTask";
import SimulationEvent from "./SimulationEvent";
import useRobotAvoidanceTracker from "../../hooks/useRobotAvoidanceTracker";

import useStompSubscriptions from "../../hooks/useStompSubscriptions";
import { TOPICS } from "../../api/config";
import {
    simulationRunApi,
    optimizationApi,
    warehouseApi,
    scenarioApi,
    robotApi,
    fulfillmentCommandApi,
    scenarioApi,
} from "../../api/client";
import { isGuestSession } from "../../api/auth";


// 창고 목록을 못 불러왔을 때 쓸 기본 창고
const DEFAULT_WAREHOUSE_ID = 1;

// 선택한 창고를 새로고침 후에도 유지하기 위한 저장 키
const WAREHOUSE_ID_KEY = "selectedWarehouseId";

// 새로고침 후에도 실행 중인 시뮬레이션을 이어서 쓰기 위한 저장 키
const RUN_ID_KEY = "simulationRunId";

// 선택한 시나리오를 새로고침 후에도 유지하기 위한 저장 키
const SCENARIO_ID_KEY = "selectedScenarioId";

// 구조화 입력을 기본으로 두고 선택적으로 섞을 LLM 표현 비율 설정
const COMMAND_EXPRESSION_MIX_KEY = "simulationCommandExpressionMixV2";
const DEFAULT_COMMAND_EXPRESSION_MIX = {
    policyEnabled: false,
    naturalLanguageEnabled: false,
};

const loadCommandExpressionMix = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(COMMAND_EXPRESSION_MIX_KEY));
        return {
            policyEnabled: saved?.policyEnabled === true,
            naturalLanguageEnabled: saved?.naturalLanguageEnabled === true,
        };
    } catch {
        return DEFAULT_COMMAND_EXPRESSION_MIX;
    }
};

// 백엔드 SimulationRunStatus → 화면 표시 문구
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

// 백엔드 RobotStateResponse → 화면 로봇 객체
//
// BE가 보내는 현재 MOVE 구간과 절대 진행률을 화면 모델로 옮긴다.
// FE는 시간을 누적하지 않고 매 상태 메시지에서 이 값을 다시 기준점으로 삼는다.
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
        activity: state.activity ?? state.status,
        current_task_id: state.currentTaskId,
        task_type: state.taskType,
        service_kind: state.serviceKind,
        service_progress: state.serviceProgress,
        carrying_load: Boolean(state.carryingLoad),
        waiting_reason: state.waitingReason ?? null,
        waiting_node_code: state.waitingNodeCode ?? null,
        blocking_robot_id: state.blockingRobotId ?? null,
        wait_started_at_ms: state.waitStartedAtMillis ?? null,
        estimated_resume_at_ms: state.estimatedResumeAtMillis ?? null,
    };
};

function Simulation() {
    /* =========================================================
       상단 헤더 - 시뮬레이션 실행
    ========================================================= */

    // 창고 선택
    // 창고마다 지도·로봇·재고가 다르므로, 바꾸면 화면과 시뮬레이션 대상이 함께 바뀐다.
    const [warehouses, setWarehouses] = useState([]);
    const [selectedWarehouseId, setSelectedWarehouseIdState] = useState(() => {
        const saved = localStorage.getItem(WAREHOUSE_ID_KEY);
        return saved ? Number(saved) : DEFAULT_WAREHOUSE_ID;
    });

    const setSelectedWarehouseId = (warehouseId) => {
        localStorage.setItem(WAREHOUSE_ID_KEY, String(warehouseId));
        setSelectedWarehouseIdState(warehouseId);
    };

    // 시나리오 선택
    // 시나리오를 고르면 그 설정(배속 등)을 실행에 그대로 쓴다.
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
    const [commandExpressionMix, setCommandExpressionMixState] = useState(
        loadCommandExpressionMix
    );

    const setCommandExpressionMix = (mix) => {
        const normalized = {
            policyEnabled: mix?.policyEnabled === true,
            naturalLanguageEnabled: mix?.naturalLanguageEnabled === true,
        };
        localStorage.setItem(COMMAND_EXPRESSION_MIX_KEY, JSON.stringify(normalized));
        setCommandExpressionMixState(normalized);
    };

    // 실행 중인 시뮬레이션 ID
    // 새로고침해도 같은 실행을 이어서 쓰도록 localStorage 에 보관한다.
    // (새 실행이 생기면 그 실행에 등록해둔 작업들이 누락되기 때문)
    const [simulationRunId, setSimulationRunIdState] = useState(() => {
        const saved = localStorage.getItem(RUN_ID_KEY);
        return saved ? Number(saved) : null;
    });

    const setSimulationRunId = (runId) => {
        if (runId) {
            localStorage.setItem(RUN_ID_KEY, String(runId));
        } else {
            localStorage.removeItem(RUN_ID_KEY);
        }
        setSimulationRunIdState(runId);
    };

    // 작업 / 이벤트 목록
    // 목업이 아니라 백엔드에서 받은 것만 보여준다.
    // 시작하면 그 실행의 작업으로 채워지고, 이후 WebSocket 으로 갱신된다.
    const [taskList, setTaskList] = useState([]);
    const [eventList, setEventList] = useState([]);
    const [generatedCommands, setGeneratedCommands] = useState([]);

    useEffect(() => {
        setGeneratedCommands([]);
    }, [simulationRunId, selectedWarehouseId]);

    /* =========================================================
       백엔드 초기 데이터 로딩
    ========================================================= */

    // 창고 목록은 한 번만 불러온다
    useEffect(() => {
        const loadWarehouses = async () => {
            try {
                const list = await warehouseApi.getAll();

                if (!Array.isArray(list) || list.length === 0) {
                    return;
                }

                setWarehouses(list);

                // 저장해둔 창고가 목록에 없으면 첫 번째로 되돌린다
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

    // 선택한 창고의 시나리오 목록을 불러온다.
    // 창고가 바뀌면 이전 창고의 시나리오는 쓸 수 없으므로 선택을 비운다.
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

                const items = Array.isArray(list) ? list : [];
                setScenarios(items);

                // 저장해둔 시나리오가 이 창고에 없으면 첫 번째로 되돌린다.
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

    // 시나리오를 고르면 그 배속을 화면 설정에도 반영한다.
    const handleScenarioChange = (event) => {
        const value = event.target.value;
        const scenarioId = value ? Number(value) : null;

        setSelectedScenarioId(scenarioId);

        const scenario = scenarios.find((item) => item.id === scenarioId);

        if (scenario?.simulationSpeed) {
            setSimulationSpeed(Number(scenario.simulationSpeed));
        }
    };

    // 시작 전에도 창고에 등록된 로봇을 지도에 보여준다.
    // 실행 중이면 실시간 상태가 우선이므로 건드리지 않는다.
    useEffect(() => {
        if (simulationRunId) {
            return;
        }

        loadRestingRobots(selectedWarehouseId);
        // 창고가 바뀔 때만 다시 배치한다.
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

    /**
     * 창고 변경.
     *
     * 창고마다 지도도 로봇도 다르므로 진행 중인 시뮬레이션을 이어갈 수 없다.
     * 실행 중이면 먼저 확인을 받고, 화면을 처음 상태로 되돌린다.
     */
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
        setSelectedWarehouseId(nextId);
        loadRestingRobots(nextId);
    };

    /**
     * 시작 전 화면에 보여줄 로봇 배치를 불러온다.
     *
     * 예전에는 충전소 6칸에 가짜 로봇을 그렸는데,
     * 창고마다 로봇 수와 위치가 다르므로 실제 등록된 로봇을 쓴다.
     * 로봇의 node_id 는 숫자이고 지도는 노드 코드로 그리므로 레이아웃으로 변환한다.
     */
    const loadRestingRobots = async (warehouseId) => {
        if (!warehouseId) {
            return;
        }

        try {
            const [robotList, layout] = await Promise.all([
                robotApi.getAll(warehouseId),
                warehouseApi.getLayout(warehouseId),
            ]);

            const nodeCodeById = new Map(
                (layout.nodes ?? []).map((node) => [node.id, node.nodeCode])
            );

            const placed = (robotList ?? [])
                .map((robot) => ({
                    robot_id: robot.id,
                    robot_code: `R${robot.id}`,
                    node_id: nodeCodeById.get(robot.nodeId),
                    battery: robot.battery,
                    status: "IDLE",
                }))
                .filter((robot) => robot.node_id);

            setRobots(placed);
        } catch (error) {
            console.warn("로봇 초기 배치 조회 실패", error.message);
            setRobots([]);
        }
    };

    /**
     * 실행 배속 변경.
     * 진행 중인 시뮬레이션이 있으면 백엔드 시계 속도도 함께 바꾼다.
     */
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

    /**
     * 해당 실행의 작업 목록을 백엔드에서 다시 읽어온다.
     * 시작/초기화 시점에 화면을 그 실행의 작업만으로 맞춘다.
     */
    const reloadTasks = async (runId) => {
        try {
            const runTasks = await simulationRunApi.getTasks(runId);
            setTaskList(Array.isArray(runTasks) ? runTasks : []);
        } catch (error) {
            console.warn("작업 목록 조회 실패", error.message);
            setTaskList([]);
        }
    };

    /**
     * 진행 중인 시뮬레이션의 현재 모습을 그대로 복구한다.
     *
     * 다른 페이지에 갔다 오면 화면은 초기 상태로 돌아가지만
     * 백엔드 재생은 계속 진행된다. 그래서 돌아온 직후 첫 WebSocket 메시지가 오면
     * 로봇이 충전소에서 현재 위치까지 화면을 가로질러 날아가는 것처럼 보인다.
     *
     * 돌아오자마자 현재 위치를 받아 "애니메이션 없이" 배치하면 이 점프가 사라진다.
     */
    const restoreRuntime = async (runId) => {
        try {
            const snapshot = await simulationRunApi.getRobotStates(runId);

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
                setRobots(snapshot.robots.map(toRobotView));
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

    // 페이지에 들어오거나 새로고침했을 때 진행 중이던 실행을 이어서 보여준다
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
    const buildCreatePayload = ({ warehouseId, scenarioId }) => {
        return {
            warehouseId,
            scenarioId,
            simulationSpeed: Number(simulationSpeed),
            // 고른 시나리오가 있으면 그 설정으로 실행한다.
            scenarioId: selectedScenarioId ?? null,
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
            throw new Error("개인 창고 복제 응답에서 warehouseId를 확인할 수 없습니다.");
        }

        return numericWarehouseId;
    };

    /**
     * SimulationRun에는 공유 템플릿 ID를 전달하지 않는다.
     * 공유 템플릿이면 현재 로그인 유형에 맞게 개인 복제본을 만든 뒤,
     * 복제본에 속한 시나리오를 다시 조회해 새 관계 ID를 사용한다.
     */
    const resolveSimulationTarget = async () => {
        let warehouse = warehouses.find(
            (item) => Number(item.id) === Number(selectedWarehouseId)
        );

        if (!warehouse) {
            warehouse = await warehouseApi.get(selectedWarehouseId);
        }

        let warehouseId = Number(warehouse.id ?? selectedWarehouseId);

        if (warehouse.shared === true) {
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
        }

        const scenarios = await scenarioApi.getAll(warehouseId);

        if (!Array.isArray(scenarios) || scenarios.length === 0) {
            throw new Error("선택한 창고에 실행할 시나리오가 없습니다.");
        }

        const scenarioId = scenarios[0]?.id ?? scenarios[0]?.scenarioId;

        if (scenarioId === null || scenarioId === undefined) {
            throw new Error("시나리오 조회 응답에서 scenarioId를 확인할 수 없습니다.");
        }

        return { warehouseId, scenarioId };
    };

    /**
     * 설정값이 유효한지 검사한다.
     */
    const validateSettings = () => {
        return Boolean(selectedWarehouseId);
    };

    /**
     * 새 시뮬레이션 생성.
     *
     * 진행 중인 실행을 중지하고, 지금 화면의 설정값으로 새 실행을 만든다.
     * 이전 작업은 버리고 백엔드가 작업을 새로 생성한다.
     */
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
     * - 완료/실패            초기화해서 같은 작업을 다시 재생
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
                // 같은 작업을 처음부터 다시 재생할 수 있게 되돌린다
                console.log("이전 실행이 종료돼 있어 초기화 후 재생합니다.");
                await simulationRunApi.reset(simulationRunId);
                await reloadTasks(simulationRunId);
                return simulationRunId;

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

    // 시뮬레이션 시작
    const handleStart = async () => {
        // 일시정지 상태면 재개
        if (simulationStatus === "일시정지") {
            await handleResume();
            return;
        }

        if (!validateSettings()) {
            return;
        }

        try {
            // 이미 만들어둔 실행이 있으면 재사용한다.
            // (초기화 후 다시 시작할 때 새 실행이 생겨 기존 작업이 누락되는 것을 막는다)
            //
            // 다만 저장된 실행이 이미 끝났거나 중지된 상태일 수 있으므로
            // (예: 어제 실행을 localStorage 가 기억하고 있는 경우)
            // 상태를 확인해서 시작 가능한 형태로 맞춘다.
            const selectedWarehouse = warehouses.find(
                (warehouse) =>
                    Number(warehouse.id) === Number(selectedWarehouseId)
            );
            let runId = selectedWarehouse?.shared === true
                ? null
                : await resolveStartableRunId();

            if (runId === "ALREADY_RUNNING") {
                return;
            }

            if (runId) {
                console.log(`기존 시뮬레이션 재사용: runId=${runId}`);
            } else {
                const simulationTarget = await resolveSimulationTarget();
                const createPayload = buildCreatePayload(simulationTarget);

                if (
                    Number(simulationTarget.warehouseId)
                    !== Number(selectedWarehouseId)
                ) {
                    setSimulationRunId(null);
                    await loadRestingRobots(simulationTarget.warehouseId);
                }

                console.log("시뮬레이션 생성 요청:", createPayload);
                const created = await simulationRunApi.create(createPayload);
                runId = created.simulationRunId;
            }

            // 시작 직후 실행되는 0분 명령부터 화면에서 고른 표현 방식을 사용한다.
            await fulfillmentCommandApi.configureCycle(
                runId,
                commandExpressionMix
            );
            const started = await simulationRunApi.start(runId);

            setSimulationRunId(runId);
            setSimulationStatus(STATUS_LABEL[started.status] ?? "실행");
            isPausedRef.current = false;

            console.log(
                `%c시뮬레이션 실행 ID = ${runId}`,
                "font-size:14px;font-weight:bold;color:#2563eb"
            );

            // 시작 직후 현재 로봇 상태 스냅샷 조회
            const snapshot = await simulationRunApi.getRobotStates(runId);

            if (snapshot?.robots?.length) {
                setRobots(snapshot.robots.map(toRobotView));
            }

            // 이 실행의 작업 목록으로 교체한다.
            // (이전 실행의 작업이나 목업 데이터가 남지 않도록)
            await reloadTasks(runId);
        } catch (error) {
            console.error("시뮬레이션 시작 실패:", error);
            alert(error.message ?? "시뮬레이션을 시작하지 못했습니다.");
        }
    };

    // 시뮬레이션 일시정지
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

    // 시뮬레이션 재개
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

    // 시뮬레이션 초기화
    const handleReset = async () => {
        isPausedRef.current = false;

        if (simulationRunId) {
            try {
                await simulationRunApi.reset(simulationRunId);
                // 작업이 전부 대기 상태로 돌아간 목록을 다시 읽어온다
                await reloadTasks(simulationRunId);
            } catch (error) {
                console.error("시뮬레이션 초기화 실패:", error);
            }
        }

        // 로봇을 DB 에 저장된 시작 위치로 되돌린다
        await loadRestingRobots(selectedWarehouseId);

        // simulationRunId 는 유지한다.
        // 초기화 후 다시 시작할 때 같은 실행을 재사용해야
        // 그 실행에 등록한 작업들이 계획에 포함된다.
        setSimulationStatus("대기");
        setSimulationTime(0);
    };

    /**
     * 시뮬레이션 중지.
     *
     * 초기화와 달리 이 실행은 완전히 끝낸다.
     * 실행 ID 를 버리므로 다시 시작할 수 없고, 새 작업을 만들어야 한다.
     * (백엔드에서도 STOPPED 로 바뀌어 재생 엔진과 로봇 상태가 정리된다)
     */
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

    // 시뮬레이션 재계획
    const handleReplan = async () => {
        if (simulationStatus !== "실행") {
            return;
        }

        if (!simulationRunId) {
            alert("실행 중인 시뮬레이션이 없습니다.");
            return;
        }

        try {
            setSimulationStatus("재계획");

            await optimizationApi.reoptimize(simulationRunId, {
                reason: "MANUAL_REQUEST",
                triggerRobotId: null,
                blockedEdgeIds: [],
                description: "사용자 수동 재계획 요청",
            });

            setSimulationStatus("실행");
        } catch (error) {
            console.error("시뮬레이션 재계획 실패:", error);
            alert(error.message ?? "재계획에 실패했습니다.");
            setSimulationStatus("실행");
        }
    };

    /* =========================================================
       로봇 / 실시간 구독
    ========================================================= */

    const [robots, setRobots] = useState([]);
    const isPausedRef = useRef(false);
    const isSimulationRunning =
        simulationStatus === "실행"
        || simulationStatus === "재계획";

    const {
        avoidanceStates,
        avoidanceEvents,
    } = useRobotAvoidanceTracker(
        robots,
        isSimulationRunning,
    );
    // 로봇 상태 1건 수신 → 해당 로봇만 갱신
    const applyRobotState = (state) => {
        const incoming = toRobotView(state);

        setRobots((prevRobots) => {
            const exists = prevRobots.some(
                (robot) => robot.robot_id === incoming.robot_id
            );

            if (!exists) {
                return [...prevRobots, incoming];
            }

            return prevRobots.map((robot) =>
                robot.robot_id === incoming.robot_id
                    ? { ...robot, ...incoming }
                    : robot
            );
        });
    };

    // 작업 변경 수신 → 목록 갱신
    // 백엔드 TaskResponse 형태를 그대로 보관한다. (SimulationTask 가 같은 형태를 읽는다)
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

    // 이벤트 발생/해결 수신 → 목록 갱신
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

    // 실행 중인 시뮬레이션이 있을 때만 구독
    const subscriptions = simulationRunId
        ? {
            [TOPICS.runRobots(simulationRunId)]: applyRobotState,
            [TOPICS.TASKS]: applyTask,
            [TOPICS.EVENTS]: applyEvent,
            [TOPICS.SIMULATION_RUNS]: (run) => {
                if (run.simulationRunId !== simulationRunId) {
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

    /* =========================================================
       화면
    ========================================================= */

    return (
        <div className="simulation-wrapper">

            {/* 상단 헤더 */}
            <header className="simulation-header">
                {/* 상단 네이비 헤더 */}
                <div className="simulation-topbar">
                    <div className="simulation-topbar-title">
                        <h2>시뮬레이션 실행</h2>
                    </div>

                    {/* 선택한 창고에 등록된 시나리오를 고른다. */}
                    <div className="simulation-topbar-scenario">
                        <span className="simulation-topbar-label">
                            시나리오 선택
                        </span>

                        <select
                            value={selectedScenarioId ?? ""}
                            onChange={handleScenarioChange}
                            disabled={
                                scenarios.length === 0
                                || Boolean(simulationRunId)
                            }
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

                    {/* 사용자와 현재 날짜·시간은 관련 데이터가 연결되면 교체한다. */}
                    <div className="simulation-topbar-meta">
                        <div className="simulation-topbar-user">
                            <span className="simulation-topbar-label">
                                사용자
                            </span>
                            <p>운영자 정보 연결 필요</p>
                        </div>

                        <p className="simulation-topbar-datetime">
                            현재 날짜·시간 표시 기능 연결 필요
                        </p>
                    </div>
                </div>

                {/* 시뮬레이션 설정 및 제어 영역 */}
                <div className="simulation-controlbar">
                    <div className="simulation-header-info">
                        {/* 창고 선택 */}
                        <div className="simulation-header-info-item simulation-scenario">
                            <span className="simulation-header-label">창고</span>

                            <select
                                value={selectedWarehouseId}
                                onChange={(e) =>
                                    handleWarehouseChange(e.target.value)
                                }
                                disabled={warehouses.length === 0}
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

                        {/* 현재 시뮬레이션 상태 */}
                        <div className="simulation-header-info-item">
                            <span className="simulation-header-label">상태</span>
                            <span className="simulation-header-status">
                                {simulationStatus}
                            </span>

                            {/* 실시간 연결 표시 */}
                            {simulationRunId && (
                                <span
                                    className="simulation-header-socket"
                                    title={
                                        connected
                                            ? "실시간 연결됨"
                                            : "실시간 연결 대기 중"
                                    }
                                >
                                    {connected ? "● 실시간" : "○ 연결 중"}
                                </span>
                            )}
                        </div>

                        {/* 시뮬레이션 타이머 */}
                        <div className="simulation-header-info-item">
                            <span className="simulation-header-label">
                                실행 시간
                            </span>
                            <span className="simulation-header-time">
                                {formatSimulationTime(simulationTime)}
                            </span>
                        </div>

                        {/* 시뮬레이션 실행 속도 */}
                        <div className="simulation-header-info-item">
                            <span className="simulation-header-label">
                                실행 속도
                            </span>

                            <select
                                className="simulation-header-speed"
                                value={simulationSpeed}
                                onChange={(e) =>
                                    handleSpeedChange(Number(e.target.value))
                                }
                            >
                                <option value={0.5}>0.5배</option>
                                <option value={1}>1배</option>
                                <option value={2}>2배</option>
                                <option value={3}>3배</option>
                            </select>
                        </div>
                    </div>

                    {/* 기존 시뮬레이션 제어 기능을 그대로 사용한다. */}
                    <div className="simulation-header-buttons">
                        <button
                            type="button"
                            className="simulation-header-button start"
                            onClick={handleStart}
                        >
                            시작
                        </button>
                        <button
                            type="button"
                            className="simulation-header-button new-run"
                            onClick={handleNewRun}
                            title="현재 작업을 버리고 지금 설정으로 작업을 새로 생성합니다"
                        >
                            새 작업 생성
                        </button>
                        <button
                            type="button"
                            className="simulation-header-button"
                            onClick={handlePause}
                        >
                            일시정지
                        </button>
                        <button
                            type="button"
                            className="simulation-header-button"
                            onClick={handleReset}
                        >
                            초기화
                        </button>
                        <button
                            type="button"
                            className="simulation-header-button stop"
                            onClick={handleStop}
                            disabled={!simulationRunId}
                            title="이 실행을 완전히 종료합니다. 다시 시작하려면 새 작업을 만들어야 합니다."
                        >
                            중지
                        </button>
                        <button
                            type="button"
                            className="simulation-header-button"
                            onClick={handleReplan}
                        >
                            재계획
                        </button>
                    </div>
                </div>
            </header>

            {/* 시뮬레이션 화면 */}
            <main className="simulation-view">
                <WarehouseSVG
                    warehouseId={selectedWarehouseId}
                    robots={robots}
                    tasks={taskList}
                    generatedCommands={generatedCommands}
                    avoidanceStates={avoidanceStates}
                    isRunning={isSimulationRunning}
                />
            </main>

            {/* 입출고 설정 / 자연어 명령 패널 */}
            <SimulationPanel
                simulationRunId={simulationRunId}
                onSimulatedTimeChange={setSimulationTime}
                tasks={taskList}
                commandExpressionMix={commandExpressionMix}
                onCommandExpressionMixChange={setCommandExpressionMix}
                onGeneratedCommandsChange={setGeneratedCommands}
            />

            {/* 작업 목록 (WebSocket 실시간 갱신) */}
            <SimulationTask tasks={taskList} />

            {/* 이벤트 목록 (WebSocket 실시간 갱신) */}
            <SimulationEvent
                events={[
                    ...avoidanceEvents,
                    ...eventList,
                ]}
            />

        </div>
    );
}

export default Simulation;
