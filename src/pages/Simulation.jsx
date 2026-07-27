import { useEffect, useState, useRef } from "react";
import "../styles/Simulation.css";
import WarehouseSVG from "../Simulation/WarehouseSVG";
import SimulationTask from "../Simulation/SimulationTask";
import SimulationEvent from "../Simulation/SimulationEvent";
import SimulationPanel from "../simulation/SimulationPanel";

import scenarios from "../data/scenarios.json";
import alerts from "../data/alerts.json";
import tasks from "../data/tasks.json";
import robots from "../data/robots.json";
import products from "../data/products.json";
import inbound from "../data/inbound.json";
import outbound from "../data/outbound.json";
import events from "../data/events.json";

const API_URL = "http://localhost:8080/api";

function Simulation() {

    useEffect(() => {
        const fetchScenarios = async () => {
            try {
                const accessToken = localStorage.getItem("accessToken");
                const response = await fetch(
                    `${API_URL}/simulations/scenarios`,
                    {
                        method: "GET",
                        headers: {
                            Authorization:
                                `Bearer ${accessToken}`,
                        },
                    }
                );

                if (!response.ok) {
                    throw new Error("시나리오 조회에 실패했습니다.");
                }

                const data = await response.json();
                setScenarioSettings(data);

                // 첫 번째 시나리오 기본 선택
                if (data.length > 0) {
                    setSelectedScenario(data[0].scenario_id);
                }

            } catch (error) {
                console.error("시나리오 조회 실패:", error);
            }
        };

        fetchScenarios();
    }, []);

    /* ===== 상단 헤더 - 시뮬레이션 실행  ===== */

    // 시나리오 설정
    const [scenarioSettings, setScenarioSettings] = useState([]);
    const [selectedScenario, setSelectedScenario] = useState("");
    const [simulationSpeed, setSimulationSpeed] = useState(1);
    const [simulationStatus, setSimulationStatus] = useState("대기");
    const [simulationTime, setSimulationTime] = useState(0);

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
            .map((value) => String(value).padStart(2, "0"))
            .join(":");
    };

    // 시뮬레이션 시나리오 선택 (저장된 설정값 불러오기)
    const handleScenarioChange = (scenarioId) => {
        setSelectedScenario(scenarioId);
    };

    const [simulationId, setSimulationId] = useState(null);
    const [simulationRunId, setSimulationRunId] = useState(null);

    // 시뮬레이션 시작
    const handleStart = async () => {

        if (simulationStatus === "일시정지") {
            await handleResume();
            return;
        }

        if (!simulationId) {
            alert("실행할 시뮬레이션이 없습니다.");
            return;
        }

        if (inboundRatioTotal !== 100) {
            alert("입고 품목 구성 비율의 합계가 100%가 되어야 합니다.");
            return;
        }

        try {
            const accessToken = localStorage.getItem("accessToken");

            const response = await fetch(
                `${API_URL}/simulations/${simulationId}/start`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                const errorMessage = await response.text();

                throw new Error(errorMessage || "시뮬레이션 실행에 실패했습니다.");
            }

            const data = await response.json();

            console.log("시뮬레이션 실행 응답:", data);
            setSimulationId(data.simulationId);

            if (data.status === "RUNNING") {
                setSimulationStatus("실행");
            } else {
                setSimulationStatus(data.status);
            }

            setSimulationTime(data.simulationTime ?? 0);

            // 로봇 정보 반영
            if (Array.isArray(data.robots)) {

                setRobots((prevRobots) =>
                    prevRobots.map((robot) => {

                        const updatedRobot =
                            data.robots.find(
                                (item) =>
                                    item.robotId ===
                                    robot.robot_id
                            );

                        if (!updatedRobot) {
                            return robot;
                        }

                        return {
                            ...robot,

                            x: updatedRobot.x,
                            y: updatedRobot.y,

                            status:
                                updatedRobot.status,
                        };
                    })
                );
            }

            isPausedRef.current = false;
            movementRunRef.current += 1;

        } catch (error) {
            console.error("시뮬레이션 시작 실패:", error);
            alert(error.message || "시뮬레이션을 시작하지 못했습니다.");
        }
    };

    // 시뮬레이션 일시정지
    const handlePause = async () => {
        if (simulationStatus !== "실행" || !simulationRunId) {
            return;
        }

        try {
            const accessToken = localStorage.getItem("accessToken");

            const response = await fetch(
                `${API_URL}/simulation-runs/${simulationRunId}/pause`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error("시뮬레이션 일시정지에 실패했습니다.");
            }

            isPausedRef.current = true;
            setSimulationStatus("일시정지");

        } catch (error) {
            console.error("시뮬레이션 일시정지 실패:", error);
            alert("시뮬레이션을 일시정지하지 못했습니다.");
        }
    };

    // 시뮬레이션 재개
    const handleResume = async () => {
        if (simulationStatus !== "일시정지" || !simulationRunId) {
            return;
        }

        try {
            const accessToken = localStorage.getItem("accessToken");

            const response = await fetch(
                `${API_URL}/simulation-runs/${simulationRunId}/resume`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error("시뮬레이션 재개에 실패했습니다.");
            }

            isPausedRef.current = false;
            setSimulationStatus("실행");

        } catch (error) {
            console.error("시뮬레이션 재개 실패:", error);
            alert("시뮬레이션을 재개하지 못했습니다.");
        }
    };

    // 시뮬레이션 초기화 
    const handleReset = async () => {
        try {
            const accessToken = localStorage.getItem("accessToken");

            if (simulationRunId) {
                const response = await fetch(
                    `${API_URL}/simulation-runs/${simulationRunId}/stop`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                );

                if (!response.ok) {
                    throw new Error("시뮬레이션 중지에 실패했습니다.");
                }
            }

            movementRunRef.current += 1;
            isPausedRef.current = false;

            setRobots(
                robotsData.map((robot) => ({
                    ...robot,
                }))
            );

            setSimulationStatus("대기");
            setSimulationTime(0);
            setSimulationRunId(null);

        } catch (error) {
            console.error("시뮬레이션 초기화 실패:", error);
            alert("시뮬레이션을 초기화하지 못했습니다.");
        }
    };

    // 시뮬레이션 재계획
    const handleReplan = async () => {
        if (simulationStatus !== "실행" || !simulationRunId) {
            return;
        }

        try {
            const accessToken = localStorage.getItem("accessToken");
            setSimulationStatus("재계획");

            const response = await fetch(
                `재계획 API`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error("시뮬레이션 재계획에 실패했습니다.");
            }

            setSimulationStatus("실행");

        } catch (error) {
            console.error("시뮬레이션 재계획 실패:", error);
            setSimulationStatus("실행");
            alert("시뮬레이션 재계획에 실패했습니다.");
        }
    };

    /* ===== 로봇 ===== */
    const [robotList, setRobots] = useState(robots);
    const isPausedRef = useRef(false);

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

    // 로봇 이동
    const moveRobot = async (robotId, path) => {
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

    // Panel State
    const [inboundSettings, setInboundSettings] = useState(inbound);
    const [outboundSettings, setOutboundSettings] = useState(outbound);

    // 입고 품목 비율 합계
    const inboundRatioTotal =
        inboundSettings.products.reduce(
            (total, product) =>
                total + Number(product.ratio),
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

        const commandRequest = {
            command: command,
        };

        try {
            const accessToken = localStorage.getItem("accessToken");

            console.log("자연어 명령:", commandRequest);

            const response = await fetch(
                `${API_URL}/simulation-runs/${simulationRunId}/commands`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify(commandRequest),
                }
            );

            if (!response.ok) {
                const errorMessage = await response.text();

                throw new Error(errorMessage || "자연어 명령 처리에 실패했습니다.");
            }

            const data = await response.json();

            console.log("자연어 명령 응답:", data);
            setNaturalCommand("");

        } catch (error) {
            console.error("자연어 명령 처리 실패:", error);
            alert(error.message || "명령을 처리하지 못했습니다.");
        }
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
                                handleScenarioChange(
                                    e.target.value
                                )
                            }
                        >
                            {scenarioSettings.map(
                                (scenario) => (
                                    <option
                                        key={scenario.scenario_id}
                                        value={scenario.scenario_id}
                                    >
                                        {scenario.scenario_name}
                                    </option>
                                )
                            )}
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
                    robots={robotList}
                    simulationSpeed={simulationSpeed}
                />
            </main>

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

            <SimulationTask tasks={tasks} />

            <SimulationEvent events={events} />

            {/* 하단 footer */}
            <footer className="footer">
                Footer
            </footer>
        </div>
    );
}

export default Simulation;