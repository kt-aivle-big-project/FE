import { useEffect, useMemo, useRef, useState } from "react";
import {
    LAYOUT_OBJECT_DEFINITIONS,
    compileWarehouseLayout,
    createExplicitAisle,
    createLayoutObject,
    getLayoutConnectionPoint,
    snapLayoutPoint,
} from "../../utils/warehouseLayoutBuilder";
import "../../styles/WarehouseLayoutEditor.css";

const GRID_SIZE = 1;
const EXISTING_MAP_GRID_SIZE = 0.05;
const EXISTING_MAP_MAJOR_GRID_SIZE = 0.25;
const MAX_HISTORY = 30;
const DELETE_HOLD_MS = 3000;
const FACILITY_GROUP_KINDS = new Set(["inbound", "outbound", "charging"]);

const COMPACT_OBJECT_SIZES = {
    rack: { width: 0.48, height: 0.38 },
    inbound: { width: 0.32, height: 0.28 },
    outbound: { width: 0.32, height: 0.28 },
    charging: { width: 0.32, height: 0.32 },
    route: { width: 0, height: 0 },
};

const PALETTE_GROUPS = [
    {
        title: "시설물",
        tools: ["rack", "inbound", "outbound", "charging"],
    },
    {
        title: "경로망",
        tools: ["AISLE", "route"],
    },
];

const TOOL_META = {
    SELECT: { label: "선택·이동", symbol: "↖", description: "배치된 객체를 선택하고 이동합니다." },
    AISLE: { label: "엣지 연결", symbol: "╱", description: "서로 다른 노드 두 개를 차례로 선택해 연결합니다." },
    rack: { label: "3층 선반", symbol: "▤", description: LAYOUT_OBJECT_DEFINITIONS.rack.description },
    inbound: { label: "입고지", symbol: "⇥", description: LAYOUT_OBJECT_DEFINITIONS.inbound.description },
    outbound: { label: "출고지", symbol: "⇢", description: LAYOUT_OBJECT_DEFINITIONS.outbound.description },
    charging: { label: "충전소", symbol: "▲", description: LAYOUT_OBJECT_DEFINITIONS.charging.description },
    route: { label: "경로 노드", symbol: "◇", description: LAYOUT_OBJECT_DEFINITIONS.route.description },
};

const snapshotOf = (objects, aisles) => ({
    objects: objects.map((object) => ({
        ...object,
        rawNode: object.rawNode ? { ...object.rawNode } : undefined,
    })),
    aisles: aisles.map((aisle) => ({
        ...aisle,
        start: { ...aisle.start },
        end: { ...aisle.end },
        rawEdges: aisle.rawEdges?.map((edge) => ({ ...edge })),
    })),
});

const objectDimensions = (object) => {
    const rotated = Math.abs(Number(object.rotation) % 180) === 90;
    return {
        width: rotated ? object.height : object.width,
        height: rotated ? object.width : object.height,
    };
};

const nextAisleId = (aisles) => {
    const used = new Set(aisles.map((aisle) => aisle.id));
    let sequence = 1;

    while (used.has(`A${String(sequence).padStart(3, "0")}`)) {
        sequence += 1;
    }

    return `A${String(sequence).padStart(3, "0")}`;
};

const aisleVisualClass = (aisle) => {
    const type = String(aisle.rawEdges?.[0]?.type ?? "lane").toLowerCase();

    if (type.includes("rack")) return "rack-edge";
    if (type.includes("inbound") || type.includes("handoff")) return "inbound-edge";
    if (type.includes("outbound") || type.includes("station") || type.includes("tote")) return "outbound-edge";
    if (type.includes("return")) return "return-edge";
    return "route-edge";
};

const objectRenderPriority = (object) => {
    const type = object.rawNode?.type;
    if (type === "rack_storage") return 0;
    if (type === "inbound" || type === "outbound") return 1;
    if (type === "charging_slot") return 2;
    if (type?.includes("access")) return 4;
    return 3;
};

const isInternalAccessObject = (object) => [
    "inbound_handoff_access",
    "outbound_station_access",
].includes(object?.rawNode?.type) && !object?.facilityEndpoint;

const isRackAccessObject = (object) => object?.rawNode?.type === "rack_access";

const orderedFacilityMembers = (members, orientation) => [...members].sort((left, right) => {
    const indexDifference = Number(left.facilityIndex ?? 0) - Number(right.facilityIndex ?? 0);
    if (indexDifference !== 0) {
        return indexDifference;
    }
    return orientation === "HORIZONTAL"
        ? left.x - right.x || left.y - right.y
        : left.y - right.y || left.x - right.x;
});

const facilityGroupBounds = (members) => {
    if (members.length === 0) {
        return null;
    }
    const boxes = members.map((object) => {
        const dimensions = objectDimensions(object);
        return {
            left: object.x - dimensions.width / 2,
            right: object.x + dimensions.width / 2,
            top: object.y - dimensions.height / 2,
            bottom: object.y + dimensions.height / 2,
        };
    });
    return {
        left: Math.min(...boxes.map((box) => box.left)),
        right: Math.max(...boxes.map((box) => box.right)),
        top: Math.min(...boxes.map((box) => box.top)),
        bottom: Math.max(...boxes.map((box) => box.bottom)),
    };
};

const facilityGroupLabel = (kind) => ({
    inbound: "입고 설비",
    outbound: "출고 설비",
    charging: "충전 설비",
}[kind] ?? "설비");

const minimumFacilityStep = (members, orientation, compact) => {
    const occupiedSize = Math.max(
        ...members.map((member) => {
            const dimensions = objectDimensions(member);
            return orientation === "HORIZONTAL" ? dimensions.width : dimensions.height;
        }),
        0,
    );
    const minimumGap = compact ? 0.04 : 0.2;
    return Math.ceil((occupiedSize + minimumGap) * 100) / 100;
};

const alphaLabel = (index, upperCase = false) => {
    let value = index + 1;
    let label = "";
    while (value > 0) {
        value -= 1;
        label = String.fromCharCode(65 + (value % 26)) + label;
        value = Math.floor(value / 26);
    }
    return upperCase ? label : label.toLowerCase();
};

const nextRawFacilityIdentity = (kind, objects, template = null) => {
    const used = new Set(objects.map((object) => object.id));
    const accessFacility = [
        "inbound_handoff_access",
        "outbound_station_access",
    ].includes(template?.type);
    for (let index = 0; index < 999; index += 1) {
        if (accessFacility) {
            const id = kind === "inbound"
                ? `IN_HANDOFF_${index + 1}`
                : `OUT_STATION_${index + 1}`;
            if (!used.has(id)) {
                return { id, label: String(index + 1) };
            }
            continue;
        }
        const label = kind === "charging"
            ? String(index + 1).padStart(2, "0")
            : alphaLabel(index, kind === "outbound");
        const id = kind === "inbound"
            ? `I_${label}`
            : kind === "outbound"
                ? `O_${label}`
                : `C${label}`;
        if (!used.has(id)) {
            return { id, label };
        }
    }
    throw new Error("설비 노드 ID를 생성할 수 없습니다.");
};

function WarehouseLayoutEditor({
    width,
    height,
    title,
    onChange,
    initialDraft = null,
    onDraftChange,
    existingMapMode = false,
}) {
    const svgRef = useRef(null);
    const canvasWheelHandlerRef = useRef(null);
    const deleteTimerRef = useRef(null);
    const [objects, setObjects] = useState(() =>
        Array.isArray(initialDraft?.objects)
            ? initialDraft.objects
                  .filter((object) => object.kind !== "buffer")
                  .map((object) => ({ ...object }))
            : [],
    );
    const [aisles, setAisles] = useState(() =>
        Array.isArray(initialDraft?.aisles)
            ? initialDraft.aisles
                  .filter((aisle) => aisle.startNodeId && aisle.endNodeId)
                  .map((aisle) => ({
                      ...aisle,
                      start: { ...aisle.start },
                      end: { ...aisle.end },
                  }))
            : [],
    );
    const [history, setHistory] = useState([]);
    const [activeTool, setActiveTool] = useState("SELECT");
    const [selected, setSelected] = useState(null);
    const [aisleStart, setAisleStart] = useState(null);
    const [edgeMessage, setEdgeMessage] = useState("");
    const [dragging, setDragging] = useState(null);
    const [panning, setPanning] = useState(null);
    const [viewport, setViewport] = useState(null);
    const [paletteDragging, setPaletteDragging] = useState(null);
    const [showGraph, setShowGraph] = useState(!existingMapMode);
    const [deleteHold, setDeleteHold] = useState(null);

    const numericWidth = Number(width);
    const numericHeight = Number(height);
    const dimensionsReady = Number.isFinite(numericWidth) && numericWidth > 0 &&
        Number.isFinite(numericHeight) && numericHeight > 0;
    const editorGridSize = existingMapMode ? EXISTING_MAP_GRID_SIZE : GRID_SIZE;
    const visualGridSize = existingMapMode ? EXISTING_MAP_MAJOR_GRID_SIZE : GRID_SIZE;
    const activeViewport = viewport ?? {
        x: 0,
        y: 0,
        width: numericWidth || 1,
        height: numericHeight || 1,
    };

    useEffect(() => {
        setViewport(null);
    }, [numericHeight, numericWidth]);

    const compiled = useMemo(
        () => compileWarehouseLayout({
            width: numericWidth,
            height: numericHeight,
            objects,
            aisles,
            title: title || "사용자 설계 창고",
        }),
        [aisles, numericHeight, numericWidth, objects, title],
    );

    useEffect(() => {
        onChange(compiled);
    }, [compiled, onChange]);

    useEffect(() => {
        onDraftChange?.(snapshotOf(objects, aisles));
    }, [aisles, objects, onDraftChange]);

    const pushHistory = () => {
        setHistory((previous) => [
            ...previous.slice(-(MAX_HISTORY - 1)),
            snapshotOf(objects, aisles),
        ]);
    };

    const pointFromClient = (clientX, clientY) => {
        const svg = svgRef.current;

        if (!svg) {
            return { x: 0, y: 0 };
        }

        const matrix = svg.getScreenCTM();

        if (!matrix) {
            return { x: 0, y: 0 };
        }

        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const transformed = point.matrixTransform(matrix.inverse());
        return {
            x: Math.max(0, Math.min(numericWidth, transformed.x)),
            y: Math.max(0, Math.min(numericHeight, transformed.y)),
        };
    };

    const clampViewport = (nextViewport) => ({
        ...nextViewport,
        x: Math.max(0, Math.min(numericWidth - nextViewport.width, nextViewport.x)),
        y: Math.max(0, Math.min(numericHeight - nextViewport.height, nextViewport.y)),
    });

    const handleCanvasWheel = (event) => {
        if (!dimensionsReady) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (!event.ctrlKey) {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) {
                return;
            }

            const horizontalPixels = event.shiftKey ? event.deltaY : event.deltaX;
            const verticalPixels = event.shiftKey ? 0 : event.deltaY;
            setViewport(clampViewport({
                ...activeViewport,
                x: activeViewport.x + horizontalPixels / rect.width * activeViewport.width,
                y: activeViewport.y + verticalPixels / rect.height * activeViewport.height,
            }));
            return;
        }

        const focus = pointFromClient(event.clientX, event.clientY);
        const zoomFactor = event.deltaY < 0 ? 0.86 : 1.16;
        const nextWidth = Math.max(
            numericWidth * 0.25,
            Math.min(numericWidth, activeViewport.width * zoomFactor),
        );
        const scale = nextWidth / activeViewport.width;
        const nextHeight = activeViewport.height * scale;

        if (Math.abs(nextWidth - activeViewport.width) < 1e-6) {
            return;
        }

        const focusRatioX = (focus.x - activeViewport.x) / activeViewport.width;
        const focusRatioY = (focus.y - activeViewport.y) / activeViewport.height;
        setViewport(clampViewport({
            x: focus.x - nextWidth * focusRatioX,
            y: focus.y - nextHeight * focusRatioY,
            width: nextWidth,
            height: nextHeight,
        }));
    };
    canvasWheelHandlerRef.current = handleCanvasWheel;

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg || !dimensionsReady) {
            return undefined;
        }

        const onWheel = (event) => canvasWheelHandlerRef.current?.(event);
        svg.addEventListener("wheel", onWheel, { passive: false });
        return () => svg.removeEventListener("wheel", onWheel);
    }, [dimensionsReady]);

    useEffect(() => () => {
        if (deleteTimerRef.current) {
            window.clearTimeout(deleteTimerRef.current);
        }
    }, []);

    const beginCanvasPan = (event) => {
        if (event.button !== 1 || !dimensionsReady) {
            return;
        }

        event.preventDefault();
        setPanning({
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startClientY: event.clientY,
            viewport: { ...activeViewport },
        });
        svgRef.current?.setPointerCapture?.(event.pointerId);
    };

    const addObject = (kind, point) => {
        const snappedPoint = snapLayoutPoint(
            point,
            numericWidth,
            numericHeight,
            editorGridSize,
        );
        const created = createLayoutObject(kind, snappedPoint, objects);
        const compactSize = existingMapMode ? COMPACT_OBJECT_SIZES[kind] : null;
        pushHistory();

        if (kind === "rack") {
            const rack = {
                ...created,
                ...(compactSize ?? {}),
                rawNode: {
                    id: created.id,
                    type: "rack_storage",
                    rack_id: created.id,
                    resource_id: created.id,
                    service_only: false,
                    transit_allowed: false,
                    holding_allowed: false,
                    node_capacity: 1,
                    label: `${created.id} · 3층`,
                },
            };
            setObjects((previous) => [...previous, rack]);
            setSelected(null);
            return;
        }

        setObjects((previous) => [
            ...previous,
            compactSize ? { ...created, ...compactSize } : created,
        ]);
        setSelected(null);
    };

    const handleToolSelect = (tool) => {
        cancelDeleteHold();
        setActiveTool(tool);
        setAisleStart(null);
        setEdgeMessage(
            tool === "AISLE"
                ? "연결할 첫 번째 노드를 선택하세요."
                : tool === "DELETE"
                    ? "삭제할 노드나 엣지를 3초 동안 누르세요."
                    : "",
        );
        setSelected(null);
    };

    const handleCanvasClick = (event) => {
        if (!dimensionsReady) {
            return;
        }

        if (activeTool === "SELECT") {
            setSelected(null);
            return;
        }

        if (activeTool === "AISLE") {
            setEdgeMessage("빈 공간이 아니라 배치된 노드를 선택하세요.");
            return;
        }

        if (activeTool === "DELETE") {
            setEdgeMessage("삭제할 노드나 엣지를 3초 동안 누르세요.");
            return;
        }

        if (LAYOUT_OBJECT_DEFINITIONS[activeTool]) {
            const point = pointFromClient(event.clientX, event.clientY);
            addObject(activeTool, point);
            if (activeTool !== "route") {
                setActiveTool("SELECT");
            }
        }
    };

    const handleConnectionNodeClick = (event, object) => {
        event.stopPropagation();

        if (activeTool === "DELETE") {
            return;
        }

        if (activeTool !== "AISLE") {
            return;
        }

        if (!aisleStart) {
            setAisleStart({ nodeId: object.id });
            setEdgeMessage(`${object.id} 선택됨 · 연결할 두 번째 노드를 선택하세요.`);
            return;
        }

        if (aisleStart.nodeId === object.id) {
            setEdgeMessage("같은 노드는 서로 연결할 수 없습니다. 다른 노드를 선택하세요.");
            return;
        }

        const startObject = objects.find(
            (candidate) => candidate.id === aisleStart.nodeId,
        );

        if (!startObject) {
            setAisleStart(null);
            setEdgeMessage("시작 노드를 찾을 수 없습니다. 다시 선택하세요.");
            return;
        }

        const resolvedStart = startObject;
        const resolvedEnd = object;

        const duplicate = aisles.some((aisle) =>
            (aisle.startNodeId === resolvedStart.id && aisle.endNodeId === resolvedEnd.id) ||
            (aisle.startNodeId === resolvedEnd.id && aisle.endNodeId === resolvedStart.id),
        );

        if (duplicate) {
            setAisleStart(null);
            setEdgeMessage("이미 연결된 두 노드입니다. 첫 번째 노드를 다시 선택하세요.");
            return;
        }

        const nextId = nextAisleId(aisles);
        pushHistory();
        setAisles((previous) => [
            ...previous,
            createExplicitAisle(resolvedStart, resolvedEnd, nextId),
        ]);
        setAisleStart(null);
        setEdgeMessage(`${startObject.id}과(와) ${object.id}을(를) 연결했습니다.`);
    };

    const removeObjectById = (objectId) => {
        const target = objects.find((object) => object.id === objectId);
        if (!target) {
            return;
        }
        const removedIds = new Set([objectId]);
        if (target.kind === "rack") {
            const rackId = target.rawNode?.rack_id ?? target.id;
            objects
                .filter((object) =>
                    isRackAccessObject(object) && object.rawNode?.rack_id === rackId,
                )
                .forEach((object) => removedIds.add(object.id));
        }

        pushHistory();
        setObjects((previous) => previous.filter((object) => !removedIds.has(object.id)));
        setAisles((previous) => previous.filter(
            (aisle) => !removedIds.has(aisle.startNodeId) &&
                !removedIds.has(aisle.endNodeId),
        ));
        setSelected(null);
        setAisleStart(null);
        setEdgeMessage(`${target.id}을(를) 삭제했습니다.`);
    };

    const removeAisleById = (aisleId) => {
        if (!aisles.some((aisle) => aisle.id === aisleId)) {
            return;
        }
        pushHistory();
        setAisles((previous) => previous.filter((aisle) => aisle.id !== aisleId));
        setSelected(null);
        setAisleStart(null);
        setEdgeMessage(`${aisleId} 엣지를 삭제했습니다.`);
    };

    const cancelDeleteHold = (message = "") => {
        if (deleteTimerRef.current) {
            window.clearTimeout(deleteTimerRef.current);
            deleteTimerRef.current = null;
        }
        setDeleteHold(null);
        if (message) {
            setEdgeMessage(message);
        }
    };

    const beginDeleteHold = (event, target) => {
        if (activeTool !== "DELETE" || event.button !== 0) {
            return false;
        }
        event.preventDefault();
        event.stopPropagation();
        cancelDeleteHold();
        setDeleteHold(target);
        setEdgeMessage(`${target.id} 삭제 대기 중 · 3초 동안 계속 누르세요.`);
        svgRef.current?.setPointerCapture?.(event.pointerId);
        deleteTimerRef.current = window.setTimeout(() => {
            deleteTimerRef.current = null;
            setDeleteHold(null);
            if (target.type === "object") {
                removeObjectById(target.id);
            } else {
                removeAisleById(target.id);
            }
        }, DELETE_HOLD_MS);
        return true;
    };

    const beginPaletteDrag = (event, kind) => {
        if (!LAYOUT_OBJECT_DEFINITIONS[kind]) {
            return;
        }

        setPaletteDragging({
            kind,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
        });
    };

    const trackPaletteDrag = (event) => {
        if (!paletteDragging || paletteDragging.moved) {
            return;
        }

        if (Math.hypot(
            event.clientX - paletteDragging.startX,
            event.clientY - paletteDragging.startY,
        ) >= 5) {
            setPaletteDragging((current) => current ? { ...current, moved: true } : null);
        }
    };

    const finishPaletteDrag = (event) => {
        if (!paletteDragging) {
            return;
        }

        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect();
        const droppedOnCanvas = paletteDragging.moved && dimensionsReady && rect &&
            event.clientX >= rect.left && event.clientX <= rect.right &&
            event.clientY >= rect.top && event.clientY <= rect.bottom;

        if (droppedOnCanvas) {
            addObject(
                paletteDragging.kind,
                pointFromClient(event.clientX, event.clientY),
            );
            if (paletteDragging.kind !== "route") {
                setActiveTool("SELECT");
            }
        }

        setPaletteDragging(null);
    };

    const beginObjectDrag = (event, object) => {
        if (beginDeleteHold(event, { type: "object", id: object.id })) {
            return;
        }

        if (event.button === 1) {
            return;
        }

        event.stopPropagation();

        if (event.button !== 0) {
            return;
        }

        if (activeTool === "AISLE") {
            return;
        }

        if (activeTool !== "SELECT") {
            setActiveTool("SELECT");
            setAisleStart(null);
            setEdgeMessage("");
        }

        const point = pointFromClient(event.clientX, event.clientY);
        const groupMembers = object.facilityGroupId
            ? objects.filter((candidate) => candidate.facilityGroupId === object.facilityGroupId)
            : [object];
        pushHistory();
        setSelected({ type: "object", id: object.id });
        setDragging({
            id: object.id,
            groupId: object.facilityGroupId ?? null,
            pointerId: event.pointerId,
            offsetX: point.x - object.x,
            offsetY: point.y - object.y,
            anchorX: object.x,
            anchorY: object.y,
            memberPositions: groupMembers.map((member) => ({
                id: member.id,
                x: member.x,
                y: member.y,
            })),
        });
        svgRef.current?.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event) => {
        if (panning) {
            const rect = svgRef.current?.getBoundingClientRect();
            if (!rect) {
                return;
            }
            const deltaX = (event.clientX - panning.startClientX) / rect.width * panning.viewport.width;
            const deltaY = (event.clientY - panning.startClientY) / rect.height * panning.viewport.height;
            setViewport(clampViewport({
                ...panning.viewport,
                x: panning.viewport.x - deltaX,
                y: panning.viewport.y - deltaY,
            }));
            return;
        }

        if (!dragging) {
            return;
        }

        const point = pointFromClient(event.clientX, event.clientY);
        const nextPoint = snapLayoutPoint(
            {
                x: point.x - dragging.offsetX,
                y: point.y - dragging.offsetY,
            },
            numericWidth,
            numericHeight,
            editorGridSize,
        );

        const deltaX = nextPoint.x - dragging.anchorX;
        const deltaY = nextPoint.y - dragging.anchorY;
        const startById = new Map(
            dragging.memberPositions.map((position) => [position.id, position]),
        );

        setObjects((previous) => previous.map((object) => {
            const start = startById.get(object.id);
            return start
                ? { ...object, x: start.x + deltaX, y: start.y + deltaY }
                : object;
        }));
    };

    const finishObjectDrag = (event) => {
        if (deleteTimerRef.current) {
            svgRef.current?.releasePointerCapture?.(event.pointerId);
            cancelDeleteHold("삭제가 취소되었습니다. 삭제하려면 3초 동안 계속 누르세요.");
            event.stopPropagation();
            return;
        }

        if (panning) {
            svgRef.current?.releasePointerCapture?.(panning.pointerId);
            setPanning(null);
            event.stopPropagation();
            return;
        }

        if (!dragging) {
            return;
        }

        svgRef.current?.releasePointerCapture?.(dragging.pointerId);
        setDragging(null);
        event.stopPropagation();
    };

    const undo = () => {
        const previous = history.at(-1);

        if (!previous) {
            return;
        }

        setObjects(previous.objects);
        setAisles(previous.aisles);
        setHistory((items) => items.slice(0, -1));
        setSelected(null);
        setAisleStart(null);
    };

    const clearLayout = () => {
        if (objects.length === 0 && aisles.length === 0) {
            return;
        }

        if (!window.confirm("배치한 시설물과 통로를 모두 지울까요?")) {
            return;
        }

        cancelDeleteHold();
        pushHistory();
        setObjects([]);
        setAisles([]);
        setSelected(null);
        setAisleStart(null);
    };

    const rotateSelectedRack = () => {
        if (selected?.type !== "object") {
            return;
        }

        const object = objects.find((candidate) => candidate.id === selected.id);

        if (object?.kind !== "rack") {
            return;
        }

        pushHistory();
        setObjects((previous) => previous.map((candidate) =>
            candidate.id === selected.id
                ? { ...candidate, rotation: (Number(candidate.rotation) + 90) % 180 }
                : candidate,
        ));
    };

    const updateSelectedAisleDirection = (direction) => {
        if (selected?.type !== "aisle") {
            return;
        }

        pushHistory();
        setAisles((previous) => previous.map((aisle) =>
            aisle.id === selected.id ? { ...aisle, direction } : aisle,
        ));
    };

    const handleKeyDown = (event) => {
        if (event.key === "Escape") {
            cancelDeleteHold();
            setActiveTool("SELECT");
            setAisleStart(null);
            setEdgeMessage("");
            setSelected(null);
            return;
        }

        const targetTag = event.target?.tagName?.toLowerCase();
        if (["input", "select", "textarea"].includes(targetTag) || event.target?.isContentEditable) {
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
            event.preventDefault();
            undo();
            return;
        }

        if ((event.key === "Delete" || event.key === "Backspace") && selected) {
            event.preventDefault();
            setActiveTool("DELETE");
            setSelected(null);
            setEdgeMessage("안전을 위해 삭제할 노드나 엣지를 3초 동안 누르세요.");
        }
    };

    const selectedObject = selected?.type === "object"
        ? objects.find((object) => object.id === selected.id)
        : null;
    const selectedFacilityGroupId = selectedObject?.facilityGroupId;
    const selectedAisle = selected?.type === "aisle"
        ? aisles.find((aisle) => aisle.id === selected.id)
        : null;
    const objectById = new Map(objects.map((object) => [object.id, object]));
    const aisleStartObject = aisleStart
        ? objectById.get(aisleStart.nodeId)
        : null;
    const aisleStartPoint = getLayoutConnectionPoint(aisleStartObject);
    const nodeById = new Map(compiled.map.nodes.map((node) => [node.id, node]));
    const visibleEdges = [];
    const visibleEdgeKeys = new Set();
    compiled.map.edges.forEach((edge) => {
        const key = [edge.source, edge.target].sort().join("::");

        if (!visibleEdgeKeys.has(key)) {
            visibleEdgeKeys.add(key);
            visibleEdges.push(edge);
        }
    });
    const renderObjects = objects.filter((object) =>
        !isRackAccessObject(object) &&
        !(existingMapMode && !showGraph && isInternalAccessObject(object)),
    );
    const orderedRenderObjects = existingMapMode
        ? [...renderObjects].sort(
              (left, right) => objectRenderPriority(left) - objectRenderPriority(right),
          )
        : renderObjects;
    const importantNodeIds = new Set();
    const importantAisleIds = new Set();
    const physicalRouteObjects = renderObjects.filter((object) =>
        object.kind === "route" &&
        (!object.rawNode || object.rawNode.type === "route"),
    );
    const leftmostRouteByRow = new Map();
    const topmostRouteByColumn = new Map();

    physicalRouteObjects.forEach((object) => {
        const rowKey = Number(object.y).toFixed(3);
        const columnKey = Number(object.x).toFixed(3);
        const leftmost = leftmostRouteByRow.get(rowKey);
        const topmost = topmostRouteByColumn.get(columnKey);

        if (!leftmost || object.x < leftmost.x) {
            leftmostRouteByRow.set(rowKey, object);
        }
        if (!topmost || object.y < topmost.y) {
            topmostRouteByColumn.set(columnKey, object);
        }
    });
    leftmostRouteByRow.forEach((object) => importantNodeIds.add(object.id));
    topmostRouteByColumn.forEach((object) => importantNodeIds.add(object.id));

    aisles.forEach((aisle) => {
        const startObject = objectById.get(aisle.startNodeId);
        const endObject = objectById.get(aisle.endNodeId);
        const startIsFacility = FACILITY_GROUP_KINDS.has(startObject?.kind);
        const endIsFacility = FACILITY_GROUP_KINDS.has(endObject?.kind);

        if (!startIsFacility && !endIsFacility) {
            return;
        }

        importantAisleIds.add(aisle.id);
        if (startObject?.kind === "route") {
            importantNodeIds.add(startObject.id);
        }
        if (endObject?.kind === "route") {
            importantNodeIds.add(endObject.id);
        }
    });

    if (selectedObject) {
        importantNodeIds.add(selectedObject.id);
    }
    if (aisleStart?.nodeId) {
        importantNodeIds.add(aisleStart.nodeId);
    }
    if (selectedAisle) {
        importantAisleIds.add(selectedAisle.id);
    }
    const facilityGroups = [...new Set(
        objects.map((object) => object.facilityGroupId).filter(Boolean),
    )].map((groupId) => {
        const members = objects.filter((object) => object.facilityGroupId === groupId);
        return {
            id: groupId,
            kind: members[0]?.kind,
            members,
            bounds: facilityGroupBounds(members),
        };
    }).filter((group) => group.bounds);
    const facilityGroupOrder = { inbound: 0, outbound: 1, charging: 2 };
    const configurableFacilityGroups = facilityGroups
        .filter((group) => FACILITY_GROUP_KINDS.has(group.kind))
        .sort((left, right) =>
            (facilityGroupOrder[left.kind] ?? 99) - (facilityGroupOrder[right.kind] ?? 99),
        );
    const facilityDisplayIndexById = new Map();
    configurableFacilityGroups.forEach((group) => {
        orderedFacilityMembers(
            group.members,
            group.members[0]?.facilityOrientation,
        ).forEach((member, index) => {
            facilityDisplayIndexById.set(member.id, index + 1);
        });
    });
    const requiredFacilityKinds = [
        ["rack", "3층 선반"],
        ["inbound", "입고 설비"],
        ["outbound", "출고 설비"],
        ["charging", "충전 설비"],
    ];
    const missingFacilityLabels = requiredFacilityKinds
        .filter(([kind]) => !objects.some((object) => object.kind === kind))
        .map(([, label]) => label);
    const facilitiesReady = dimensionsReady && missingFacilityLabels.length === 0;
    const routeNodeReady = objects.some((object) =>
        object.kind === "route" && !isRackAccessObject(object),
    );
    const connectionErrors = compiled.validation.errors.filter((error) =>
        error.includes("엣지") || error.includes("연결") || error.includes("분리된 노드"),
    );
    const placementErrors = compiled.validation.errors.filter((error) =>
        error.includes("경계") || error.includes("겹칩니다"),
    );
    const routeReady = routeNodeReady && aisles.length > 0 && connectionErrors.length === 0;
    const placementReady = facilitiesReady && routeReady && placementErrors.length === 0;
    const validationSteps = [
        {
            id: "facilities",
            label: "필수 시설 배치",
            complete: facilitiesReady,
            description: !dimensionsReady
                ? "먼저 창고 가로·세로 크기를 입력하세요."
                : missingFacilityLabels.length > 0
                    ? `${missingFacilityLabels.join("·")}를 1개 이상 배치하세요.`
                    : "선반과 입고·출고·충전 설비가 준비되었습니다.",
        },
        {
            id: "routes",
            label: "노드·엣지 연결",
            complete: routeReady,
            description: !routeNodeReady
                ? "경로 노드를 배치한 뒤 엣지 연결 도구로 시설과 연결하세요."
                : aisles.length === 0
                    ? "엣지 연결을 누르고 서로 다른 노드 두 개를 차례로 선택하세요."
                    : connectionErrors[0] ?? "모든 시설이 하나의 경로망으로 연결되었습니다.",
        },
        {
            id: "placement",
            label: "배치 검증",
            complete: placementReady,
            description: placementErrors[0] ?? (
                compiled.validation.isValid
                    ? "경계·겹침 검사를 통과했습니다."
                    : "앞 단계의 미완료 항목을 해결하면 자동으로 검증됩니다."
            ),
        },
    ];
    const activeValidationStep = validationSteps.find((step) => !step.complete);

    const updateFacilityGroupCount = (groupId, requestedCount) => {
        const group = facilityGroups.find((candidate) => candidate.id === groupId);
        const members = orderedFacilityMembers(
            group?.members ?? [],
            group?.members?.[0]?.facilityOrientation,
        );
        if (!group || members.length === 0) {
            return;
        }

        const nextCount = Math.max(1, Math.min(30, Number(requestedCount) || 1));
        const currentCount = members.length;
        if (nextCount === currentCount) {
            return;
        }

        pushHistory();
        if (nextCount < currentCount) {
            const removedIds = new Set(
                members.slice(nextCount).map((member) => member.id),
            );
            setObjects((previous) => previous.filter((object) => !removedIds.has(object.id)));
            setAisles((previous) => previous.filter(
                (aisle) => !removedIds.has(aisle.startNodeId) &&
                    !removedIds.has(aisle.endNodeId),
            ));
            if (selected?.type === "object" && removedIds.has(selected.id)) {
                setSelected({ type: "object", id: members[0].id });
            }
            return;
        }

        const anchor = members[0];
        const orientation = anchor.facilityOrientation ?? "VERTICAL";
        const step = Number(anchor.facilityStep) ||
            (existingMapMode ? 0.5 : Math.max(anchor.width, anchor.height) + 0.3);
        const additions = [];
        const workingObjects = [...objects];

        for (let index = currentCount; index < nextCount; index += 1) {
            const point = {
                x: anchor.x + (orientation === "HORIZONTAL" ? step * index : 0),
                y: anchor.y + (orientation === "VERTICAL" ? step * index : 0),
            };
            const created = createLayoutObject(anchor.kind, point, workingObjects);
            const rawIdentity = anchor.rawNode
                ? nextRawFacilityIdentity(anchor.kind, workingObjects, anchor.rawNode)
                : null;
            const nextMember = {
                ...created,
                ...(existingMapMode ? COMPACT_OBJECT_SIZES[anchor.kind] : {}),
                id: rawIdentity?.id ?? created.id,
                facilityGroupId: groupId,
                facilityIndex: index,
                facilityOrientation: orientation,
                facilityStep: step,
                facilityEndpoint: Boolean(anchor.facilityEndpoint),
                ...(anchor.rawNode ? {
                    rawNode: {
                        ...anchor.rawNode,
                        id: rawIdentity.id,
                        label: rawIdentity.label,
                        resource_id: rawIdentity.id,
                        ...(anchor.kind === "inbound"
                            ? { handoff_id: rawIdentity.id }
                            : anchor.kind === "outbound"
                                ? { station_id: rawIdentity.id }
                                : {}),
                    },
                } : {}),
            };
            additions.push(nextMember);
            workingObjects.push(nextMember);
        }

        setObjects((previous) => [...previous, ...additions]);
    };

    const updateFacilityGroupOrientation = (groupId, orientation) => {
        const group = facilityGroups.find((candidate) => candidate.id === groupId);
        const members = orderedFacilityMembers(
            group?.members ?? [],
            group?.members?.[0]?.facilityOrientation,
        );
        const currentOrientation = members[0]?.facilityOrientation ?? "VERTICAL";
        if (!group || members.length === 0 || orientation === currentOrientation) {
            return;
        }

        const anchor = members[0];
        const step = Math.max(
            Number(anchor.facilityStep) ||
                (existingMapMode ? 0.5 : Math.max(anchor.width, anchor.height) + 0.3),
            minimumFacilityStep(members, orientation, existingMapMode),
        );
        pushHistory();
        setObjects((previous) => previous.map((object) => {
            if (object.facilityGroupId !== groupId) {
                return object;
            }
            const index = Number(object.facilityIndex ?? 0);
            return {
                ...object,
                x: anchor.x + (orientation === "HORIZONTAL" ? step * index : 0),
                y: anchor.y + (orientation === "VERTICAL" ? step * index : 0),
                facilityOrientation: orientation,
                facilityStep: step,
            };
        }));
    };

    const updateFacilityGroupStep = (groupId, requestedStep) => {
        const group = facilityGroups.find((candidate) => candidate.id === groupId);
        const members = orderedFacilityMembers(
            group?.members ?? [],
            group?.members?.[0]?.facilityOrientation,
        );
        if (!group || members.length === 0) {
            return;
        }

        const orientation = members[0].facilityOrientation ?? "VERTICAL";
        const numericStep = Number(requestedStep);
        if (!Number.isFinite(numericStep)) {
            return;
        }

        const nextStep = Math.max(
            minimumFacilityStep(members, orientation, existingMapMode),
            Math.min(10, numericStep),
        );
        const anchor = members[0];
        pushHistory();
        setObjects((previous) => previous.map((object) => {
            if (object.facilityGroupId !== groupId) {
                return object;
            }
            const index = facilityDisplayIndexById.get(object.id) - 1;
            return {
                ...object,
                x: anchor.x + (orientation === "HORIZONTAL" ? nextStep * index : 0),
                y: anchor.y + (orientation === "VERTICAL" ? nextStep * index : 0),
                facilityIndex: index,
                facilityStep: nextStep,
            };
        }));
    };

    return (
        <div
            className={`layout-editor ${paletteDragging?.moved ? "palette-dragging" : ""}`}
            onKeyDown={handleKeyDown}
            onPointerMove={trackPaletteDrag}
            onPointerUp={finishPaletteDrag}
            onPointerCancel={() => setPaletteDragging(null)}
            tabIndex={0}
        >
            <div className="layout-editor-toolbar">
                <div className="layout-editor-toolset">
                    <button
                        type="button"
                        className={activeTool === "SELECT" ? "active" : ""}
                        onClick={() => handleToolSelect("SELECT")}
                    >
                        <span>↖</span>
                        선택·이동
                    </button>
                    <button type="button" disabled={history.length === 0} onClick={undo}>
                        <span>↶</span>
                        실행 취소
                    </button>
                    <button
                        type="button"
                        className={activeTool === "DELETE" ? "active" : ""}
                        onClick={() => handleToolSelect(
                            activeTool === "DELETE" ? "SELECT" : "DELETE",
                        )}
                    >
                        <span>×</span>
                        3초 눌러 삭제
                    </button>
                    <button type="button" onClick={clearLayout}>
                        전체 지우기
                    </button>
                    <button type="button" disabled={!viewport} onClick={() => setViewport(null)}>
                        화면 맞춤
                    </button>
                </div>

                <label
                    className="layout-editor-layer-toggle"
                    title="외곽 기준 노드와 입고·출고·충전 설비 연결 엣지 등 지도 식별에 필요한 주요 ID만 표시합니다. 선택한 항목의 ID는 항상 포함됩니다."
                >
                    <input
                        type="checkbox"
                        checked={showGraph}
                        onChange={(event) => setShowGraph(event.target.checked)}
                    />
                    {existingMapMode ? "주요 노드·엣지 ID 표시" : "생성 노드·엣지 표시"}
                </label>
            </div>

            <div className="layout-editor-workspace">
                <section className="layout-editor-canvas-panel">
                    {!dimensionsReady ? (
                        <div className="layout-editor-empty">
                            창고 가로·세로 크기를 입력하면 설계 영역이 열립니다.
                        </div>
                    ) : (
                        <div
                            className={`layout-editor-canvas ${activeTool === "AISLE" ? "drawing-aisle" : ""} ${activeTool === "DELETE" ? "deleting" : ""} ${panning ? "panning" : ""}`}
                        >
                            <svg
                                ref={svgRef}
                                viewBox={`${activeViewport.x} ${activeViewport.y} ${activeViewport.width} ${activeViewport.height}`}
                                preserveAspectRatio="xMidYMid meet"
                                onClick={handleCanvasClick}
                                onPointerDown={beginCanvasPan}
                                onPointerMove={handlePointerMove}
                                onPointerUp={finishObjectDrag}
                                onPointerCancel={finishObjectDrag}
                                role="application"
                                aria-label="창고 지도 설계 캔버스"
                            >
                                <defs>
                                    <pattern
                                        id="warehouse-editor-minor-grid"
                                        width={editorGridSize}
                                        height={editorGridSize}
                                        patternUnits="userSpaceOnUse"
                                    >
                                        <path
                                            d={`M ${editorGridSize} 0 L 0 0 0 ${editorGridSize}`}
                                            fill="none"
                                            stroke={existingMapMode ? "#f5f7fa" : "#e2e8f0"}
                                            strokeWidth={existingMapMode ? "0.004" : "0.05"}
                                        />
                                    </pattern>
                                    <pattern
                                        id="warehouse-editor-major-grid"
                                        width={visualGridSize}
                                        height={visualGridSize}
                                        patternUnits="userSpaceOnUse"
                                    >
                                        <path
                                            d={`M ${visualGridSize} 0 L 0 0 0 ${visualGridSize}`}
                                            fill="none"
                                            stroke={existingMapMode ? "#e5eaf0" : "#e2e8f0"}
                                            strokeWidth={existingMapMode ? "0.012" : "0.05"}
                                        />
                                    </pattern>
                                </defs>

                                <rect
                                    x="0"
                                    y="0"
                                    width={numericWidth}
                                    height={numericHeight}
                                    fill="url(#warehouse-editor-minor-grid)"
                                    stroke="#0f172a"
                                    strokeWidth="0.15"
                                />
                                {existingMapMode && (
                                    <rect
                                        x="0"
                                        y="0"
                                        width={numericWidth}
                                        height={numericHeight}
                                        fill="url(#warehouse-editor-major-grid)"
                                        pointerEvents="none"
                                    />
                                )}

                                <g className="layout-editor-facility-groups" aria-label="반복 설비 그룹">
                                    {facilityGroups.map((group) => {
                                        const padding = existingMapMode ? 0.12 : 0.4;
                                        const selectedGroup = group.id === selectedFacilityGroupId;
                                        return (
                                            <g key={group.id} className={selectedGroup ? "selected" : ""}>
                                                <rect
                                                    x={group.bounds.left - padding}
                                                    y={group.bounds.top - padding}
                                                    width={group.bounds.right - group.bounds.left + padding * 2}
                                                    height={group.bounds.bottom - group.bounds.top + padding * 2}
                                                    rx={existingMapMode ? 0.08 : 0.25}
                                                />
                                                <text
                                                    x={(group.bounds.left + group.bounds.right) / 2}
                                                    y={group.bounds.top - padding - (existingMapMode ? 0.08 : 0.22)}
                                                >
                                                    {facilityGroupLabel(group.kind)} · {group.members.length}개
                                                </text>
                                            </g>
                                        );
                                    })}
                                </g>

                                <g className={`layout-editor-raw-aisles ${existingMapMode ? "compact" : ""}`}>
                                    {aisles.map((aisle) => {
                                        const startObject = objectById.get(aisle.startNodeId);
                                        const endObject = objectById.get(aisle.endNodeId);
                                        if (existingMapMode && !showGraph &&
                                            (isInternalAccessObject(startObject) || isInternalAccessObject(endObject))) {
                                            return null;
                                        }
                                        const startPoint = getLayoutConnectionPoint(
                                            startObject,
                                        );
                                        const endPoint = getLayoutConnectionPoint(
                                            endObject,
                                        );

                                        if (!startPoint || !endPoint) {
                                            return null;
                                        }

                                        const selectAisle = (event) => {
                                            event.stopPropagation();
                                            if (activeTool === "DELETE") {
                                                return;
                                            }
                                            setSelected({ type: "aisle", id: aisle.id });
                                            setActiveTool("SELECT");
                                            setAisleStart(null);
                                            setEdgeMessage("");
                                        };
                                        const deleting = deleteHold?.type === "aisle" &&
                                            deleteHold.id === aisle.id;
                                        const className = `${aisleVisualClass(aisle)} ${selectedAisle?.id === aisle.id ? "selected" : ""} ${deleting ? "delete-pending" : ""}`;
                                        const beginAisleDelete = (event) => beginDeleteHold(
                                            event,
                                            { type: "aisle", id: aisle.id },
                                        );

                                        return (
                                            <g key={aisle.id}>
                                                <line
                                                    x1={startPoint.x}
                                                    y1={startPoint.y}
                                                    x2={endPoint.x}
                                                    y2={endPoint.y}
                                                    className="aisle-hit-area"
                                                    onPointerDown={beginAisleDelete}
                                                    onClick={selectAisle}
                                                />
                                                <line
                                                    x1={startPoint.x}
                                                    y1={startPoint.y}
                                                    x2={endPoint.x}
                                                    y2={endPoint.y}
                                                    className={className}
                                                    onPointerDown={beginAisleDelete}
                                                    onClick={selectAisle}
                                                >
                                                    <title>
                                                        {aisle.id} / {aisle.startNodeId} → {aisle.endNodeId} / {aisle.direction}
                                                    </title>
                                                </line>
                                                {existingMapMode && showGraph && importantAisleIds.has(aisle.id) && (
                                                    <text
                                                        className="layout-editor-edge-id"
                                                        x={(startPoint.x + endPoint.x) / 2}
                                                        y={(startPoint.y + endPoint.y) / 2}
                                                    >
                                                        {aisle.id}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}
                                </g>

                                {!existingMapMode && showGraph && (
                                    <g className="layout-editor-generated-graph">
                                        {visibleEdges.map((edge) => {
                                            const source = nodeById.get(edge.source);
                                            const target = nodeById.get(edge.target);

                                            if (!source || !target || source.type === "rack_storage" || target.type === "rack_storage") {
                                                return null;
                                            }

                                            return (
                                                <line
                                                    key={`${edge.source}-${edge.target}`}
                                                    x1={source.x}
                                                    y1={source.y}
                                                    x2={target.x}
                                                    y2={target.y}
                                                    className={edge.service_only ? "service-edge" : "route-edge"}
                                                />
                                            );
                                        })}
                                        {compiled.map.nodes
                                            .filter((node) => node.type === "route")
                                            .map((node) => (
                                                <circle key={node.id} cx={node.x} cy={node.y} r="0.18">
                                                    <title>{node.id}</title>
                                                </circle>
                                            ))}
                                    </g>
                                )}

                                <g className="layout-editor-objects">
                                    {orderedRenderObjects.map((object) => {
                                        if (object.kind === "route") {
                                            const showRouteLabel = existingMapMode
                                                ? showGraph && importantNodeIds.has(object.id)
                                                : !object.rawNode || showGraph;
                                            const deleting = deleteHold?.type === "object" &&
                                                deleteHold.id === object.id;
                                            return (
                                                <g
                                                    key={object.id}
                                                    data-node-id={object.id}
                                                    className={`layout-editor-object route-object raw-${object.rawNode?.type ?? "new"} ${existingMapMode ? "compact-object" : ""} ${selectedObject?.id === object.id ? "selected" : ""} ${activeTool === "AISLE" ? "edge-selectable" : ""} ${aisleStart?.nodeId === object.id ? "edge-start" : ""} ${deleting ? "delete-pending" : ""}`}
                                                    onPointerDown={(event) => beginObjectDrag(event, object)}
                                                    onClick={(event) => handleConnectionNodeClick(event, object)}
                                                >
                                                    {existingMapMode && (
                                                        <circle className="node-hit-target" cx={object.x} cy={object.y} r="0.12" />
                                                    )}
                                                    <circle cx={object.x} cy={object.y} r={existingMapMode || object.rawNode ? "0.07" : "0.36"} />
                                                    {showRouteLabel && (
                                                        <text
                                                            className={existingMapMode ? "compact-node-id" : ""}
                                                            x={object.x}
                                                            y={object.y - (existingMapMode ? 0.16 : 0.55)}
                                                        >
                                                            {object.id}
                                                        </text>
                                                    )}
                                                    <title>{object.id} / {object.rawNode?.type ?? "route"}</title>
                                                </g>
                                            );
                                        }

                                        const dimensions = objectDimensions(object);
                                        const connectionPoint = getLayoutConnectionPoint(object);
                                        const rawType = object.rawNode?.type;
                                        const rawAccess = rawType?.includes("access") && !object.facilityEndpoint;
                                        const rawLogical = rawType === "inbound" || rawType === "outbound";
                                        const chargingStation = object.kind === "charging";
                                        const rawLabel = object.rawNode?.label ?? object.id.replace(/^[IO]_/, "");
                                        const facilityTag = object.facilityGroupId
                                            ? facilityDisplayIndexById.get(object.id) ?? Number(object.facilityIndex ?? 0) + 1
                                            : rawLabel;
                                        const showPrimaryLabel = object.kind !== "rack" ||
                                            !existingMapMode || showGraph;
                                        const deleting = deleteHold?.type === "object" &&
                                            deleteHold.id === object.id;
                                        return (
                                            <g
                                                key={object.id}
                                                data-node-id={object.id}
                                                className={`layout-editor-object kind-${object.kind} raw-${rawType ?? "new"} ${existingMapMode ? "compact-object" : ""} ${selectedObject?.id === object.id || (object.facilityGroupId && object.facilityGroupId === selectedFacilityGroupId) ? "selected" : ""} ${activeTool === "AISLE" ? "edge-selectable" : ""} ${aisleStart?.nodeId === object.id ? "edge-start" : ""} ${deleting ? "delete-pending" : ""}`}
                                                onPointerDown={(event) => beginObjectDrag(event, object)}
                                                onClick={(event) => handleConnectionNodeClick(event, object)}
                                            >
                                                {existingMapMode && !rawLogical && object.kind !== "rack" && (
                                                    <circle className="node-hit-target" cx={object.x} cy={object.y} r="0.12" />
                                                )}
                                                {rawAccess ? (
                                                    <circle cx={object.x} cy={object.y} r={existingMapMode ? "0.075" : "0.11"} />
                                                ) : chargingStation ? (
                                                    <>
                                                        <polygon points={`${object.x},${object.y - 0.2} ${object.x - 0.18},${object.y + 0.16} ${object.x + 0.18},${object.y + 0.16}`} />
                                                        <text className="charging-symbol" x={object.x} y={object.y + 0.08}>{facilityTag}</text>
                                                    </>
                                                ) : (
                                                    <rect
                                                        x={object.x - dimensions.width / 2}
                                                        y={object.y - dimensions.height / 2}
                                                        width={dimensions.width}
                                                        height={dimensions.height}
                                                        rx={object.kind === "rack" ? 0.04 : 0.08}
                                                    />
                                                )}
                                                {object.kind === "rack" && (
                                                    <>
                                                        <line
                                                            x1={object.x - dimensions.width / 2}
                                                            y1={object.y - dimensions.height / 6}
                                                            x2={object.x + dimensions.width / 2}
                                                            y2={object.y - dimensions.height / 6}
                                                        />
                                                        <line
                                                            x1={object.x - dimensions.width / 2}
                                                            y1={object.y + dimensions.height / 6}
                                                            x2={object.x + dimensions.width / 2}
                                                            y2={object.y + dimensions.height / 6}
                                                        />
                                                        <circle
                                                            className="rack-center-node"
                                                            cx={object.x}
                                                            cy={object.y}
                                                            r={existingMapMode ? "0.045" : "0.16"}
                                                        >
                                                            <title>{object.id} 연결 노드</title>
                                                        </circle>
                                                    </>
                                                )}
                                                {!rawAccess && !chargingStation && showPrimaryLabel && (
                                                    <text
                                                        className={object.rawNode && existingMapMode ? "raw-object-label" : ""}
                                                        x={object.x}
                                                        y={object.facilityGroupId ? object.y : object.y + (rawLogical ? 0.03 : 0.15)}
                                                    >
                                                        {object.facilityGroupId ? facilityTag : object.id}
                                                    </text>
                                                )}
                                                {existingMapMode && showGraph && rawAccess && importantNodeIds.has(object.id) && (
                                                    <text className="compact-node-id" x={object.x} y={object.y - 0.16}>
                                                        {object.id}
                                                    </text>
                                                )}
                                                {!object.rawNode && !chargingStation && (
                                                    <>
                                                        <line
                                                            className="layout-editor-connection-stem"
                                                            x1={object.x}
                                                            y1={object.y}
                                                            x2={connectionPoint.x}
                                                            y2={connectionPoint.y}
                                                        />
                                                        <circle
                                                            className="layout-editor-connection-handle"
                                                            cx={connectionPoint.x}
                                                            cy={connectionPoint.y}
                                                            r={existingMapMode ? "0.12" : "0.34"}
                                                        >
                                                            <title>{object.id} 연결 노드</title>
                                                        </circle>
                                                    </>
                                                )}
                                                <title>{object.id} / {rawType ?? object.kind}</title>
                                            </g>
                                        );
                                    })}
                                </g>

                                {aisleStartPoint && (
                                    <g className={`layout-editor-aisle-start ${existingMapMode ? "compact" : ""}`}>
                                        <circle
                                            cx={aisleStartPoint.x}
                                            cy={aisleStartPoint.y}
                                            r={existingMapMode ? "0.13" : "0.5"}
                                        />
                                        {!existingMapMode && (
                                            <text x={aisleStartPoint.x} y={aisleStartPoint.y - 0.7}>두 번째 노드를 선택하세요</text>
                                        )}
                                    </g>
                                )}
                            </svg>
                        </div>
                    )}

                    <div className="layout-editor-statusbar">
                        <span>{numericWidth || 0}m × {numericHeight || 0}m</span>
                        <span>이동 단위 {editorGridSize}m</span>
                        <span>선반 {compiled.stats.rackCount}개 / 보관 칸 {compiled.stats.storageSlotCount}개</span>
                        <span>노드 {compiled.map.nodes.length}개 / 연결 {compiled.stats.connectionCount}개 / 방향 엣지 {compiled.stats.edgeCount}개</span>
                        <span className="layout-editor-navigation-hint">
                            휠 이동 · Shift+휠 가로 이동 · Ctrl+휠 확대·축소 · 휠 버튼 드래그 이동
                        </span>
                        {activeTool === "AISLE" && (
                            <span className="layout-editor-tool-message">{edgeMessage || "연결할 첫 번째 노드를 선택하세요."}</span>
                        )}
                        {activeTool === "route" && (
                            <span className="layout-editor-tool-message">경로 노드 연속 배치 중 · Esc 키로 종료</span>
                        )}
                    </div>
                </section>

                <aside className="layout-editor-palette">
                    {PALETTE_GROUPS.map((group) => (
                        <section key={group.title}>
                            <h4>{group.title}</h4>
                            <div className="layout-editor-palette-grid">
                                {group.tools.map((tool) => (
                                    <button
                                        key={tool}
                                        type="button"
                                        className={activeTool === tool ? "active" : ""}
                                        onPointerDown={(event) => beginPaletteDrag(event, tool)}
                                        onClick={() => handleToolSelect(tool)}
                                        title={TOOL_META[tool].description}
                                    >
                                        <span>{TOOL_META[tool].symbol}</span>
                                        <strong>{TOOL_META[tool].label}</strong>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}

                    <section className="layout-editor-facility-settings">
                        <h4>설비 설정</h4>
                        {configurableFacilityGroups.length === 0 ? (
                            <p>입고지·출고지·충전소를 배치하면 개수와 방향을 설정할 수 있습니다.</p>
                        ) : configurableFacilityGroups.map((group) => {
                            const members = orderedFacilityMembers(
                                group.members,
                                group.members[0]?.facilityOrientation,
                            );
                            const orientation = members[0]?.facilityOrientation ?? "VERTICAL";
                            const label = facilityGroupLabel(group.kind);
                            const step = Number(members[0]?.facilityStep) ||
                                minimumFacilityStep(members, orientation, existingMapMode);
                            const minimumStep = minimumFacilityStep(
                                members,
                                orientation,
                                existingMapMode,
                            );
                            return (
                                <div className={`layout-editor-facility-card kind-${group.kind}`} key={group.id}>
                                    <div className="layout-editor-facility-card-title">
                                        <strong>{label}</strong>
                                        <span>{members.length}개</span>
                                    </div>
                                    <div className="layout-editor-facility-card-controls">
                                        <label>
                                            <span>개수</span>
                                            <input
                                                type="number"
                                                min="1"
                                                max="30"
                                                aria-label={`${label} 개수`}
                                                value={members.length}
                                                onChange={(event) => updateFacilityGroupCount(group.id, event.target.value)}
                                            />
                                        </label>
                                        <label>
                                            <span>간격(m)</span>
                                            <input
                                                type="number"
                                                min={minimumStep}
                                                max="10"
                                                step="0.01"
                                                aria-label={`${label} 간격`}
                                                value={Number(step.toFixed(2))}
                                                onChange={(event) => updateFacilityGroupStep(group.id, event.target.value)}
                                            />
                                        </label>
                                        <div className="layout-editor-orientation-buttons">
                                            <button
                                                type="button"
                                                aria-label={`${label} 가로 배치`}
                                                className={orientation === "HORIZONTAL" ? "active" : ""}
                                                onClick={() => updateFacilityGroupOrientation(group.id, "HORIZONTAL")}
                                            >
                                                가로
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`${label} 세로 배치`}
                                                className={orientation === "VERTICAL" ? "active" : ""}
                                                onClick={() => updateFacilityGroupOrientation(group.id, "VERTICAL")}
                                            >
                                                세로
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </section>

                    {(selectedObject || selectedAisle) && (
                        <section className="layout-editor-inspector">
                            <h4>선택 항목</h4>
                            {selectedObject && (
                                <>
                                    <strong>{selectedObject.id}</strong>
                                    <span>{selectedObject.rawNode?.type ?? TOOL_META[selectedObject.kind]?.label}</span>
                                    <span>X {selectedObject.x}m · Y {selectedObject.y}m</span>
                                    {selectedObject.kind === "rack" && (
                                        <button type="button" onClick={rotateSelectedRack}>
                                            선반 90° 회전
                                        </button>
                                    )}
                                </>
                            )}
                            {selectedAisle && (
                                <>
                                    <strong>{selectedAisle.id}</strong>
                                    <span>{selectedAisle.startNodeId} ↔ {selectedAisle.endNodeId}</span>
                                    <label>
                                        통행 방향
                                        <select
                                            value={selectedAisle.direction}
                                            onChange={(event) => updateSelectedAisleDirection(event.target.value)}
                                        >
                                            <option value="BOTH">양방향</option>
                                            <option value="FORWARD">시작 → 끝</option>
                                            <option value="REVERSE">끝 → 시작</option>
                                        </select>
                                    </label>
                                </>
                            )}
                        </section>
                    )}
                </aside>
            </div>

            <div className={`layout-editor-validation ${compiled.validation.isValid ? "valid" : "invalid"}`}>
                <div className="layout-editor-validation-summary">
                    <span className="layout-editor-validation-badge">
                        {compiled.validation.isValid ? "완료" : "진행 중"}
                    </span>
                    <div>
                        <strong>
                            {compiled.validation.isValid
                                ? "지도 준비 완료"
                                : `다음 작업: ${activeValidationStep?.label ?? "수정 항목 확인"}`}
                        </strong>
                        <span>
                            {compiled.validation.isValid
                                ? "이제 저장 버튼을 눌러 변경한 지도를 반영할 수 있습니다."
                                : activeValidationStep?.description ?? `${compiled.validation.errors.length}개의 수정 항목이 있습니다.`}
                        </span>
                    </div>
                </div>
                <ol className="layout-editor-validation-steps" aria-label="지도 완성 단계">
                    {validationSteps.map((step, index) => {
                        const current = step.id === activeValidationStep?.id;
                        return (
                            <li
                                className={`${step.complete ? "complete" : "pending"} ${current ? "current" : ""}`}
                                key={step.id}
                            >
                                <span>{step.complete ? "✓" : index + 1}</span>
                                <strong>{step.label}</strong>
                            </li>
                        );
                    })}
                </ol>
                {(compiled.validation.errors.length > 0 || compiled.validation.warnings.length > 0) && (
                    <ul className="layout-editor-validation-issues">
                        {compiled.validation.errors.map((error) => (
                            <li key={error}>
                                <strong>수정</strong>
                                <span>{error}</span>
                            </li>
                        ))}
                        {compiled.validation.warnings.map((warning) => (
                            <li className="warning" key={warning}>
                                <strong>참고</strong>
                                <span>{warning}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default WarehouseLayoutEditor;
