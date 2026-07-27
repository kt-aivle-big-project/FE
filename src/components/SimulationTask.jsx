/**
 * 시뮬레이션 작업 현황 카드 목록.
 *
 * tasks 항목 형태
 *  { task_code, task_name, start_node, end_node, robot_id, status, started, ended }
 */

// 백엔드 TaskStatus / 목업 한글 상태 → 표시 문구
const STATUS_LABEL = {
    PENDING: "대기",
    ASSIGNED: "배정",
    IN_PROGRESS: "진행",
    DONE: "완료",
    FAILED: "실패",
    CANCELLED: "취소",
};

// 상태 → CSS 클래스
const STATUS_CLASS = {
    PENDING: "status-waiting",
    ASSIGNED: "status-assigned",
    IN_PROGRESS: "status-running",
    DONE: "status-completed",
    FAILED: "status-failed",
    CANCELLED: "status-failed",

    // 목업 데이터(한글 상태) 대응
    대기: "status-waiting",
    진행: "status-running",
    "진행 중": "status-running",
    지연: "status-failed",
    완료: "status-completed",
};

// 작업 유형 표시
const TYPE_LABEL = {
    INBOUND: "입고",
    OUTBOUND: "출고",
    MOVE: "이동",
    CHARGE: "충전",
};

function SimulationTask({ tasks = [] }) {

    const getStatusLabel = (status) => {
        return STATUS_LABEL[status] ?? status ?? "-";
    };

    const getStatusClass = (status) => {
        return STATUS_CLASS[status] ?? "status-waiting";
    };

    const getTypeLabel = (taskName) => {
        return TYPE_LABEL[taskName] ?? taskName ?? "-";
    };

    // 진행 중 / 완료 건수 요약
    const runningCount = tasks.filter((task) =>
        task.status === "IN_PROGRESS" ||
        task.status === "진행" ||
        task.status === "진행 중"
    ).length;

    const completedCount = tasks.filter((task) =>
        task.status === "DONE" || task.status === "완료"
    ).length;

    return (
        <section className="simulation-task">

            <div className="simulation-task-header">

                <h2 className="simulation-task-title">
                    작업 현황
                </h2>

                <div className="simulation-task-summary">
                    <span>전체 {tasks.length}</span>
                    <span>진행 {runningCount}</span>
                    <span>완료 {completedCount}</span>
                </div>

            </div>


            {tasks.length === 0 ? (

                <div className="simulation-task-empty">
                    표시할 작업이 없습니다.
                </div>

            ) : (

                <div className="simulation-task-list">

                    {tasks.map((task, index) => (

                        <article
                            className="simulation-task-card"
                            key={`${task.task_code}-${index}`}
                        >

                            <div className="simulation-task-card-header">

                                <div className="simulation-task-card-title">

                                    <strong>{task.task_code}</strong>

                                    <span className="simulation-task-type">
                                        {getTypeLabel(task.task_name)}
                                    </span>

                                </div>

                                <span
                                    className={`simulation-task-status ${getStatusClass(task.status)}`}
                                >
                                    {getStatusLabel(task.status)}
                                </span>

                            </div>


                            <div className="simulation-task-info">

                                <span className="simulation-task-info-label">
                                    담당 로봇
                                </span>

                                <span>{task.robot_id ?? "-"}</span>

                            </div>


                            <div className="simulation-task-route">

                                <span>{task.start_node}</span>

                                <span className="simulation-task-route-arrow">
                                    →
                                </span>

                                <span>{task.end_node}</span>

                            </div>


                            {(task.started || task.ended) && (
                                <div className="simulation-task-order">
                                    시작 {task.started ?? "-"} / 종료 {task.ended ?? "-"}
                                </div>
                            )}

                        </article>

                    ))}

                </div>

            )}

        </section>
    );
}

export default SimulationTask;
