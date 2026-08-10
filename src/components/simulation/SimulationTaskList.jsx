import "../../styles/simulation/SimulationTaskList.css";

const TASK_TYPE_LABEL = {
    INBOUND: "입고",
    OUTBOUND: "출고",
    CHARGING: "충전",
    RELOCATION: "재배치",
    REPLENISHMENT: "보충",
};

const TASK_STATUS_LABEL = {
    PENDING: "대기",
    ASSIGNED: "배정",
    IN_PROGRESS: "진행",
    RUNNING: "진행",
    DONE: "완료",
    COMPLETED: "완료",
    FAILED: "실패",
    CANCELLED: "취소",
};

const normalizeValue = (value) =>
    typeof value === "string" ? value.toUpperCase() : value;

// 작업 유형을 화면 표시용 문구로 변환한다.
const getTaskTypeLabel = (taskType) => {
    const normalizedType = normalizeValue(taskType);
    return TASK_TYPE_LABEL[normalizedType] ?? taskType ?? "-";
};

// 작업 상태를 화면 표시용 문구로 변환한다.
const getTaskStatusLabel = (status) => {
    const normalizedStatus = normalizeValue(status);
    return TASK_STATUS_LABEL[normalizedStatus] ?? status ?? "-";
};

// 작업 상태에 맞는 배지 클래스를 반환한다.
const getTaskStatusClass = (status) => {
    switch (normalizeValue(status)) {
        case "PENDING":
            return "status-pending";
        case "ASSIGNED":
            return "status-assigned";
        case "IN_PROGRESS":
        case "RUNNING":
            return "status-in-progress";
        case "DONE":
        case "COMPLETED":
            return "status-completed";
        case "FAILED":
            return "status-failed";
        case "CANCELLED":
            return "status-cancelled";
        default:
            return "status-default";
    }
};

// 백엔드 시간값을 시:분 형식으로 표시한다.
const formatTaskTime = (dateTime) => {
    if (!dateTime) {
        return "-";
    }

    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};

const getTaskId = (task) =>
    task.id
    ?? task.taskId
    ?? task.task_id;

const getTaskRobotId = (task) =>
    task.robotId
    ?? task.robot_id
    ?? task.assignedRobotId
    ?? task.assigned_robot_id;

const getRobotIdLabel = (robotId) => {
    if (robotId === null || robotId === undefined || robotId === "") {
        return "미배정";
    }

    const robotIdText = String(robotId);

    return robotIdText.toUpperCase().startsWith("R")
        ? robotIdText
        : `R${robotIdText}`;
};

// 작업의 출발지와 도착지를 하나의 경로 문구로 표시한다.
const getTaskRoute = (task) => {
    const startNode =
        task.startNodeCode
        ?? task.start_node_code
        ?? task.startNodeId
        ?? task.start_node_id
        ?? task.sourceNodeCode
        ?? task.source_node_code
        ?? task.sourceNodeId
        ?? task.source_node_id
        ?? task.pickupNodeCode
        ?? task.pickup_node_code
        ?? task.pickupNodeId
        ?? task.pickup_node_id;

    const endNode =
        task.endNodeCode
        ?? task.end_node_code
        ?? task.endNodeId
        ?? task.end_node_id
        ?? task.destinationNodeCode
        ?? task.destination_node_code
        ?? task.destinationNodeId
        ?? task.destination_node_id
        ?? task.dropoffNodeCode
        ?? task.dropoff_node_code
        ?? task.dropoffNodeId
        ?? task.dropoff_node_id;

    if (startNode === null || startNode === undefined) {
        return "-";
    }

    if (endNode === null || endNode === undefined) {
        return String(startNode);
    }

    return `${startNode} → ${endNode}`;
};

// 상품 정보가 없으면 기존 작업 설명을 사용하고, 둘 다 없으면 빈 값으로 둔다.
const getTaskContent = (task) =>
    task.productName
    ?? task.product_name
    ?? task.productCode
    ?? task.product_code
    ?? task.description
    ?? task.taskDescription
    ?? task.task_description
    ?? "-";

const getRequestedAt = (task) =>
    task.requestedAt
    ?? task.requested_at
    ?? task.createdAt
    ?? task.created_at;

const getAssignedAt = (task) =>
    task.assignedAt
    ?? task.assigned_at;

function SimulationTaskList({ taskList = [] }) {
    // 목록 상단에는 현재 작업 상태를 간단히 요약한다.
    const pendingCount = taskList.filter(
        (task) => normalizeValue(task.status) === "PENDING"
    ).length;

    const progressCount = taskList.filter((task) =>
        ["ASSIGNED", "IN_PROGRESS", "RUNNING"].includes(
            normalizeValue(task.status)
        )
    ).length;

    const completedCount = taskList.filter((task) =>
        ["DONE", "COMPLETED"].includes(normalizeValue(task.status))
    ).length;

    const failedCount = taskList.filter(
        (task) => normalizeValue(task.status) === "FAILED"
    ).length;

    return (
        <section className="simulation-list simulation-task-list">
            <header className="simulation-task-list-header">
                <div>
                    <h2 className="simulation-task-list-title">TASK LIST</h2>
                    <span className="simulation-task-list-count">
                        전체 {taskList.length}건
                    </span>
                </div>

                <div
                    className="simulation-task-list-summary"
                    aria-label="작업 상태 요약"
                >
                    <span>대기 {pendingCount}</span>
                    <span>진행 {progressCount}</span>
                    <span>완료 {completedCount}</span>

                    {failedCount > 0 && (
                        <span className="is-danger">
                            실패 {failedCount}
                        </span>
                    )}
                </div>
            </header>

            <div className="simulation-task-list-table-wrapper">
                <table className="simulation-task-list-table">
                    <thead>
                        <tr>
                            <th scope="col">작업 ID</th>
                            <th scope="col">유형</th>
                            <th scope="col">상품 / 내용</th>
                            <th scope="col">담당 로봇</th>
                            <th scope="col">상태</th>
                            <th scope="col">경로</th>
                            <th scope="col">요청 시간</th>
                            <th scope="col">배정 시간</th>
                        </tr>
                    </thead>

                    <tbody>
                        {taskList.length === 0 ? (
                            <tr>
                                <td
                                    className="simulation-task-list-empty"
                                    colSpan={8}
                                >
                                    현재 등록된 작업이 없습니다.
                                </td>
                            </tr>
                        ) : (
                             taskList.slice(0, 5).map((task, index) => {
                                const taskId = getTaskId(task);
                                const robotId = getTaskRobotId(task);

                                return (
                                    <tr key={taskId ?? `task-${index}`}>
                                        <td className="simulation-task-list-id">
                                            {taskId !== null
                                            && taskId !== undefined
                                                ? `#${taskId}`
                                                : "-"}
                                        </td>

                                        <td>
                                            <span className="simulation-task-list-type">
                                                {getTaskTypeLabel(
                                                    task.taskType
                                                    ?? task.task_type
                                                    ?? task.type
                                                )}
                                            </span>
                                        </td>

                                        <td className="simulation-task-list-content">
                                            {getTaskContent(task)}
                                        </td>

                                        <td className="simulation-task-list-robot">
                                            {getRobotIdLabel(robotId)}
                                        </td>

                                        <td>
                                            <span
                                                className={`simulation-task-list-status ${getTaskStatusClass(
                                                    task.status
                                                )}`}
                                            >
                                                {getTaskStatusLabel(task.status)}
                                            </span>
                                        </td>

                                        <td className="simulation-task-list-route">
                                            {getTaskRoute(task)}
                                        </td>

                                        <td className="simulation-task-list-time">
                                            {formatTaskTime(getRequestedAt(task))}
                                        </td>

                                        <td className="simulation-task-list-time">
                                            {formatTaskTime(getAssignedAt(task))}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default SimulationTaskList;
