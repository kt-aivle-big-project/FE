import "../styles/RobotManagement.css";

function RobotManagement() {
    const robots = [
        {
            id: 1,
            name: "로봇1",
            currentTask: "입고 작업",
            currentPosition: "A-12",
            nextTask: "B-04 이동",
            battery: 82,
            status: "WORKING",
        },
        {
            id: 2,
            name: "로봇2",
            currentTask: "출고 작업",
            currentPosition: "B-07",
            nextTask: "출고장 이동",
            battery: 64,
            status: "WORKING",
        },
        {
            id: 3,
            name: "로봇3",
            currentTask: "대기",
            currentPosition: "C-03",
            nextTask: "배정 대기",
            battery: 91,
            status: "IDLE",
        },
        {
            id: 4,
            name: "로봇4",
            currentTask: "재고 이동",
            currentPosition: "D-09",
            nextTask: "A-02 이동",
            battery: 45,
            status: "WORKING",
        },
        {
            id: 5,
            name: "로봇5",
            currentTask: "충전 중",
            currentPosition: "충전소 1",
            nextTask: "배정 대기",
            battery: 28,
            status: "CHARGING",
        },
    ];

    const handleMoveToCharge = (robotId) => {
        console.log(`${robotId}번 로봇 충전소 이동`);
    };

    const handleStopRobot = (robotId) => {
        console.log(`${robotId}번 로봇 작업 중지`);
    };

    return (
        <div className="robot-management">
            <div className="management-header">
                <h1>로봇 관리</h1>
            </div>

            <div className="robot-list">
                {robots.map((robot) => (
                    <div className="robot-row" key={robot.id}>
                        <div className="robot-name">
                            {robot.name}
                        </div>

                        <div className="robot-info">
                            <span className="robot-info-label">
                                현재 임무
                            </span>
                            <span className="robot-info-value">
                                {robot.currentTask}
                            </span>
                        </div>

                        <div className="robot-info">
                            <span className="robot-info-label">
                                현재 위치
                            </span>
                            <span className="robot-info-value">
                                {robot.currentPosition}
                            </span>
                        </div>

                        <div className="robot-info">
                            <span className="robot-info-label">
                                다음 임무
                            </span>
                            <span className="robot-info-value">
                                {robot.nextTask}
                            </span>
                        </div>

                        <div className="robot-info">
                            <span className="robot-info-label">
                                배터리 잔량
                            </span>
                            <span className="robot-info-value">
                                {robot.battery}%
                            </span>
                        </div>

                        <div className="robot-actions">
                            <button
                                type="button"
                                className="charge-button"
                                onClick={() =>
                                    handleMoveToCharge(robot.id)
                                }
                            >
                                충전소
                            </button>

                            <button
                                type="button"
                                className="stop-button"
                                onClick={() =>
                                    handleStopRobot(robot.id)
                                }
                            >
                                작업중지
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default RobotManagement;