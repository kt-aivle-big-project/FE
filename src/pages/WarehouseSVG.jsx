import { useEffect, useRef, useState } from "react";
import "../styles/WarehouseSVG.css";
import { productApi, warehouseApi, warehouseItemApi } from "../api/client";

// API 조회 전 또는 실패 시에는 Neo4j 계약과 동일한 기본형 지도 하나만 사용한다.

import robotCharging from "../assets/robots/robot_charging.png";
import robotHero from "../assets/robots/robot_hero.png";
import robotPicking from "../assets/robots/robot_picking.png";
import robotPutaway from "../assets/robots/robot_putaway.png";
import robotRelocation from "../assets/robots/robot_relocation.png";
import robotReplenish from "../assets/robots/robot_replenish.png";

const withRackStorageNodes = (graph) => {
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const existingRackIds = new Set(
        nodes
            .filter((node) => node.type === "rack_storage")
            .map((node) => node.id),
    );
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

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

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

const robotPositionAt = (
    robot,
    fromX,
    fromY,
    toX,
    toY,
    now,
    isRunning,
) => {
    if (!robot.movement_step_id || !Number.isFinite(robot.movement_progress)) {
        return { x: fromX, y: fromY };
    }

    const baseProgress = clamp01(robot.movement_progress);
    let progress = baseProgress;
    const remainingMillis = Number(robot.arrival_in_seconds) * 1000;
    const receivedAt = Number(robot.movement_snapshot_received_at);

    // BE progress is authoritative. requestAnimationFrame only predicts the
    // small interval until the next BE snapshot and never accumulates time.
    if (
        isRunning
        && baseProgress < 1
        && Number.isFinite(remainingMillis)
        && remainingMillis > 0
        && Number.isFinite(receivedAt)
    ) {
        const elapsed = Math.max(0, now - receivedAt);
        const remainingRatio = Math.min(1, elapsed / remainingMillis);
        progress = baseProgress + (1 - baseProgress) * remainingRatio;
    }

    return {
        x: fromX + (toX - fromX) * progress,
        y: fromY + (toY - fromY) * progress,
    };
};

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

    const initialPosition = robotPositionAt(
        robot,
        fromX,
        fromY,
        toX,
        toY,
        performance.now(),
        isRunning,
    );
    const robotSize = 46;

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
                y={robotSize / 2 + 10}
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

function WarehouseSVG({
    warehouseId = 1,
    robots = [],
    tasks = [],
    generatedCommands = [],
    isRunning = false,
}) {
    // 노드 표시 ON / OFF
    const [showNodeLabels, setShowNodeLabels] = useState(false);

    // 처음에는 고른 창고의 JSON 지도를 보여주고,
    // API 조회 성공 후 백엔드 데이터로 교체
    const [graphData, setGraphData] = useState(null);
    const [layoutLoading, setLayoutLoading] = useState(true);
    const [layoutError, setLayoutError] = useState(null);
    const [layoutReloadKey, setLayoutReloadKey] = useState(0);
    const [warehouseItems, setWarehouseItems] = useState([]);
    const [products, setProducts] = useState([]);

    useEffect(() => {
        let cancelled = false;
        setGraphData(null);
        setLayoutError(null);
        setLayoutLoading(true);
        // 창고를 바꾸면 API 응답이 오기 전까지 그 창고의 폴백 지도를 보여준다

        const fetchWarehouseLayout = async () => {
            try {
                const data = await warehouseApi.getLayout(warehouseId);
                if (cancelled) return;

                const nodeCodeMap = new Map(
                    data.nodes
                        .filter((node) => node.nodeCode)
                        .map((node) => [node.id, node.nodeCode])
                );

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
                        ...(edge.routeAttributes ?? {}),
                        id: edge.edgeCode ?? String(edge.id),
                        source: nodeCodeMap.get(edge.fromNodeId),
                        target: nodeCodeMap.get(edge.toNodeId),
                        type: edge.edgeType ?? "lane",
                        distance_m: edge.distance,
                        speed_limit_mps: edge.speedLimitMps,
                        service_only: edge.serviceOnly,
                        mobile_robot_traversable:
                            edge.mobileRobotTraversable,
                    }))
                    .filter((edge) => edge.source && edge.target);

                setGraphData(withRackStorageNodes({
                    nodes: convertedNodes,
                    edges: convertedEdges,
                }));
                setLayoutLoading(false);

                console.log("변환된 창고 지도:", {
                    warehouseId,
                    nodes: convertedNodes.length,
                    edges: convertedEdges.length,
                });
            } catch (error) {
                if (cancelled) return;
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
            timerId = window.setInterval(refreshInventory, 1500);
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
                <button type="button" onClick={() => setLayoutReloadKey((value) => value + 1)}>
                    다시 시도
                </button>
            </div>
        );
    }

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

    const edgesByNode = new Map();
    graphData.edges.forEach((edge) => {
        [edge.source, edge.target].forEach((nodeId) => {
            const values = edgesByNode.get(nodeId) ?? [];
            values.push(edge);
            edgesByNode.set(nodeId, values);
        });
    });
    const peerNodeId = (edge, nodeId) => (
        edge.source === nodeId
            ? edge.target
            : edge.target === nodeId
                ? edge.source
                : null
    );
    const isOutboundServiceEdge = (edge) => (
        edge.service_only === true
        || ["outbound_service", "station_service"].includes(
            String(edge.type ?? "").toLowerCase(),
        )
    );

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

    const inboundAccessNodes = graphData.nodes.filter(
        (node) => node.type === "inbound_handoff_access",
    );
    const inboundAccessForMobileNode = (nodeCode, robotKey = 0) => {
        const candidates = inboundAccessNodes.filter((accessNode) => (
            accessNode.id === nodeCode
            || accessNode.adjacent_route_node === nodeCode
            || (edgesByNode.get(accessNode.id) ?? []).some(
                (edge) => peerNodeId(edge, accessNode.id) === nodeCode,
            )
        ));
        if (candidates.length === 0) return null;
        const numericKey = Number(robotKey ?? 0);
        const index = Math.abs(Number.isFinite(numericKey) ? numericKey : 0)
            % candidates.length;
        return candidates[index];
    };

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

    const mobileBoundaryNodesForHub = (hub) => (edgesByNode.get(hub?.id) ?? [])
        .filter((edge) => !isOutboundServiceEdge(edge))
        .filter((edge) => edge.mobile_robot_traversable !== false)
        .map((edge) => nodeMap.get(peerNodeId(edge, hub.id)))
        .filter((node) => node?.type === "route" && !fixedHubIds.has(node.id));

    const closestNodeByY = (nodes, targetY) => nodes.reduce(
        (best, node) => (
            !best || Math.abs(Number(node.y) - Number(targetY))
                < Math.abs(Number(best.y) - Number(targetY))
                ? node
                : best
        ),
        null,
    );

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

    const stationAccessForMobileNode = (nodeCode, robotKey = 0) => {
        const group = stationGroupForMobileNode(nodeCode);
        if (!group || group.accessNodes.length === 0) return null;

        const directlyConnected = group.accessNodes.filter(
            (node) => node.adjacent_route_node === nodeCode || node.id === nodeCode
        );
        const candidates = directlyConnected.length > 0
            ? directlyConnected
            : group.accessNodes;
        const numericKey = Number(robotKey ?? 0);
        const index = Math.abs(Number.isFinite(numericKey) ? numericKey : 0)
            % candidates.length;
        return candidates[index];
    };

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

    const productById = new Map(
        products.map((product) => [Number(product.id), product]),
    );
    const taskById = new Map(tasks.map((task) => [Number(task.id), task]));
    const taskByOperationId = new Map(
        tasks
            .filter((task) => task.externalOperationId)
            .map((task) => [task.externalOperationId, task]),
    );

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
    const rackInventoryMap = new Map(
        graphData.nodes
            .filter((node) => node.type === "rack_storage")
            .map((node) => {
                const storedLevels = inventoryByNodeId.get(Number(node.databaseId)) ?? new Map();
                return [
                    node.id,
                    {
                        levels: [1, 2, 3].map((level) => {
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

    // 로봇 이미지 매핑
    const robotImages = {
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

    const transferBoxes = robots.flatMap((robot) => {
        const serviceNode = resolveRobotDisplayNode(robot);
        const serviceKind = robot.service_kind?.toUpperCase();
        const taskType = robot.task_type?.toUpperCase();
        if (!serviceNode || robot.service_progress === null
            || robot.service_progress === undefined) {
            return [];
        }

        let facilityNodeIds = [];
        let direction = null;
        let transferStartNode = serviceNode;
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

        const numericKey = Number(robot.current_task_id ?? robot.robot_id ?? 0);
        const facilityNode = facilityNodes[
            Math.abs(Number.isFinite(numericKey) ? numericKey : 0)
            % facilityNodes.length
        ];
        const progress = Math.max(0, Math.min(1, Number(robot.service_progress)));
        const serviceX = convertX(serviceNode.x);
        const serviceY = convertY(serviceNode.y);
        const facilityX = convertX(facilityNode.x);
        const facilityY = convertY(facilityNode.y);
        const fixedHub = direction === "outbound"
            ? fixedHubForStationAccess(transferStartNode, serviceNode)
            : null;
        // Default station timing is roughly 25% input handoff and 75%
        // fixed-robot sorting/release.  The latter may overlap the next box.
        const handoffRatio = 0.25;
        let x;
        let y;
        let stage = "facility-to-mobile";
        if (direction === "inbound") {
            x = facilityX + (serviceX - facilityX) * progress;
            y = facilityY + (serviceY - facilityY) * progress;
        } else if (fixedHub && progress <= handoffRatio) {
            const stageProgress = progress / handoffRatio;
            x = serviceX + (convertX(fixedHub.x) - serviceX) * stageProgress;
            y = serviceY + (convertY(fixedHub.y) - serviceY) * stageProgress;
            stage = "mobile-to-fixed-robot";
        } else if (fixedHub) {
            const stageProgress = (progress - handoffRatio) / (1 - handoffRatio);
            x = convertX(fixedHub.x) + (facilityX - convertX(fixedHub.x)) * stageProgress;
            y = convertY(fixedHub.y) + (facilityY - convertY(fixedHub.y)) * stageProgress;
            stage = "fixed-robot-to-chute";
        } else {
            x = serviceX + (facilityX - serviceX) * progress;
            y = serviceY + (facilityY - serviceY) * progress;
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

    const terminalTaskStatuses = new Set(["DONE", "FAILED", "CANCELLED"]);
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
    const inboundTaskEntries = tasks
        .filter((task) => task.taskType === "INBOUND")
        .map((task) => ({
            key: task.externalOperationId ?? `task-${task.id}`,
            task,
            command: generatedByOperationId.get(task.externalOperationId) ?? null,
            itemId: task.itemId,
        }));
    const inboundCommandEntries = generatedCommands
        .filter((command) => command.operationType === "INBOUND")
        .filter((command) => !taskByOperationId.has(command.operationId))
        .map((command) => ({
            key: command.operationId,
            task: null,
            command,
            itemId: command.productId,
        }));

    const waitingInboundGroups = new Map();
    [...inboundTaskEntries, ...inboundCommandEntries].forEach((entry, index) => {
        const task = entry.task;
        if (
            task
            && (
                terminalTaskStatuses.has(task.status)
                || task.inventoryAppliedAt
            )
        ) return;

        const robot = task ? robotByTaskId.get(Number(task.id)) : null;
        const pickupInProgress = robot
            && robot.task_type?.toUpperCase() === "INBOUND"
            && robot.service_kind?.toUpperCase() === "PICKUP"
            && robot.service_progress != null;
        if (pickupInProgress || robot?.carrying_load) return;

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

    // 로봇 이동 속도/시간 조절
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
                            if (
                                edge.mobile_robot_traversable === false ||
                                edge.active_for_new_work === false
                            ) {
                                return null;
                            }
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

                {/* 통로 번호 */}
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

                {/* 로봇이 실제로 이동하는 route 노드 */}
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

                {/* 시설 논리 관계: 화면에만 표시하고 경로 탐색에는 포함하지 않는다. */}
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

                {/* 아직 AMR이 수령하지 않은 입고 BOX 대기열 */}
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

                {/* 로봇은 접근 노드에 머물고 BOX만 논리 입·출고 설비와 이동한다. */}
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

                {/* 입고지 연결 inbound-access */}
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

                {/* 출고지 연결 inbound-access */}
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

                {/* 충전소 연결 Junction
                    route ↔ charging slot 연결 지점 */}
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

                {/* 선반
                    rack_inventory.json의 3단 재고 상태까지 표시 */}
                <g className="warehouse-racks">
                    {graphData.nodes
                        .filter((node) =>
                            node.type === "rack_storage"
                        )
                        .map((node) => {
                            const inventory = rackInventoryMap.get(node.id);
                            /*
                             * 화면에서는 상단 → 중단 → 하단 순서로 보여주기 위해
                             * level을 역순으로 정렬
                             */
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

                                    {/* 선반 3단 */}
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

                {/* 입고 엘리베이터 IA ~ IG  */}
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
                            ))}
                </g>

                {/* 충전소 C01 ~ C10 */}
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

                {/* 영역 이름 */}
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

                {/* 로봇 */}
                {/* Fixed outbound robots own the blue station nodes. */}
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
                    {robots.map((robot) => {
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

                        // 현재 상태에 맞는 로봇 이미지
                        const robotImage =
                            robotImages[robot.activity]
                            ?? robotImages[robot.status]
                            ?? robotHero;
                        const activeTask = taskById.get(Number(robot.current_task_id));
                        const activeProduct = productById.get(Number(activeTask?.itemId));
                        const hasFacilityTransfer = transferBoxes.some(
                            (box) => String(box.id).startsWith(`${robot.robot_id}-`),
                        );

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
