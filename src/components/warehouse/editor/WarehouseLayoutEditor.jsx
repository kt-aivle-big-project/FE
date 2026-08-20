import { useEffect, useMemo, useRef, useState } from "react";
import {
    LAYOUT_OBJECT_DEFINITIONS,
    compileWarehouseLayout,
    createExplicitAisle,
    createLayoutObject,
    getLayoutConnectionPoint,
    snapLayoutPoint,
} from "../../../utils/warehouseLayoutBuilder";
import "../../../styles/warehouse/WarehouseLayoutEditor.css";

import WarehouseEditorCanvas from "./WarehouseEditorCanvas";
import WarehouseEditorSidebar from "./WarehouseEditorSidebar";
import {
    COMPACT_OBJECT_SIZES,
    DEFAULT_LAYOUT_TITLE,
    DELETE_GUIDE_MESSAGE,
    DELETE_HOLD_MS,
    EXISTING_MAP_GRID_SIZE,
    EXISTING_MAP_MAJOR_GRID_SIZE,
    FACILITY_GROUP_KINDS,
    FACILITY_GROUP_ORDER,
    GRID_SIZE,
    MAX_FACILITY_COUNT,
    MAX_FACILITY_STEP,
    MAX_HISTORY,
    MIN_FACILITY_COUNT,
    MIN_VIEWPORT_RATIO,
    PALETTE_DRAG_THRESHOLD_PX,
    SAFE_DELETE_GUIDE_MESSAGE,
    ZOOM_IN_FACTOR,
    ZOOM_OUT_FACTOR,
} from "./warehouseEditorConfig";
import {
    calculateContentViewport,
    clamp,
    createFacilityGroups,
    createImportantGraphIds,
    createValidationState,
    defaultFacilityStep,
    initialAislesFromDraft,
    initialObjectsFromDraft,
    isEditableKeyboardTarget,
    isInternalAccessObject,
    isPointInsideRect,
    isRackAccessObject,
    minimumFacilityStep,
    nextAisleId,
    nextRawFacilityIdentity,
    objectRenderPriority,
    orderedFacilityMembers,
    snapshotOf,
    toolGuideMessage,
    uniqueVisibleEdges,
} from "./warehouseEditorUtils";

// ============================================================
// WarehouseLayoutEditor
// ============================================================

/**
 * 창고 레이아웃의 편집 상태와 사용자 입력을 관리한다.
 * 저장용 지도와 재편집용 초안을 부모 컴포넌트에 전달하고,
 * 캔버스와 설정 패널 렌더링은 하위 컴포넌트에 위임한다.
 *
 * @param {Object} props
 * @param {number|string} props.width 창고 전체 너비
 * @param {number|string} props.height 창고 전체 높이
 * @param {string} props.title 저장할 지도 제목
 * @param {Function} props.onChange 저장용 지도 구조 변경 콜백
 * @param {Object|null} props.initialDraft 이전 편집 초안
 * @param {Function} props.onDraftChange 재편집용 초안 변경 콜백
 * @param {boolean} props.existingMapMode 기존 지도 편집 모드 여부
 */
function WarehouseLayoutEditor({
    width,
    height,
    title,
    onChange,
    initialDraft = null,
    onDraftChange,
    existingMapMode = false,
}) {
    // ============================================================
    // 1. 편집 상태와 외부 동기화
    // ============================================================

    const svgRef = useRef(null);
    const canvasWheelHandlerRef = useRef(null);
    const deleteTimerRef = useRef(null);

    const [objects, setObjects] = useState(() => initialObjectsFromDraft(initialDraft));

    const [aisles, setAisles] = useState(() => initialAislesFromDraft(initialDraft));

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

    // 기존 지도는 실제 객체 범위를 기본 viewport로 사용한다.
    const contentViewport = useMemo(
        () => calculateContentViewport(objects, existingMapMode),
        [existingMapMode, objects],
    );

    const activeViewport = viewport ?? contentViewport ?? {
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
            title: title || DEFAULT_LAYOUT_TITLE,
        }),
        [aisles, numericHeight, numericWidth, objects, title],
    );

    useEffect(() => {
        onChange(compiled);
    }, [compiled, onChange]);

    useEffect(() => {
        onDraftChange?.(snapshotOf(objects, aisles));
    }, [aisles, objects, onDraftChange]);

    // ============================================================
    // 2. 공통 상태 변경
    // ============================================================

    const pushHistory = () => {
        setHistory((previous) => [
            ...previous.slice(-(MAX_HISTORY - 1)),
            snapshotOf(objects, aisles),
        ]);
    };

    const clearSelectionState = () => {
        setSelected(null);
        setAisleStart(null);
    };

    // ============================================================
    // 3. 좌표 변환과 viewport 이벤트
    // ============================================================

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
            x: clamp(transformed.x, 0, numericWidth),
            y: clamp(transformed.y, 0, numericHeight),
        };
    };

    const clampViewport = (nextViewport) => ({
        ...nextViewport,
        x: clamp(nextViewport.x, 0, numericWidth - nextViewport.width),
        y: clamp(nextViewport.y, 0, numericHeight - nextViewport.height),
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
        const zoomFactor = event.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
        const nextWidth = Math.max(
            numericWidth * MIN_VIEWPORT_RATIO,
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

    // 브라우저 기본 스크롤을 막기 위해 passive: false인 네이티브 wheel 이벤트를 등록한다.
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

    // ============================================================
    // 4. 객체·엣지 편집과 포인터 이벤트
    // ============================================================

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

        // 선반은 저장 위치 노드로도 사용되므로 컴파일에 필요한 rack_storage 원본 정보를 함께 구성한다.
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
        clearSelectionState();
        setEdgeMessage(toolGuideMessage(tool));
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
            setEdgeMessage(DELETE_GUIDE_MESSAGE);
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
        clearSelectionState();
        setEdgeMessage(`${target.id}을(를) 삭제했습니다.`);
    };

    const removeAisleById = (aisleId) => {
        if (!aisles.some((aisle) => aisle.id === aisleId)) {
            return;
        }
        pushHistory();
        setAisles((previous) => previous.filter((aisle) => aisle.id !== aisleId));
        clearSelectionState();
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
        ) >= PALETTE_DRAG_THRESHOLD_PX) {
            setPaletteDragging((current) => current ? { ...current, moved: true } : null);
        }
    };

    const finishPaletteDrag = (event) => {
        if (!paletteDragging) {
            return;
        }

        const svg = svgRef.current;
        const rect = svg?.getBoundingClientRect();
        const droppedOnCanvas = paletteDragging.moved && dimensionsReady &&
            isPointInsideRect(event.clientX, event.clientY, rect);

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
        clearSelectionState();
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
        clearSelectionState();
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

    // ============================================================
    // 5. 키보드 단축키
    // ============================================================

    const handleKeyDown = (event) => {
        if (event.key === "Escape") {
            cancelDeleteHold();
            setActiveTool("SELECT");
            clearSelectionState();
            setEdgeMessage("");
            return;
        }

        if (isEditableKeyboardTarget(event.target)) {
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
            setEdgeMessage(SAFE_DELETE_GUIDE_MESSAGE);
        }
    };

    // ============================================================
    // 6. 화면 렌더링용 파생 데이터
    // ============================================================

    const { selectedObject, selectedAisle } = useMemo(
        () => ({
            selectedObject: selected?.type === "object"
                ? objects.find((object) => object.id === selected.id) ?? null
                : null,
            selectedAisle: selected?.type === "aisle"
                ? aisles.find((aisle) => aisle.id === selected.id) ?? null
                : null,
        }),
        [aisles, objects, selected],
    );
    const selectedFacilityGroupId = selectedObject?.facilityGroupId;

    const objectById = useMemo(
        () => new Map(objects.map((object) => [object.id, object])),
        [objects],
    );
    const nodeById = useMemo(
        () => new Map(compiled.map.nodes.map((node) => [node.id, node])),
        [compiled.map.nodes],
    );
    const aisleStartObject = aisleStart ? objectById.get(aisleStart.nodeId) : null;
    const aisleStartPoint = getLayoutConnectionPoint(aisleStartObject);

    const visibleEdges = useMemo(
        () => uniqueVisibleEdges(compiled.map.edges),
        [compiled.map.edges],
    );

    const renderObjects = useMemo(
        () => objects.filter((object) =>
            !isRackAccessObject(object) &&
            !(existingMapMode && !showGraph && isInternalAccessObject(object)),
        ),
        [existingMapMode, objects, showGraph],
    );
    const orderedRenderObjects = useMemo(
        () => existingMapMode
            ? [...renderObjects].sort(
                (left, right) => objectRenderPriority(left) - objectRenderPriority(right),
            )
            : renderObjects,
        [existingMapMode, renderObjects],
    );

    const facilityGroups = useMemo(() => createFacilityGroups(objects), [objects]);
    const facilityGroupById = useMemo(
        () => new Map(facilityGroups.map((group) => [group.id, group])),
        [facilityGroups],
    );
    const configurableFacilityGroups = useMemo(
        () => facilityGroups
            .filter((group) => FACILITY_GROUP_KINDS.has(group.kind))
            .sort((left, right) =>
                (FACILITY_GROUP_ORDER[left.kind] ?? 99) -
                (FACILITY_GROUP_ORDER[right.kind] ?? 99),
            ),
        [facilityGroups],
    );
    const facilityDisplayIndexById = useMemo(() => {
        const displayIndexById = new Map();
        configurableFacilityGroups.forEach((group) => {
            orderedFacilityMembers(
                group.members,
                group.members[0]?.facilityOrientation,
            ).forEach((member, index) => {
                displayIndexById.set(member.id, index + 1);
            });
        });
        return displayIndexById;
    }, [configurableFacilityGroups]);

    const { importantNodeIds, importantAisleIds } = useMemo(
        () => createImportantGraphIds({
            aisles,
            aisleStart,
            objectById,
            renderObjects,
            selectedAisle,
            selectedObject,
        }),
        [
            aisles,
            aisleStart,
            objectById,
            renderObjects,
            selectedAisle,
            selectedObject,
        ],
    );

    const { validationSteps, activeValidationStep } = useMemo(
        () => createValidationState({ aisles, compiled, dimensionsReady, objects }),
        [aisles, compiled, dimensionsReady, objects],
    );

    const getFacilityGroupContext = (groupId) => {
        const group = facilityGroupById.get(groupId);
        const members = orderedFacilityMembers(
            group?.members ?? [],
            group?.members?.[0]?.facilityOrientation,
        );
        return { group, members };
    };

    // ============================================================
    // 7. 반복 설비 그룹 설정
    // ============================================================

    const updateFacilityGroupCount = (groupId, requestedCount) => {
        const { group, members } = getFacilityGroupContext(groupId);
        if (!group || members.length === 0) {
            return;
        }

        const nextCount = clamp(
            Number(requestedCount) || MIN_FACILITY_COUNT,
            MIN_FACILITY_COUNT,
            MAX_FACILITY_COUNT,
        );
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
        const step = defaultFacilityStep(anchor, existingMapMode);
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
                        // 접근 노드 기반 지도에서만 handoff_id 또는 station_id를 유지한다.
                        // 일반 inbound/outbound 노드에 필드를 추가하면 기존 백엔드 계약이 달라진다.
                        ...(anchor.rawNode.type === "inbound_handoff_access"
                            ? { handoff_id: rawIdentity.id }
                            : anchor.rawNode.type === "outbound_station_access"
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
        const { group, members } = getFacilityGroupContext(groupId);
        const currentOrientation = members[0]?.facilityOrientation ?? "VERTICAL";
        if (!group || members.length === 0 || orientation === currentOrientation) {
            return;
        }

        const anchor = members[0];
        const step = Math.max(
            defaultFacilityStep(anchor, existingMapMode),
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
        const { group, members } = getFacilityGroupContext(groupId);
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
            Math.min(MAX_FACILITY_STEP, numericStep),
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

    // ============================================================
    // 8. 단순 UI 이벤트
    // ============================================================

    const handleAisleClick = (event, aisleId) => {
        event.stopPropagation();
        if (activeTool === "DELETE") {
            return;
        }
        setSelected({ type: "aisle", id: aisleId });
        setActiveTool("SELECT");
        setAisleStart(null);
        setEdgeMessage("");
    };

    const handleAislePointerDown = (event, aisleId) => beginDeleteHold(
        event,
        { type: "aisle", id: aisleId },
    );

    const cancelPaletteDrag = () => setPaletteDragging(null);
    const handleGraphVisibilityChange = (event) => setShowGraph(event.target.checked);

    // ============================================================
    // 9. 화면 렌더링
    // ============================================================

    return (
        <div
            className={`layout-editor ${paletteDragging?.moved ? "palette-dragging" : ""}`}
            onKeyDown={handleKeyDown}
            onPointerMove={trackPaletteDrag}
            onPointerUp={finishPaletteDrag}
            onPointerCancel={cancelPaletteDrag}
            tabIndex={0}
        >
            {/* 상단 편집 도구 */}
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
                    <button
                        type="button"
                        disabled={history.length === 0}
                        onClick={undo}
                    >
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
                    <button
                        type="button"
                        disabled={!viewport}
                        onClick={() => setViewport(null)}
                    >
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
                        onChange={handleGraphVisibilityChange}
                    />
                    {existingMapMode ? "주요 노드·엣지 ID 표시" : "생성 노드·엣지 표시"}
                </label>
            </div>

            <div className="layout-editor-workspace">
                <WarehouseEditorCanvas
                    svgRef={svgRef}
                    dimensionsReady={dimensionsReady}
                    numericWidth={numericWidth}
                    numericHeight={numericHeight}
                    editorGridSize={editorGridSize}
                    visualGridSize={visualGridSize}
                    activeViewport={activeViewport}
                    activeTool={activeTool}
                    panning={panning}
                    existingMapMode={existingMapMode}
                    showGraph={showGraph}
                    facilityGroups={facilityGroups}
                    selectedFacilityGroupId={selectedFacilityGroupId}
                    aisles={aisles}
                    objectById={objectById}
                    selectedAisle={selectedAisle}
                    deleteHold={deleteHold}
                    importantAisleIds={importantAisleIds}
                    visibleEdges={visibleEdges}
                    nodeById={nodeById}
                    compiled={compiled}
                    orderedRenderObjects={orderedRenderObjects}
                    importantNodeIds={importantNodeIds}
                    selectedObject={selectedObject}
                    aisleStart={aisleStart}
                    facilityDisplayIndexById={facilityDisplayIndexById}
                    aisleStartPoint={aisleStartPoint}
                    edgeMessage={edgeMessage}
                    onCanvasClick={handleCanvasClick}
                    onCanvasPan={beginCanvasPan}
                    onPointerMove={handlePointerMove}
                    onPointerEnd={finishObjectDrag}
                    onAislePointerDown={handleAislePointerDown}
                    onAisleClick={handleAisleClick}
                    onObjectPointerDown={beginObjectDrag}
                    onConnectionNodeClick={handleConnectionNodeClick}
                />

                <WarehouseEditorSidebar
                    activeTool={activeTool}
                    configurableFacilityGroups={configurableFacilityGroups}
                    selectedObject={selectedObject}
                    selectedAisle={selectedAisle}
                    existingMapMode={existingMapMode}
                    onPalettePointerDown={beginPaletteDrag}
                    onToolSelect={handleToolSelect}
                    onFacilityCountChange={updateFacilityGroupCount}
                    onFacilityStepChange={updateFacilityGroupStep}
                    onFacilityOrientationChange={updateFacilityGroupOrientation}
                    onRotateRack={rotateSelectedRack}
                    onAisleDirectionChange={updateSelectedAisleDirection}
                />
            </div>

            {/* 지도 저장 전 검증 결과 */}
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
                                : activeValidationStep?.description
                                    ?? `${compiled.validation.errors.length}개의 수정 항목이 있습니다.`}
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

                {(compiled.validation.errors.length > 0
                    || compiled.validation.warnings.length > 0) && (
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
