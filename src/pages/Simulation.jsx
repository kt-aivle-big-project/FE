import { useEffect, useState, useRef } from "react";
import "../styles/simulation.css"; import WarehouseSVG from "../components/WarehouseSVG";
import SimulationTask from "../components/SimulationTask";

import useStompSubscriptions from "../hooks/useStompSubscriptions";
import { TOPICS } from "../api/config";
import {
    simulationRunApi,
    scenarioApi,
    productApi,
    optimizationApi,
} from "../api/client";

import scenariosData from "../data/scenarios.json";
import alerts from "../data/alerts.json";
import tasksData from "../data/tasks.json";
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
        transition_ms: isMoving && state.arrivalInSeconds
            ? Math.max(0, state.arrivalInSeconds * 1000)
            : 0,
    };
};


function Simulation() {
    /* ===== 상단 헤더 - 시뮬레이션 실행  ===== */

    // 시나리오 설정 (백엔드 조회 실패 시 목업 데이터로 폴백)
    const [scenarioSettings, setScenarioSettings] = useState(scenariosData);
    const [selectedScenario, setSelectedScenario] = useState(
        scenariosData[0]?.scenario_id ?? ""
    );
    const [simulationSpeed, setSimulationSpeed] = useState(1);
    const [simulationStatus, setSimulationStatus] = useState("대기");
    const [simulationTime, setSimulationTime] = useState(0);

    // 실행 중인 시뮬레이션 ID (백엔드 연동)
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

    // 작업 목록 / 품목 목록
    const [tasks, setTasks] = useState(tasksData);
    const [products, setProducts] = useState(productsData);

    /* ===== 백엔드 초기 데이터 로딩 ===== */
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
        if (simulationStatus !== "실행" && simulationStatus !== "재계획") { return; }
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
            .map((value) =>
                String(value).padStart(2, "0")
            )
            .join(":");
    };

    // 시뮬레이션 시나리오 선택 (저장된 설정값 불러오기)
    const handleScenarioChange = (scenarioId) => {
        setSelectedScenario(scenarioId);
    };

    // 시뮬레이션 시작
    const handleStart = async () => {

        if (simulationStatus === "일시정지") {
            isPausedRef.current = false;
            setSimulationStatus("실행");
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
                allowPartialShipment:
                    outboundSettings.allow_partial_shipment,
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
        } catch (error) {
            console.error("시뮬레이션 시작 실패:", error);
            alert(
                error.message ??
                "시뮬레이션을 시작하지 못했습니다."
            );
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

    // 시뮬레이션 초기화
    const handleReset = async () => {
        movementRunRef.current += 1;
        isPausedRef.current = false;

        if (simulationRunId) {
            try {
                await simulationRunApi.reset(simulationRunId);
            } catch (error) {
                console.error("시뮬레이션 초기화 실패:", error);
            }
        }

        // 로봇 위치 초기화
        setRobots(
            robotsData.map((robot) => ({
                ...robot,
            }))
        );

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

    /* ===== 로봇 ===== */

    const [robots, setRobots] = useState(robotsData);
    const isPausedRef = useRef(false);

    /* ===== 실시간 구독 (WebSocket) ===== */

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
    const applyTask = (task) => {
        setTasks((prevTasks) => {
            const exists = prevTasks.some(
                (item) => item.task_code === String(task.id)
            );

            const mapped = {
                task_code: String(task.id),
                task_name: task.taskType,
                start_node: String(task.startNodeId),
                end_node: String(task.endNodeId),
                robot_id: task.robotId ? `R${task.robotId}` : "-",
                status: task.status,
                started: "-",
                ended: "-",
            };

            if (!exists) {
                return [...prevTasks, mapped];
            }

            return prevTasks.map((item) =>
                item.task_code === mapped.task_code ? mapped : item
            );
        });
    };

    // 실행 중인 시뮬레이션이 있을 때만 구독
    const subscriptions = simulationRunId
        ? {
            [TOPICS.runRobots(simulationRunId)]: applyRobotState,
            [TOPICS.TASKS]: applyTask,
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
    // 실행 중인 이동을 구분하기 위한 값
    // 초기화했을 때 기존 이동 루프를 중단하기 위해 사용
    const movementRunRef = useRef(0);

    // 테스트 경로
    const testPath = [
        "R6_0",
        "R5_0",
        "R4_0",
        "R4_1",
        "R4_2",
        "R4_3",
        "R4_4",
        "R4_5",
        "R4_6",
        "R4_7",
        "R4_8",
        "R4_9",
        "R4_10",
        "R3_10",
        "O_D",
    ];

    const sleep = (ms) => {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    };

    const moveRobot = async (robotId, path) => {

        // 이번 실행 번호 저장
        const currentRun = movementRunRef.current;

        for (const nodeId of path) {
            if (currentRun !== movementRunRef.current) {
                return;
            }
            while (isPausedRef.current) {
                if (currentRun !== movementRunRef.current) {
                    return;
                }
                await sleep(100);
            }

            // 해당 로봇의 현재 node_id 변경
            setRobots((prevRobots) =>
                prevRobots.map((robot) =>
                    robot.robot_id === robotId
                        ? {
                            ...robot,
                            node_id: nodeId,
                        }
                        : robot
                )
            );

            // 시뮬레이션 속도 적용
            // 0.5배속 → 1000ms / 1배속 → 500ms / 2배속 → 250ms
            const delay = 500 / Number(simulationSpeed);
            await sleep(delay);
        }

        if (currentRun === movementRunRef.current) {
            setSimulationStatus("완료");
        }
    };

    /* ===== 작업 카드 ===== */


    /* ===== 입고 설정 ===== */
    const [inboundSettings, setInboundSettings] = useState(inbound);
    const [newProductCode, setNewProductCode] = useState("");
    const [newProductRatio, setNewProductRatio] = useState("");

    // 입고 설정 변경
    const handleInboundChange = (field, value) => {
        setInboundSettings((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    // 품목명 불러오기
    const getProductName = (productCode) => {
        const product = products.find(
            (product) => product.product_code === productCode
        );

        return product?.product_name ?? "";
    };

    // 이미 추가한 품목은 목록에서 제외
    const availableProducts = products.filter(
        (product) =>
            !inboundSettings.products.some(
                (inboundProduct) =>
                    inboundProduct.product_code === product.product_code
            )
    );

    // 품목 추가
    const handleAddInboundProduct = () => {
        if (!newProductCode) {
            alert("추가할 품목을 선택해주세요.");
            return;
        }

        const ratio = Number(newProductRatio);

        if (ratio <= 0) {
            alert("품목 비율을 입력해주세요.");
            return;
        }

        if (inboundRatioTotal + ratio > 100) {
            alert("품목 구성 비율의 합계는 100%를 초과할 수 없습니다.");
            return;
        }

        setInboundSettings((prev) => ({
            ...prev,
            products: [
                ...prev.products,
                {
                    product_code: newProductCode,
                    ratio: ratio,
                },
            ],
        }));

        setNewProductCode("");
        setNewProductRatio("");
    };

    // 품목 삭제
    const handleDeleteInboundProduct = (productCode) => {
        setInboundSettings((prev) => ({
            ...prev,
            products: prev.products.filter(
                (product) => product.product_code !== productCode
            ),
        }));
    };

    // 품목 비율 수정
    const handleInboundRatioChange = (productCode, value) => {
        const ratio = Math.max(
            0,
            Math.min(100, Number(value))
        );

        setInboundSettings((prev) => ({
            ...prev,
            products: prev.products.map((product) =>
                product.product_code === productCode
                    ? {
                        ...product,
                        ratio: ratio,
                    }
                    : product
            ),
        }));
    };

    // 품목 비율 합계
    const inboundRatioTotal = inboundSettings.products.reduce(
        (total, product) => total + product.ratio,
        0
    );

    /* ===== 출고 설정 ===== */
    const [outboundSettings, setOutboundSettings] = useState(outbound);

    // 출고 설정 변경
    const handleOutboundChange = (field, value) => {
        setOutboundSettings((prev) => ({
            ...prev,
            [field]: value,
        }));
    };


    // 자연어 명령
    const [naturalCommand, setNaturalCommand] = useState("");
    const handleNaturalCommand = () => {
        const command = naturalCommand.trim();

        if (!command) {
            alert("명령을 입력해주세요.");
            return;
        }

        const commandRequest = {
            command: command,
        };

        console.log("자연어 명령:", commandRequest);

        // 전송 완료됐다고 가정
        setNaturalCommand("");
    };


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
                        <span className="simulation-header-label">
                            상태
                        </span>
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

            <SimulationTask tasks={tasks} />

            <aside className="simulation-panel">
                {/* 입고 설정 */}
                <section className="simulation-setting-panel">

                    <h2 className="simulation-setting-title">
                        입고 설정
                    </h2>

                    <div className="simulation-setting-row">
                        <label>입고 예정 건수</label>

                        <div className="simulation-input-unit">
                            <input
                                type="number"
                                value={inboundSettings.inbound_count}
                                onChange={(e) =>
                                    handleInboundChange(
                                        "inbound_count",
                                        Number(e.target.value)
                                    )
                                }
                            />
                            <span>건</span>
                        </div>
                    </div>

                    <div className="simulation-setting-row">
                        <label>총 입고 예정량</label>

                        <div className="simulation-input-unit">
                            <input
                                type="number"
                                value={inboundSettings.total_quantity}
                                onChange={(e) =>
                                    handleInboundChange(
                                        "total_quantity",
                                        Number(e.target.value)
                                    )
                                }
                            />
                            <span>BOX</span>
                        </div>
                    </div>

                    <div className="simulation-setting-row">
                        <label>입고 발생 패턴</label>

                        <select
                            value={inboundSettings.arrival_pattern}
                            onChange={(e) =>
                                handleInboundChange(
                                    "arrival_pattern",
                                    e.target.value
                                )
                            }
                        >
                            <option value="UNIFORM">균등</option>
                            <option value="RANDOM">랜덤</option>
                            <option value="PEAK">집중</option>
                        </select>
                    </div>


                    {/* 품목 구성 */}
                    <div className="inbound-product-section">

                        <div className="inbound-product-header">

                            <h3>품목 구성</h3>

                            <span
                                className={
                                    inboundRatioTotal === 100
                                        ? "inbound-ratio-valid"
                                        : "inbound-ratio-invalid"
                                }
                            >
                                합계 {inboundRatioTotal}%
                            </span>

                        </div>


                        {/* 추가된 품목 */}
                        <div className="inbound-product-list">

                            {inboundSettings.products.map((product) => (

                                <div
                                    className="inbound-poducrt-row"
                                    key={product.product_code}
                                >

                                    <div className="inbound-product-info">

                                        <strong>
                                            {product.product_code}
                                        </strong>

                                        <span>
                                            {getProductName(product.product_code)}
                                        </span>

                                    </div>


                                    <div className="inbound-product-control">

                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={product.ratio}
                                            onChange={(e) =>
                                                handleInboundRatioChange(
                                                    product.product_code,
                                                    e.target.value
                                                )
                                            }
                                        />

                                        <span>%</span>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleDeleteInboundProduct(
                                                    product.product_code
                                                )
                                            }
                                        >
                                            삭제
                                        </button>

                                    </div>

                                </div>

                            ))}

                        </div>


                        {/* 품목 추가 */}
                        {availableProducts.length > 0 && (

                            <div className="inbound-product-add">

                                <select
                                    value={newProductCode}
                                    onChange={(e) =>
                                        setNewProductCode(e.target.value)
                                    }
                                >

                                    <option value="">
                                        품목 선택
                                    </option>

                                    {availableProducts.map((product) => (

                                        <option
                                            key={product.product_code}
                                            value={product.product_code}
                                        >
                                            {product.product_code} {product.product_name}
                                        </option>

                                    ))}

                                </select>


                                <div className="inbound-add-ratio">

                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        placeholder="비율"
                                        value={newProductRatio}
                                        onChange={(e) =>
                                            setNewProductRatio(e.target.value)
                                        }
                                    />

                                    <span>%</span>

                                </div>


                                <button
                                    type="button"
                                    onClick={handleAddInboundProduct}
                                >
                                    추가
                                </button>

                            </div>

                        )}

                    </div>

                </section>

                {/* 출고 설정 */}
                <section className="simulation-setting-panel">

                    <h2 className="simulation-setting-title">
                        출고 설정
                    </h2>

                    <div className="simulation-setting-row">
                        <label>출고 주문 건수</label>

                        <div className="simulation-input-unit">
                            <input
                                type="number"
                                value={outboundSettings.order_count}
                                onChange={(e) =>
                                    handleOutboundChange(
                                        "order_count",
                                        Number(e.target.value)
                                    )
                                }
                            />
                            <span>건</span>
                        </div>
                    </div>

                    <div className="simulation-setting-row">
                        <label>총 출고 예정량</label>

                        <div className="simulation-input-unit">
                            <input
                                type="number"
                                value={outboundSettings.total_quantity}
                                onChange={(e) =>
                                    handleOutboundChange(
                                        "total_quantity",
                                        Number(e.target.value)
                                    )
                                }
                            />
                            <span>BOX</span>
                        </div>
                    </div>

                    <div className="simulation-setting-row">
                        <label>주문 발생 패턴</label>

                        <select
                            value={outboundSettings.arrival_pattern}
                            onChange={(e) =>
                                handleOutboundChange(
                                    "arrival_pattern",
                                    e.target.value
                                )
                            }
                        >
                            <option value="UNIFORM">균등</option>
                            <option value="RANDOM">랜덤</option>
                            <option value="PEAK">집중</option>
                        </select>
                    </div>

                    <div className="simulation-setting-row">
                        <label>출고 처리기한</label>

                        <div className="simulation-input-unit">
                            <input
                                type="number"
                                value={outboundSettings.processing_deadline_minutes}
                                onChange={(e) =>
                                    handleOutboundChange(
                                        "processing_deadline_minutes",
                                        Number(e.target.value)
                                    )
                                }
                            />
                            <span>분</span>
                        </div>
                    </div>

                    <div className="simulation-setting-row">
                        <label>부분 출고</label>

                        <select
                            value={
                                outboundSettings.allow_partial_shipment
                                    ? "true"
                                    : "false"
                            }
                            onChange={(e) =>
                                handleOutboundChange(
                                    "allow_partial_shipment",
                                    e.target.value === "true"
                                )
                            }
                        >
                            <option value="true">허용</option>
                            <option value="false">허용 안 함</option>
                        </select>
                    </div>

                </section>

                <section className="simulation-setting-panel">

                    <h2 className="simulation-setting-title">
                        명령 입력
                    </h2>

                    <div className="natural-command-content">
                        <textarea
                            id="natural-command"
                            value={naturalCommand}
                            onChange={(e) =>
                                setNaturalCommand(e.target.value)
                            }
                            placeholder="예: A 상품 출고 작업을 우선 처리해줘"
                        />

                        <div className="natural-command-actions">

                            <button
                                type="button"
                                onClick={handleNaturalCommand}
                                disabled={!naturalCommand.trim()}
                            >
                                명령 실행
                            </button>

                        </div>

                    </div>

                </section>
            </aside>


            {/* 하단 footer */}
            <footer className="footer">
                Footer
            </footer>
        </div>
    );
}

export default Simulation;