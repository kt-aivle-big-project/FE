import { useEffect, useRef, useState } from "react";
import "../styles/simulation.css";

import WarehouseSVG from "../simulation/WarehouseSVG";
import SimulationPanel from "../simulation/SimulationPanel";
import SimulationTask from "../simulation/SimulationTask";
import SimulationEvent from "../simulation/SimulationEvent";

import useStompSubscriptions from "../hooks/useStompSubscriptions";
import { API_URL, TOPICS } from "../api/config";
import {
    simulationRunApi,
    scenarioApi,
    productApi,
    optimizationApi,
} from "../api/client";

import scenariosData from "../data/scenarios.json";
import robotsData from "../data/robots.json";
import productsData from "../data/products.json";
import inbound from "../data/inbound.json";
import outbound from "../data/outbound.json";

// 데모용 창고 ID (창고 선택 기능 붙이기 전까지 고정)
const DEFAULT_WAREHOUSE_ID = 1;

// 새로고침 후에도 실행 중인 시뮬레이션을 이어서 쓰기 위한 저장 키
const RUN_ID_KEY = "simulationRunId";

// 백엔드 SimulationRunStatus → 화면 표시 문구
const STATUS_LABEL = {
    CREATED: "대기",
    RUNNING: "실행",
    PAUSED: "일시정지",
    REPLANNING: "재계획",
    COMPLETED: "완료",
    STOPPED: "중지",
    FAILED: "실패",
};

// 백엔드 RobotStateResponse → 화면 로봇 객체
//
// 이동 중이면 백엔드가 다음 노드(nextNodeCode)와 도착까지 남은 시간을 함께 보낸다.
// 로봇을 "도착 지점"에 배치하고 그 시간만큼 CSS transition 을 주면
// 브라우저가 직전 위치에서 목적지까지 부드럽게 이어서 그려준다.
const toRobotView = (state) => {
    const isMoving = Boolean(state.nextNodeCode);

    return {
        robot_id: state.robotId,
        robot_code: `R${state.robotId}`,

        // 이동 중이면 목적지 노드, 정지 중이면 현재 노드
        node_id: isMoving ? state.nextNodeCode : state.currentNodeCode,

        battery: state.batteryLevel,
        status: state.status,

        // 보간 시간(ms). 정지 상태면 즉시 반영
        transition_ms:
            isMoving && state.arrivalInSeconds
                ? Math.max(0, state.arrivalInSeconds * 1000)
                : 0,
    };
};

function Simulation() {
    /* =========================================================
       상단 헤더 - 시뮬레이션 실행
    ========================================================= */

    // 시나리오 설정 (백엔드 조회 실패 시 목업 데이터로 폴백)
    const [scenarioSettings, setScenarioSettings] = useState(scenariosData);
    const [selectedScenario, setSelectedScenario] = useState(
        scenariosData[0]?.scenario_id ?? ""
    );
    const [simulationSpeed, setSimulationSpeed] = useState(1);
    const [simulationStatus, setSimulationStatus] = useState("대기");
    const [simulationTime, setSimulationTime] = useState(0);

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

    // 작업 / 이벤트 / 품목 목록
    // 목업이 아니라 백엔드에서 받은 것만 보여준다.
    // 시작하면 그 실행의 작업으로 채워지고, 이후 WebSocket 으로 갱신된다.
    const [taskList, setTaskList] = useState([]);
    const [eventList, setEventList] = useState([]);
    const [products, setProducts] = useState(productsData);

    /* =========================================================
       백엔드 초기 데이터 로딩
    ========================================================= */

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const scenarioList = await scenarioApi.getAll(
                    DEFAULT_WAREHOUSE_ID
                );

                if (Array.isArray(scenarioList) && scenarioList.length > 0) {
                    // 백엔드 응답을 화면에서 쓰던 형태로 변환
                    const mapped = scenarioList.map((scenario) => ({
                        scenario_id: scenario.id,
                        scenario_name: scenario.scenarioName,
                        robot_count: scenario.robotCount,
                        simulation_speed: scenario.simulationSpeed,
                        initial_battery: scenario.initialBattery,
                        charging_threshold: scenario.chargingThreshold,
                        auto_replan: scenario.autoReplan,
                        obstacle_enabled: scenario.obstacleEnabled,
                    }));

                    setScenarioSettings(mapped);
                    setSelectedScenario(mapped[0].scenario_id);
                }
            } catch (error) {
                console.warn(
                    "시나리오 조회 실패 - 목업 데이터를 사용합니다.",
                    error.message
                );
            }

            try {
                const productList = await productApi.getAll();

                if (Array.isArray(productList) && productList.length > 0) {
                    setProducts(
                        productList.map((product) => ({
                            product_code: product.productCode,
                            product_name: product.productName,
                        }))
                    );
                }
            } catch (error) {
                console.warn(
                    "품목 조회 실패 - 목업 데이터를 사용합니다.",
                    error.message
                );
            }
        };

        loadInitialData();
    }, []);

    // 시뮬레이션 타이머
    useEffect(() => {
        if (simulationStatus !== "실행" && simulationStatus !== "재계획") {
            return;
        }

        const timer = setInterval(() => {
            setSimulationTime((time) => time + simulationSpeed);
        }, 1000);

        return () => clearInterval(timer);
    }, [simulationStatus, simulationSpeed]);

    const formatSimulationTime = (totalSeconds) => {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map((value) => String(value).padStart(2, "0"))
            .join(":");
    };

    // 시뮬레이션 시나리오 선택
    const handleScenarioChange = (scenarioId) => {
        setSelectedScenario(scenarioId);
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

    // 새로고침해도 진행 중이던 실행의 작업 목록을 되살린다
    useEffect(() => {
        if (simulationRunId) {
            reloadTasks(simulationRunId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [simulationRunId]);

    // 시뮬레이션 시작
    const handleStart = async () => {
        // 일시정지 상태면 재개
        if (simulationStatus === "일시정지") {
            await handleResume();
            return;
        }

        if (!selectedScenario) {
            alert("시나리오를 선택해주세요.");
            return;
        }

        if (inboundRatioTotal !== 100) {
            alert("입고 품목 구성 비율의 합계가 100%가 되어야 합니다.");
            return;
        }

        // 시나리오 ID는 숫자여야 한다.
        // 백엔드 조회 실패로 목업("S1")이 선택된 경우 null로 보낸다.
        const scenarioIdNumber = Number(selectedScenario);
        const scenarioId = Number.isFinite(scenarioIdNumber)
            ? scenarioIdNumber
            : null;

        if (scenarioId === null) {
            console.warn(
                "시나리오가 백엔드에서 조회되지 않아 프리셋 없이 실행합니다."
            );
        }

        // 백엔드로 보낼 데이터 (SimulationRunCreateRequest)
        const createPayload = {
            warehouseId: DEFAULT_WAREHOUSE_ID,
            scenarioId: scenarioId,
            simulationSpeed: Number(simulationSpeed),
            inbound: {
                inboundCount: inboundSettings.inbound_count,
                totalQuantity: inboundSettings.total_quantity,
                arrivalPattern: inboundSettings.arrival_pattern,
                products: inboundSettings.products.map((product) => ({
                    productCode: product.product_code,
                    ratio: product.ratio,
                })),
            },
            outbound: {
                orderCount: outboundSettings.order_count,
                totalQuantity: outboundSettings.total_quantity,
                arrivalPattern: outboundSettings.arrival_pattern,
                processingDeadlineMinutes:
                outboundSettings.processing_deadline_minutes,
                allowPartialShipment: outboundSettings.allow_partial_shipment,
            },
        };

        try {
            // 이미 만들어둔 실행이 있으면 재사용한다.
            // (초기화 후 다시 시작할 때 새 실행이 생겨 기존 작업이 누락되는 것을 막는다)
            let runId = simulationRunId;

            if (runId) {
                console.log(`기존 시뮬레이션 재사용: runId=${runId}`);
            } else {
                console.log("시뮬레이션 생성 요청:", createPayload);
                const created = await simulationRunApi.create(createPayload);
                runId = created.simulationRunId;
            }

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

        // 로봇 위치 초기화
        setRobots(robotsData.map((robot) => ({ ...robot })));

        // simulationRunId 는 유지한다.
        // 초기화 후 다시 시작할 때 같은 실행을 재사용해야
        // 그 실행에 등록한 작업들이 계획에 포함된다.
        setSimulationStatus("대기");
        setSimulationTime(0);
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

    const [robots, setRobots] = useState(robotsData);
    const isPausedRef = useRef(false);

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
                // 초기화 후 다시 시작하면 같은 시나리오를 처음부터 재생할 수 있다.
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
       입출고 설정 패널
    ========================================================= */

    const [inboundSettings, setInboundSettings] = useState(inbound);
    const [outboundSettings, setOutboundSettings] = useState(outbound);

    // 입고 품목 비율 합계
    const inboundRatioTotal = inboundSettings.products.reduce(
        (total, product) => total + Number(product.ratio),
        0
    );

    // 자연어 명령 처리
    const [naturalCommand, setNaturalCommand] = useState("");

    const handleNaturalCommand = async () => {
        const command = naturalCommand.trim();

        if (!command) {
            alert("명령을 입력해주세요.");
            return;
        }

        if (!simulationRunId) {
            alert("먼저 시뮬레이션을 실행해주세요.");
            return;
        }

        try {
            const accessToken = localStorage.getItem("accessToken");

            console.log("자연어 명령:", { command: command });

            const response = await fetch(
                `${API_URL}/simulation-runs/${simulationRunId}/commands`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ command: command }),
                }
            );

            if (!response.ok) {
                const errorMessage = await response.text();

                throw new Error(
                    errorMessage || "자연어 명령 처리에 실패했습니다."
                );
            }

            const data = await response.json();

            console.log("자연어 명령 응답:", data);
            setNaturalCommand("");
        } catch (error) {
            console.error("자연어 명령 처리 실패:", error);
            alert(error.message ?? "명령을 처리하지 못했습니다.");
        }
    };

    /* =========================================================
       화면
    ========================================================= */

    return (
        <div className="simulation-wrapper">

            {/* 상단 헤더 */}
            <header className="simulation-header">
                <div className="simulation-header-title">
                    <h2>시뮬레이션 실행</h2>
                </div>

                <div className="simulation-header-info">
                    {/* 시나리오 선택 */}
                    <div className="simulation-header-info-item simulation-scenario">
                        <span className="simulation-header-label">
                            시나리오
                        </span>

                        <select
                            value={selectedScenario}
                            onChange={(e) =>
                                handleScenarioChange(e.target.value)
                            }
                        >
                            {scenarioSettings.map((scenario) => (
                                <option
                                    key={scenario.scenario_id}
                                    value={scenario.scenario_id}
                                >
                                    {scenario.scenario_name}
                                </option>
                            ))}
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
                                setSimulationSpeed(Number(e.target.value))
                            }
                        >
                            <option value={0.5}>0.5배</option>
                            <option value={1}>1배</option>
                            <option value={2}>2배</option>
                            <option value={3}>3배</option>
                        </select>
                    </div>
                </div>

                {/* 시뮬레이션 제어 버튼 */}
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
                        className="simulation-header-button"
                        onClick={handleReplan}
                    >
                        재계획
                    </button>
                </div>
            </header>

            {/* 시뮬레이션 화면 */}
            <main className="simulation-view">
                <WarehouseSVG
                    robots={robots}
                    simulationSpeed={simulationSpeed}
                />
            </main>

            {/* 입출고 설정 / 자연어 명령 패널 */}
            <SimulationPanel
                inboundSettings={inboundSettings}
                setInboundSettings={setInboundSettings}
                outboundSettings={outboundSettings}
                setOutboundSettings={setOutboundSettings}
                products={products}
                inboundRatioTotal={inboundRatioTotal}
                naturalCommand={naturalCommand}
                setNaturalCommand={setNaturalCommand}
                handleNaturalCommand={handleNaturalCommand}
            />

            {/* 작업 목록 (WebSocket 실시간 갱신) */}
            <SimulationTask tasks={taskList} />

            {/* 이벤트 목록 (WebSocket 실시간 갱신) */}
            <SimulationEvent events={eventList} />

            {/* 하단 footer */}
            <footer className="footer">
                Footer
            </footer>
        </div>
    );
}

export default Simulation;