import { useEffect, useRef, useState } from "react";
import "../styles/SimulationTask.css";

const API_URL = "http://localhost:8080/api";

function SimulationTask({ simulationRunId = null }) {
    const taskListRef = useRef(null);

    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    // 작업 전체 조회
    const fetchTasks = async () => {
        try {
            setIsLoading(true);

            const accessToken = localStorage.getItem("accessToken");

            const response = await fetch(
                `${API_URL}/tasks`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error("작업 조회에 실패했습니다.");
            }

            const data = await response.json();
            const taskList = Array.isArray(data) ? data : [];

            // 현재 시뮬레이션 작업만 표시
            if (simulationRunId !== null) {
                setTasks(taskList.filter(
                    (task) => task.simulationRunId === simulationRunId
                ));
            } else {
                setTasks(taskList);
            }

        } catch (error) {
            console.error("작업 조회 실패:", error);

        } finally {
            setIsLoading(false);
        }
    };

    // 최초 작업 조회
    useEffect(() => {
        fetchTasks();
    }, [simulationRunId]);
    
    //TaskTypeLabel
    const getTaskTypeLabel = (taskType) => {
        switch (taskType) {
            case "INBOUND":
                return "입고";

            case "OUTBOUND":
                return "출고";

            case "CHARGING":
                return "충전";

            case "RELOCATION":
                return "재배치";

            case "REPLENISHMENT":
                return "보충";

            default:
                return taskType || "-";
        }
    };

    //TaskStatusLabel
    const getTaskStatusLabel = (status) => {
        switch (status) {
            case "PENDING":
                return "대기";

            case "ASSIGNED":
                return "배정";

            case "IN_PROGRESS":
                return "진행";

            case "DONE":
                return "완료";

            case "FAILED":
                return "실패";

            case "CANCELLED":
                return "취소";

            default:
                return status || "-";
        }
    };

    // 시간 표시
    const formatTaskTime = (dateTime) => {
        if (!dateTime) {
            return "-";
        }

        const date = new Date(dateTime);

        return date.toLocaleTimeString(
            "ko-KR",
            {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }
        );
    };

    // 작업 개수
    const pendingCount = tasks.filter((task) => task.status === "PENDING").length;
    const progressCount = tasks.filter((task) => task.status === "ASSIGNED" || task.status === "IN_PROGRESS").length;
    const completedCount = tasks.filter((task) => task.status === "DONE").length;
    const failedCount = tasks.filter((task) => task.status === "FAILED").length;

    // 카드 좌우 이동
    const scrollTaskCards = (direction) => {
        const container = taskListRef.current;

        if (!container) {
            return;
        }

        const card = container.querySelector(".simulation-task-card");

        if (!card) {
            return;
        }

        const cardWidth = card.offsetWidth;
        const gap = 12;
        const scrollAmount = cardWidth + gap;

        container.scrollBy({
            left:
                direction === "left"
                    ? -scrollAmount
                    : scrollAmount,

            behavior: "smooth",
        });
    };

    const handleTaskScrollLeft = () => { scrollTaskCards("left"); };
    const handleTaskScrollRight = () => { scrollTaskCards("right"); };

    return (
        <section className="simulation-task">

            {/* 작업 현황 헤더 */}
            <div className="simulation-task-header">
                <h2 className="simulation-task-title">
                    작업 현황
                </h2>

                <div className="simulation-task-summary">
                    <span>대기 {pendingCount}</span>
                    <span>진행 {progressCount}</span>
                    <span>완료 {completedCount}</span>

                    {failedCount > 0 && (
                        <span className="task-summary-failed">
                            실패 {failedCount}
                        </span>
                    )}
                </div>
            </div>


            {/* 작업 카드 영역 */}
            <div className="simulation-task-card-area">

                {/* 왼쪽 버튼 */}
                <button
                    type="button"
                    className="simulation-task-scroll-button"
                    onClick={handleTaskScrollLeft}
                    aria-label="이전 작업"
                >
                    ‹
                </button>

                {/* 작업 목록 */}
                <div
                    className="simulation-task-list"
                    ref={taskListRef}
                >
                    {tasks.length === 0 ? (
                        <div className="simulation-task-empty">
                            현재 등록된 작업이 없습니다.
                        </div>
                    ) : (
                        tasks.map((task) => (
                            <article
                                key={task.id}
                                className="simulation-task-card"
                            >
                                {/* 카드 헤더 */}
                                <div className="simulation-task-card-header">
                                    <div className="simulation-task-card-title">
                                        <strong>
                                            Task #{task.id}
                                        </strong>
                                        <span className="simulation-task-type">
                                            {getTaskTypeLabel(
                                                task.taskType
                                            )}
                                        </span>
                                    </div>

                                    <span
                                        className={`simulation-task-status ${task.status
                                            ? `status-${task.status.toLowerCase()}`
                                            : "status-default"
                                            }`}
                                    >
                                        {getTaskStatusLabel(task.status)}
                                    </span>
                                </div>

                                {/* 담당 로봇 */}
                                <div className="simulation-task-info">
                                    <span className="simulation-task-info-label">
                                        담당 로봇
                                    </span>
                                    <strong>
                                        {task.robotId
                                            ? `R${task.robotId}`
                                            : "미배정"}
                                    </strong>
                                </div>

                                {/* 이동 경로 */}
                                <div className="simulation-task-route">
                                    <div className="simulation-task-node">
                                        <span className="simulation-task-node-label">
                                            출발
                                        </span>
                                        <strong>{task.startNodeId}</strong>
                                    </div>

                                    <span className="simulation-task-route-arrow">
                                        →
                                    </span>

                                    <div className="simulation-task-node">
                                        <span className="simulation-task-node-label">
                                            도착
                                        </span>
                                        <strong>{task.endNodeId}</strong>
                                    </div>
                                </div>

                                {/* 시간 */}
                                <div className="simulation-task-time">
                                    <div>
                                        <span>요청</span>
                                        <strong>{formatTaskTime(task.requestedAt)}</strong>
                                    </div>

                                    <div>
                                        <span>배정</span>
                                        <strong>{formatTaskTime(task.assignedAt)}</strong>
                                    </div>
                                </div>
                            </article>
                        ))
                    )}
                </div>

                {/* 오른쪽 버튼 */}
                <button
                    type="button"
                    className="simulation-task-scroll-button"
                    onClick={handleTaskScrollRight}
                    aria-label="다음 작업"
                >
                    ›
                </button>
            </div>
        </section>
    );
}

export default SimulationTask;