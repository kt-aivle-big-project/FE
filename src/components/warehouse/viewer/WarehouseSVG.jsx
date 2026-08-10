import { useEffect, useState } from "react";
import "../../../styles/warehouse/WarehouseSVG.css";
import { productApi, warehouseApi, warehouseItemApi } from "../../../api/client";

import WarehouseCanvas from "./WarehouseCanvas";
import {
    clamp01,
    closestNodeByY,
    createCoordinateConverter,
    createEdgesByNodeMap,
    interpolate,
    isOutboundServiceEdge,
    peerNodeId,
    productColor,
    selectByStableKey,
} from "./warehouseSvgUtils";


// ============================================================
// 1. 공통 설정과 레이아웃 변환
// ============================================================
const SVG_WIDTH = 1200;
const SVG_HEIGHT = 600;
const PADDING_X = 40;
const PADDING_Y = 30;
const INVENTORY_POLL_INTERVAL_MS = 1500;
const OUTBOUND_HANDOFF_RATIO = 0.25;
const RACK_LEVELS = [1, 2, 3];
const TERMINAL_TASK_STATUSES = new Set(["DONE", "FAILED", "CANCELLED"]);

/**
 * 백엔드 그래프에 rack_storage가 없으면 같은 rack_id의 rack_access 중심 좌표에
 * 화면 표시용 선반 노드를 만든다. 파생 노드는 visualOnly로 표시해 경로 탐색 데이터와 구분한다.
 */
const withRackStorageNodes = (graph) => {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const existingRackIds = new Set(
        nodes
            .filter((node) => node.type === "rack_storage")
            .map((node) => node.id),
    );
    // rack_id가 없을 수 있어 resourceCode와 노드 ID 규칙을 순서대로 대체한다.
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

    return {
        ...graph,
        nodes: [...nodes, ...derivedRacks],
    };
};

// 백엔드 레이아웃 응답을 화면에서 사용하는 그래프 구조로 변환한다.
const convertWarehouseLayout = (data) => {
    // 엣지의 DB 노드 ID를 화면용 nodeCode로 치환하기 위한 맵이다.
    const nodeCodeMap = new Map(
        data.nodes
            .filter((node) => node.nodeCode)
            .map((node) => [node.id, node.nodeCode]),
    );

    // 백엔드 확장 속성을 보존하되 화면에서 공통으로 사용하는 필드는 명시적으로 정규화한다.
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
// 2. WarehouseSVG 컴포넌트
// ============================================================
/**
 * 창고 레이아웃과 실시간 로봇·재고 상태를 하나의 SVG로 시각화한다.
 *
 * @param {Object} props
 * @param {number|string} props.warehouseId 조회할 창고 식별자
 * @param {Array} props.robots 로봇 상태 목록
 * @param {Array} props.tasks 현재 작업 목록
 * @param {Array} props.generatedCommands 아직 작업으로 저장되지 않은 생성 명령 목록
 * @param {boolean} props.isRunning 시뮬레이션 실행 여부
 */
function WarehouseSVG({
    warehouseId = 1,
    robots = [],
    tasks = [],
    generatedCommands = [],
    avoidanceStates = [],
    isRunning = false,
}) {
    const [showNodeLabels, setShowNodeLabels] = useState(false);

    const [graphData, setGraphData] = useState(null);
    const [layoutLoading, setLayoutLoading] = useState(true);
    const [layoutError, setLayoutError] = useState(null);
    const [layoutReloadKey, setLayoutReloadKey] = useState(0);
    const [warehouseItems, setWarehouseItems] = useState([]);
    const [products, setProducts] = useState([]);

    const handleToggleNodeLabels = () => {
        setShowNodeLabels((previousValue) => !previousValue);
    };

    const handleRetryLayout = () => {
        setLayoutReloadKey((previousValue) => previousValue + 1);
    };

    // ============================================================
    // 3. 서버 데이터 조회
    // ============================================================
    // 이전 요청이 늦게 끝나 새 창고 상태를 덮어쓰지 않도록 cancelled 플래그를 사용한다.
    useEffect(() => {
        let cancelled = false;
        setGraphData(null);
        setLayoutError(null);
        setLayoutLoading(true);
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

                console.log("변환된 창고 지도:", {
                    warehouseId,
                    nodes: convertedNodeCount,
                    edges: convertedEdgeCount,
                });
            } catch (error) {
                if (cancelled) return;

                // 조회 실패 시 이전 창고 지도가 남지 않도록 그래프 상태를 비운다.
                console.error("창고 레이아웃 조회 오류:", error);
                setGraphData(null);
                setLayoutError(error.message ?? "창고 지도를 불러오지 못했습니다.");
                setLayoutLoading(false);
            }
        };

        if (warehouseId) {
            fetchWarehouseLayout();
        } else {
            setLayoutError("선택된 창고가 없습니다.");
            setLayoutLoading(false);
        }
        return () => {
            cancelled = true;
        };
    }, [warehouseId, layoutReloadKey]);

    // 상품 조회에 실패해도 빈 배열을 유지해 지도와 재고 렌더링은 계속한다.
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

    // 실행 중에는 작업 결과가 선반에 반영되는 모습을 보여주기 위해 재고를 1.5초마다 갱신한다.
    useEffect(() => {
        let cancelled = false;
        let timerId = null;

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

        setWarehouseItems([]);
        refreshInventory();
        if (isRunning) {
            timerId = window.setInterval(refreshInventory, INVENTORY_POLL_INTERVAL_MS);
        }
        return () => {
            cancelled = true;
            if (timerId !== null) window.clearInterval(timerId);
        };
    }, [warehouseId, isRunning]);

    if (layoutLoading) {
        return (
            <div className="warehouse-svg-wrapper warehouse-layout-state">
                <span>창고 지도를 불러오는 중입니다.</span>
            </div>
        );
    }

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
    // 4. 그래프 인덱스와 시설 관계 계산
    // ============================================================
    // 창고별 좌표 범위를 고정 SVG 영역에 맞게 정규화한다.
    const xValues = graphData.nodes.map((node) => node.x);
    const yValues = graphData.nodes.map((node) => node.y);

    const convertX = createCoordinateConverter(xValues, SVG_WIDTH, PADDING_X);
    const convertY = createCoordinateConverter(yValues, SVG_HEIGHT, PADDING_Y);

    // 시설 관계와 로봇 위치 보정에서 반복 조회할 인덱스다.
    const nodeMap = new Map(
        graphData.nodes.map((node) => [node.id, node])
    );

    const edgesByNode = createEdgesByNodeMap(graphData.edges);

    // 포트와 슈트는 실제 주행 노드가 아니므로 TRAVERSES와 분리한 화면용 논리 엣지로 표시한다.
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

    const inboundAccessNodes = graphData.nodes.filter(
        (node) => node.type === "inbound_handoff_access",
    );

    // 후보가 여러 개면 robotKey로 고정해 같은 로봇이 렌더링마다 다른 접근 노드를 선택하지 않게 한다.
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

    // station_id가 없으면 resourceCode와 노드 ID를 차례로 대체해 출고 설비를 그룹화한다.
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

    // 백엔드 표현 방식 차이를 흡수하기 위해 adjacent_route_node와 서비스 엣지를 모두 확인한다.
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

    // 접근 노드의 평균 좌표를 논리 출고 연결선의 스테이션 중심점으로 사용한다.
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

    // 두 개 이상의 출고 접근 노드와 서비스 엣지로 연결된 route를 고정 출고 로봇 허브로 판단한다.
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

    // AMR 경계 노드에서는 서비스 전용·통행 불가 엣지와 다른 고정 허브를 제외한다.
    const mobileBoundaryNodesForHub = (hub) => (edgesByNode.get(hub?.id) ?? [])
        .filter((edge) => !isOutboundServiceEdge(edge))
        .filter((edge) => edge.mobile_robot_traversable !== false)
        .map((edge) => nodeMap.get(peerNodeId(edge, hub.id)))
        .filter((node) => node?.type === "route" && !fixedHubIds.has(node.id));

    // 출고 그룹 판별 시 그룹 ID, 슈트, 접근 노드, 고정 허브와 AMR 경계 노드까지 확인한다.
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

    // 직접 연결된 접근 노드를 우선하고, 없으면 robotKey를 기준으로 그룹 내 후보를 고정한다.
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

    // 모바일 노드와 경계를 공유하는 허브를 우선하고, 없으면 y축 거리가 가까운 허브를 사용한다.
    const fixedHubForStationAccess = (accessNode, mobileNode) => {
        const candidates = fixedHubNodesForAccess(accessNode)
            .filter((node) => fixedHubIds.has(node.id));
        if (candidates.length === 0) return null;
        if (!mobileNode) return candidates[0];
        return candidates.find((hub) =>
            mobileBoundaryNodesForHub(hub).some((node) => node.id === mobileNode.id)
        ) ?? closestNodeByY(candidates, mobileNode.y) ?? candidates[0];
    };

    // ============================================================
    // 5. 로봇 표시 노드 보정
    // ============================================================
    /*
     * 로봇은 실제로 OUTBOUND_STATION_ACCESS까지만 주행한다.
     * 외부 상태가 논리 출고지나 슈트 코드를 가리키더라도 화면에서 사라지지 않도록
     * 실제 접근 가능한 노드 좌표로 보정한다.
     *
     * 보정 순서:
     * 1) 출고 접근 노드 → 인접 AMR 경계 노드
     * 2) 고정 허브 → 허브 주변 AMR 경계 노드
     * 3) 일반 route → 원래 노드
     * 4) 논리 출고지·슈트 → 소속 출고 그룹의 실제 접근 노드
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
    // 6. 상품·작업·재고 파생 데이터
    // ============================================================
    // externalOperationId 맵은 저장된 작업과 생성 명령의 중복 표시를 막는다.
    const productById = new Map(
        products.map((product) => [Number(product.id), product]),
    );

    const taskById = new Map(tasks.map((task) => [Number(task.id), task]));

    const taskByOperationId = new Map(
        tasks
            .filter((task) => task.externalOperationId)
            .map((task) => [task.externalOperationId, task]),
    );

    /*
     * 재고는 DB nodeId와 rackLevel을 기준으로 묶는다.
     * quantity가 0인 행은 슬롯 이력이므로 실제 BOX로 표시하지 않는다.
     */
    const inventoryByNodeId = new Map();
    warehouseItems
        .filter((item) => Number(item.quantity ?? 0) > 0)
        .forEach((item) => {
            const levels = inventoryByNodeId.get(Number(item.nodeId)) ?? new Map();
            levels.set(Number(item.rackLevel), item);
            inventoryByNodeId.set(Number(item.nodeId), levels);
        });

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
    // 7. 시설 인계와 입고 대기 BOX 계산
    // ============================================================
    // service_progress를 기준으로 시설과 로봇 사이에서 이동 중인 BOX를 계산한다.
    const transferBoxes = robots.flatMap((robot) => {
        const serviceNode = resolveRobotDisplayNode(robot);
        const serviceKind = robot.service_kind?.toUpperCase();
        const taskType = robot.task_type?.toUpperCase();
        if (!serviceNode || robot.service_progress === null
            || robot.service_progress === undefined) {
            return [];
        }

        // transferStartNode는 출고 고정 허브를 찾을 때 기준이 되는 실제 접근 노드다.
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

        const facilityNodes = facilityNodeIds
            .map((nodeId) => nodeMap.get(nodeId))
            .filter(Boolean);
        if (facilityNodes.length === 0) {
            return [];
        }

        // 같은 작업이 렌더링마다 다른 포트나 슈트를 선택하지 않도록 task/robot ID로 후보를 고정한다.
        const facilityNode = selectByStableKey(
            facilityNodes,
            robot.current_task_id ?? robot.robot_id,
        );

        const progress = clamp01(robot.service_progress);
        const serviceX = convertX(serviceNode.x);
        const serviceY = convertY(serviceNode.y);
        const facilityX = convertX(facilityNode.x);
        const facilityY = convertY(facilityNode.y);

        // 출고 진행률의 25%는 AMR→고정 로봇, 나머지 75%는 고정 로봇→슈트 구간에 사용한다.
        const fixedHub = direction === "outbound"
            ? fixedHubForStationAccess(transferStartNode, serviceNode)
            : null;

        const handoffRatio = OUTBOUND_HANDOFF_RATIO;
        let x;
        let y;
        let stage = "facility-to-mobile";

        // 입고는 단일 구간, 출고는 고정 허브가 있으면 두 구간으로 나누어 보간한다.
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

        const task = taskById.get(Number(robot.current_task_id));
        const itemId = task?.itemId ?? null;
        const product = productById.get(Number(itemId)) ?? null;

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

    // 저장된 입고 작업에는 같은 operationId의 생성 명령을 연결한다.
    const inboundTaskEntries = tasks
        .filter((task) => task.taskType === "INBOUND")
        .map((task) => ({
            key: task.externalOperationId ?? `task-${task.id}`,
            task,
            command: generatedByOperationId.get(task.externalOperationId) ?? null,
            itemId: task.itemId,
        }));

    // 아직 저장되지 않은 입고 명령만 대기열에 추가해 작업과의 중복 표시를 막는다.
    const inboundCommandEntries = generatedCommands
        .filter((command) => command.operationType === "INBOUND")
        .filter((command) => !taskByOperationId.has(command.operationId))
        .map((command) => ({
            key: command.operationId,
            task: null,
            command,
            itemId: command.productId,
        }));

    // AMR이 아직 수령하지 않은 BOX를 입고 포트별로 그룹화한다.
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

    // ============================================================
    // 8. 로봇 렌더링 데이터와 화면 조합
    // ============================================================

    // BOX가 허브를 지나면 working, 슈트로 방출 중이면 releasing 상태를 적용한다.
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

    const avoidanceByRobotId = new Map(
        avoidanceStates.map(
            (avoidance) => [
                avoidance.robotId,
                avoidance,
            ],
        ),
    );

    // 자식 레이어가 시설 관계를 다시 계산하지 않도록 로봇 표시 데이터를 부모에서 준비한다.
    const mobileRobotMarkers = robots
        .map((robot) => {
            const fromNode = resolveRobotDisplayNode(
                robot,
                robot.from_node_code ?? robot.node_id,
            );
            const toNode = robot.movement_step_id
                ? resolveRobotDisplayNode(
                    robot,
                    robot.to_node_code ?? robot.node_id,
                )
                : fromNode;

            if (!fromNode || !toNode) {
                return null;
            }

            const activeTask = taskById.get(Number(robot.current_task_id));
            const activeProduct = productById.get(Number(activeTask?.itemId));
            const hasFacilityTransfer = transferBoxes.some(
                (box) => String(box.id).startsWith(`${robot.robot_id}-`),
            );

            const avoidance =
                avoidanceByRobotId.get(
                    robot.robot_id,
                );

            return {
                robot,
                fromX: convertX(fromNode.x),
                fromY: convertY(fromNode.y),
                toX: convertX(toNode.x),
                toY: convertY(toNode.y),

                isAvoidanceWaiting:
                    Boolean(avoidance),

                avoidanceLabel:
                    avoidance
                        ? `${avoidance.reason} · `
                        + `${avoidance.waitingSeconds.toFixed(1)}초`
                        : null,

                loadColor: productColor(activeTask?.itemId),
                loadTitle: activeProduct
                    ? `${activeProduct.productName} (${activeProduct.productCode}) BOX 운반 중`
                    : "BOX 운반 중",
                hideLoad: hasFacilityTransfer,
            };
        })
        .filter(Boolean);

    return (
        <WarehouseCanvas
            svgWidth={SVG_WIDTH}
            svgHeight={SVG_HEIGHT}
            showNodeLabels={showNodeLabels}
            onToggleNodeLabels={handleToggleNodeLabels}
            graphData={graphData}
            nodeMap={nodeMap}
            convertX={convertX}
            convertY={convertY}
            inboundLogicalEdges={inboundLogicalEdges}
            outboundLogicalGroups={outboundLogicalGroups}
            waitingInboundGroups={waitingInboundGroups}
            transferBoxes={transferBoxes}
            rackInventoryMap={rackInventoryMap}
            productColor={productColor}
            fixedOutboundRobots={fixedOutboundRobots}
            mobileRobotMarkers={mobileRobotMarkers}
            isRunning={isRunning}
        />
    );
}

export default WarehouseSVG;
