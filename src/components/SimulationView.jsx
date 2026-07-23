import warehouseGraph from "../data/warehouse_graph.json";
import rackInventory from "../data/rack_inventory.json";

import "../styles/simulationView.css";


const SVG_WIDTH = 1600;
const SVG_HEIGHT = 800;


/* =========================
   JSON 좌표 → SVG 좌표 변환
========================= */

const MAP_MIN_X = 3;
const MAP_MAX_X = 12.6;

const MAP_MIN_Y = 0.55;
const MAP_MAX_Y = 6.1;

const MAP_LEFT = 250;
const MAP_TOP = 35;

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 610;


const convertX = (x) => {
    return (
        MAP_LEFT +
        ((x - MAP_MIN_X) /
            (MAP_MAX_X - MAP_MIN_X)) *
            MAP_WIDTH
    );
};


const convertY = (y) => {
    return (
        MAP_TOP +
        ((y - MAP_MIN_Y) /
            (MAP_MAX_Y - MAP_MIN_Y)) *
            MAP_HEIGHT
    );
};


/* =========================
   데이터 분류
========================= */

const nodeMap = new Map(
    warehouseGraph.nodes.map((node) => [
        node.id,
        node,
    ])
);


const rackInventoryMap = new Map(
    rackInventory.racks.map((rack) => [
        rack.rack_node_id,
        rack,
    ])
);


const routeNodes = warehouseGraph.nodes.filter(
    (node) => node.type === "route"
);


const junctionNodes = warehouseGraph.nodes.filter(
    (node) =>
        node.type === "route_charge_junction"
);


const rackNodes = warehouseGraph.nodes.filter(
    (node) => node.type === "rack_storage"
);


const inboundNodes = warehouseGraph.nodes.filter(
    (node) => node.type === "inbound"
);


const outboundNodes = warehouseGraph.nodes.filter(
    (node) => node.type === "outbound"
);


const chargingSlots = warehouseGraph.nodes.filter(
    (node) => node.type === "charging_slot"
);


/* =========================
   선반 묶음 생성
========================= */

const rackGroups = (() => {
    const groups = {};

    rackNodes.forEach((node) => {
        const side =
            node.col <= 4 ? "left" : "right";

        const key =
            `${node.shelfRow}-${side}`;

        if (!groups[key]) {
            groups[key] = [];
        }

        groups[key].push(node);
    });

    return Object.entries(groups).map(
        ([key, nodes]) => {
            const sortedNodes = [...nodes].sort(
                (a, b) => a.x - b.x
            );

            const xValues = sortedNodes.map(
                (node) => convertX(node.x)
            );

            const yValues = sortedNodes.map(
                (node) => convertY(node.y)
            );

            const centerY =
                yValues.reduce(
                    (total, value) =>
                        total + value,
                    0
                ) / yValues.length;

            return {
                key,
                nodes: sortedNodes,
                x: Math.min(...xValues) - 42,
                y: centerY - 30,
                width:
                    Math.max(...xValues) -
                    Math.min(...xValues) +
                    84,
                height: 60,
                centerY,
            };
        }
    );
})();


/* =========================
   선반 층 상태
========================= */

const getRackLevelClass = (status) => {
    switch (status) {
        case "FULL":
            return "warehouse-level-full";

        case "PARTIAL":
            return "warehouse-level-partial";

        case "EMPTY":
        default:
            return "warehouse-level-empty";
    }
};


/* =========================
   경로 종류
========================= */

const getEdgeClass = (type = "") => {
    if (type.includes("rack")) {
        return "warehouse-edge rack-edge";
    }

    if (type.includes("inbound")) {
        return "warehouse-edge inbound-edge";
    }

    if (type.includes("outbound")) {
        return "warehouse-edge outbound-edge";
    }

    if (type.includes("charging")) {
        return "warehouse-edge charging-edge";
    }

    return "warehouse-edge route-edge";
};


function SimulationView() {
    const inboundX = convertX(3.11);

    const inboundTop =
        Math.min(
            ...inboundNodes.map((node) =>
                convertY(node.y)
            )
        ) - 65;

    const inboundBottom =
        Math.max(
            ...inboundNodes.map((node) =>
                convertY(node.y)
            )
        ) + 35;


    const outboundX = convertX(12.43);

    const outboundTop =
        Math.min(
            ...outboundNodes.map((node) =>
                convertY(node.y)
            )
        ) - 65;

    const outboundBottom =
        Math.max(
            ...outboundNodes.map((node) =>
                convertY(node.y)
            )
        ) + 35;


    const chargingXValues =
        chargingSlots.map((node) =>
            convertX(node.x)
        );

    const chargingYValues =
        chargingSlots.map((node) =>
            convertY(node.y)
        );

    const chargingLeft =
        Math.min(...chargingXValues) - 35;

    const chargingRight =
        Math.max(...chargingXValues) + 35;

    const chargingY =
        Math.max(...chargingYValues);


    return (
        <div className="warehouse-static-view">
            <svg
                className="warehouse-static-svg"
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                role="img"
                aria-label="자동 창고 정적 배치도"
            >
                {/* 전체 배경 */}
                <rect
                    className="warehouse-page-background"
                    x="2"
                    y="2"
                    width={SVG_WIDTH - 4}
                    height={SVG_HEIGHT - 4}
                    rx="18"
                />


                {/* =========================
                    왼쪽 컨베이어
                ========================= */}

                <g className="warehouse-conveyor">
                    <rect
                        className="conveyor-track"
                        x="20"
                        y="45"
                        width="205"
                        height="605"
                        rx="100"
                    />

                    <rect
                        className="conveyor-dash"
                        x="20"
                        y="45"
                        width="205"
                        height="605"
                        rx="100"
                    />

                    <g className="conveyor-direction">
                        <text
                            className="conveyor-arrow"
                            x="122"
                            y="160"
                            textAnchor="middle"
                        >
                            →
                        </text>

                        <text
                            x="122"
                            y="195"
                            textAnchor="middle"
                        >
                            하행
                        </text>
                    </g>

                    <g className="conveyor-direction">
                        <text
                            className="conveyor-arrow"
                            x="122"
                            y="545"
                            textAnchor="middle"
                        >
                            ←
                        </text>

                        <text
                            x="122"
                            y="580"
                            textAnchor="middle"
                        >
                            상행
                        </text>
                    </g>

                    <polygon
                        className="conveyor-small-arrow"
                        points="
                            192,250
                            213,250
                            202,270
                        "
                    />

                    <polygon
                        className="conveyor-small-arrow"
                        points="
                            33,475
                            54,475
                            43,455
                        "
                    />
                </g>


                {/* =========================
                    창고 영역
                ========================= */}

                <rect
                    className="warehouse-main-frame"
                    x="235"
                    y="20"
                    width="1340"
                    height="680"
                    rx="32"
                />


                {/* =========================
                    입고 엘리베이터
                ========================= */}

                <rect
                    className="warehouse-inbound-panel"
                    x={inboundX - 46}
                    y={inboundTop}
                    width="92"
                    height={
                        inboundBottom -
                        inboundTop
                    }
                    rx="18"
                />

                <rect
                    className="warehouse-inbound-title"
                    x={inboundX - 46}
                    y={inboundTop}
                    width="92"
                    height="68"
                    rx="18"
                />

                <text
                    className="warehouse-area-title"
                    x={inboundX}
                    y={inboundTop + 28}
                    textAnchor="middle"
                >
                    <tspan
                        x={inboundX}
                        dy="0"
                    >
                        입고
                    </tspan>

                    <tspan
                        x={inboundX}
                        dy="20"
                    >
                        엘리베이터
                    </tspan>
                </text>


                {/* =========================
                    출고지
                ========================= */}

                <rect
                    className="warehouse-outbound-panel"
                    x={outboundX - 45}
                    y={outboundTop}
                    width="90"
                    height={
                        outboundBottom -
                        outboundTop
                    }
                    rx="18"
                />

                <rect
                    className="warehouse-outbound-title"
                    x={outboundX - 45}
                    y={outboundTop}
                    width="90"
                    height="68"
                    rx="18"
                />

                <text
                    className="warehouse-area-title"
                    x={outboundX}
                    y={outboundTop + 42}
                    textAnchor="middle"
                >
                    출고지
                </text>


                {/* =========================
                    충전 구역
                ========================= */}

                <rect
                    className="warehouse-charging-zone"
                    x={chargingLeft}
                    y={chargingY + 23}
                    width={
                        chargingRight -
                        chargingLeft
                    }
                    height="48"
                    rx="9"
                />

                <text
                    className="warehouse-charging-title"
                    x={
                        (chargingLeft +
                            chargingRight) /
                        2
                    }
                    y={chargingY + 58}
                    textAnchor="middle"
                >
                    충전 구역
                </text>


                {/* =========================
                    이동 경로
                ========================= */}

                <g className="warehouse-edges">
                    {warehouseGraph.edges.map(
                        (edge) => {
                            const source =
                                nodeMap.get(
                                    edge.source
                                );

                            const target =
                                nodeMap.get(
                                    edge.target
                                );

                            if (
                                !source ||
                                !target
                            ) {
                                return null;
                            }

                            return (
                                <line
                                    key={edge.id}
                                    className={getEdgeClass(
                                        edge.type
                                    )}
                                    x1={convertX(
                                        source.x
                                    )}
                                    y1={convertY(
                                        source.y
                                    )}
                                    x2={convertX(
                                        target.x
                                    )}
                                    y2={convertY(
                                        target.y
                                    )}
                                />
                            );
                        }
                    )}
                </g>


                {/* =========================
                    선반 배경 및 3단 표시
                ========================= */}

                <g className="warehouse-racks">
                    {rackGroups.map((group) => (
                        <g key={group.key}>
                            <rect
                                className="warehouse-rack-background"
                                x={group.x}
                                y={group.y}
                                width={group.width}
                                height={group.height}
                                rx="10"
                            />

                            <text
                                className="warehouse-rack-title"
                                x={
                                    group.x +
                                    group.width / 2
                                }
                                y={group.y + 16}
                                textAnchor="middle"
                            >
                                선반
                            </text>

                            {group.nodes.map(
                                (node) => {
                                    const x =
                                        convertX(
                                            node.x
                                        );

                                    const rack =
                                        rackInventoryMap.get(
                                            node.id
                                        );

                                    return (
                                        <g
                                            key={
                                                node.id
                                            }
                                        >
                                            <text
                                                className="warehouse-rack-name"
                                                x={x}
                                                y={
                                                    group.centerY -
                                                    2
                                                }
                                                textAnchor="middle"
                                            >
                                                K
                                                {
                                                    node.col
                                                }
                                            </text>

                                            {rack?.levels.map(
                                                (
                                                    level,
                                                    index
                                                ) => (
                                                    <g
                                                        key={
                                                            level.level
                                                        }
                                                    >
                                                        <rect
                                                            className={getRackLevelClass(
                                                                level.status
                                                            )}
                                                            x={
                                                                x -
                                                                14 +
                                                                index *
                                                                    10
                                                            }
                                                            y={
                                                                group.centerY +
                                                                7
                                                            }
                                                            width="8"
                                                            height="8"
                                                            rx="1"
                                                        />

                                                        <text
                                                            className="warehouse-level-label"
                                                            x={
                                                                x -
                                                                10 +
                                                                index *
                                                                    10
                                                            }
                                                            y={
                                                                group.centerY +
                                                                24
                                                            }
                                                            textAnchor="middle"
                                                        >
                                                            L
                                                            {
                                                                level.level
                                                            }
                                                        </text>
                                                    </g>
                                                )
                                            )}
                                        </g>
                                    );
                                }
                            )}
                        </g>
                    ))}
                </g>


                {/* =========================
                    경로 노드
                ========================= */}

                <g className="warehouse-route-nodes">
                    {routeNodes.map((node) => {
                        const x = convertX(
                            node.x
                        );

                        const y = convertY(
                            node.y
                        );

                        return (
                            <g key={node.id}>
                                <polygon
                                    className="warehouse-route-node"
                                    points={`
                                        ${x},${y - 6}
                                        ${x + 6},${y}
                                        ${x},${y + 6}
                                        ${x - 6},${y}
                                    `}
                                />

                                <text
                                    className="warehouse-node-id"
                                    x={x}
                                    y={y - 10}
                                    textAnchor="middle"
                                >
                                    {node.id}
                                </text>
                            </g>
                        );
                    })}


                    {junctionNodes.map((node) => {
                        const x = convertX(
                            node.x
                        );

                        const y = convertY(
                            node.y
                        );

                        return (
                            <polygon
                                key={node.id}
                                className="warehouse-junction-node"
                                points={`
                                    ${x},${y - 5}
                                    ${x + 5},${y}
                                    ${x},${y + 5}
                                    ${x - 5},${y}
                                `}
                            />
                        );
                    })}
                </g>


                {/* =========================
                    입고 노드
                ========================= */}

                <g className="warehouse-inbound-nodes">
                    {inboundNodes.map((node) => {
                        const x = convertX(
                            node.x
                        );

                        const y = convertY(
                            node.y
                        );

                        return (
                            <g key={node.id}>
                                <text
                                    className="warehouse-station-id"
                                    x={x - 30}
                                    y={y + 4}
                                    textAnchor="end"
                                >
                                    {node.id}
                                </text>

                                <circle
                                    className="warehouse-inbound-node"
                                    cx={x}
                                    cy={y}
                                    r="13"
                                />

                                <text
                                    className="warehouse-station-letter"
                                    x={x}
                                    y={y + 5}
                                    textAnchor="middle"
                                >
                                    {node.label}
                                </text>
                            </g>
                        );
                    })}
                </g>


                {/* =========================
                    출고 노드
                ========================= */}

                <g className="warehouse-outbound-nodes">
                    {outboundNodes.map((node) => {
                        const x = convertX(
                            node.x
                        );

                        const y = convertY(
                            node.y
                        );

                        return (
                            <g key={node.id}>
                                <text
                                    className="warehouse-station-id"
                                    x={x - 30}
                                    y={y + 4}
                                    textAnchor="end"
                                >
                                    {node.id}
                                </text>

                                <circle
                                    className="warehouse-outbound-node"
                                    cx={x}
                                    cy={y}
                                    r="13"
                                />

                                <text
                                    className="warehouse-station-letter"
                                    x={x}
                                    y={y + 5}
                                    textAnchor="middle"
                                >
                                    {node.label}
                                </text>
                            </g>
                        );
                    })}
                </g>


                {/* =========================
                    충전 슬롯
                ========================= */}

                <g className="warehouse-charging-slots">
                    {chargingSlots.map((node) => {
                        const x = convertX(
                            node.x
                        );

                        const y = convertY(
                            node.y
                        );

                        return (
                            <g key={node.id}>
                                <polygon
                                    className="warehouse-charging-slot"
                                    points={`
                                        ${x},${y - 15}
                                        ${x + 12},${y + 10}
                                        ${x - 12},${y + 10}
                                    `}
                                />

                                <text
                                    className="warehouse-charging-code"
                                    x={x}
                                    y={y + 25}
                                    textAnchor="middle"
                                >
                                    {node.id}
                                </text>
                            </g>
                        );
                    })}
                </g>


                {/* =========================
                    범례
                ========================= */}

                <g className="warehouse-legend">
                    <rect
                        className="warehouse-legend-background"
                        x="30"
                        y="718"
                        width="1540"
                        height="55"
                        rx="10"
                    />

                    <polygon
                        className="warehouse-route-node"
                        points="
                            65,739
                            72,746
                            65,753
                            58,746
                        "
                    />

                    <text x="85" y="751">
                        로봇 경로 노드
                    </text>


                    <rect
                        className="warehouse-level-empty"
                        x="255"
                        y="739"
                        width="14"
                        height="14"
                    />

                    <text x="285" y="751">
                        랙 저장 노드
                    </text>


                    <line
                        className="warehouse-edge route-edge"
                        x1="440"
                        y1="746"
                        x2="490"
                        y2="746"
                    />

                    <text x="510" y="751">
                        로봇 이동 경로
                    </text>


                    <line
                        className="warehouse-edge rack-edge"
                        x1="680"
                        y1="746"
                        x2="730"
                        y2="746"
                    />

                    <text x="750" y="751">
                        랙 접근 경로
                    </text>


                    <circle
                        className="warehouse-inbound-node"
                        cx="920"
                        cy="746"
                        r="10"
                    />

                    <text x="940" y="751">
                        입고 a-g
                    </text>


                    <circle
                        className="warehouse-outbound-node"
                        cx="1070"
                        cy="746"
                        r="10"
                    />

                    <text x="1090" y="751">
                        출고 A-G
                    </text>


                    <polygon
                        className="warehouse-charging-slot"
                        points="
                            1270,734
                            1281,755
                            1259,755
                        "
                    />

                    <text x="1295" y="751">
                        충전 슬롯 10개
                    </text>
                </g>
            </svg>
        </div>
    );
}

export default SimulationView;