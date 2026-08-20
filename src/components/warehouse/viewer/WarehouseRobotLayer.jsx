import AnimatedRobotMarker from "./AnimatedRobotMarker";

import robotCharging from "../../../assets/robots/robot_charging.png";
import robotHero from "../../../assets/robots/robot_hero.png";
import robotPicking from "../../../assets/robots/robot_picking.png";
import robotPutaway from "../../../assets/robots/robot_putaway.png";
import robotRelocation from "../../../assets/robots/robot_relocation.png";
import robotReplenish from "../../../assets/robots/robot_replenish.png";

const ROBOT_IMAGES = {
    IDLE: robotHero,
    ASSIGNED: robotHero,
    MOVING: robotHero,
    WORKING: robotHero,
    CHARGING: robotCharging,
    PICKING: robotPicking,
    PUTAWAY: robotPutaway,
    RELOCATION: robotRelocation,
    REPLENISH: robotReplenish,
};

function WarehouseRobotLayer({
    fixedOutboundRobots,
    mobileRobotMarkers,
    isRunning,
}) {
    return (
        <>
            <g className="warehouse-fixed-station-robots">
                {fixedOutboundRobots.map((stationRobot) => (
                    <g
                        key={stationRobot.id}
                        className={`warehouse-fixed-station-robot ${stationRobot.active ? "working" : "idle"} ${stationRobot.outputActive ? "releasing" : ""}`}
                        transform={`translate(${stationRobot.x}, ${stationRobot.y})`}
                    >
                        <rect className="station-robot-platform" x="-18" y="13" width="36" height="8" rx="3" />
                        <rect className="station-robot-body" x="-9" y="-3" width="18" height="18" rx="5" />
                        <circle className="station-robot-head" cx="0" cy="-12" r="8" />
                        <circle className="station-robot-eye" cx="-3" cy="-13" r="1.5" />
                        <circle className="station-robot-eye" cx="3" cy="-13" r="1.5" />
                        <path className="station-robot-arm left" d="M -8 1 L -18 -5 L -22 4" />
                        <path className="station-robot-arm right" d="M 8 1 L 18 -5 L 22 4" />
                        <circle className="station-robot-joint" cx="-18" cy="-5" r="3" />
                        <circle className="station-robot-joint" cx="18" cy="-5" r="3" />
                        <title>
                            {`${stationRobot.label} / ${stationRobot.active ? "작업 중" : "대기"}`}
                        </title>
                    </g>
                ))}
            </g>

            <g className="warehouse-robots">
                {mobileRobotMarkers.map((marker) => {
                    const robotImage =
                        ROBOT_IMAGES[marker.robot.activity]
                        ?? ROBOT_IMAGES[marker.robot.status]
                        ?? robotHero;

                    return (
                        <AnimatedRobotMarker
                            key={marker.robot.robot_id}
                            robot={marker.robot}
                            fromX={marker.fromX}
                            fromY={marker.fromY}
                            toX={marker.toX}
                            toY={marker.toY}
                            robotImage={robotImage}
                            isRunning={isRunning}
                            isAvoidanceWaiting={marker.isAvoidanceWaiting}
                            avoidanceLabel={marker.avoidanceLabel}
                            waitingStatusLabel={marker.waitingStatusLabel}
                            loadColor={marker.loadColor}
                            loadTitle={marker.loadTitle}
                            hideLoad={marker.hideLoad}
                        />
                    );
                })}
            </g>
        </>
    );
}

export default WarehouseRobotLayer;
