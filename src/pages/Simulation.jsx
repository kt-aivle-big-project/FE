import { useEffect, useState, useRef } from "react";
import "../styles/Simulation.css";
import WarehouseSVG from "../Simulation/WarehouseSVG";
import SimulationTask from "../Simulation/SimulationTask";
import SimulationEvent from "../Simulation/SimulationEvent";
import { apiFetch } from "../api/apiFetch";


import scenarios from "../data/scenarios.json";
import alerts from "../data/alerts.json";
import tasks from "../data/tasks.json";
import robots from "../data/robots.json";
import products from "../data/products.json";
import inbound from "../data/inbound.json";
import outbound from "../data/outbound.json";
import events from "../data/events.json";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

function Simulation() {

    useEffect(() => {
        const fetchScenarios = async () => {
            try {
                const accessToken = localStorage.getItem("accessToken");
                const response = await apiFetch(
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
    const [scenarioSettings, setScenarioSettings] = useState(scenarios);
    const [selectedScenario, setSelectedScenario] = useState(scenarios[0]?.scenario_id ?? "");
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

    // 시뮬레이션 시작
    const handleStart = async () => {

        if (simulationStatus === "일시정지") {
            isPausedRef.current = false;
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

            const response = await apiFetch(
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

            const response = await apiFetch(
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

            const response = await apiFetch(
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
                const response = await apiFetch(
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
            
            const response = await apiFetch(
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
                    robots={robots}
                    simulationSpeed={simulationSpeed}
                />
            </main>

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
                            onChange={(e) => setNaturalCommand(e.target.value)}
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
