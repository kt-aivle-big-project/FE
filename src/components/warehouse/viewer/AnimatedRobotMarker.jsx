import { useEffect, useRef } from "react";
import { clamp01, robotPositionAt } from "./warehouseSvgUtils";

const ROBOT_MARKER_SIZE = 46;

/**
 * 로봇 한 대를 SVG 그룹으로 렌더링하고 위치를 애니메이션한다.
 * 부모가 계산한 출발·도착 SVG 좌표와 백엔드 이동 스냅샷을 받아 DOM transform만 갱신한다.
 */
function AnimatedRobotMarker({
    robot,
    fromX,
    fromY,
    toX,
    toY,
    robotImage,
    isRunning,
    loadColor,
    loadTitle,
    hideLoad,
}) {
    // 매 프레임 React를 다시 렌더링하지 않고 SVG 그룹의 transform만 변경한다.
    const elementRef = useRef(null);

    useEffect(() => {
        let frameId = null;

        const renderPosition = (now) => {
            const position = robotPositionAt(
                robot,
                fromX,
                fromY,
                toX,
                toY,
                now,
                isRunning,
            );

            if (elementRef.current) {
                elementRef.current.style.transform =
                    `translate(${position.x}px, ${position.y}px)`;
            }

            const shouldContinue = isRunning
                && robot.movement_step_id
                && clamp01(robot.movement_progress) < 1
                && Number(robot.arrival_in_seconds) > 0;

            if (shouldContinue) {
                frameId = window.requestAnimationFrame(renderPosition);
            }
        };

        renderPosition(performance.now());

        return () => {
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
        };
    }, [
        robot,
        fromX,
        fromY,
        toX,
        toY,
        isRunning,
    ]);

    // 첫 렌더에서도 로봇이 출발점으로 튀지 않도록 현재 시각 기준 위치를 적용한다.
    const initialPosition = robotPositionAt(
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
