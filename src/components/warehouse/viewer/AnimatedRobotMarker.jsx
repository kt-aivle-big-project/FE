import { useEffect, useRef } from "react";
import { robotPositionAt } from "./warehouseSvgUtils";

const ROBOT_MARKER_SIZE = 46;

// 목표 위치를 따라붙는 속도. 작을수록 즉각적이고, 클수록 부드럽다.
// 80ms 정도면 백엔드 갱신 주기(100ms)와 자연스럽게 맞물린다.
const SMOOTHING_TIME_MS = 80;

// 이보다 멀리 떨어지면 보간하지 않고 바로 옮긴다.
// (다른 노드로 재배치되거나 시뮬레이션을 초기화한 경우)
const SNAP_DISTANCE = 120;

/**
 * 로봇 한 대를 SVG 그룹으로 렌더링하고 위치를 애니메이션한다.
 *
 * 백엔드 스냅샷은 100ms마다 띄엄띄엄 오고 값도 조금씩 튄다.
 * 그래서 스냅샷 위치를 그대로 그리지 않고 "목표"로만 두고,
 * 화면 위치가 매 프레임 그 목표를 향해 조금씩 따라가게 한다.
 */
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
    // 매 프레임 React를 다시 렌더링하지 않고 SVG 그룹의 transform만 변경한다.
    const elementRef = useRef(null);

    // 루프 안에서 항상 최신 값을 읽되, 값이 바뀌어도 루프를 다시 만들지 않는다.
    const targetRef = useRef(null);

    targetRef.current = {
        robot,
        fromX,
        fromY,
        toX,
        toY,
        isRunning,
    };

    // 화면에 실제로 그려지고 있는 위치
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
        // 마운트되어 있는 동안 한 번만 돈다.
    }, []);

    // 첫 렌더에서도 로봇이 출발점으로 튀지 않도록 현재 시각 기준 위치를 적용한다.
    const initialPosition = drawnRef.current ?? robotPositionAt(
        robot,
        fromX,
        fromY,
        toX,
        toY,
        performance.now(),
        isRunning,
    );

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
