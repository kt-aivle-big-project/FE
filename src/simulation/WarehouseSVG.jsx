import { useEffect, useState } from "react";

import warehouseGraph from "../data/warehouse_graph.json";
import rackInventory from "../data/rack_inventory.json";

import robotCharging from "../assets/robots/robot_charging.png";
import robotHero from "../assets/robots/robot_hero.png";
import robotPicking from "../assets/robots/robot_picking.png";
import robotPutaway from "../assets/robots/robot_putaway.png";
import robotRelocation from "../assets/robots/robot_relocation.png";
import robotReplenish from "../assets/robots/robot_replenish.png";

import "../styles/WarehouseSVG.css";

function WarehouseSVG({ robots = [], simulationSpeed = 1 }) {
    // 노드 표시 ON / OFF
    const [showNodeLabels, setShowNodeLabels] = useState(false);

    // 처음에는 기존 JSON 지도를 보여주고,
    // API 조회 성공 후 백엔드 데이터로 교체
    const [graphData, setGraphData] = useState(warehouseGraph);

    useEffect(() => {
        const fetchWarehouseLayout = async () => {
            try {
                const accessToken = localStorage.getItem("accessToken");

                const response = await fetch(
                    "http://localhost:8080/api/warehouses/1/layout",
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                );

                if (!response.ok) {
                    throw new Error(`레이아웃 조회 실패: ${response.status}`);
                }

                const data = await response.json();

                const nodeCodeMap = new Map(
                    data.nodes
                        .filter((node) => node.nodeCode)
                        .map((node) => [node.id, node.nodeCode])
                );

                const convertedNodes = data.nodes
                    .filter((node) => node.nodeCode && node.nodeType)
                    .map((node) => {
                        const routeMatch =
                            node.nodeCode.match(/^R(\d+)_(\d+)$/);

                        const chargingMatch =
                            node.nodeCode.match(/^C(\d+)$/);

                        return {
                            databaseId: node.id,
                            id: node.nodeCode,
                            type: node.nodeType.toLowerCase(),
                            x: node.x,
                            y: node.y,

                            row: routeMatch
                                ? Number(routeMatch[1])
                                : undefined,

                            col: routeMatch
                                ? Number(routeMatch[2])
                                : undefined,

                            label:
                                node.nodeType === "INBOUND"
                                    ? node.nodeCode.replace("I_", "")
                                    : node.nodeType === "OUTBOUND"
                                        ? node.nodeCode.replace("O_", "")
                                        : undefined,

                            index: chargingMatch
                                ? Number(chargingMatch[1])
                                : undefined,
                        };
                    });

                const convertedEdges = data.edges
                    .map((edge) => ({
                        id: edge.id,
                        source: nodeCodeMap.get(edge.fromNodeId),
                        target: nodeCodeMap.get(edge.toNodeId),
                        type: "lane",
                    }))
                    .filter((edge) => edge.source && edge.target);

                setGraphData({
                    nodes: convertedNodes,
                    edges: convertedEdges,
                });

                console.log("변환된 창고 지도:", {
                    nodes: convertedNodes.length,
                    edges: convertedEdges.length,
                });
            } catch (error) {
                console.error("창고 레이아웃 조회 오류:", error);
            }
        };

        fetchWarehouseLayout();
    }, []);

    // SVG 크기
    const SVG_WIDTH = 1200;
    const SVG_HEIGHT = 600;

    const PADDING_X = 40;
    const PADDING_Y = 30;

    // warehouse_graph.json 좌표 범위 계산
    // JSON의 x, y 좌표를 SVG 좌표로 자동 변환하기 위해 최소/최대 좌표를 구함
    const xValues = graphData.nodes.map((node) => node.x);
    const yValues = graphData.nodes.map((node) => node.y);

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);

    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    // JSON 좌표 → SVG 좌표 변환
    const convertX = (x) => {
        const availableWidth = SVG_WIDTH - PADDING_X * 2;
        return (
            PADDING_X +
            ((x - minX) / (maxX - minX)) *
            availableWidth
        );
    };

    const convertY = (y) => {
        const availableHeight = SVG_HEIGHT - PADDING_Y * 2;
        return (
            PADDING_Y +
            ((y - minY) / (maxY - minY)) *
            availableHeight
        );
    };

    // 노드 ID → 노드 정보
    // edge.source / edge.target를 좌표로 변환할 때 사용
    const nodeMap = new Map(
        graphData.nodes.map((node) => [node.id, node])
    );

    // 랙 ID → 랙 재고 정보
    // K0_1 같은 rack_storage 노드와 rack_inventory.json 데이터를 연결
    const rackInventoryMap = new Map(
        rackInventory.racks.map((rack) => [rack.rack_node_id, rack])
    );

    // 랙 상태 class 반환
    const getRackLevelClass = (status) => {
        switch (status) {
            case "FULL":
                return "rack-level-full";
            case "PARTIAL":
                return "rack-level-partial";
            default:
                return "rack-level-empty";
        }
    };

    // 로봇 이미지 매핑
    const robotImages = {
        IDLE: robotHero,
        CHARGING: robotCharging,
        PICKING: robotPicking,
        PUTAWAY: robotPutaway,
        RELOCATION: robotRelocation,
        REPLENISH: robotReplenish,
    };

    // 로봇 이동 속도/시간 조절
    const getRobotTransitionDuration = (speed) => {
        const baseDuration = 500 / Number(speed);

        switch (Number(speed)) {
            case 0.5:
                return baseDuration * 2;
            case 1:
                return baseDuration;
            case 2:
                return baseDuration * 0.5;
            case 3:
                return baseDuration * 0.2;
            default:
                return baseDuration;
        }
    };

    return (
        <div className="warehouse-svg-wrapper">

            {/* 노드 표시 ON / OFF */}
            <button
                type="button"
                className="warehouse-node-toggle"
                onClick={() => setShowNodeLabels((prev) => !prev)}
            >
                {showNodeLabels ? "노드 번호 숨기기" : "노드 번호 보기"}
            </button>

            <svg
                className="warehouse-svg"
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
            >
                {/* 창고 바닥 격자 패턴 */}
                <defs>
                    <pattern
                        id="warehouse-grid"
                        width="10"
                        height="10"
                        patternUnits="userSpaceOnUse"
                    >
                        <path
                            d="M 10 0 L 0 0 0 10"
                            fill="none"
                            stroke="#e5e5e5"
                            strokeWidth="1"
                        />
                    </pattern>
                </defs>

                {/* 창고 바닥 */}
                <rect
                    x="0"
                    y="0"
                    width={SVG_WIDTH}
                    height={SVG_HEIGHT}
                    fill="#ffffff"
                />

                {/* 좌표 격자 */}
                <rect
                    x="0"
                    y="0"
                    width={SVG_WIDTH}
                    height={SVG_HEIGHT}
                    fill="url(#warehouse-grid)"
                />

                {/* EDGE
                    항상 노드보다 먼저 그려야 선 위에 노드가 올라옴 */}
                <g className="warehouse-edges">
                    {graphData.edges.map(
                        (edge) => {
                            const source = nodeMap.get(edge.source);
                            const target = nodeMap.get(edge.target);

                            if (!source || !target) {
                                return null;
                            }

                            return (
                                <line
                                    key={edge.id}
                                    x1={convertX(source.x)}
                                    y1={convertY(source.y)}
                                    x2={convertX(target.x)}
                                    y2={convertY(target.y)}
                                    className={`warehouse-edge edge-${edge.type}`}
                                />
                            );
                        }
                    )}
                </g>

                {/* 통로 번호 */}
                <g className="warehouse-aisle-labels">
                    {graphData.nodes
                        .filter(
                            (node) =>
                                node.type === "route" &&
                                node.col === 0
                        )
                        .map((node) => (

                            <text
                                key={`aisle-${node.row}`}
                                x={convertX(node.x) - 10}
                                y={convertY(node.y) + 4}
                                textAnchor="end"
                                className="warehouse-aisle-label"
                            >
                                {`A${String(node.row).padStart(2, "0")}`}
                            </text>
                        ))}
                </g>

                {/* 로봇이 실제로 이동하는 route 노드 */}
                <g className="warehouse-route-nodes">
                    {graphData.nodes
                        .filter((node) => node.type === "route")
                        .map((node) => (
                            <g key={node.id}>

                                {/* 이동 노드 */}
                                <circle
                                    cx={convertX(node.x)}
                                    cy={convertY(node.y)}
                                    r="3"
                                    className="warehouse-route-node"
                                >
                                    <title>{node.id}</title>
                                </circle>

                                {/* 노드 번호 */}
                                {showNodeLabels && (
                                    <text
                                        x={convertX(node.x)}
                                        y={convertY(node.y) + 12}
                                        textAnchor="middle"
                                        className="warehouse-route-label"
                                    >
                                        {node.id}
                                    </text>
                                )}
                            </g>
                        ))}
                </g>

                {/* 충전소 연결 Junction
                    route ↔ charging slot 연결 지점 */}
                <g className="warehouse-charge-junctions">
                    {graphData.nodes
                        .filter(
                            (node) =>
                                node.type ===
                                "route_charge_junction"
                        )
                        .map(
                            (node) => (
                                <circle
                                    key={node.id}
                                    cx={convertX(node.x)}
                                    cy={convertY(node.y)}
                                    r="4"
                                    className="warehouse-charge-junction"
                                >
                                    <title>{node.id}</title>
                                </circle>
                            )
                        )}
                </g>

                {/* 선반
                    rack_inventory.json의 3단 재고 상태까지 표시 */}
                <g className="warehouse-racks">
                    {graphData.nodes
                        .filter(
                            (node) =>
                                node.type ===
                                "rack_storage"
                        )
                        .map(
                            (node) => {
                                const inventory = rackInventoryMap.get(node.id);
                                /*
                                 * 화면에서는 상단 → 중단 → 하단 순서로 보여주기 위해
                                 * level을 역순으로 정렬
                                 */
                                const levels =
                                    inventory?.levels
                                        ? [...inventory.levels]
                                            .sort(
                                                (a, b) =>
                                                    b.level -
                                                    a.level
                                            )
                                        : [];

                                return (
                                    <g
                                        key={node.id}
                                        transform={
                                            `translate(
                                                ${convertX(node.x)},
                                                ${convertY(node.y)}
                                            )`
                                        }
                                    >
                                        {/* 선반 외곽 */}
                                        <rect
                                            x="-22"
                                            y="-17"
                                            width="44"
                                            height="34"
                                            className="warehouse-rack"
                                        />

                                        {/* 선반 3단 */}
                                        {levels.map(
                                            (level, index) => (
                                                <rect
                                                    key={level.level}
                                                    x="-20"
                                                    y={-15 + index * 10}
                                                    width="40"
                                                    height="9"
                                                    className={`warehouse-rack-level ${getRackLevelClass(level.status)}`}
                                                >
                                                    <title>
                                                        {`${node.id} / ${level.level}단 / ${level.status}`}
                                                    </title>
                                                </rect>
                                            )
                                        )}

                                        {/* 랙 ID */}
                                        <text
                                            x="0"
                                            y="27"
                                            textAnchor="middle"
                                            className="warehouse-rack-label"
                                        >
                                            {node.id}
                                        </text>
                                    </g>
                                );
                            }
                        )}
                </g>

                {/* 입고 엘리베이터 IA ~ IG  */}
                <g className="warehouse-inbound">
                    {graphData.nodes
                        .filter(
                            (node) =>
                                node.type ===
                                "inbound"
                        )
                        .map(
                            (node) => (
                                <g key={node.id}>
                                    <rect
                                        x={convertX(node.x) - 14}
                                        y={convertY(node.y) - 10}
                                        width="28"
                                        height="20"
                                        className="warehouse-inbound-node"
                                    />

                                    <text
                                        x={convertX(node.x)}
                                        y={convertY(node.y) + 4}
                                        textAnchor="middle"
                                        className="warehouse-station-label"
                                    >
                                        {node.label}
                                    </text>

                                    {/* 입고 엘리베이터 노드 번호 */}
                                    {showNodeLabels && (
                                        <text
                                            x={convertX(node.x)}
                                            y={convertY(node.y) + 22}
                                            textAnchor="middle"
                                            className="warehouse-station-id"
                                        >
                                            {node.id}
                                        </text>
                                    )}
                                </g>
                            )
                        )}
                </g>

                {/* 출고 엘리베이터 OA ~ OG */}
                <g className="warehouse-outbound">
                    {graphData.nodes
                        .filter(
                            (node) =>
                                node.type ===
                                "outbound"
                        )
                        .map(
                            (node) => (
                                <g key={node.id}>
                                    <rect
                                        x={convertX(node.x) - 14}
                                        y={convertY(node.y) - 10}
                                        width="28"
                                        height="20"
                                        className="warehouse-outbound-node"
                                    />

                                    <text
                                        x={convertX(node.x)}
                                        y={convertY(node.y) + 4}
                                        textAnchor="middle"
                                        className="warehouse-station-label"
                                    >
                                        {node.label}
                                    </text>
                                    {/* 출고 엘리베이터 노드 번호 */}
                                    {showNodeLabels && (
                                        <text
                                            x={convertX(node.x)}
                                            y={convertY(node.y) + 22}
                                            textAnchor="middle"
                                            className="warehouse-station-id"
                                        >
                                            {node.id}
                                        </text>
                                    )}
                                </g>
                            )
                        )}
                </g>

                {/* 충전소 C01 ~ C10 */}
                <g className="warehouse-charging">
                    {graphData.nodes
                        .filter(
                            (node) =>
                                node.type ===
                                "charging_slot"
                        )
                        .map(
                            (node) => (
                                <g key={node.id}>
                                    <rect
                                        x={convertX(node.x) - 18}
                                        y={convertY(node.y) - 10}
                                        width="36"
                                        height="20"
                                        className="warehouse-charging-slot"
                                    >
                                        <title>{node.id}</title>
                                    </rect>

                                    <text
                                        x={convertX(node.x)}
                                        y={convertY(node.y) + 4}
                                        textAnchor="middle"
                                        className="warehouse-charging-label"
                                    >
                                        {node.index}
                                    </text>

                                    {/* 충전소 노드 번호 */}
                                    {showNodeLabels && (
                                        <text
                                            x={convertX(node.x)}
                                            y={convertY(node.y) + 22}
                                            textAnchor="middle"
                                            className="warehouse-station-id"
                                        >
                                            {node.id}
                                        </text>
                                    )}
                                </g>
                            )
                        )}
                </g>

                {/* 영역 이름 */}
                <text
                    x="30"
                    y="300"
                    className="warehouse-area-title"
                    transform="rotate(-90 30 300)"
                    textAnchor="middle"
                >
                    입고 엘리베이터
                </text>

                <text
                    x={SVG_WIDTH - 30}
                    y="300"
                    className="warehouse-area-title"
                    transform={`rotate(90 ${SVG_WIDTH - 30} 300)`}
                    textAnchor="middle"
                >
                    출고 엘리베이터
                </text>

                <text
                    x={SVG_WIDTH / 2}
                    y={SVG_HEIGHT - 8}
                    className="warehouse-area-title"
                    textAnchor="middle"
                >
                    충전소
                </text>

                {/* 로봇 */}
                <g className="warehouse-robots">
                    {robots.map((robot) => {
                        // robots.json의 node_id를 이용해서
                        // warehouse_graph.json에서 현재 위치 찾기
                        const currentNode = nodeMap.get(robot.node_id);

                        if (!currentNode) {
                            return null;
                        }

                        // 현재 상태에 맞는 로봇 이미지
                        const robotImage = robotImages[robot.status] ?? robotHero;
                        const robotX = convertX(currentNode.x);
                        const robotY = convertY(currentNode.y);
                        const ROBOT_SIZE = 46;

                        return (
                            <g
                                key={robot.robot_id}
                                className="warehouse-robot"
                                style={{
                                    transform: `translate(${robotX}px, ${robotY}px)`,

                                    // 백엔드가 알려준 도착 예정 시간에 맞춰 보간한다.
                                    // 값이 없으면(목업/정지) 기존 배속 기반 시간을 사용.
                                    transitionDuration:
                                        robot.transition_ms !== undefined
                                            ? `${robot.transition_ms}ms`
                                            : `${getRobotTransitionDuration(simulationSpeed)}ms`,
                                }}
                            >
                                <defs>
                                    <clipPath id="robot-rounded">
                                        <rect
                                            x="-23"
                                            y="-23"
                                            width="50"
                                            height="50"
                                            rx="50"
                                            ry="50"
                                        />
                                    </clipPath>
                                </defs>
                                <image
                                    href={robotImage}
                                    x="-23"
                                    y="-23"
                                    width="50"
                                    height="50"
                                    clipPath="url(#robot-rounded)"
                                />

                                <text
                                    x="3"
                                    y={ROBOT_SIZE / 2 + 10}
                                    textAnchor="middle"
                                    className="warehouse-robot-id"
                                >
                                    {robot.robot_code}
                                </text>

                                <title>
                                    {`${robot.robot_code}
                                        상태: ${robot.status}
                                        배터리: ${robot.battery}%
                                        현재 노드: ${robot.node_id}`}
                                </title>
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
}

export default WarehouseSVG;