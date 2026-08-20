import { useEffect, useRef } from "react";
import { robotPositionAt } from "./warehouseSvgUtils";

const ROBOT_MARKER_SIZE = 46;

const SMOOTHING_TIME_MS = 80;

const SNAP_DISTANCE = 120;

const isLowBatteryRobot = (robot) => {
    const activity = String(robot.activity ?? "").toUpperCase();
    const status = String(robot.status ?? "").toUpperCase();
    const serviceKind = String(
        robot.service_kind ?? robot.serviceKind ?? "",
    ).toUpperCase();
    const waitingReason = String(
        robot.waiting_reason ?? robot.waitingReason ?? "",
    ).toUpperCase();

    if (
        activity === "CHARGING"
        || status === "CHARGING"
        || serviceKind === "CHARGE"
    ) {
        return false;
    }

    return activity === "LOW_BATTERY"
        || activity === "RETURNING_TO_CHARGE"
        || waitingReason.includes("배터리")
        || waitingReason.includes("LOW_BATTERY");
};

const lowBatteryTitle = (robot) => {
    const activity = String(robot.activity ?? "").toUpperCase();
    if (activity === "RETURNING_TO_CHARGE") {
        return "배터리 부족으로 전용 충전소 복귀 중";
    }
    const currentTaskId = robot.current_task_id ?? robot.currentTaskId;
    if (activity === "LOW_BATTERY" && currentTaskId !== null && currentTaskId !== undefined) {
        return "배터리 부족 · 현재 임무 마무리 중";
    }
    return "배터리 부족";
};

function AnimatedRobotMarker({
    robot,
    fromX,
    fromY,
    toX,
    toY,
    robotImage,
    isRunning,
    isAvoidanceWaiting = false,
    avoidanceLabel = null,
    waitingStatusLabel = "대기",
    loadColor,
    loadTitle,
    hideLoad,
}) {
    const elementRef = useRef(null);

    const targetRef = useRef(null);

    targetRef.current = {
        robot,
        fromX,
        fromY,
        toX,
        toY,
        isRunning,
    };

    const drawnRef = useRef(null);

    useEffect(() => {
        let frameId = null;
        let previousTime = null;

        const step = (now) => {
            const {
                robot: currentRobot,
                fromX: currentFromX,
                fromY: currentFromY,
                toX: currentToX,
                toY: currentToY,
                isRunning: currentIsRunning,
            } = targetRef.current;

            const target = robotPositionAt(
                currentRobot,
                currentFromX,
                currentFromY,
                currentToX,
                currentToY,
                now,
                currentIsRunning,
            );

            if (drawnRef.current === null) {
                drawnRef.current = { ...target };
            } else {
                const deltaX = target.x - drawnRef.current.x;
                const deltaY = target.y - drawnRef.current.y;
                const distance = Math.hypot(deltaX, deltaY);

                if (distance > SNAP_DISTANCE) {
                    // 순간이동이나 재배치. 보간하면 화면을 가로지르므로 바로 옮긴다.
                    drawnRef.current = { ...target };
                } else {
                    // 프레임 간격을 반영해 프레임률이 흔들려도 속도가 일정하다.
                    const deltaTime = previousTime === null
                        ? 16
                        : Math.min(100, now - previousTime);

                    const factor = 1 - Math.exp(-deltaTime / SMOOTHING_TIME_MS);

                    drawnRef.current = {
                        x: drawnRef.current.x + deltaX * factor,
                        y: drawnRef.current.y + deltaY * factor,
                    };
                }
            }

            previousTime = now;

            if (elementRef.current) {
                elementRef.current.style.transform =
                    `translate(${drawnRef.current.x}px, ${drawnRef.current.y}px)`;
            }

            frameId = window.requestAnimationFrame(step);
        };

        frameId = window.requestAnimationFrame(step);

        return () => {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, []);

    const initialPosition = drawnRef.current ?? robotPositionAt(
        robot,
        fromX,
        fromY,
        toX,
        toY,
        performance.now(),
        isRunning,
    );
    const lowBatteryRobot = isLowBatteryRobot(robot);

    return (
        <g
            ref={elementRef}
            className="warehouse-robot"
            style={{
                transform: `translate(${initialPosition.x}px, ${initialPosition.y}px)`,
            }}
        >
            <defs>
                <clipPath id={`robot-rounded-${robot.robot_id}`}>
                    <rect x="-23" y="-23" width="50" height="50" rx="50" ry="50" />
                </clipPath>
            </defs>

            {lowBatteryRobot && (
                <circle
                    cx="1"
                    cy="1"
                    r="27"
                    className="warehouse-robot-low-battery-highlight"
                    pointerEvents="none"
                >
                    <title>{lowBatteryTitle(robot)}</title>
                </circle>
            )}

            {isAvoidanceWaiting && (
                <>
                    <circle
                        cx="1"
                        cy="1"
                        r="28"
                        className="warehouse-robot-avoidance-ring"
                        pointerEvents="none"
                    >
                        <title>
                            {avoidanceLabel ?? "통행 순서 대기 중"}
                        </title>
                    </circle>

                    <text
                        x="1"
                        y="-31"
                        textAnchor="middle"
                        className="warehouse-robot-avoidance-label"
                        pointerEvents="none"
                    >
                        {waitingStatusLabel}
                    </text>
                </>
            )}

            <image
                href={robotImage}
                x="-23"
                y="-23"
                width="50"
                height="50"
                clipPath={`url(#robot-rounded-${robot.robot_id})`}
            />

            {robot.carrying_load && !hideLoad && (
                <g className="warehouse-robot-load" transform="translate(14, -18)">
                    <rect width="16" height="12" x="-8" y="-6" rx="2" style={{ fill: loadColor }} />
                    <path d="M -8 -1 H 8 M 0 -6 V 6" />
                    <title>{loadTitle ?? "운반 중인 BOX"}</title>
                </g>
            )}

            <text
                x="3"
                y={ROBOT_MARKER_SIZE / 2 + 10}
                textAnchor="middle"
                className="warehouse-robot-id"
            >
                {robot.robot_code}
            </text>

            <title>
                {`${robot.robot_code}\nstatus: ${robot.status}\nbattery: ${robot.battery}%\nnode: ${robot.node_id}`}
            </title>
        </g>
    );
}

export default AnimatedRobotMarker;
