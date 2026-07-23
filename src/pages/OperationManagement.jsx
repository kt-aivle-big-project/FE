import { useState } from "react";
import "../styles/operationManagement.css";
import { data } from "react-router-dom";

const tasks = [
    {
        task_code: "T1",
        task_name: "피킹",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "진행",
        started: "00:00",
        ended: "00:00",
    },
    {
        task_code: "T2",
        task_name: "피킹",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "진행",
        started: "00:00",
        ended: "00:00",
    },
    {
        task_code: "T3",
        task_name: "분류",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "지연",
        started: "00:00",
        ended: "00:00",
    },
    {
        task_code: "T4",
        task_name: "분류",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "대기",
        started: "00:00",
        ended: "00:00",
    },
    {
        task_code: "T5",
        task_name: "운송",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "진행 중",
        started: "00:00",
        ended: "00:00",
    },
    {
        task_code: "T5",
        task_name: "포장",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "완료",
        started: "00:00",
        ended: "00:00",
    },
    {
        task_code: "T5",
        task_name: "포장",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "완료",
        started: "00:00",
        ended: "00:00",
    },
    {
        task_code: "T5",
        task_name: "운송",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "진행",
        started: "00:00",
        ended: "00:00",
    },
    {
        task_code: "T5",
        task_name: "피킹",
        start_node: "시작 위치",
        end_node: "도착 위치",
        robot_id: "R1",
        status: "진행",
        started: "00:00",
        ended: "00:00",
    },
]

const alerts = [
    {
        alerts_id: "A1",
        status: "심각",
        alerts_name: "알림 제목",
        description: "설명",
        createdAt: "00:00:00",
        unread: true,
    },
    {
        alerts_id: "A2",
        status: "심각",
        alerts_name: "알림 제목",
        description: "설명",
        createdAt: "00:00:00",
        unread: true,
    }, {
        alerts_id: "A3",
        status: "경고",
        alerts_name: "알림 제목",
        description: "설명",
        createdAt: "00:00:00",
        unread: true,
    }, {
        alerts_id: "A4",
        status: "경고",
        alerts_name: "알림 제목",
        description: "설명",
        createdAt: "00:00:00",
        unread: false,
    }, {
        alerts_id: "A5",
        status: "경고",
        alerts_name: "알림 제목",
        description: "설명",
        createdAt: "00:00:00",
        unread: false,
    },
];

const robots = [
    {
        robot_id: "R1",
        node_id: "N1",
        task_code: "T1",
        battery: 50,
        status: "작업 중",
    },
    {
        robot_id: "R2",
        node_id: "N2",
        task_code: "T2",
        battery: 60,
        status: "지연",
    },
    {
        robot_id: "R3",
        node_id: "N3",
        task_code: "T3",
        battery: 100,
        status: "대기",
    },
    {
        robot_id: "R4",
        node_id: "N4",
        task_code: "T4",
        battery: 20,
        status: "충전 필요",
    },
    {
        robot_id: "R5",
        node_id: "N5",
        task_code: "T5",
        battery: 10,
        status: "충전 필요",
    },
]



function OperationManagement() {

    //상단 날짜 선택
    const [selectedDate, setSelectedDate] = useState("2026-07-21");

    //작업 현황
    const [selectedTask, setSelectedTask] = useState(null);

    const handleView = (task) => {
        setSelectedTask(task);
    };

    const handleClose = () => {
        setSelectedTask(null);
    };


    //알림
    const handleAlertView = (alertId) => {
        console.log(`${alertId}번 알림 상세 조회`);
    };

    const handleAllAlerts = () => {
        console.log("전체 알림 조회");
    };

    //작업 타임라인
    const getTimelineStatusClass = (status) => {
        switch (status) {
            case "진행":
                return "timeline-progress";

            case "지연":
                return "timeline-delay";

            case "대기":
                return "timeline-waiting";

            case "완료":
                return "timeline-complete";

            default:
                return "timeline-waiting";
        }
    };

    return (
        <div className="operation-management">
            <div className="management-header">
                <h1>운영 관리</h1>
            </div>
            <div className="operation-filter">
                <div className="date-select">
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="date-input"
                    />
                </div>
                <select className="time-select">
                    <option>00:00 ~ 12:00</option>
                    <option>12:00 ~ 00:00</option>
                </select>
                <select className="warehouse-select">
                    <option>전체 창고</option>
                    <option>A 창고</option>
                    <option>B 창고</option>
                </select>
            </div>

            <div className="operation-list">
                <div className="operation-list-card">
                    <span>진행 작업</span>
                    <strong>건</strong>
                </div>
                <div className="operation-list-card">
                    <span>대기 작업</span>
                    <strong>건</strong>
                </div>
                <div className="operation-list-card">
                    <span>지연 작업</span>
                    <strong>건</strong>
                </div>
                <div className="operation-list-card">
                    <span>충전 필요 로봇</span>
                    <strong>대</strong>
                </div>
                <div className="operation-list-card">
                    <span>긴급 알림</span>
                    <strong>건</strong>
                </div>
            </div>

            {/* 실시간 작업 현황 */}
            <section className="task-queue-section">
                <h3>실시간 작업 큐</h3>

                <table className="task-table">
                    <thead>
                        <tr>
                            <th>작업 ID</th>
                            <th>작업명</th>
                            <th>출발 위치</th>
                            <th>도착 위치</th>
                            <th>할당 로봇</th>
                            <th>상태</th>
                            <th>시작 시간</th>
                            <th>예상 완료</th>
                        </tr>
                    </thead>

                    <tbody>
                        {tasks.map((task) => (
                            <tr
                                key={task.task_code}
                                className="task-row"
                                onClick={() => handleView(task)}
                            >
                                <td>{task.task_code}</td>
                                <td>{task.task_name}</td>
                                <td>{task.start_node}</td>
                                <td>{task.end_node}</td>
                                <td>{task.robot_id}</td>

                                <td>
                                    <span
                                        className={`task-status status-${task.status.replaceAll(
                                            " ",
                                            "-"
                                        )}`}
                                    >
                                        {task.status}
                                    </span>
                                </td>

                                <td>{task.started}</td>

                                <td className={task.status === "지연" ? "delayed" : ""}>
                                    {task.ended}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
            {selectedTask && (
                <div className="modal-overlay" onClick={handleClose}>
                    <div
                        className="task-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="task-modal-header">
                            <div>
                                <h2>작업 상세</h2>
                                <span>{selectedTask.task_code}</span>
                            </div>
                        </div>

                        <div className="task-modal-body">
                            <div className="task-detail-row">
                                작업 상세 정보
                            </div>
                        </div>

                        <div className="task-modal-footer">
                            <button
                                type="button"
                                onClick={handleClose}
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <section className="alert-section">
                <div className="alert-header">
                    <h3>알림</h3>
                    <button
                        type="button"
                        className="alert-view-all"
                        onClick={handleAllAlerts}
                    >
                        전체 보기 <span>➡️</span>
                    </button>
                </div>

                <div className="alert-list">
                    {alerts.map((alert) => (
                        <button
                            type="button"
                            className="alert-item"
                            key={alert.alerts_id}
                            onClick={() => handleAlertView(alert.alerts_id)}
                        >

                            <span
                                className={`alert-status alert-status-${alert.status.replaceAll(
                                    " ",
                                    "-"
                                )}`}
                            >
                                {alert.status}
                            </span>

                            <div className="alert-content">
                                <strong>{alert.alerts_name}</strong>
                                <span>{alert.description}</span>
                            </div>

                            <div className="alert-meta">
                                <time>{alert.createdAt}</time>

                                {alert.unread && (
                                    <span
                                        className="alert-unread"
                                        aria-label="읽지 않은 알림"
                                    />
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    className="alert-footer-button"
                    onClick={handleAllAlerts}
                >
                    모든 알림 보기 <span>➡️</span>
                </button>
            </section>

            <section className="robot-section">
                <h3>실시간 로봇 현황</h3>
                <div className="robot-table">
                    <thead>
                        <tr>
                            <th>로봇 ID</th>
                            <th>현재 위치</th>
                            <th>현재 작업</th>
                            <th>배터리</th>
                            <th>상태</th>
                        </tr>
                    </thead>

                    <tbody>
                        {robots.map((robot) => (
                            <tr key={robot.robot_id}>
                                <td>{robot.robot_id}</td>

                                <td>{robot.node_id}</td>

                                <td>{robot.task_code}</td>

                                <td>
                                    <div className="battery-info">
                                        <span>{robot.battery}%</span>

                                        <div className="battery-bar">
                                            <div
                                                className={`battery-level ${robot.battery <= 20
                                                    ? "battery-low"
                                                    : ""
                                                    }`}
                                                style={{
                                                    width: `${robot.battery}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </td>

                                <td>
                                    <span
                                        className={`robot-status robot-status-${robot.status.replaceAll(
                                            " ",
                                            "-"
                                        )}`}
                                    >
                                        {robot.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </div>
                <button
                    type="button"
                    className="robot-view-all"
                >
                    전체 로봇 보기 ➡️
                </button>
            </section>

            <section className="task-timeline">
                <div className="task-timeling-header">
                    <h3>작업 타임라인</h3>

                    <select defaultValue="2">
                        <option value="1">1시간</option>
                        <option value="2">2시간</option>
                        <option value="4">4시간</option>
                        <option value="8">8시간</option>
                    </select>
                </div>

                <div className="timeline-time-area">
                    <span style={{ left: "0%" }}>10:00</span>
                    <span style={{ left: "25%" }}>10:30</span>
                    <span style={{ left: "50%" }}>11:00</span>
                    <span style={{ left: "75%" }}>11:30</span>
                    <span style={{ left: "100%" }}>12:00</span>
                </div>

                <div className="timeline-list">
                    {tasks.length > 0 ? (
                        tasks.map((task, index) => {
                            // started, ended가 모두 00:00이므로
                            // 현재는 배열 순서에 따라 임시 위치를 표시
                            const left = Math.min(index * 5, 40);

                            const width =
                                task.status === "지연"
                                    ? 35
                                    : task.status === "대기"
                                        ? 20
                                        : 30;

                            const endPosition = Math.min(left + width, 94);

                            return (
                                <div
                                    className="timeline-row"
                                    key={`${task.task_code}-${index}`}
                                >
                                    <div className="timeline-task-name">
                                        <strong>{task.task_code}</strong>

                                        <span>{task.task_name}</span>

                                        <small>{task.robot_id}</small>
                                    </div>

                                </div>
                            );
                        })
                    ) : (
                        <div className="timeline-empty">
                            등록된 작업이 없습니다.
                        </div>
                    )}
                </div>

                <div className="timeline-legend">
                    <div>
                        <span className="legend-dot waiting-dot"></span>
                        대기
                    </div>

                    <div>
                        <span className="legend-dot progress-dot"></span>
                        진행 중
                    </div>

                    <div>
                        <span className="legend-dot delay-dot"></span>
                        지연
                    </div>

                    <div>
                        <span className="legend-dot complete-dot"></span>
                        완료
                    </div>

                    <div>
                        <span className="legend-warning">▲</span>
                        문제 발생
                    </div>
                </div>
            </section>


            <section className="passivity-control">
                <h3>수동</h3>
            </section>
        </div>

    )
}

export default OperationManagement;