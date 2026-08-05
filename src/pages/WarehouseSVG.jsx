// ============================================================
// 1. IMPORTS
// ============================================================
import { useEffect, useRef, useState } from "react";
import "../styles/WarehouseSVG.css";
import { productApi, warehouseApi, warehouseItemApi } from "../api/client";

import robotCharging from "../assets/robots/robot_charging.png";
import robotHero from "../assets/robots/robot_hero.png";
import robotPicking from "../assets/robots/robot_picking.png";
import robotPutaway from "../assets/robots/robot_putaway.png";
import robotRelocation from "../assets/robots/robot_relocation.png";
import robotReplenish from "../assets/robots/robot_replenish.png";

// ============================================================
// 2. 화면·시뮬레이션 공통 상수
// ============================================================
const SVG_WIDTH = 1200;
const SVG_HEIGHT = 600;
const PADDING_X = 40;
const PADDING_Y = 30;
const INVENTORY_POLL_INTERVAL_MS = 1500;
const ROBOT_MARKER_SIZE = 46;
const OUTBOUND_HANDOFF_RATIO = 0.25;
const RACK_LEVELS = [1, 2, 3];

const TERMINAL_TASK_STATUSES = new Set(["DONE", "FAILED", "CANCELLED"]);
const OUTBOUND_SERVICE_EDGE_TYPES = new Set([
    "outbound_service",
    "station_service",
]);

// 로봇 동작·상태별 이미지 매핑
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

// ============================================================
// 3. 공통 순수 함수
// ============================================================

/**
 * 그래프에 시각화용 rack_storage 노드가 없는 경우 rack_access 노드를 이용해 보완한다.
 * 백엔드 그래프는 경로 탐색에 필요한 접근 노드만 제공할 수 있지만, 
 * 화면에서는 선반 자체를 그려야 하므로 동일한 rack_id를 가진 접근 노드들의 중심 좌표에 가상 선반 노드를 만든다.
 * 이미 같은 ID의 rack_storage 노드가 존재하면 중복 생성하지 않는다.
 */
const withRackStorageNodes = (graph) => {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    // 실제 그래프에 이미 포함된 선반 ID를 Set으로 만들어 중복 여부를 빠르게 확인한다.
    const existingRackIds = new Set(
        nodes
            .filter((node) => node.type === "rack_storage")
            .map((node) => node.id),
    );
    // rack_access 노드를 rack_id별로 묶는다.
    // rack_id 필드가 없을 수 있으므로 resourceCode와 노드 ID 규칙을 순서대로 대체값으로 사용한다.
    const accessNodesByRack = new Map();

    nodes
        .filter((node) => node.type === "rack_access")
        .forEach((node) => {
            const rackId =
                node.rack_id ??
                node.resourceCode ??
                node.id?.replace(/_ACCESS_[A-Z]$/, "");
            if (!rackId) return;
            const accessNodes = accessNodesByRack.get(rackId) ?? [];
            accessNodes.push(node);
            accessNodesByRack.set(rackId, accessNodes);
        });

    // 선반 본체가 없는 rack_id만 골라 접근 노드들의 평균 좌표에 시각화 전용 선반을 생성한다.
    // visualOnly는 경로 탐색용 노드가 아니라 화면 표시를 위해 파생된 노드임을 나타낸다.
    const derivedRacks = [...accessNodesByRack.entries()]
        .filter(([rackId]) => !existingRackIds.has(rackId))
        .map(([rackId, accessNodes]) => ({
            id: rackId,
            type: "rack_storage",
            x:
                accessNodes.reduce((sum, node) => sum + Number(node.x), 0) /
                accessNodes.length,
            y:
                accessNodes.reduce((sum, node) => sum + Number(node.y), 0) /
                accessNodes.length,
            visualOnly: true,
        }));

    // 원본 그래프 객체의 다른 속성은 그대로 유지하고, 파생 선반 노드만 nodes 배열 뒤에 추가한다.
    return {
        ...graph,
        nodes: [...nodes, ...derivedRacks],
    };
};

// 진행률이나 비율을 0~1 범위로 제한하는 공통 함수
// 숫자로 변환할 수 없는 값은 0으로 처리해 좌표 계산에서 NaN이 퍼지는 것을 막는다.
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

// task/robot ID를 이용해 여러 후보 중 하나를 고르는 로직이 입고·출고에서 반복되므로
// 동일한 선택 규칙을 한 함수로 모아 렌더링마다 선택 결과가 바뀌지 않게 한다.
const selectByStableKey = (items, key = 0) => {
    if (!Array.isArray(items) || items.length === 0) return null;

    const numericKey = Number(key ?? 0);
    const safeKey = Number.isFinite(numericKey) ? numericKey : 0;
    return items[Math.abs(safeKey) % items.length];
};

// 좌표 보간식이 로봇 이동과 BOX 인계 처리에 반복되어 의미를 드러내는 함수로 정리한다.
const interpolate = (start, end, progress) =>
    start + (end - start) * progress;

// 주어진 엣지에서 현재 nodeId의 반대편 노드 ID를 반환한다.
// 해당 엣지에 nodeId가 포함되지 않으면 null을 반환한다.
const peerNodeId = (edge, nodeId) => (
    edge.source === nodeId
        ? edge.target
        : edge.target === nodeId
            ? edge.source
            : null
);

// 출고 설비 내부 연결에 해당하는 서비스 엣지인지 판별한다.
const isOutboundServiceEdge = (edge) => (
    edge.service_only === true
    || OUTBOUND_SERVICE_EDGE_TYPES.has(String(edge.type ?? "").toLowerCase())
);

// 여러 후보 중 목표 y 좌표와 가장 가까운 노드를 선택한다.
const closestNodeByY = (nodes, targetY) => nodes.reduce(
    (best, node) => (
        !best || Math.abs(Number(node.y) - Number(targetY))
            < Math.abs(Number(best.y) - Number(targetY))
            ? node
            : best
    ),
    null,
);

// 원본 그래프 좌표를 SVG 좌표로 바꾸는 X/Y 함수의 중복을 제거한다.
const createCoordinateConverter = (values, canvasSize, padding) => {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const availableSize = canvasSize - padding * 2;

    return (value) => (
        padding
        + ((value - minValue) / (maxValue - minValue)) * availableSize
    );
};

// 연결 노드를 찾을 때마다 전체 엣지를 순회하지 않도록 노드별 엣지 역인덱스를 생성한다.
const createEdgesByNodeMap = (edges) => {
    const edgesByNode = new Map();

    edges.forEach((edge) => {
        [edge.source, edge.target].forEach((nodeId) => {
            const connectedEdges = edgesByNode.get(nodeId) ?? [];
            connectedEdges.push(edge);
            edgesByNode.set(nodeId, connectedEdges);
        });
    });

    return edgesByNode;
};

/**
 * 상품 ID마다 일관된 BOX 색상을 만든다.
 * 숫자 ID는 그대로 사용하고, 문자열 ID는 문자 코드의 합으로 안정적인 숫자를 만든다.
 * 황금각에 가까운 137.508도를 간격으로 hue를 이동시켜 인접 ID도 서로 다른 색이 되게 한다.
 */
const productColor = (itemId) => {
    const numericId = Number(itemId);
    const stableNumber = Number.isFinite(numericId)
        ? numericId
        : String(itemId ?? "")
            .split("")
            .reduce((sum, character) => sum + character.charCodeAt(0), 0);
    const hue = ((stableNumber - 1) * 137.508 + 210) % 360;
    return `hsl(${hue.toFixed(1)} 68% 62%)`;
};

/**
 * 특정 시각(now)에 로봇이 화면상 어느 좌표에 있어야 하는지 계산한다.
 * 백엔드가 내려준 movement_progress를 기준값으로 사용하고, 
 * 다음 스냅샷이 오기 전 짧은 구간만 requestAnimationFrame 시각을 이용해 예측한다. 
 */
const robotPositionAt = (
    robot,
    fromX,
    fromY,
    toX,
    toY,
    now,
    isRunning,
) => {
    // 이동 단계 ID가 없거나 진행률이 유효한 숫자가 아니면 정지 상태로 보고 출발 좌표를 반환한다.
    if (!robot.movement_step_id || !Number.isFinite(robot.movement_progress)) {
        return { x: fromX, y: fromY };
    }

    // 백엔드 스냅샷에 포함된 진행률, 남은 시간, 스냅샷 수신 시각을 보간 계산에 사용한다.
    const baseProgress = clamp01(robot.movement_progress);
    let progress = baseProgress;
    const remainingMillis = Number(robot.arrival_in_seconds) * 1000;
    const receivedAt = Number(robot.movement_snapshot_received_at);

    // 백엔드에서 전달받은 진행률을 기준값으로 사용한다.
    // 다음 백엔드 스냅샷을 받기 전까지의 짧은 구간만 예측하며, 프론트에서 경과 시간을 누적해 진행률을 계속 계산하지 않는다.
    if (
        isRunning
        && baseProgress < 1
        && Number.isFinite(remainingMillis)
        && remainingMillis > 0
        && Number.isFinite(receivedAt)
    ) {
        // 스냅샷 수신 후 지난 시간을 남은 이동 시간과 비교해, 남은 구간에서의 예상 진행률을 구한다.
        // Math.min(1, ...)을 사용하므로 다음 응답이 늦어져도 목표 지점을 지나치지 않는다.
        const elapsed = Math.max(0, now - receivedAt);
        const remainingRatio = Math.min(1, elapsed / remainingMillis);
        progress = baseProgress + (1 - baseProgress) * remainingRatio;
    }

    // 출발점과 도착점 사이를 progress 비율만큼 선형 보간하여 최종 SVG 좌표를 만든다.
    return {
        x: interpolate(fromX, toX, progress),
        y: interpolate(fromY, toY, progress),
    };
};

// ============================================================
// 4. 백엔드 레이아웃 응답 변환
// ============================================================
// 백엔드 레이아웃 응답을 화면에서 사용하는 그래프 구조로 변환한다.
const convertWarehouseLayout = (data) => {
    // 엣지는 DB의 숫자 노드 ID를 참조하므로, 화면용 nodeCode로 바꾸기 위한 맵을 만든다.
    const nodeCodeMap = new Map(
        data.nodes
            .filter((node) => node.nodeCode)
            .map((node) => [node.id, node.nodeCode]),
    );

    // 유효한 코드와 타입을 가진 노드만 렌더링 대상으로 변환한다.
    // routeAttributes를 먼저 펼친 뒤 공통 필드를 덮어써 백엔드 확장 속성도 보존한다.
    const convertedNodes = data.nodes
        .filter((node) => node.nodeCode && node.nodeType)
        .map((node) => {
            const routeMatch = node.nodeCode.match(/^R(\d+)_(\d+)$/);
            const chargingMatch = node.nodeCode.match(/^C(\d+)$/);

            return {
                ...(node.routeAttributes ?? {}),
                databaseId: node.id,
                id: node.nodeCode,
                type: node.nodeType.toLowerCase(),
                x: node.x,
                y: node.y,
                rack_id:
                    node.nodeType === "RACK_ACCESS"
                        ? node.resourceCode
                        : undefined,
                handoff_id:
                    node.nodeType === "INBOUND_HANDOFF_ACCESS"
                        ? node.resourceCode
                        : undefined,
                station_id:
                    node.nodeType === "OUTBOUND_STATION_ACCESS"
                        ? node.resourceCode
                        : undefined,
                side: node.side,
                service_only: node.serviceOnly,
                transit_allowed: node.transitAllowed,
                holding_allowed: node.holdingAllowed,
                node_capacity: node.nodeCapacity,
                row: routeMatch ? Number(routeMatch[1]) : undefined,
                col: routeMatch ? Number(routeMatch[2]) : undefined,
                label:
                    node.nodeType === "INBOUND"
                        ? node.nodeCode.replace("I_", "")
                        : node.nodeType === "OUTBOUND"
                            ? node.nodeCode.replace("O_", "")
                            : undefined,
                index: chargingMatch ? Number(chargingMatch[1]) : undefined,
            };
        });

    // 엣지의 양 끝 DB ID를 nodeCode로 교체하고 거리·속도·통행 가능 속성을 보존한다.
    const convertedEdges = data.edges
        .map((edge) => ({
            ...(edge.routeAttributes ?? {}),
            id: edge.edgeCode ?? String(edge.id),
            source: nodeCodeMap.get(edge.fromNodeId),
            target: nodeCodeMap.get(edge.toNodeId),
            type: edge.edgeType ?? "lane",
            distance_m: edge.distance,
            speed_limit_mps: edge.speedLimitMps,
            service_only: edge.serviceOnly,
            mobile_robot_traversable: edge.mobileRobotTraversable,
        }))
        .filter((edge) => edge.source && edge.target);

    return {
        graph: withRackStorageNodes({
            nodes: convertedNodes,
            edges: convertedEdges,
        }),
        convertedNodeCount: convertedNodes.length,
        convertedEdgeCount: convertedEdges.length,
    };
};

// ============================================================
// 5. 로봇 마커 하위 컴포넌트
// ============================================================
/**
 * 로봇 한 대를 SVG 그룹으로 렌더링하고 위치를 애니메이션한다.
 * 부모가 계산한 출발·도착 SVG 좌표와 백엔드 이동 스냅샷을 받아 DOM transform만 갱신한다.
 * carrying_load가 참이면 로봇 우측 상단에 운반 중인 BOX도 함께 표시한다.
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
    // SVG <g> 요소를 직접 참조해 매 프레임 React 재렌더링 없이 transform만 변경한다.
    const elementRef = useRef(null);

    // 로봇 데이터나 이동 구간이 바뀔 때 애니메이션 루프를 새로 시작한다.
    useEffect(() => {
        let frameId = null;
        // requestAnimationFrame이 넘겨주는 고해상도 시각을 기준으로 현재 예상 좌표를 계산한다.
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
            // ref가 연결된 뒤에는 SVG 그룹 전체를 해당 위치로 이동시킨다.
            // 로봇 이미지, ID, 적재 BOX가 같은 그룹 안에 있으므로 함께 움직인다.
            if (elementRef.current) {
                elementRef.current.style.transform =
                    `translate(${position.x}px, ${position.y}px)`;
            }

            // 시뮬레이션이 실행 중이고 아직 이동이 끝나지 않았을 때만 다음 프레임을 예약한다.
            // 정지 상태나 도착 상태에서는 불필요한 애니메이션 루프를 유지하지 않는다.
            const shouldContinue = isRunning
                && robot.movement_step_id
                && clamp01(robot.movement_progress) < 1
                && Number(robot.arrival_in_seconds) > 0;
            if (shouldContinue) {
                frameId = window.requestAnimationFrame(renderPosition);
            }
        };

        // effect가 시작된 즉시 한 번 위치를 반영하고, 컴포넌트 해제 시 예약된 프레임을 취소한다.
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

    // 첫 렌더 순간에도 로봇이 출발점으로 튀지 않도록 현재 시각 기준 초기 위치를 계산한다.
    const initialPosition = robotPositionAt(
        robot,
        fromX,
        fromY,
        toX,
        toY,
        performance.now(),
        isRunning,
    );
    // 각 로봇은 하나의 SVG 그룹으로 묶여 transform 이동이 모든 자식 요소에 동일하게 적용된다.
    return (
        <g
            ref={elementRef}
            className="warehouse-robot"
            style={{
                transform: `translate(${initialPosition.x}px, ${initialPosition.y}px)`,
            }}
        >
            {/* 로봇별 고유 clipPath를 만들어 정사각형 이미지를 원형에 가깝게 잘라 표시한다. */}
            <defs>
                <clipPath id={`robot-rounded-${robot.robot_id}`}>
                    <rect x="-23" y="-23" width="50" height="50" rx="50" ry="50" />
                </clipPath>
            </defs>
            {/* 현재 activity/status에 맞게 선택된 로봇 이미지를 그룹 중심에 배치한다. */}
            <image
                href={robotImage}
                x="-23"
                y="-23"
                width="50"
                height="50"
                clipPath={`url(#robot-rounded-${robot.robot_id})`}
            />
            {/* 시설 인계 애니메이션이 별도로 표시되지 않을 때만 로봇 위의 적재 BOX를 보여준다. */}
            {robot.carrying_load && !hideLoad && (
                <g className="warehouse-robot-load" transform="translate(14, -18)">
                    <rect width="16" height="12" x="-8" y="-6" rx="2" style={{ fill: loadColor }} />
                    <path d="M -8 -1 H 8 M 0 -6 V 6" />
                    <title>{loadTitle ?? "운반 중인 BOX"}</title>
                </g>
            )}
            {/* 로봇 코드와 상세 툴팁을 제공해 지도에서 개별 로봇 상태를 식별할 수 있게 한다. */}
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

// ============================================================
// 6. 창고 메인 컴포넌트
// ============================================================
/**
 * warehouseId가 바뀌면 레이아웃과 재고를 다시 조회하고, robots/tasks/commands를 조합하여
 * 실시간 로봇 이동, 시설 인계, 입고 대기열, 선반 점유 상태를 한 SVG 안에 표현한다.
 *
 * 주요 props
 * - warehouseId: 조회할 창고 식별자
 * - robots: 백엔드 또는 실시간 채널에서 받은 로봇 상태 목록
 * - tasks: 현재 작업 목록
 * - generatedCommands: 아직 작업으로 저장되지 않았을 수 있는 생성 명령 목록
 * - isRunning: 시뮬레이션 실행 여부이며 애니메이션과 재고 폴링에 사용된다.
 */
function WarehouseSVG({
    warehouseId = 1,
    robots = [],
    tasks = [],
    generatedCommands = [],
    isRunning = false,
}) {
    // ============================================================
    // 6-1. 상태
    // ============================================================
    const [showNodeLabels, setShowNodeLabels] = useState(false);

    // 백엔드에서 조회한 창고 레이아웃을 화면용 그래프 데이터로 저장한다.
    const [graphData, setGraphData] = useState(null);
    const [layoutLoading, setLayoutLoading] = useState(true);
    const [layoutError, setLayoutError] = useState(null);
    const [layoutReloadKey, setLayoutReloadKey] = useState(0);
    const [warehouseItems, setWarehouseItems] = useState([]);
    const [products, setProducts] = useState([]);

    // ============================================================
    // 6-2. UI 이벤트 핸들러
    // ============================================================
    const handleToggleNodeLabels = () => {
        setShowNodeLabels((previousValue) => !previousValue);
    };

    const handleRetryLayout = () => {
        setLayoutReloadKey((previousValue) => previousValue + 1);
    };

    // ============================================================
    // 6-3. 서버 데이터 조회 effect
    // ============================================================
    // 창고 ID가 바뀌거나 사용자가 다시 시도 버튼을 누르면 레이아웃을 다시 조회한다.
    // cancelled 플래그는 이전 요청이 늦게 완료되어 새 창고 상태를 덮어쓰는 것을 방지한다.
    useEffect(() => {
        let cancelled = false;
        setGraphData(null);
        setLayoutError(null);
        setLayoutLoading(true);
        // 백엔드 레이아웃 응답을 받아 프론트에서 사용하는 node/edge 필드명으로 변환한다.
        const fetchWarehouseLayout = async () => {
            try {
                const data = await warehouseApi.getLayout(warehouseId);
                if (cancelled) return;

                const {
                    graph,
                    convertedNodeCount,
                    convertedEdgeCount,
                } = convertWarehouseLayout(data);

                setGraphData(graph);
                setLayoutLoading(false);

                // 변환된 노드·엣지 개수를 기록해 백엔드 응답 누락이나 필터링 결과를 확인하기 쉽게 한다.
                console.log("변환된 창고 지도:", {
                    warehouseId,
                    nodes: convertedNodeCount,
                    edges: convertedEdgeCount,
                });
                // 조회 실패 시 이전 지도를 남기지 않고 오류 상태로 전환하여 잘못된 창고가 보이지 않게 한다.
            } catch (error) {
                if (cancelled) return;
                console.error("창고 레이아웃 조회 오류:", error);
                setGraphData(null);
                setLayoutError(error.message ?? "창고 지도를 불러오지 못했습니다.");
                setLayoutLoading(false);
            }
        };

        // warehouseId가 있을 때만 실제 요청을 보내고, 없으면 즉시 사용자에게 선택 오류를 보여준다.
        if (warehouseId) {
            fetchWarehouseLayout();
        } else {
            setLayoutError("선택된 창고가 없습니다.");
            setLayoutLoading(false);
        }
        // effect가 종료되면 이후 도착하는 비동기 응답이 상태를 변경하지 못하도록 표시한다.
        return () => {
            cancelled = true;
        };
    }, [warehouseId, layoutReloadKey]);

    // 상품 목록은 창고와 무관한 공통 데이터이므로 컴포넌트 최초 마운트 시 한 번만 조회한다.
    // 조회 실패 시 빈 배열로 유지해 재고 렌더링은 계속하되 상품명만 대체값으로 표시한다.
    useEffect(() => {
        let cancelled = false;
        productApi.getAll()
            .then((data) => {
                if (!cancelled) setProducts(Array.isArray(data) ? data : []);
            })
            .catch((error) => {
                if (!cancelled) {
                    console.warn("상품 목록 조회 실패", error.message);
                    setProducts([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // 선택 창고의 재고를 조회한다.
    // 시뮬레이션 실행 중에는 작업 결과가 선반에 반영되는 모습을 보여주기 위해 1.5초마다 갱신한다.
    useEffect(() => {
        let cancelled = false;
        let timerId = null;

        // 한 번의 재고 조회를 담당하는 내부 함수이며, warehouseId가 없으면 요청하지 않는다.
        const refreshInventory = async () => {
            if (!warehouseId) return;
            try {
                const data = await warehouseItemApi.getAll(warehouseId);
                if (!cancelled) {
                    setWarehouseItems(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                if (!cancelled) {
                    console.warn("창고 재고 조회 실패", error.message);
                }
            }
        };

        // 창고 변경 시 이전 창고 재고를 먼저 비우고 즉시 새 재고를 조회한다.
        // 실행 상태일 때만 interval을 생성하여 정지 중 불필요한 네트워크 요청을 줄인다.
        setWarehouseItems([]);
        refreshInventory();
        if (isRunning) {
            timerId = window.setInterval(refreshInventory, INVENTORY_POLL_INTERVAL_MS);
        }
        // 창고나 실행 상태가 바뀌면 이전 요청 결과를 무시하고 기존 폴링 타이머를 정리한다.
        return () => {
            cancelled = true;
            if (timerId !== null) window.clearInterval(timerId);
        };
    }, [warehouseId, isRunning]);

    // ============================================================
    // 6-4. 조회 상태별 화면
    // ============================================================
    // 레이아웃이 준비되기 전에는 좌표 계산을 진행할 수 없으므로 로딩 화면을 먼저 반환한다.
    if (layoutLoading) {
        return (
            <div className="warehouse-svg-wrapper warehouse-layout-state">
                <span>창고 지도를 불러오는 중입니다.</span>
            </div>
        );
    }

    // 조회 오류 또는 그래프 데이터 부재 시 오류 메시지와 재시도 버튼만 렌더링한다.
    // 재시도 버튼은 layoutReloadKey를 증가시켜 레이아웃 effect를 다시 실행한다.
    if (layoutError || !graphData) {
        return (
            <div className="warehouse-svg-wrapper warehouse-layout-state warehouse-layout-error">
                <strong>창고 지도를 불러오지 못했습니다.</strong>
                <span>{layoutError}</span>
                <button type="button" onClick={handleRetryLayout}>
                    다시 시도
                </button>
            </div>
        );
    }

    // ============================================================
    // 6-5. 그래프 인덱스와 좌표 변환
    // ============================================================
    // 백엔드 좌표의 최소·최대 범위를 구해 서로 다른 크기의 창고도 같은 SVG 영역에 맞춘다.
    const xValues = graphData.nodes.map((node) => node.x);
    const yValues = graphData.nodes.map((node) => node.y);

    // X/Y는 같은 정규화 공식을 사용하므로 공통 팩토리 함수로 생성한다.
    const convertX = createCoordinateConverter(xValues, SVG_WIDTH, PADDING_X);
    const convertY = createCoordinateConverter(yValues, SVG_HEIGHT, PADDING_Y);

    // 반복적인 배열 검색을 피하기 위해 node.id를 키로 노드 객체를 바로 찾는 맵을 만든다.
    // 엣지 좌표 계산, 시설 그룹화, 로봇 위치 보정 등 대부분의 후속 계산에서 사용된다.
    const nodeMap = new Map(
        graphData.nodes.map((node) => [node.id, node])
    );

    const edgesByNode = createEdgesByNodeMap(graphData.edges);

    // ============================================================
    // 6-6. 시설 관계와 로봇 표시 위치 계산
    // ============================================================
    // 입고 포트와 AMR 접근 노드의 관계는 경로 탐색용 엣지가 아니라 화면 안내용 논리 엣지이다.
    // display_port_ids에 등록된 포트만 연결하고, 실제 노드 객체가 없는 항목은 제외한다.
    // 포트/슈트는 로봇 경로 노드가 아니므로 실제 TRAVERSES와 분리해 표시한다.
    const inboundLogicalEdges = graphData.nodes
        .filter((node) => node.type === "inbound_handoff_access")
        .flatMap((accessNode) =>
            (accessNode.display_port_ids ?? []).map((portId) => ({
                id: `logical-inbound-${accessNode.id}-${portId}`,
                source: nodeMap.get(portId),
                target: accessNode,
            })),
        )
        .filter((edge) => edge.source && edge.target);

    // 입고 인계 접근 노드만 별도 목록으로 보관해 로봇 상태와 입고 대기 BOX의 위치를 보정한다.
    const inboundAccessNodes = graphData.nodes.filter(
        (node) => node.type === "inbound_handoff_access",
    );
    // 전달받은 노드 코드와 연관된 입고 접근 노드를 찾는다.
    // 동일한 후보가 여러 개면 robotKey를 나머지 연산에 사용해 로봇별 선택이 안정적으로 유지되게 한다.
    const inboundAccessForMobileNode = (nodeCode, robotKey = 0) => {
        const candidates = inboundAccessNodes.filter((accessNode) => (
            accessNode.id === nodeCode
            || accessNode.adjacent_route_node === nodeCode
            || (edgesByNode.get(accessNode.id) ?? []).some(
                (edge) => peerNodeId(edge, accessNode.id) === nodeCode,
            )
        ));
        if (candidates.length === 0) return null;
        return selectByStableKey(candidates, robotKey);
    };

    // 같은 출고 스테이션에 속하는 접근 노드와 슈트 ID를 하나의 그룹으로 묶는다.
    // station_id가 없을 때는 resourceCode, 최종적으로 노드 ID를 그룹 키로 사용한다.
    const outboundStationGroups = new Map();
    graphData.nodes
        .filter((node) => node.type === "outbound_station_access")
        .forEach((node) => {
            const stationId = node.station_id ?? node.resourceCode ?? node.id;
            const group = outboundStationGroups.get(stationId) ?? {
                id: stationId,
                accessNodes: [],
                chuteIds: new Set(),
            };
            group.accessNodes.push(node);
            (node.display_chute_ids ?? []).forEach((id) => group.chuteIds.add(id));
            outboundStationGroups.set(stationId, group);
        });

    // 특정 출고 접근 노드와 연결된 route 노드 중 고정 로봇 허브 후보를 찾는다.
    // adjacent_route_node와 서비스 엣지 양쪽을 모두 확인해 백엔드 표현 방식 차이를 흡수한다.
    const fixedHubNodesForAccess = (accessNode) => {
        const routeNodeIds = new Set();
        if (accessNode.adjacent_route_node) {
            routeNodeIds.add(accessNode.adjacent_route_node);
        }
        (edgesByNode.get(accessNode.id) ?? []).forEach((edge) => {
            if (!isOutboundServiceEdge(edge)) return;
            const peer = nodeMap.get(peerNodeId(edge, accessNode.id));
            if (peer?.type === "route") routeNodeIds.add(peer.id);
        });
        return [...routeNodeIds].map((id) => nodeMap.get(id)).filter(Boolean);
    };

    // 출고 스테이션 그룹에 평균 표시 좌표, 고정 허브 후보, 실제 슈트 노드 객체를 결합한다.
    // 평균 좌표는 논리 출고 연결선을 그릴 때 스테이션 중심점으로 사용한다.
    const outboundLogicalGroups = [...outboundStationGroups.values()].map((group) => {
        const hubs = [...new Map(
            group.accessNodes
                .flatMap(fixedHubNodesForAccess)
                .map((node) => [node.id, node]),
        ).values()];
        return {
            ...group,
            x:
                group.accessNodes.reduce((sum, node) => sum + Number(node.x), 0) /
                group.accessNodes.length,
            y:
                group.accessNodes.reduce((sum, node) => sum + Number(node.y), 0) /
                group.accessNodes.length,
            hubs,
            chutes: [...group.chuteIds]
                .map((id) => nodeMap.get(id))
                .filter(Boolean),
        };
    });

    // 두 개 이상의 출고 접근 노드와 서비스 엣지로 연결된 route 노드를 고정 출고 로봇 허브로 판단한다.
    // Map으로 ID 중복을 제거한 뒤 실제 화면에 그릴 고정 로봇 목록의 기준으로 사용한다.
    const fixedOutboundHubs = [...new Map(
        outboundLogicalGroups
            .flatMap((group) => group.hubs)
            .filter((hub) => {
                const fixedEndpointCount = new Set((edgesByNode.get(hub.id) ?? [])
                    .filter(isOutboundServiceEdge)
                    .map((edge) => nodeMap.get(peerNodeId(edge, hub.id)))
                    .filter((node) => node?.type === "outbound_station_access")
                    .map((node) => node.id)).size;
                return fixedEndpointCount >= 2;
            })
            .map((node) => [node.id, node]),
    ).values()];
    const fixedHubIds = new Set(fixedOutboundHubs.map((node) => node.id));

    // 고정 허브 주변에서 AMR이 실제로 접근할 수 있는 일반 route 노드만 찾는다.
    // 서비스 전용 엣지와 통행 불가 엣지, 다른 고정 허브는 제외한다.
    const mobileBoundaryNodesForHub = (hub) => (edgesByNode.get(hub?.id) ?? [])
        .filter((edge) => !isOutboundServiceEdge(edge))
        .filter((edge) => edge.mobile_robot_traversable !== false)
        .map((edge) => nodeMap.get(peerNodeId(edge, hub.id)))
        .filter((node) => node?.type === "route" && !fixedHubIds.has(node.id));

    // 노드 코드가 어떤 출고 그룹에 속하는지 폭넓게 판별한다.
    // 그룹 ID, 슈트, 접근 노드, 고정 허브, 허브 주변 AMR 경계 노드까지 모두 확인한다.
    const stationGroupForMobileNode = (nodeCode) =>
        outboundLogicalGroups.find((group) =>
            group.id === nodeCode
            || group.chuteIds.has(nodeCode)
            || group.accessNodes.some((node) =>
                node.id === nodeCode
                || node.adjacent_route_node === nodeCode
            )
            || group.hubs.some((hub) => hub.id === nodeCode)
            || group.hubs.some((hub) =>
                mobileBoundaryNodesForHub(hub).some((node) => node.id === nodeCode)
            )
        );

    // 모바일 로봇의 현재 노드와 연결되는 출고 접근 노드를 선택한다.
    // 직접 연결된 접근 노드를 우선하며, 없으면 그룹 전체에서 robotKey 기반으로 안정적으로 배정한다.
    const stationAccessForMobileNode = (nodeCode, robotKey = 0) => {
        const group = stationGroupForMobileNode(nodeCode);
        if (!group || group.accessNodes.length === 0) return null;

        const directlyConnected = group.accessNodes.filter(
            (node) => node.adjacent_route_node === nodeCode || node.id === nodeCode
        );
        const candidates = directlyConnected.length > 0
            ? directlyConnected
            : group.accessNodes;
        return selectByStableKey(candidates, robotKey);
    };

    // 출고 접근 노드에 대응하는 고정 허브를 결정한다.
    // 모바일 노드와 직접 경계를 공유하는 허브를 우선하고, 없으면 y축 거리 기준 후보를 사용한다.
    const fixedHubForStationAccess = (accessNode, mobileNode) => {
        const candidates = fixedHubNodesForAccess(accessNode)
            .filter((node) => fixedHubIds.has(node.id));
        if (candidates.length === 0) return null;
        if (!mobileNode) return candidates[0];
        return candidates.find((hub) =>
            mobileBoundaryNodesForHub(hub).some((node) => node.id === mobileNode.id)
        ) ?? closestNodeByY(candidates, mobileNode.y) ?? candidates[0];
    };

    /**
     * 로봇은 실제로 OUTBOUND_STATION_ACCESS까지만 주행한다.
     * 다만 외부 상태가 논리 출고지/슈트 코드를 가리키는 경우에도 화면에서
     * 사라지지 않도록 해당 출고 설비의 실제 접근 노드 좌표로 보정한다.
     * 
     * 표시 위치 보정 순서:
     * 1) 실제 출고 접근 노드면 인접 AMR 경계 노드로 이동한다.
     * 2) 고정 허브 코드면 해당 허브 주변의 AMR 경계 노드로 이동한다.
     * 3) 일반 경로 노드는 그대로 사용한다.
     * 4) 논리 출고지/슈트 코드면 소속 출고 그룹을 찾아 실제 접근 가능한 노드로 대체한다.
    */
    const resolveRobotDisplayNode = (robot, requestedNodeCode = robot.node_id) => {
        const nodeCode = requestedNodeCode;
        const exactNode = nodeMap.get(nodeCode);
        if (exactNode?.type === "outbound_station_access") {
            const hub = fixedHubForStationAccess(exactNode, exactNode);
            return closestNodeByY(mobileBoundaryNodesForHub(hub), exactNode.y)
                ?? nodeMap.get(exactNode.adjacent_route_node)
                ?? exactNode;
        }
        if (fixedHubIds.has(exactNode?.id)) {
            return closestNodeByY(mobileBoundaryNodesForHub(exactNode), exactNode.y)
                ?? exactNode;
        }
        if (exactNode && exactNode.type !== "outbound") {
            return exactNode;
        }

        const matchingGroup = [...outboundStationGroups.values()].find((group) =>
            group.id === nodeCode
            || group.chuteIds.has(nodeCode)
            || group.accessNodes.some((node) => node.id === nodeCode)
        );
        if (!matchingGroup || matchingGroup.accessNodes.length === 0) {
            return exactNode;
        }

        const stationAccess = stationAccessForMobileNode(
            nodeCode,
            robot.current_task_id ?? robot.robot_id
        );
        const hub = fixedHubForStationAccess(stationAccess, exactNode);
        return closestNodeByY(
            mobileBoundaryNodesForHub(hub),
            stationAccess?.y ?? exactNode?.y ?? 0,
        ) ?? nodeMap.get(stationAccess?.adjacent_route_node)
            ?? stationAccess
            ?? exactNode;
    };

    // ============================================================
    // 6-7. 상품·작업·재고 파생 데이터
    // ============================================================
    // 상품과 작업을 ID로 즉시 조회할 수 있도록 Map으로 변환한다.
    // externalOperationId 맵은 생성 명령과 이미 저장된 작업의 중복 표시를 막는 데 사용한다.
    const productById = new Map(
        products.map((product) => [Number(product.id), product]),
    );
    const taskById = new Map(tasks.map((task) => [Number(task.id), task]));
    const taskByOperationId = new Map(
        tasks
            .filter((task) => task.externalOperationId)
            .map((task) => [task.externalOperationId, task]),
    );

    // 재고 데이터는 먼저 DB nodeId별로 묶고, 그 안에서 rackLevel을 키로 다시 묶는다.
    // 이렇게 하면 특정 선반의 각 층 재고를 상수 시간에 조회할 수 있다.
    // PostgreSQL warehouse_items를 실제 3층 선반에 연결한다.
    // quantity=0인 행은 슬롯 이력일 뿐 물리 BOX가 아니므로 빈 칸으로 표시한다.
    const inventoryByNodeId = new Map();
    warehouseItems
        .filter((item) => Number(item.quantity ?? 0) > 0)
        .forEach((item) => {
            const levels = inventoryByNodeId.get(Number(item.nodeId)) ?? new Map();
            levels.set(Number(item.rackLevel), item);
            inventoryByNodeId.set(Number(item.nodeId), levels);
        });
    // 그래프의 rack_storage 노드마다 1~3층 배열을 만들어 렌더링에 바로 사용할 형태로 정리한다.
    // 재고가 존재하면 상품 정보까지 연결하고, 없으면 item과 product를 null로 유지한다.
    const rackInventoryMap = new Map(
        graphData.nodes
            .filter((node) => node.type === "rack_storage")
            .map((node) => {
                const storedLevels = inventoryByNodeId.get(Number(node.databaseId)) ?? new Map();
                return [
                    node.id,
                    {
                        levels: RACK_LEVELS.map((level) => {
                            const item = storedLevels.get(level) ?? null;
                            const product = item
                                ? productById.get(Number(item.itemId)) ?? null
                                : null;
                            return { level, item, product };
                        }),
                    },
                ];
            }),
    );

    // ============================================================
    // 6-8. 시설 인계 BOX와 입고 대기열 계산
    // ============================================================
    // 각 로봇의 service_progress를 이용해 시설과 로봇 사이에서 이동 중인 BOX를 만든다.
    // flatMap을 사용하므로 시설 인계 상태가 아닌 로봇은 빈 배열을 반환해 결과에서 자연스럽게 제외된다.
    const transferBoxes = robots.flatMap((robot) => {
        const serviceNode = resolveRobotDisplayNode(robot);
        const serviceKind = robot.service_kind?.toUpperCase();
        const taskType = robot.task_type?.toUpperCase();
        // 서비스 노드를 찾지 못했거나 서비스 진행률이 없으면 시설 인계 애니메이션 대상이 아니다.
        if (!serviceNode || robot.service_progress === null
            || robot.service_progress === undefined) {
            return [];
        }

        // facilityNodeIds는 연결 가능한 포트/슈트 목록, direction은 입고·출고 방향을 나타낸다.
        // transferStartNode는 출고 고정 허브를 찾을 때 기준이 되는 실제 접근 노드이다.
        let facilityNodeIds = [];
        let direction = null;
        let transferStartNode = serviceNode;

        // 입고 PICKUP은 외부 포트에서 AMR 접근 노드 방향으로 BOX가 이동한다.
        if (
            taskType === "INBOUND"
            && serviceKind === "PICKUP"
        ) {
            const inboundAccess = serviceNode.type === "inbound_handoff_access"
                ? serviceNode
                : inboundAccessForMobileNode(
                    serviceNode.id,
                    robot.current_task_id ?? robot.robot_id,
                );
            if (!inboundAccess) return [];
            facilityNodeIds = inboundAccess.display_port_ids ?? [];
            transferStartNode = inboundAccess;
            direction = "inbound";

            // 출고 DROP/STATION은 AMR 접근 노드에서 고정 로봇을 거쳐 슈트로 BOX가 이동한다.
        } else if (
            taskType === "OUTBOUND"
            && ["DROP", "STATION"].includes(serviceKind)
            && (
                serviceNode.type === "outbound_station_access"
                || stationGroupForMobileNode(serviceNode.id)
            )
        ) {
            const stationAccess = stationAccessForMobileNode(
                serviceNode.id,
                robot.current_task_id ?? robot.robot_id
            );
            if (!stationAccess) return [];
            facilityNodeIds = stationAccess.display_chute_ids ?? [];
            transferStartNode = stationAccess;
            direction = "outbound";
        } else {
            return [];
        }

        // 시설 ID를 실제 노드 객체로 변환하고, 존재하지 않는 노드는 제거한다.
        // 연결 가능한 시설이 하나도 없으면 좌표를 계산할 수 없으므로 표시하지 않는다.
        const facilityNodes = facilityNodeIds
            .map((nodeId) => nodeMap.get(nodeId))
            .filter(Boolean);
        if (facilityNodes.length === 0) {
            return [];
        }

        // 여러 포트나 슈트가 연결된 경우 task/robot ID 기반으로 하나를 선택한다.
        // 같은 작업은 렌더링마다 같은 시설을 선택하므로 BOX가 임의로 다른 위치로 바뀌지 않는다.
        const facilityNode = selectByStableKey(
            facilityNodes,
            robot.current_task_id ?? robot.robot_id,
        );
        // 서비스 진행률을 0~1로 제한하고, 로봇·시설 좌표를 SVG 좌표로 미리 변환한다.
        const progress = clamp01(robot.service_progress);
        const serviceX = convertX(serviceNode.x);
        const serviceY = convertY(serviceNode.y);
        const facilityX = convertX(facilityNode.x);
        const facilityY = convertY(facilityNode.y);
        // 출고일 때만 고정 로봇 허브를 찾는다.
        // 전체 진행률의 25%는 AMR→고정 로봇 인계, 나머지 75%는 고정 로봇→슈트 이동으로 사용한다.
        const fixedHub = direction === "outbound"
            ? fixedHubForStationAccess(transferStartNode, serviceNode)
            : null;

        const handoffRatio = OUTBOUND_HANDOFF_RATIO;
        let x;
        let y;
        let stage = "facility-to-mobile";
        // 입고는 포트에서 AMR 쪽으로 단일 구간 보간을 수행한다.
        // 출고는 고정 허브 유무와 진행률에 따라 두 구간 또는 단일 구간으로 나누어 보간한다.
        if (direction === "inbound") {
            x = interpolate(facilityX, serviceX, progress);
            y = interpolate(facilityY, serviceY, progress);
        } else if (fixedHub && progress <= handoffRatio) {
            const stageProgress = progress / handoffRatio;
            x = interpolate(serviceX, convertX(fixedHub.x), stageProgress);
            y = interpolate(serviceY, convertY(fixedHub.y), stageProgress);
            stage = "mobile-to-fixed-robot";
        } else if (fixedHub) {
            const stageProgress = (progress - handoffRatio) / (1 - handoffRatio);
            x = interpolate(convertX(fixedHub.x), facilityX, stageProgress);
            y = interpolate(convertY(fixedHub.y), facilityY, stageProgress);
            stage = "fixed-robot-to-chute";
        } else {
            x = interpolate(serviceX, facilityX, progress);
            y = interpolate(serviceY, facilityY, progress);
            stage = "mobile-to-chute";
        }

        // 현재 작업의 상품을 찾아 BOX 색상과 툴팁에 필요한 메타데이터를 연결한다.
        const task = taskById.get(Number(robot.current_task_id));
        const itemId = task?.itemId ?? null;
        const product = productById.get(Number(itemId)) ?? null;

        // 렌더링 단계에서 바로 사용할 BOX 위치·단계·상품 정보를 하나의 객체로 반환한다.
        return [{
            id: `${robot.robot_id}-${robot.current_task_id}-${direction}`,
            direction,
            x,
            y,
            facilityNodeId: facilityNode.id,
            fixedHubId: fixedHub?.id,
            stage,
            progress,
            itemId,
            product,
            color: productColor(itemId),
        }];
    });

    // 입고 대기 BOX 계산에 필요한 조회용 맵을 준비한다.
    // 완료·실패·취소 상태 집합은 렌더링마다 재생성하지 않도록 파일 상단 상수를 사용한다.
    const robotByTaskId = new Map(
        robots
            .filter((robot) => robot.current_task_id != null)
            .map((robot) => [Number(robot.current_task_id), robot]),
    );
    const generatedByOperationId = new Map(
        generatedCommands
            .filter((command) => command.operationId)
            .map((command) => [command.operationId, command]),
    );
    // 저장된 INBOUND 작업을 화면용 공통 entry 구조로 변환하고 연결된 생성 명령을 함께 붙인다.
    const inboundTaskEntries = tasks
        .filter((task) => task.taskType === "INBOUND")
        .map((task) => ({
            key: task.externalOperationId ?? `task-${task.id}`,
            task,
            command: generatedByOperationId.get(task.externalOperationId) ?? null,
            itemId: task.itemId,
        }));
    // 아직 tasks에 저장되지 않은 INBOUND 생성 명령도 대기열에 포함한다.
    // operationId가 이미 작업에 존재하는 명령은 중복 표시를 막기 위해 제외한다.
    const inboundCommandEntries = generatedCommands
        .filter((command) => command.operationType === "INBOUND")
        .filter((command) => !taskByOperationId.has(command.operationId))
        .map((command) => ({
            key: command.operationId,
            task: null,
            command,
            itemId: command.productId,
        }));

    // 입고 포트별로 아직 AMR이 수령하지 않은 BOX를 그룹화한다.
    const waitingInboundGroups = new Map();
    [...inboundTaskEntries, ...inboundCommandEntries].forEach((entry, index) => {
        const task = entry.task;
        // 종료된 작업이거나 재고 반영까지 끝난 작업은 입고 대기 상태가 아니므로 제외한다.
        if (
            task
            && (
                TERMINAL_TASK_STATUSES.has(task.status)
                || task.inventoryAppliedAt
            )
        ) return;

        // 이미 로봇이 PICKUP 서비스를 수행 중이거나 BOX를 운반 중이면 포트 대기 표시를 제거한다.
        const robot = task ? robotByTaskId.get(Number(task.id)) : null;
        const pickupInProgress = robot
            && robot.task_type?.toUpperCase() === "INBOUND"
            && robot.service_kind?.toUpperCase() === "PICKUP"
            && robot.service_progress != null;
        if (pickupInProgress || robot?.carrying_load) return;

        // 작업/명령이 지정한 시작 노드를 DB ID 또는 노드 코드로 찾는다.
        // 직접 접근 노드가 아니면 주변 입고 접근 노드를 찾고, 그래도 없으면 순서 기반 기본 노드를 사용한다.
        const requestedNodeId = task?.startNodeId ?? entry.command?.source?.nodeId;
        const requestedNodeCode = entry.command?.source?.nodeCode
            ?? entry.command?.source?.facilityCode;
        const requestedNode = graphData.nodes.find((node) =>
            Number(node.databaseId) === Number(requestedNodeId)
            || node.id === requestedNodeCode,
        );
        let accessNode = requestedNode?.type === "inbound_handoff_access"
            ? requestedNode
            : inboundAccessForMobileNode(requestedNode?.id, task?.id ?? index);
        if (!accessNode && inboundAccessNodes.length > 0) {
            accessNode = inboundAccessNodes[index % inboundAccessNodes.length];
        }
        if (!accessNode) return;

        // 접근 노드에 연결된 포트 중 하나를 선택하고, 같은 포트에 대기 중인 entry를 누적한다.
        // 상품 정보와 안정적인 색상도 함께 저장해 JSX에서 추가 계산 없이 그릴 수 있게 한다.
        const portIds = accessNode.display_port_ids ?? [];
        const portNode = nodeMap.get(portIds[index % Math.max(1, portIds.length)])
            ?? accessNode;
        const product = productById.get(Number(entry.itemId)) ?? null;
        const group = waitingInboundGroups.get(portNode.id) ?? {
            portNode,
            entries: [],
        };
        group.entries.push({
            ...entry,
            product,
            color: productColor(entry.itemId),
        });
        waitingInboundGroups.set(portNode.id, group);
    });

    // 고정 출고 허브를 화면용 로봇 객체로 변환한다.
    // 해당 허브를 지나는 BOX가 있으면 working, 슈트로 방출 중이면 releasing 상태 클래스를 적용한다.
    const fixedOutboundRobots = fixedOutboundHubs.map((hub) => {
        const activeTransfers = transferBoxes.filter((box) => box.fixedHubId === hub.id);
        const index = fixedOutboundHubs.indexOf(hub);
        return {
            id: hub.id,
            label: `출고로봇 ${index + 1}`,
            x: convertX(hub.x),
            y: convertY(hub.y),
            active: activeTransfers.length > 0,
            outputActive: activeTransfers.some(
                (box) => box.stage === "fixed-robot-to-chute",
            ),
        };
    });

    // ============================================================
    // 6-9. SVG 렌더링
    // ============================================================
    // 뒤에 작성된 요소가 앞 요소 위에 보이므로 바닥→엣지→시설→BOX→로봇 순서를 유지한다.
    return (
        <div className="warehouse-svg-wrapper">

            {/* 노드 라벨 토글 버튼은 showNodeLabels 상태만 변경하며 지도 데이터에는 영향을 주지 않는다. */}
            <button
                type="button"
                className="warehouse-node-toggle"
                onClick={handleToggleNodeLabels}
            >
                {showNodeLabels ? "노드 번호 숨기기" : "노드 번호 보기"}
            </button>

            {/* viewBox를 고정해 컨테이너 크기가 달라져도 동일한 내부 좌표 비율로 지도를 표시한다. */}
            <svg
                className="warehouse-svg"
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
            >
                {/* defs 내부 패턴은 실제 요소를 직접 그리지 않고 이후 rect의 fill에서 재사용한다. */}
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

                {/* 흰색 바닥을 먼저 깔아 부모 배경색과 무관하게 지도 배경을 일정하게 유지한다. */}
                <rect
                    x="0"
                    y="0"
                    width={SVG_WIDTH}
                    height={SVG_HEIGHT}
                    fill="#ffffff"
                />

                {/* 동일 크기의 rect에 격자 패턴을 덮어 창고 좌표계를 시각적으로 구분한다. */}
                <rect
                    x="0"
                    y="0"
                    width={SVG_WIDTH}
                    height={SVG_HEIGHT}
                    fill="url(#warehouse-grid)"
                />

                {/* EDGE (항상 노드보다 먼저 그려야 선 위에 노드가 올라옴)
                    이동 가능한 활성 엣지만 선으로 표시한다. 통행 불가·신규 작업 비활성 엣지는 숨긴다. */}
                <g className="warehouse-edges">
                    {graphData.edges.map(
                        (edge) => {
                            if (
                                edge.mobile_robot_traversable === false ||
                                edge.active_for_new_work === false
                            ) {
                                return null;
                            }
                            // source/target ID를 실제 노드로 변환한 뒤 원본 좌표를 SVG 좌표로 바꿔 선을 그린다.
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
                        })}
                </g>

                {/* 각 통로의 첫 번째 열(col=0) 노드만 사용해 A01 형식의 통로 라벨을 한 번씩 표시한다. */}
                <g className="warehouse-aisle-labels">
                    {graphData.nodes
                        .filter((node) =>
                            node.type === "route" && node.col === 0
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

                {/* AMR이 실제로 지나는 route 노드를 작은 원으로 표시하고, 옵션에 따라 ID도 함께 보여준다. */}
                <g className="warehouse-route-nodes">
                    {graphData.nodes
                        .filter((node) => node.type === "route"
                        )
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

                {/* 논리 엣지는 시설 관계를 설명하기 위한 선이며 실제 로봇 경로 계산 결과와 분리된다. */}
                <g className="warehouse-logical-edges">
                    {inboundLogicalEdges.map((edge) => (
                        <line
                            key={edge.id}
                            x1={convertX(edge.source.x)}
                            y1={convertY(edge.source.y)}
                            x2={convertX(edge.target.x)}
                            y2={convertY(edge.target.y)}
                            className="warehouse-logical-edge logical-inbound"
                        />
                    ))}
                    {outboundLogicalGroups.flatMap((group) =>
                        group.chutes.map((chute) => (
                            <line
                                key={`logical-outbound-${group.id}-${chute.id}`}
                                x1={convertX(group.x)}
                                y1={convertY(group.y)}
                                x2={convertX(chute.x)}
                                y2={convertY(chute.y)}
                                className="warehouse-logical-edge logical-outbound"
                            />
                        )),
                    )}
                </g>

                {/* AMR이 아직 수령하지 않은 입고 BOX를 포트별로 최대 3개까지 표시하고, 초과 수량은 배지로 보여준다. */}
                <g className="warehouse-inbound-waiting-boxes">
                    {[...waitingInboundGroups.values()].map(({ portNode, entries }) => {
                        const visibleEntries = entries.slice(0, 3);
                        return (
                            <g
                                key={`waiting-${portNode.id}`}
                                transform={`translate(${convertX(portNode.x) + 22}, ${convertY(portNode.y)})`}
                            >
                                {visibleEntries.map((entry, index) => (
                                    <g
                                        key={entry.key}
                                        className="warehouse-waiting-box"
                                        transform={`translate(${index * 5}, ${-index * 4})`}
                                    >
                                        <rect
                                            x="-8"
                                            y="-6"
                                            width="16"
                                            height="12"
                                            rx="2"
                                            style={{ fill: entry.color }}
                                        />
                                        <path d="M -8 -1 H 8 M 0 -6 V 6" />
                                        <title>
                                            {`${entry.product?.productName ?? entry.command?.productName ?? "입고 상품"} / ${entry.product?.productCode ?? entry.command?.productCode ?? entry.itemId} / 입고 대기`}
                                        </title>
                                    </g>
                                ))}
                                {entries.length > 3 && (
                                    <g className="warehouse-waiting-count" transform="translate(14, -14)">
                                        <circle r="8" />
                                        <text y="3" textAnchor="middle">{entries.length}</text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </g>

                {/* transferBoxes에서 계산한 좌표에 BOX를 배치하며,
                    로봇은 접근 노드에 머물고 BOX만 논리 입·출고 설비 사이를 이동한다. */}
                <g className="warehouse-box-transfers">
                    {transferBoxes.map((box) => (
                        <g
                            key={box.id}
                            className={`warehouse-box-transfer transfer-${box.direction}`}
                            transform={`translate(${box.x}, ${box.y})`}
                        >
                            <rect
                                x="-10"
                                y="-7"
                                width="20"
                                height="14"
                                rx="2"
                                style={{ fill: box.color }}
                            />
                            <path d="M -10 -2 H 10 M 0 -7 V 7" />
                            <title>
                                {`${box.product?.productName ?? "BOX"} / ${box.direction === "inbound" ? "입고" : "출고"} / ${box.facilityNodeId} / ${Math.round(box.progress * 100)}%`}
                            </title>
                        </g>
                    ))}
                </g>

                {/* 입고 포트와 AMR 경로 사이의 인계 지점을 별도 원으로 표시한다. */}
                <g className="warehouse-inbound-access">
                    {graphData.nodes
                        .filter((node) =>
                            node.type === "inbound_handoff_access"
                        )
                        .map((node) => (
                            <g key={node.id}>

                                <circle
                                    cx={convertX(node.x)}
                                    cy={convertY(node.y)}
                                    r="4"
                                    className="warehouse-inbound-access"
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

                {/* 출고 스테이션과 AMR 경로 사이의 접근 지점을 입고 접근점과 다른 스타일로 표시한다. */}
                <g className="warehouse-outbound-access">
                    {graphData.nodes
                        .filter((node) =>
                            node.type === "outbound_station_access"
                        )
                        .map((node) => (
                            <g key={node.id}>
                                <circle
                                    cx={convertX(node.x)}
                                    cy={convertY(node.y)}
                                    r="4"
                                    className="warehouse-outbound-access"
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

                {/* route와 charging_slot 사이에서 진입 방향을 연결하는 충전 분기 노드이다. */}
                <g className="warehouse-charge-junctions">
                    {graphData.nodes
                        .filter((node) =>
                            node.type === "route_charge_junction"
                        )
                        .map((node) => (
                            <circle
                                key={node.id}
                                cx={convertX(node.x)}
                                cy={convertY(node.y)}
                                r="4"
                                className="warehouse-charge-junction"
                            >
                                <title>{node.id}</title>
                            </circle>
                        ))}
                </g>

                {/* 선반마다 외곽과 3개 층을 그리며, 점유된 층은 상품 ID 기반 색상으로 채운다. */}
                <g className="warehouse-racks">
                    {graphData.nodes
                        .filter((node) =>
                            node.type === "rack_storage"
                        )
                        .map((node) => {
                            // rackInventoryMap에 저장된 DB 재고와 상품 정보를 현재 선반 ID로 조회한다.
                            const inventory = rackInventoryMap.get(node.id);
                            // 화면에서는 상단 → 중단 → 하단 순서로 보여주기 위해 level을 역순으로 정렬
                            const levels = inventory?.levels
                                ? [...inventory.levels].sort((a, b) => b.level - a.level)
                                : [3, 2, 1].map((level) => ({ level, item: null, product: null }));

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

                                    {/* 선반 3단 
                                        데이터의 층 번호는 1~3이지만 화면은 위에서 아래로 3→2→1 순서로 그린다.*/}
                                    {levels.map(
                                        (level, index) => (
                                            <rect
                                                key={level.level}
                                                x="-20"
                                                y={-15 + index * 10}
                                                width="40"
                                                height="9"
                                                className={`warehouse-rack-level ${level.item ? "rack-level-occupied" : "rack-level-empty"}`}
                                                style={level.item
                                                    ? { fill: productColor(level.item.itemId) }
                                                    : undefined}
                                            >
                                                <title>
                                                    {level.item
                                                        ? `${node.id} / ${level.level}층 / ${level.product?.productName ?? level.item.itemId} / ${level.item.quantity} EA`
                                                        : `${node.id} / ${level.level}층 / 비어 있음`}
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
                        })}
                </g>

                {/* 논리 입고 시설은 사각형과 간단한 라벨로 표시하며, 필요할 때 전체 노드 ID도 보여준다. */}
                <g className="warehouse-inbound">
                    {graphData.nodes
                        .filter((node) =>
                            node.type === "inbound"
                        )
                        .map((node) => (
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
                        ))}
                </g>

                {/* 논리 출고 시설도 입고 시설과 동일한 구조이지만 별도 CSS 클래스로 구분한다. */}
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
                            ))}
                </g>

                {/* charging_slot은 슬롯 번호를 중앙에 표시하고, 노드 라벨 옵션이 켜지면 전체 ID도 추가한다. */}
                <g className="warehouse-charging">
                    {graphData.nodes
                        .filter((node) =>
                            node.type === "charging_slot"
                        )
                        .map((node) => (
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
                        ))}
                </g>

                {/* 고정 좌표에 입고지·출고지·충전소 영역명을 표시해 지도 방향을 빠르게 파악하게 한다. */}
                <text
                    x="40"
                    y="100"
                    className="warehouse-area-title"
                    textAnchor="middle"
                >
                    입고지
                </text>

                <text
                    x={SVG_WIDTH - 40}
                    y="100"
                    className="warehouse-area-title"
                    textAnchor="middle"
                >
                    출고지
                </text>

                <text
                    x={SVG_WIDTH / 2}
                    y={SVG_HEIGHT - 8}
                    className="warehouse-area-title"
                    textAnchor="middle"
                >
                    충전소
                </text>

                {/* 고정 출고 로봇은 출고 허브에 배치되며 BOX 단계에 따라 작업·방출 애니메이션 클래스를 받는다. */}
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

                {/* 모바일 로봇은 백엔드의 from/to 노드를 화면 표시 가능한 노드로 보정한 뒤 애니메이션한다. */}
                <g className="warehouse-robots">
                    {robots.map((robot) => {
                        // 이동 시작 노드는 from_node_code가 있으면 우선 사용하고, 없으면 현재 node_id를 사용한다.
                        const fromNode = resolveRobotDisplayNode(
                            robot,
                            robot.from_node_code ?? robot.node_id,
                        );
                        // movement_step_id가 있을 때만 별도의 도착 노드를 계산하며, 정지 상태는 시작 노드에 머문다.
                        const toNode = robot.movement_step_id
                            ? resolveRobotDisplayNode(
                                robot,
                                robot.to_node_code ?? robot.node_id,
                            )
                            : fromNode;

                        // 노드 보정에 실패한 로봇은 잘못된 좌표로 렌더링하지 않고 해당 항목만 건너뛴다.
                        if (!fromNode || !toNode) {
                            return null;
                        }

                        // activity가 더 구체적인 현재 동작이므로 status보다 먼저 이미지 선택에 사용한다.
                        const robotImage =
                            ROBOT_IMAGES[robot.activity]
                            ?? ROBOT_IMAGES[robot.status]
                            ?? robotHero;
                        // 현재 작업과 상품을 연결해 운반 BOX의 색상 및 툴팁 문구를 구성한다.
                        const activeTask = taskById.get(Number(robot.current_task_id));
                        const activeProduct = productById.get(Number(activeTask?.itemId));
                        // 시설 인계 BOX가 별도로 움직이는 동안에는 로봇 위 BOX를 숨겨 중복 표시를 방지한다.
                        const hasFacilityTransfer = transferBoxes.some(
                            (box) => String(box.id).startsWith(`${robot.robot_id}-`),
                        );

                        // 계산된 좌표와 표시 정보를 하위 AnimatedRobotMarker에 전달한다.
                        return (
                            <AnimatedRobotMarker
                                key={robot.robot_id}
                                robot={robot}
                                fromX={convertX(fromNode.x)}
                                fromY={convertY(fromNode.y)}
                                toX={convertX(toNode.x)}
                                toY={convertY(toNode.y)}
                                robotImage={robotImage}
                                isRunning={isRunning}
                                loadColor={productColor(activeTask?.itemId)}
                                loadTitle={activeProduct
                                    ? `${activeProduct.productName} (${activeProduct.productCode}) BOX 운반 중`
                                    : "BOX 운반 중"}
                                hideLoad={hasFacilityTransfer}
                            />
                        );
                    })}
                </g>
            </svg>
        </div>
    );
}

export default WarehouseSVG;
