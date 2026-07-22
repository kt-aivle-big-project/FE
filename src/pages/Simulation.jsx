import { useState } from "react";
import "../styles/simulation.css";



function Simulation() {

    //하단 robotCount
    const [robotCount, setRobotCount] = useState(1);

    const decreaseRobotCount = () => {
        setRobotCount((count) => Math.max(1, count - 1));
    };

    const increaseRobotCount = () => {
        setRobotCount((count) => Math.min(20, count + 1));
    };


    return (
        <div className="simulation-wrapper">

            {/* 상단 헤더 */}
            <header className="header">
                <div className="header-title">
                    시뮬레이션 실행
                </div>

                <div className="header-item">
                    <div>
                        <div className="item-label">현재 시나리오</div>
                        <div className="item-name">시나리오 v1</div>
                    </div>
                </div>

                <div className="header-item">
                    <div>
                        <div className="item-label">시뮬레이션 상태</div>
                        <button className="item-button">실행중</button>
                    </div>
                </div>

                <div className="header-item">
                    <div>
                        <div className="item-label">현재 시간</div>
                        <div className="item-name">00:00:00</div>
                    </div>
                </div>

                <div className="header-button">
                    <button type="button">시작</button>
                    <button type="button">일시정지</button>
                    <button type="button">초기화</button>
                    <button type="button">재계획</button>
                </div>

                <div className="profile">
                    <div className="profile-icon"></div>
                </div>
            </header>

            {/* 시뮬레이션 화면 */}
            <main className="simulation-view">
                창고 화면
            </main>

            {/* 오른쪽 패널 */}
            <aside className="simulation-panel">
                <div className="panel-group">

                    <div className="natural-language">
                        자연어 입력

                        <div className="textarea">
                            <textarea
                                placeholder="명령 입력"
                            />

                            <button
                                type="button"
                                className="input-button"
                            >
                                입력
                            </button>
                        </div>
                    </div>

                    <div className="receiving">
                        입고량
                        <select>
                            <option></option>
                        </select>
                    </div>

                    <div className="shipping">
                        출고량
                        <select>
                            <option></option>
                        </select>
                    </div>

                    <div className="item">
                        물품 분류
                        <select>
                            <option></option>
                        </select>
                    </div>

                    <div className="task">
                        작업 분류
                        <select>
                            <option></option>
                        </select>
                    </div>

                </div>
            </aside>

            {/* 작업 현황 */}
            <section className="simulation-task">
                <div className="task-section">

                    <div className="section-title">
                        작업 현황
                    </div>

                    <div className="task-list">
                        <div className="task-card">
                            R1 실행중인 작업
                        </div>

                        <div className="task-card">
                            R2 실행중인 작업
                        </div>

                        <div className="task-card">
                            R3 실행중인 작업
                        </div>

                        <div className="task-card">
                            R4 실행중인 작업
                        </div>

                        <div className="task-card">
                            R5 실행중인 작업
                        </div>
                    </div>

                </div>
            </section>

            {/* 시뮬레이션 설정 */}
            <section className="simulation-setting">
                <div className="section-title">
                    시뮬레이션 설정
                </div>

                <div className="setting-item">
                    <label>로봇 수</label>

                    <div className="robot-count">
                        <button
                            type="button"
                            onClick={decreaseRobotCount}
                        >
                            -
                        </button>

                        <input
                            type="number"
                            id="robotCount"
                            value={robotCount}
                            min={1}
                            max={20}
                            readOnly
                        />

                        <button
                            type="button"
                            onClick={increaseRobotCount}
                        >
                            +
                        </button>
                    </div>
                </div>

                <div className="setting-item">
                    <label>시뮬레이션 속도</label>

                    <select>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                    </select>
                </div>

                <div className="setting-item">
                    <label>배터리</label>

                    <select>
                        <option></option>
                    </select>
                </div>

                <div className="setting-item">
                    <label>시나리오 선택</label>

                    <select>
                        <option value="scenario1">
                            시나리오 v1
                        </option>

                        <option value="scenario2">
                            시나리오 v2
                        </option>

                        <option value="scenario3">
                            시나리오 v3
                        </option>
                    </select>
                </div>

                <button
                    type="button"
                    className="save-button"
                >
                    설정 저장
                </button>
            </section>

            {/* 하단 footer */}
            <footer className="footer">
                Footer
            </footer>
        </div>
    );
}

export default Simulation;