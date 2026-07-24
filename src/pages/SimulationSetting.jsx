import { useState } from "react";
import "../styles/simulationSetting.css";

import scenarios from "../data/scenarios.json";

function SimulationSetting() {

    /* =========================================================
       시나리오 설정
    ========================================================= */

    // 첫 번째 시나리오를 기본값으로 사용
    const defaultScenario = scenarios[0] ?? {
        scenario_id: "",
        scenario_name: "",
        robot_count: 1,
        initial_battery: 100,
        charging_threshold: 20,
        auto_replan: true,
    };


    // 시나리오 목록
    const [scenarioSettings, setScenarioSettings] = useState(scenarios);

    // 선택된 시나리오
    const [selectedScenario, setSelectedScenario] = useState(
        defaultScenario.scenario_id
    );

    // 시나리오 설정값
    const [robotCount, setRobotCount] = useState(
        defaultScenario.robot_count
    );

    const [initialBattery, setInitialBattery] = useState(
        defaultScenario.initial_battery
    );

    const [chargingThreshold, setChargingThreshold] = useState(
        defaultScenario.charging_threshold
    );

    const [autoReplan, setAutoReplan] = useState(
        defaultScenario.auto_replan
    );


    /* =========================================================
       시나리오 선택
    ========================================================= */

    const handleScenarioChange = (scenarioId) => {

        const selectedSetting = scenarioSettings.find(
            (scenario) =>
                scenario.scenario_id === scenarioId
        );

        if (!selectedSetting) {
            return;
        }

        setSelectedScenario(scenarioId);

        setRobotCount(selectedSetting.robot_count);
        setInitialBattery(selectedSetting.initial_battery);
        setChargingThreshold(selectedSetting.charging_threshold);
        setAutoReplan(selectedSetting.auto_replan);
    };


    /* =========================================================
       로봇 수
    ========================================================= */

    const decreaseRobotCount = () => {
        setRobotCount((count) =>
            Math.max(1, count - 1)
        );
    };

    const increaseRobotCount = () => {
        setRobotCount((count) =>
            Math.min(10, count + 1)
        );
    };


    /* =========================================================
       시나리오 설정 저장
    ========================================================= */

    const handleSaveScenarioSetting = () => {

        const selectedSetting = scenarioSettings.find(
            (scenario) =>
                scenario.scenario_id === selectedScenario
        );

        if (!selectedSetting) {
            alert("선택된 시나리오가 없습니다.");
            return;
        }

        const updatedScenario = {
            scenario_id: selectedScenario,
            scenario_name: selectedSetting.scenario_name,
            robot_count: robotCount,
            initial_battery: initialBattery,
            charging_threshold: chargingThreshold,
            auto_replan: autoReplan,
        };

        setScenarioSettings((currentSettings) =>
            currentSettings.map((scenario) =>
                scenario.scenario_id === selectedScenario
                    ? updatedScenario
                    : scenario
            )
        );

        console.log(
            "저장할 시나리오:",
            updatedScenario
        );

        // 추후 백엔드 저장 API 연결

        alert(
            `${updatedScenario.scenario_name} 설정이 저장되었습니다.`
        );
    };


    return (
        <section className="simulation-setting">

            <h2>시나리오 설정</h2>

            <div className="simulation-setting-content">

                {/* 시나리오 */}
                <div className="setting-item">

                    <label>시나리오</label>

                    <select
                        value={selectedScenario}
                        onChange={(e) =>
                            handleScenarioChange(
                                e.target.value
                            )
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


                {/* 로봇 수 */}
                <div className="setting-item">

                    <label>로봇 수</label>

                    <div className="robot-count-control">

                        <button
                            type="button"
                            onClick={decreaseRobotCount}
                        >
                            -
                        </button>

                        <span>
                            {robotCount}
                        </span>

                        <button
                            type="button"
                            onClick={increaseRobotCount}
                        >
                            +
                        </button>

                    </div>

                </div>


                {/* 초기 배터리 */}
                <div className="setting-item">

                    <label>초기 배터리</label>

                    <select
                        value={initialBattery}
                        onChange={(e) =>
                            setInitialBattery(
                                Number(e.target.value)
                            )
                        }
                    >
                        <option value={100}>100%</option>
                        <option value={80}>80%</option>
                        <option value={60}>60%</option>
                        <option value={40}>40%</option>
                        <option value={30}>30%</option>
                        <option value={20}>20%</option>
                    </select>

                </div>


                {/* 충전 기준 */}
                <div className="setting-item">

                    <label>충전 기준</label>

                    <select
                        value={chargingThreshold}
                        onChange={(e) =>
                            setChargingThreshold(
                                Number(e.target.value)
                            )
                        }
                    >
                        <option value={10}>10%</option>
                        <option value={20}>20%</option>
                        <option value={30}>30%</option>
                        <option value={40}>40%</option>
                    </select>

                </div>


                {/* 자동 재계획 */}
                <div className="setting-item">

                    <label>자동 재계획</label>

                    <input
                        type="checkbox"
                        checked={autoReplan}
                        onChange={(e) =>
                            setAutoReplan(
                                e.target.checked
                            )
                        }
                    />

                </div>


                {/* 저장 */}
                <button
                    type="button"
                    className="simulation-setting-save"
                    onClick={handleSaveScenarioSetting}
                >
                    설정 저장
                </button>

            </div>

        </section>
    );
}

export default SimulationSetting;