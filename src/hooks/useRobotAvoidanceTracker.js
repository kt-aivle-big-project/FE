import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

const STALL_THRESHOLD_MS = 1200;
const PROGRESS_EPSILON = 0.002;
const MAX_AVOIDANCE_EVENT_COUNT = 30;

// 같은 대기 상황인지 비교한다. 대기 시간은 1초 단위로만 본다.
// (밀리초까지 비교하면 매번 값이 달라져서 갱신이 멈추지 않는다)
const avoidanceSignature = (list) => list
    .map((item) => [
        item.id,
        item.blockingRobotId,
        item.source,
        item.targetNodeCode,
        Math.floor(item.waitingSeconds),
    ].join("|"))
    .join("\n");

const CONFIRMED_WAITING_STATUSES = new Set([
    "WAITING",
    "YIELDING",
    "HOLDING",
    "WAITING_FOR_NODE",
    "WAITING_FOR_EDGE",
]);

const SERVICE_ACTIVITIES = new Set([
    "WORKING",
    "PICKING",
    "PUTAWAY",
    "RELOCATION",
    "REPLENISH",
    "CHARGING",
]);

const isFiniteNumber = (value) => (
    value !== null
    && value !== undefined
    && value !== ""
    && Number.isFinite(Number(value))
);

const isMovingRobot = (robot) => (
    Boolean(robot?.movement_step_id)
    && Boolean(robot?.from_node_code)
    && Boolean(robot?.to_node_code)
    && robot.from_node_code !== robot.to_node_code
    && isFiniteNumber(robot.movement_progress)
);

const isServiceActivity = (robot) => {
    const activity = String(
        robot?.activity ?? robot?.status ?? "",
    ).toUpperCase();

    return (
        SERVICE_ACTIVITIES.has(activity)
        || robot?.service_progress !== null
            && robot?.service_progress !== undefined
    );
};

const getKnownWaitingStatus = (robot) => {
    const status = String(
        robot?.status ?? "",
    ).toUpperCase();

    const activity = String(
        robot?.activity ?? "",
    ).toUpperCase();

    return CONFIRMED_WAITING_STATUSES.has(status)
        || CONFIRMED_WAITING_STATUSES.has(activity);
};

const findBlockingRobot = (
    waitingRobot,
    robots,
) => {
    const targetNodeCode =
        waitingRobot.to_node_code;

    if (!targetNodeCode) {
        return null;
    }

    // 목표 노드를 현재 점유하고 있는 로봇을 우선 확인한다.
    const occupyingRobot = robots.find((robot) => {
        if (
            robot.robot_id
            === waitingRobot.robot_id
        ) {
            return false;
        }

        const stationary =
            !isMovingRobot(robot);

        const occupiedNodeCode =
            robot.from_node_code
            ?? robot.node_id;

        return (
            stationary
            && occupiedNodeCode === targetNodeCode
        );
    });

    if (occupyingRobot) {
        return occupyingRobot;
    }

    // 같은 목적 노드로 접근하면서 먼저 도착할 로봇을 확인한다.
    const waitingArrival = Number(
        waitingRobot.arrival_in_seconds,
    );

    return robots.find((robot) => {
        if (
            robot.robot_id
            === waitingRobot.robot_id
            || !isMovingRobot(robot)
            || robot.to_node_code
                !== targetNodeCode
        ) {
            return false;
        }

        const otherArrival = Number(
            robot.arrival_in_seconds,
        );

        return (
            Number.isFinite(waitingArrival)
            && Number.isFinite(otherArrival)
            && otherArrival < waitingArrival
        );
    }) ?? null;
};

const createAvoidanceId = (robot) => (
    [
        "AVOIDANCE_WAIT",
        robot.robot_id,
        robot.movement_step_id
            ?? robot.to_node_code
            ?? robot.node_id
            ?? "unknown",
    ].join(":")
);

const createAvoidanceEvent = (
    avoidance,
    occurredAt,
) => ({
    id: `${avoidance.id}-${occurredAt}`,
    avoidanceId: avoidance.id,
    eventType: "COLLISION_AVOIDANCE_WAIT",
    occurredAt,
    description: avoidance.message,
    robotId: avoidance.robotId,
    robotIds: avoidance.blockingRobotId
        ? [
            avoidance.robotId,
            avoidance.blockingRobotId,
        ]
        : [avoidance.robotId],
    taskId: avoidance.taskId,
    nodeId: avoidance.targetNodeCode,
    severity: "INFO",
    source: avoidance.source,
    waitingStartedAt: occurredAt,
    waitingSeconds: 0,
    resolvedAt: null,
});

export default function useRobotAvoidanceTracker(
    robots = [],
    isRunning = false,
) {
    const robotSnapshotRef = useRef(new Map());
    const activeAvoidanceIdsRef =
        useRef(new Set());

    const [
        avoidanceStates,
        setAvoidanceStates,
    ] = useState([]);

    const [
        avoidanceEvents,
        setAvoidanceEvents,
    ] = useState([]);

    // 인터벌 안에서 최신 robots 를 읽되,
    // robots 가 바뀔 때마다 인터벌을 다시 만들지는 않는다.
    const robotsRef = useRef(robots);
    robotsRef.current = robots;

    // 로봇 상태 메시지가 갱신될 때 마지막으로 실제 이동한 시각을 기록한다.
    useEffect(() => {
        const now = performance.now();
        const currentRobotIds = new Set();

        robots.forEach((robot) => {
            currentRobotIds.add(robot.robot_id);

            const previous =
                robotSnapshotRef.current.get(
                    robot.robot_id,
                );

            const movementChanged =
                previous?.movementStepId
                    !== robot.movement_step_id;

            const progressChanged =
                !previous
                || Math.abs(
                    Number(
                        robot.movement_progress ?? 0,
                    )
                    - Number(
                        previous.progress ?? 0,
                    ),
                ) > PROGRESS_EPSILON;

            const lastMovedAt =
                movementChanged || progressChanged
                    ? now
                    : previous?.lastMovedAt ?? now;

            robotSnapshotRef.current.set(
                robot.robot_id,
                {
                    movementStepId:
                        robot.movement_step_id,
                    progress:
                        robot.movement_progress,
                    lastMovedAt,
                },
            );
        });

        [...robotSnapshotRef.current.keys()]
            .filter(
                (robotId) =>
                    !currentRobotIds.has(robotId),
            )
            .forEach((robotId) => {
                robotSnapshotRef.current.delete(
                    robotId,
                );
            });
    }, [robots]);

    // 진행률이 멈춘 시간을 계속 계산하기 위해 짧은 주기로 상태를 갱신한다.
    useEffect(() => {
        if (!isRunning) {
            setAvoidanceStates((previous) => (
                previous.length === 0 ? previous : []
            ));
            return undefined;
        }

        const updateAvoidanceStates = () => {
            const now = performance.now();
            const currentRobots = robotsRef.current;

            const nextStates = currentRobots.flatMap(
                (robot) => {
                    if (
                        !isMovingRobot(robot)
                        || isServiceActivity(robot)
                    ) {
                        return [];
                    }

                    const snapshot =
                        robotSnapshotRef.current.get(
                            robot.robot_id,
                        );

                    if (!snapshot) {
                        return [];
                    }

                    const backendWaiting =
                        getKnownWaitingStatus(robot);

                    const stalledMillis =
                        now - snapshot.lastMovedAt;

                    const inferredWaiting =
                        stalledMillis
                            >= STALL_THRESHOLD_MS;

                    if (
                        !backendWaiting
                        && !inferredWaiting
                    ) {
                        return [];
                    }

                    const blockingRobot =
                        findBlockingRobot(
                            robot,
                            currentRobots,
                        );

                    const source =
                        backendWaiting
                            ? "BACKEND"
                            : "INFERRED";

                    const targetNodeCode =
                        robot.waiting_node_code
                        ?? robot.to_node_code
                        ?? null;

                    const waitingSeconds =
                        Math.max(
                            0,
                            stalledMillis / 1000,
                        );

                    const reason =
                        robot.waiting_reason
                        ?? (
                            source === "BACKEND"
                                ? "통행 순서 대기"
                                : "이동 정체 감지"
                        );

                    const blockingRobotId =
                        robot.blocking_robot_id
                        ?? blockingRobot?.robot_id
                        ?? null;

                    const message =
                        blockingRobotId
                            ? `R${robot.robot_id}이 `
                                + `R${blockingRobotId}의 통과를 기다리며 `
                                + `${targetNodeCode ?? "-"} 노드 진입 전 대기 중입니다.`
                            : `R${robot.robot_id}이 `
                                + `${targetNodeCode ?? "-"} 노드 진입 전 `
                                + "통행 순서를 기다리는 중입니다.";

                    return [{
                        id: createAvoidanceId(robot),
                        robotId: robot.robot_id,
                        robotCode:
                            robot.robot_code
                            ?? `R${robot.robot_id}`,
                        taskId:
                            robot.current_task_id
                            ?? null,
                        currentNodeCode:
                            robot.from_node_code
                            ?? robot.node_id
                            ?? null,
                        targetNodeCode,
                        blockingRobotId,
                        waitingSeconds,
                        reason,
                        source,
                        message,
                    }];
                },
            );

            // 내용이 같으면 이전 배열을 그대로 반환해 불필요한 리렌더를 막는다.
            setAvoidanceStates((previous) => (
                avoidanceSignature(previous)
                    === avoidanceSignature(nextStates)
                    ? previous
                    : nextStates
            ));
        };

        updateAvoidanceStates();

        const timerId = window.setInterval(
            updateAvoidanceStates,
            250,
        );

        return () => {
            window.clearInterval(timerId);
        };
    }, [isRunning]);

    // 대기 시작은 새 이벤트로 만들고, 다시 이동하면 해결 처리한다.
    useEffect(() => {
        const currentIds = new Set(
            avoidanceStates.map(
                (avoidance) => avoidance.id,
            ),
        );

        const previousIds =
            activeAvoidanceIdsRef.current;

        const newAvoidances =
            avoidanceStates.filter(
                (avoidance) =>
                    !previousIds.has(avoidance.id),
            );

        const resolvedIds = new Set(
            [...previousIds].filter(
                (id) => !currentIds.has(id),
            ),
        );

        if (
            newAvoidances.length > 0
            || resolvedIds.size > 0
            || avoidanceStates.length > 0
        ) {
            const nowIso =
                new Date().toISOString();

            setAvoidanceEvents(
                (previousEvents) => {
                    // 실제로 바뀐 게 없으면 이전 배열을 그대로 돌려준다.
                    let changed =
                        newAvoidances.length > 0
                        || resolvedIds.size > 0;

                    let nextEvents =
                        previousEvents.map(
                            (event) => {
                                const activeState =
                                    avoidanceStates.find(
                                        (avoidance) =>
                                            avoidance.id
                                            === event.avoidanceId,
                                    );

                                if (activeState) {
                                    if (
                                        event.description
                                            === activeState.message
                                        && event.waitingSeconds
                                            === activeState.waitingSeconds
                                    ) {
                                        return event;
                                    }

                                    changed = true;

                                    return {
                                        ...event,
                                        description:
                                            activeState.message,
                                        waitingSeconds:
                                            activeState.waitingSeconds,
                                    };
                                }

                                if (
                                    !event.resolvedAt
                                    && resolvedIds.has(
                                        event.avoidanceId,
                                    )
                                ) {
                                    changed = true;

                                    return {
                                        ...event,
                                        resolvedAt: nowIso,
                                    };
                                }

                                return event;
                            },
                        );

                    if (!changed) {
                        return previousEvents;
                    }

                    const createdEvents =
                        newAvoidances.map(
                            (avoidance) =>
                                createAvoidanceEvent(
                                    avoidance,
                                    nowIso,
                                ),
                        );

                    nextEvents = [
                        ...createdEvents,
                        ...nextEvents,
                    ];

                    return nextEvents.slice(
                        0,
                        MAX_AVOIDANCE_EVENT_COUNT,
                    );
                },
            );
        }

        activeAvoidanceIdsRef.current =
            currentIds;
    }, [avoidanceStates]);

    const avoidanceByRobotId = useMemo(
        () => new Map(
            avoidanceStates.map(
                (avoidance) => [
                    avoidance.robotId,
                    avoidance,
                ],
            ),
        ),
        [avoidanceStates],
    );

    return {
        avoidanceStates,
        avoidanceEvents,
        avoidanceByRobotId,
    };
}