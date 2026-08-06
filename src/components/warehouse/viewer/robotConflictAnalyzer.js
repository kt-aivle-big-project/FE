// 동일 방향 엣지에서 두 로봇의 진행률 차이가 이 값 이하면 근접 위험으로 판단한다.
const SAME_EDGE_PROGRESS_THRESHOLD = 0.15;

// 같은 목적 노드의 예상 도착 시간 차이가 이 값 이하면 동시 접근 위험으로 판단한다.
const SAME_NODE_ARRIVAL_THRESHOLD_SECONDS = 1;

/**
 * null, undefined, 문자열 숫자를 포함해 유효한 숫자인지 확인한다.
 */
const isFiniteNumber = (value) => {
    if (value === null || value === undefined || value === "") {
        return false;
    }

    return Number.isFinite(Number(value));
};

/**
 * 로봇이 현재 노드 사이를 이동 중인지 확인한다.
 */
const isMovingRobot = (robot) => (
    Boolean(robot?.movement_step_id)
    && Boolean(robot?.from_node_code)
    && Boolean(robot?.to_node_code)
    && robot.from_node_code !== robot.to_node_code
    && isFiniteNumber(robot.movement_progress)
);

/**
 * 방향과 관계없이 같은 물리적 엣지를 식별하는 키를 생성한다.
 *
 * A → B와 B → A 모두 같은 키를 반환한다.
 */
export const createUndirectedEdgeKey = (
    fromNodeCode,
    toNodeCode,
) => {
    if (!fromNodeCode || !toNodeCode) {
        return null;
    }

    return [String(fromNodeCode), String(toNodeCode)]
        .sort()
        .join("::");
};

/**
 * 백엔드가 제공한 도착 예정 시간을 우선 사용한다.
 * 값이 없으면 이동 종료 시각과 현재 시뮬레이션 시각으로 계산한다.
 */
const getArrivalInSeconds = (robot) => {
    if (isFiniteNumber(robot?.arrival_in_seconds)) {
        return Math.max(
            0,
            Number(robot.arrival_in_seconds),
        );
    }

    if (
        isFiniteNumber(robot?.movement_end_at_ms)
        && isFiniteNumber(robot?.simulation_time_ms)
    ) {
        return Math.max(
            0,
            (
                Number(robot.movement_end_at_ms)
                - Number(robot.simulation_time_ms)
            ) / 1000,
        );
    }

    return null;
};

/**
 * 위험 정보의 공통 반환 구조를 생성한다.
 */
const createRisk = ({
    type,
    severity,
    robotA,
    robotB,
    edgeKey = null,
    nodeCode = null,
    message,
    details = {},
}) => {
    const robotIds = [
        robotA.robot_id,
        robotB.robot_id,
    ].sort((left, right) =>
        String(left).localeCompare(String(right))
    );

    const locationKey =
        edgeKey
        ?? nodeCode
        ?? "unknown";

    return {
        id: [
            type,
            robotIds.join("-"),
            locationKey,
        ].join(":"),

        type,
        severity,
        robotIds,
        robotCodes: [
            robotA.robot_code,
            robotB.robot_code,
        ],
        edgeKey,
        nodeCode,
        message,
        details,
    };
};

/**
 * 두 이동 로봇이 같은 엣지를 반대 방향으로 사용하는지 확인한다.
 */
const analyzeOppositeEdgeRisk = (
    robotA,
    robotB,
) => {
    const isOppositeDirection =
        robotA.from_node_code === robotB.to_node_code
        && robotA.to_node_code === robotB.from_node_code;

    if (!isOppositeDirection) {
        return null;
    }

    const edgeKey = createUndirectedEdgeKey(
        robotA.from_node_code,
        robotA.to_node_code,
    );

    return createRisk({
        type: "OPPOSITE_EDGE",
        severity: "CRITICAL",
        robotA,
        robotB,
        edgeKey,
        message:
            `${robotA.robot_code}과 ${robotB.robot_code}이 `
            + "같은 엣지를 반대 방향으로 이동 중입니다.",
    });
};

/**
 * 두 로봇이 같은 방향의 동일 엣지에서 가깝게 이동하는지 확인한다.
 */
const analyzeFollowingDistanceRisk = (
    robotA,
    robotB,
) => {
    const isSameDirection =
        robotA.from_node_code === robotB.from_node_code
        && robotA.to_node_code === robotB.to_node_code;

    if (!isSameDirection) {
        return null;
    }

    const progressA = Number(robotA.movement_progress);
    const progressB = Number(robotB.movement_progress);
    const progressGap = Math.abs(progressA - progressB);

    if (
        !Number.isFinite(progressGap)
        || progressGap > SAME_EDGE_PROGRESS_THRESHOLD
    ) {
        return null;
    }

    const leadingRobot =
        progressA >= progressB
            ? robotA
            : robotB;

    const followingRobot =
        progressA >= progressB
            ? robotB
            : robotA;

    return createRisk({
        type: "FOLLOWING_DISTANCE",
        severity: "WARNING",
        robotA,
        robotB,
        edgeKey: createUndirectedEdgeKey(
            robotA.from_node_code,
            robotA.to_node_code,
        ),
        message:
            `${robotA.robot_code}과 ${robotB.robot_code}의 `
            + "동일 엣지 이동 간격이 가깝습니다.",
        details: {
            progressGap,
            leadingRobotId: leadingRobot.robot_id,
            followingRobotId: followingRobot.robot_id,
        },
    });
};

/**
 * 서로 다른 엣지에서 같은 목적 노드로 동시에 접근하는지 확인한다.
 */
const analyzeSameTargetNodeRisk = (
    robotA,
    robotB,
) => {
    if (
        !robotA.to_node_code
        || robotA.to_node_code !== robotB.to_node_code
    ) {
        return null;
    }

    // 같은 방향 동일 엣지는 앞선 근접 이동 규칙에서 처리한다.
    const isSameMovement =
        robotA.from_node_code === robotB.from_node_code
        && robotA.to_node_code === robotB.to_node_code;

    if (isSameMovement) {
        return null;
    }

    const arrivalA = getArrivalInSeconds(robotA);
    const arrivalB = getArrivalInSeconds(robotB);

    if (arrivalA === null || arrivalB === null) {
        return null;
    }

    const arrivalGap = Math.abs(arrivalA - arrivalB);

    if (
        arrivalGap
        > SAME_NODE_ARRIVAL_THRESHOLD_SECONDS
    ) {
        return null;
    }

    return createRisk({
        type: "SAME_TARGET_NODE",
        severity: "WARNING",
        robotA,
        robotB,
        nodeCode: robotA.to_node_code,
        message:
            `${robotA.robot_code}과 ${robotB.robot_code}이 `
            + `${robotA.to_node_code} 노드에 동시에 접근 중입니다.`,
        details: {
            arrivalGap,
            arrivalA,
            arrivalB,
        },
    });
};

/**
 * 이동 로봇이 정지 로봇이 점유한 노드로 접근하는지 확인한다.
 */
const analyzeOccupiedNodeEntryRisk = (
    movingRobot,
    stationaryRobot,
) => {
    const occupiedNodeCode =
        stationaryRobot.from_node_code
        ?? stationaryRobot.node_id;

    if (
        !occupiedNodeCode
        || movingRobot.to_node_code
            !== occupiedNodeCode
    ) {
        return null;
    }

    const arrivalInSeconds =
        getArrivalInSeconds(movingRobot);

    if (
        arrivalInSeconds === null
        || arrivalInSeconds
            > SAME_NODE_ARRIVAL_THRESHOLD_SECONDS
    ) {
        return null;
    }

    return createRisk({
        type: "OCCUPIED_NODE_ENTRY",
        severity: "CRITICAL",
        robotA: movingRobot,
        robotB: stationaryRobot,
        nodeCode: occupiedNodeCode,
        message:
            `${movingRobot.robot_code}이 `
            + `${stationaryRobot.robot_code}이 점유한 `
            + `${occupiedNodeCode} 노드로 접근 중입니다.`,
        details: {
            movingRobotId: movingRobot.robot_id,
            stationaryRobotId:
                stationaryRobot.robot_id,
            arrivalInSeconds,
        },
    });
};

/**
 * 로봇 두 대의 현재 이동 상태를 비교한다.
 *
 * 한 쌍에서 여러 조건이 겹치면 위험도가 높은 조건 하나를 반환한다.
 */
const analyzeRobotPair = (
    robotA,
    robotB,
) => {
    const movingA = isMovingRobot(robotA);
    const movingB = isMovingRobot(robotB);

    if (movingA && movingB) {
        return (
            analyzeOppositeEdgeRisk(robotA, robotB)
            ?? analyzeFollowingDistanceRisk(
                robotA,
                robotB,
            )
            ?? analyzeSameTargetNodeRisk(
                robotA,
                robotB,
            )
        );
    }

    if (movingA && !movingB) {
        return analyzeOccupiedNodeEntryRisk(
            robotA,
            robotB,
        );
    }

    if (!movingA && movingB) {
        return analyzeOccupiedNodeEntryRisk(
            robotB,
            robotA,
        );
    }

    return null;
};

/**
 * 전체 로봇을 두 대씩 비교해 현재 충돌 위험 목록을 반환한다.
 *
 * 미래 전체 경로가 아닌 웹소켓의 현재 이동 구간만 분석하므로
 * 실제 충돌 제어가 아니라 실시간 위험 후보 탐지에 사용한다.
 */
export const analyzeRobotConflictRisks = (
    robots = [],
) => {
    if (!Array.isArray(robots) || robots.length < 2) {
        return [];
    }

    const risks = [];

    for (
        let firstIndex = 0;
        firstIndex < robots.length;
        firstIndex += 1
    ) {
        for (
            let secondIndex = firstIndex + 1;
            secondIndex < robots.length;
            secondIndex += 1
        ) {
            const robotA = robots[firstIndex];
            const robotB = robots[secondIndex];

            if (!robotA || !robotB) {
                continue;
            }

            const risk = analyzeRobotPair(
                robotA,
                robotB,
            );

            if (risk) {
                risks.push(risk);
            }
        }
    }

    return risks;
};