import { useEffect, useState } from "react";
import "../styles/warehouseSVG.css";

import rackInventory from "../data/rack_inventory.json";

// 창고별 정적 지도 JSON.
// 이 데이터는 창고의 고정 구조(노드, 엣지, 시설 위치)를 화면에 그리는 용도로만 사용한다.
import warehouseGraph1 from "../assets/warehouse-maps/warehouse_graph_1.json";
import warehouseGraph2 from "../assets/warehouse-maps/warehouse_graph_2.json";
import warehouseGraph3 from "../assets/warehouse-maps/warehouse_graph_3.json";

import robotCharging from "../assets/robots/robot_charging.png";
import robotHero from "../assets/robots/robot_hero.png";
import robotPicking from "../assets/robots/robot_picking.png";
import robotPutaway from "../assets/robots/robot_putaway.png";
import robotRelocation from "../assets/robots/robot_relocation.png";
import robotReplenish from "../assets/robots/robot_replenish.png";

// JSON의 node.type을 기준으로 창고 구성요소 색상을 통일한다.
// 백엔드 레이아웃도 nodeType을 소문자로 변환해 type에 넣으므로
// 폴백 JSON과 API 응답 모두 같은 색상 규칙을 사용한다.
const MAP_THEME = {
    route: {
        fill: "#ffffff",
        stroke: "#64748b",
        text: "#475569",
        label: "일반 노드",
    },
    rack: {
        fill: "#e2e8f0",
        stroke: "#475569",
        text: "#334155",
        label: "선반",
    },
    inbound: {
        fill: "#dcfce7",
        stroke: "#16a34a",
        text: "#166534",
        label: "입고지",
    },
    outbound: {
        fill: "#ffedd5",
        stroke: "#f97316",
        text: "#9a3412",
        label: "출고지",
    },
    charging: {
        fill: "#dbeafe",
        stroke: "#2563eb",
        text: "#1d4ed8",
        label: "충전 슬롯",
    },
};

const LEGEND_ITEMS = [
    { key: "rack", shape: "rect" },
    { key: "route", shape: "circle" },
    { key: "inbound", shape: "rect" },
    { key: "outbound", shape: "rect" },
    { key: "charging", shape: "rect" },
];

function WarehouseSVG({ warehouseId = 1, robots = [], simulationSpeed = 1 }) {
    // 노드 ID 표시 ON / OFF
    const [showNodeLabels, setShowNodeLabels] = useState(false);

    /*
     * 정적 지도와 동적 시뮬레이션 결과 분리
     * layoutGraph: JSON에서 읽어오는 창고의 고정 구조
     * - 창고가 바뀔 때만 교체된다.
     * simulationData: 백엔드 또는 상위 컴포넌트에서 전달하는 동적 결과
     * - 현재 단계에서는 로봇 상태만 보관한다.
     * - 이후 activePaths, blockedEdges, tasks 등을 이 객체에 추가할 수 있다.
     */
    const layoutGraph = useMemo(() =>
        fallbackGraphOf(warehouseId),
        [warehouseId]
    );

    const simulationData = useMemo(() => ({
        robots,
    }),
        [robots]
    );

    // JSON 원본을 화면 렌더링에 필요한 형태로 분류한다.
    const warehouseView = useMemo(() => {
        const nodes = layoutGraph?.nodes ?? [];

        // 노드 타입별 배열을 미리 만들어 렌더링 코드의 중복 filter를 제거한다.
        const routeNodes = nodes.filter((node) => node.type === "route");
        const rackAccessNodes = nodes.filter(
            (node) => node.type === "rack_access"
        );
        const inboundAccessNodes = nodes.filter(
            (node) => node.type === "inbound_access"
        );
        const outboundAccessNodes = nodes.filter(
            (node) => node.type === "outbound_access"
        );
        const chargeJunctionNodes = nodes.filter(
            (node) => node.type === "route_charge_junction"
        );
        const chargingNodes = nodes.filter(
            (node) => node.type === "charging_slot"
        );
        const inboundNodes = nodes.filter(
            (node) => node.type === "inbound"
        );
        const outboundNodes = nodes.filter(
            (node) => node.type === "outbound"
        );
        const emptyToteBufferNodes = nodes.filter(
            (node) => node.type === "empty_tote_buffer_access"
        );

        // edge.source / edge.target의 ID를 실제 노드 좌표로 찾을 때 사용한다.
        const nodeMap = new Map(nodes.map((node) => [node.id, node]));

        // rack_access A/B의 가운데 좌표를 실제 랙의 화면 위치로 사용한다.
        const rackMap = new Map();

        rackAccessNodes.forEach((accessNode) => {
            if (!accessNode.rack_id) {
                return;
            }

            if (!rackMap.has(accessNode.rack_id)) {
                rackMap.set(accessNode.rack_id, {
                    id: accessNode.rack_id,
                    accessA: null,
                    accessB: null,
                });
            }

            const rack = rackMap.get(accessNode.rack_id);

            if (accessNode.side === "A") {
                rack.accessA = accessNode;
            } else if (accessNode.side === "B") {
                rack.accessB = accessNode;
            }
        });

        const racks = [...rackMap.values()]
            // A/B 접근점이 모두 있는 정상 랙만 화면에 표시한다.
            .filter((rack) => rack.accessA && rack.accessB)
            .map((rack) => {
                const deltaX = rack.accessB.x - rack.accessA.x;
                const deltaY = rack.accessB.y - rack.accessA.y;

                return {
                    ...rack,

                    // A/B 접근점의 중간을 실제 랙 중심으로 사용한다.
                    x: (rack.accessA.x + rack.accessB.x) / 2,
                    y: (rack.accessA.y + rack.accessB.y) / 2,

                    // 접근점이 좌우로 놓이면 랙은 세로 방향, 접근점이 위아래로 놓이면 랙은 가로 방향으로 표시한다.
                    rotation: Math.abs(deltaX) > Math.abs(deltaY) ? 90 : 0,
                };
            });

        // 랙 관통 엣지 렌더링 방지
        // 화면상 랙을 뚫고 지나가는 엣지가 있다면 제외한다.
        // 잘못된 JSON이 들어와도 관통선을 표시하지 않도록 JSX에서 한 번 더 방어한다.
        const rackCrossingPairKeys = new Set(
            racks
                .map((rack) => {
                    const routeA = rack.accessA.adjacent_route_node;
                    const routeB = rack.accessB.adjacent_route_node;

                    if (!routeA || !routeB || routeA === routeB) {
                        return null;
                    }

                    return makeUndirectedEdgeKey(routeA, routeB);
                })
                .filter(Boolean)
        );

        // 원본 노드·엣지 구조는 로봇 이동과 기존 그래프 동작을 위해 그대로 유지한다.
        const edges = layoutGraph?.edges ?? [];

        // 랙을 관통하는 것으로 판단되는 엣지는 화면에서만 숨긴다.
        // 원본 edges에서는 제거하지 않는다.
        const renderedEdges = edges.filter((edge) =>
            !rackCrossingPairKeys.has(
                makeUndirectedEdgeKey(edge.source, edge.target)
            )
        );

        return {
            nodes,
            edges, // 기존 로봇 이동과 그래프 구조에서 사용하는 원본 엣지
            renderedEdges, // SVG 화면에 선을 그릴 때만 사용하는 엣지 
            nodeMap,
            routeNodes,
            rackAccessNodes,
            inboundAccessNodes,
            outboundAccessNodes,
            chargeJunctionNodes,
            chargingNodes,
            inboundNodes,
            outboundNodes,
            emptyToteBufferNodes,
            racks,
        };
    }, [layoutGraph]);

    // SVG 크기
    // 아래쪽에 범례 공간을 따로 확보해 충전 슬롯·로봇과 겹치지 않게 한다.
    const SVG_WIDTH = 1200;
    const SVG_HEIGHT = 680;

    const PADDING_X = 40;
    const PADDING_TOP = 50;
    const PADDING_BOTTOM = 135;

    // JSON 좌표를 SVG 좌표로 바꾸기 위해 전체 노드의 좌표 범위를 계산한다.
    // 창고 지도마다 좌표 체계가 달라도 같은 SVG 영역에 자동으로 맞춰진다.
    const coordinateBounds = useMemo(() => {
        const xValues = warehouseView.nodes.map((node) => node.x);
        const yValues = warehouseView.nodes.map((node) => node.y);

        // 비어 있는 지도나 동일 좌표만 있는 예외 상황에서도 0으로 나누지 않도록 보호한다.
        const rawMinX = xValues.length ? Math.min(...xValues) : 0;
        const rawMaxX = xValues.length ? Math.max(...xValues) : 1;
        const rawMinY = yValues.length ? Math.min(...yValues) : 0;
        const rawMaxY = yValues.length ? Math.max(...yValues) : 1;

        return {
            minX: rawMinX,
            maxX: rawMaxX === rawMinX ? rawMinX + 1 : rawMaxX,
            minY: rawMinY,
            maxY: rawMaxY === rawMinY ? rawMinY + 1 : rawMaxY,
        };
    }, [warehouseView.nodes]);

    const { minX, maxX, minY, maxY } = coordinateBounds;

    // JSON X 좌표 → SVG X 좌표
    const convertX = (x) => {
        const availableWidth = SVG_WIDTH - PADDING_X * 2;

        return (
            PADDING_X + ((x - minX) / (maxX - minX)) * availableWidth
        );
    };

    // JSON Y 좌표 → SVG Y 좌표
    const convertY = (y) => {
        const availableHeight =
            SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

        return (
            PADDING_TOP +
            ((y - minY) / (maxY - minY)) *
            availableHeight
        );
    };


    /*
     * 화면에 표시할 엣지 좌표를 계산한다.
     * 1. 반대 방향 엣지가 없으면 기존 좌표 그대로 한 줄을 그린다.
     * 2. 반대 방향 엣지가 있으면 같은 두 노드 사이의 선을
     *    중심 기준 양쪽으로 조금씩 이동해 평행한 두 줄로 그린다.
     * 3. 엣지 ID의 _IN / _OUT 여부나 엣지 type과 상관없이
     *    실제 source → target의 반대 엣지가 존재하는지만 확인한다.
     */
    const renderEdges = useMemo(() => {
        // source → target 형식으로 모든 방향 엣지를 빠르게 조회한다.
        const directedEdgeKeys = new Set(
            warehouseView.renderedEdges.map(
                (edge) => `${edge.source}->${edge.target}`
            )
        );

        return warehouseView.renderedEdges.map((edge) => {
            const source = warehouseView.nodeMap.get(edge.source);
            const target = warehouseView.nodeMap.get(edge.target);

            if (!source || !target) {
                return null;
            }

            const originalX1 = convertX(source.x);
            const originalY1 = convertY(source.y);
            const originalX2 = convertX(target.x);
            const originalY2 = convertY(target.y);

            // target → source 엣지가 있으면 양방향으로 판단한다.
            const isBidirectional = directedEdgeKeys.has(
                `${edge.target}->${edge.source}`
            );

            // 단방향 연결은 기존 중앙선 위치를 그대로 사용한다.
            if (!isBidirectional) {
                return {
                    ...edge,
                    x1: originalX1,
                    y1: originalY1,
                    x2: originalX2,
                    y2: originalY2,
                    isBidirectional: false,
                };
            }

            // 노드 ID를 정렬해 양방향 엣지의 공통 기준 방향을 만든다.
            const [canonicalSourceId, canonicalTargetId] =
                [edge.source, edge.target].sort();

            const canonicalSource = warehouseView.nodeMap.get(
                canonicalSourceId
            );
            const canonicalTarget = warehouseView.nodeMap.get(
                canonicalTargetId
            );

            if (!canonicalSource || !canonicalTarget) {
                return null;
            }

            const canonicalX1 = convertX(canonicalSource.x);
            const canonicalY1 = convertY(canonicalSource.y);
            const canonicalX2 = convertX(canonicalTarget.x);
            const canonicalY2 = convertY(canonicalTarget.y);

            const deltaX = canonicalX2 - canonicalX1;
            const deltaY = canonicalY2 - canonicalY1;
            const edgeLength = Math.hypot(deltaX, deltaY);

            // 시작점과 끝점이 같은 비정상 엣지는 기존 위치로 표시한다.
            if (edgeLength === 0) {
                return {
                    ...edge,
                    x1: originalX1,
                    y1: originalY1,
                    x2: originalX2,
                    y2: originalY2,
                    isBidirectional: true,
                };
            }

            // 공통 기준선에 수직인 단위 벡터
            const normalX = -deltaY / edgeLength;
            const normalY = deltaX / edgeLength;

            // 정렬된 기준 방향과 같은 방향이면 +offset, 반대 방향이면 -offset을 적용한다.
            const followsCanonicalDirection =
                edge.source === canonicalSourceId
                && edge.target === canonicalTargetId;

            const offsetSign = followsCanonicalDirection ? 1 : -1;
            const offsetX = normalX * BIDIRECTIONAL_EDGE_OFFSET * offsetSign;
            const offsetY = normalY * BIDIRECTIONAL_EDGE_OFFSET * offsetSign;

            return {
                ...edge,
                x1: originalX1 + offsetX,
                y1: originalY1 + offsetY,
                x2: originalX2 + offsetX,
                y2: originalY2 + offsetY,
                isBidirectional: true,
            };
        }).filter(Boolean);
    }, [
        warehouseView.renderedEdges,
        warehouseView.nodeMap,
        minX,
        maxX,
        minY,
        maxY,
    ]);

    // 랙 ID → 랙 재고 정보
    // rack_access에서 만든 화면용 랙 ID와 rack_inventory.json을 연결한다.
    const rackInventoryMap = useMemo(() => new Map(
        rackInventory.racks.map((rack) => [rack.rack_node_id, rack])
    ),
        []
    );

    // 랙 재고 상태에 따라 사용할 CSS class를 반환한다.
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

    // 로봇 상태별 이미지 매핑
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
                style={{
                    top: "10px",
                    left: "50%",
                    right: "auto",
                    transform: "translateX(-50%)",
                }}
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

                {/*  EDGE
                    - 항상 노드보다 먼저 그려야 선 위에 노드가 올라온다.
                    - 단방향 연결은 기존처럼 가운데 한 줄로 표시한다.
                    - 양방향 연결은 같은 스타일의 평행선 두 줄로 표시한다.
                */}
                <g className="warehouse-edges warehouse-rendered-edges">
                    {renderEdges.map((edge) => (
                        <line
                            key={edge.id}
                            x1={edge.x1}
                            y1={edge.y1}
                            x2={edge.x2}
                            y2={edge.y2}
                            className={`warehouse-edge warehouse-rendered-edge ${edge.isBidirectional
                                ? "warehouse-bidirectional-edge"
                                : "warehouse-single-edge"
                                } edge-${edge.type}`}
                            data-edge-id={edge.id}
                            data-bidirectional={edge.isBidirectional}
                        >
                            <title>{edge.id}</title>
                        </line>
                    ))}
                </g>

                {/* 통로 번호 */}
                <g className="warehouse-aisle-labels">
                    {warehouseView.routeNodes
                        .filter((node) => node.col === 0)
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
                    {warehouseView.routeNodes
                        .map((node) => (
                            <g key={node.id}>

                                {/* 이동 노드 */}
                                <circle
                                    cx={convertX(node.x)}
                                    cy={convertY(node.y)}
                                    r="3"
                                    className="warehouse-route-node"
                                    style={{
                                        fill: MAP_THEME.route.fill,
                                        stroke: MAP_THEME.route.stroke,
                                    }}
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

                {/* 입고지 연결 inbound-access */}
                <g className="warehouse-inbound-access">
                    {warehouseView.inboundAccessNodes
                        .map((node) => (
                            <g key={node.id}>

                                <circle
                                    cx={convertX(node.x)}
                                    cy={convertY(node.y)}
                                    r="4"
                                    className="warehouse-inbound-access"
                                    style={{
                                        fill: MAP_THEME.inbound.fill,
                                        stroke: MAP_THEME.inbound.stroke,
                                    }}
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

                {/* 출고지 연결 inbound-access */}
                <g className="warehouse-outbound-access">
                    {warehouseView.outboundAccessNodes
                        .map((node) => (
                            <g key={node.id}>
                                <circle
                                    cx={convertX(node.x)}
                                    cy={convertY(node.y)}
                                    r="4"
                                    className="warehouse-outbound-access"
                                    style={{
                                        fill: MAP_THEME.outbound.fill,
                                        stroke: MAP_THEME.outbound.stroke,
                                    }}
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
                    {warehouseView.chargeJunctionNodes
                        .map((node) => (
                            <circle
                                key={node.id}
                                cx={convertX(node.x)}
                                cy={convertY(node.y)}
                                r="4"
                                className="warehouse-charge-junction"
                                style={{
                                    fill: MAP_THEME.charging.fill,
                                    stroke: MAP_THEME.charging.stroke,
                                }}
                            >
                                <title>{node.id}</title>
                            </circle>
                        ))}
                </g>

                {/* 선반
                    - JSON에는 rack_storage 노드가 없다.
                    - rack_access A/B의 중간 좌표에 실제 랙을 생성한다.
                    - rack_inventory.json의 3단 재고 상태를 함께 표시한다.
                */}
                <g className="warehouse-racks">
                    {warehouseView.racks.map((rack) => {
                        const inventory = rackInventoryMap.get(rack.id);

                        // 화면에서는 상단 → 중단 → 하단 순서로 보여주기 위해 level을 역순으로 정렬한다.
                        const levels = inventory?.levels
                            ? [...inventory.levels].sort(
                                (a, b) => b.level - a.level
                            )
                            : [];

                        return (
                            <g
                                key={rack.id}
                                transform={`translate(
                                            ${convertX(rack.x)},
                                            ${convertY(rack.y)}
                                        )`}
                            >
                                {/* 랙 몸체만 회전시킨다.
                                    ID 텍스트는 바깥 그룹에 두어 항상 수평으로 표시한다. */}
                                <g transform={`rotate(${rack.rotation})`}>

                                    {/* 선반 외곽 */}
                                    <rect
                                        x="-22"
                                        y="-17"
                                        width="44"
                                        height="34"
                                        className="warehouse-rack"
                                        style={{
                                            fill: MAP_THEME.rack.fill,
                                            stroke: MAP_THEME.rack.stroke,
                                        }}
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
                                        style={{ fill: MAP_THEME.rack.text }}
                                    >
                                        <title>
                                            {`${rack.id} / 접근점: ${rack.accessA.id}, ${rack.accessB.id}`}
                                        </title>
                                    </rect>

                                    {/* 선반 3단 재고 상태 */}
                                    {levels.map((level, index) => (
                                        <rect
                                            key={level.level}
                                            x="-20"
                                            y={-15 + index * 10}
                                            width="40"
                                            height="9"
                                            className={`warehouse-rack-level ${getRackLevelClass(level.status)}`}
                                        >
                                            <title>
                                                {`${rack.id} / ${level.level}단 / ${level.status}`}
                                            </title>
                                        </rect>
                                    ))}
                                </g>

                                {/* 랙 ID는 회전하지 않고 항상 읽기 쉽게 표시한다. */}
                                <text
                                    x="0"
                                    y="27"
                                    textAnchor="middle"
                                    className="warehouse-rack-label"
                                >
                                    {rack.id}
                                </text>
                            </g>
                        );
                    })}
                </g>

                {/* 입고 엘리베이터 IA ~ IG  */}
                <g className="warehouse-inbound">
                    {warehouseView.inboundNodes
                        .map((node) => (
                            <g key={node.id}>
                                <rect
                                    x={convertX(node.x) - 14}
                                    y={convertY(node.y) - 10}
                                    width="28"
                                    height="20"
                                    rx="3"
                                    className="warehouse-inbound-node"
                                    style={{
                                        fill: MAP_THEME.inbound.fill,
                                        stroke: MAP_THEME.inbound.stroke,
                                    }}
                                />

                                <text
                                    x={convertX(node.x)}
                                    y={convertY(node.y) + 4}
                                    textAnchor="middle"
                                    className="warehouse-station-label"
                                    style={{ fill: MAP_THEME.inbound.text }}
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
                        ))}
                </g>

                {/* 출고 엘리베이터 OA ~ OG */}
                <g className="warehouse-outbound">
                    {warehouseView.outboundNodes
                        .map(
                            (node) => (
                                <g key={node.id}>
                                    <rect
                                        x={convertX(node.x) - 14}
                                        y={convertY(node.y) - 10}
                                        width="28"
                                        height="20"
                                        rx="3"
                                        className="warehouse-outbound-node"
                                        style={{
                                            fill: MAP_THEME.outbound.fill,
                                            stroke: MAP_THEME.outbound.stroke,
                                        }}
                                    />

                                    <text
                                        x={convertX(node.x)}
                                        y={convertY(node.y) + 4}
                                        textAnchor="middle"
                                        className="warehouse-station-label"
                                        style={{ fill: MAP_THEME.outbound.text }}
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
                            ))}
                </g>

                {/* 충전소 C01 ~ C10 */}
                <g className="warehouse-charging">
                    {warehouseView.chargingNodes
                        .map((node) => (
                            <g key={node.id}>
                                <rect
                                    x={convertX(node.x) - 18}
                                    y={convertY(node.y) - 10}
                                    width="36"
                                    height="20"
                                    rx="3"
                                    className="warehouse-charging-slot"
                                    style={{
                                        fill: MAP_THEME.charging.fill,
                                        stroke: MAP_THEME.charging.stroke,
                                    }}
                                >
                                    <title>{node.id}</title>
                                </rect>

                                <text
                                    x={convertX(node.x)}
                                    y={convertY(node.y) + 4}
                                    textAnchor="middle"
                                    className="warehouse-charging-label"
                                    style={{ fill: MAP_THEME.charging.text }}
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
                        ))}
                </g>

                {/* 주요 구역 이름: 지도의 실제 구성요소와 겹치지 않도록 배지로 표시 */}
                <g className="warehouse-area-badges">
                    <g transform="translate(16, 12)">
                        <rect
                            width="88"
                            height="28"
                            rx="8"
                            fill={MAP_THEME.inbound.fill}
                            stroke={MAP_THEME.inbound.stroke}
                        />
                        <circle
                            cx="15"
                            cy="14"
                            r="4"
                            fill={MAP_THEME.inbound.stroke}
                        />
                        <text
                            x="50"
                            y="19"
                            textAnchor="middle"
                            className="warehouse-area-title"
                            style={{ fill: MAP_THEME.inbound.text }}
                        >
                            입고지
                        </text>
                    </g>

                    <g transform={`translate(${SVG_WIDTH - 104}, 12)`}>
                        <rect
                            width="88"
                            height="28"
                            rx="8"
                            fill={MAP_THEME.outbound.fill}
                            stroke={MAP_THEME.outbound.stroke}
                        />
                        <circle
                            cx="15"
                            cy="14"
                            r="4"
                            fill={MAP_THEME.outbound.stroke}
                        />
                        <text
                            x="50"
                            y="19"
                            textAnchor="middle"
                            className="warehouse-area-title"
                            style={{ fill: MAP_THEME.outbound.text }}
                        >
                            출고지
                        </text>
                    </g>

                    <g transform={`translate(16, ${SVG_HEIGHT - PADDING_BOTTOM + 12})`}>
                        <rect
                            width="96"
                            height="28"
                            rx="8"
                            fill={MAP_THEME.charging.fill}
                            stroke={MAP_THEME.charging.stroke}
                        />
                        <circle
                            cx="15"
                            cy="14"
                            r="4"
                            fill={MAP_THEME.charging.stroke}
                        />
                        <text
                            x="54"
                            y="19"
                            textAnchor="middle"
                            className="warehouse-area-title"
                            style={{ fill: MAP_THEME.charging.text }}
                        >
                            충전소
                        </text>
                    </g>
                </g>

                {/* 색상 범례 */}
                <g
                    className="warehouse-map-legend"
                    transform={`translate(${SVG_WIDTH / 2 - 420}, ${SVG_HEIGHT - 48})`}
                >
                    <rect
                        x="0"
                        y="0"
                        width="840"
                        height="38"
                        rx="10"
                        fill="#f8fafc"
                        stroke="#cbd5e1"
                    />

                    <text
                        x="22"
                        y="24"
                        fontSize="13"
                        fontWeight="700"
                        fill="#334155"
                    >
                        범례
                    </text>

                    {LEGEND_ITEMS.map((item, index) => {
                        const theme = MAP_THEME[item.key];
                        const itemX = 86 + index * 145;

                        return (
                            <g
                                key={item.key}
                                transform={`translate(${itemX}, 0)`}
                            >
                                {item.shape === "circle" ? (
                                    <circle
                                        cx="10"
                                        cy="19"
                                        r="6"
                                        fill={theme.fill}
                                        stroke={theme.stroke}
                                        strokeWidth="2"
                                    />
                                ) : (
                                    <rect
                                        x="2"
                                        y="11"
                                        width="18"
                                        height="16"
                                        rx="3"
                                        fill={theme.fill}
                                        stroke={theme.stroke}
                                        strokeWidth="2"
                                    />
                                )}

                                <text
                                    x="28"
                                    y="24"
                                    fontSize="12"
                                    fontWeight="600"
                                    fill={theme.text}
                                >
                                    {theme.label}
                                </text>
                            </g>
                        );
                    })}
                </g>

                {/* 로봇 */}
                <g className="warehouse-robots">
                    {simulationData.robots.map((robot) => {
                        // robots.json의 node_id를 이용해서
                        // warehouse_graph.json에서 현재 위치 찾기
                        const currentNode = warehouseView.nodeMap.get(robot.node_id);

                        if (!currentNode) {
                            return null;
                        }

                        // 현재 상태에 맞는 로봇 이미지
                        const robotImage = robotImages[robot.status] ?? robotHero;
                        const robotX = convertX(currentNode.x);
                        const robotY = convertY(currentNode.y);
                        const ROBOT_SIZE = 45;

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
                                            x="-20"
                                            y="-23"
                                            width="40"
                                            height="40"
                                            rx="50"
                                            ry="50"
                                        />
                                    </clipPath>
                                </defs>
                                <image
                                    href={robotImage}
                                    x="-20"
                                    y="-20"
                                    width="40"
                                    height="40"
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