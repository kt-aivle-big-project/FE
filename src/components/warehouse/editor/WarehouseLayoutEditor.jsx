import { useEffect, useMemo, useRef, useState } from "react";
import {
    LAYOUT_OBJECT_DEFINITIONS,
    compileWarehouseLayout,
    createExplicitAisle,
    createLayoutObject,
    getLayoutConnectionPoint,
    snapLayoutPoint,
} from "../../../utils/warehouseLayoutBuilder";
import "../../../styles/WarehouseLayoutEditor.css";

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

    // buffer를 제외한 편집 객체를 초안과 참조가 섞이지 않도록 복사해 관리한다.
    const [objects, setObjects] = useState(() => initialObjectsFromDraft(initialDraft));

    // 양 끝 노드가 있는 엣지만 초안에서 복사해 편집 상태로 관리한다.
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

    // 문자열로 전달될 수 있는 창고 크기를 숫자로 정규화하고 유효성을 확인한다.
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    const dimensionsReady = Number.isFinite(numericWidth) && numericWidth > 0 &&
        Number.isFinite(numericHeight) && numericHeight > 0;
    const editorGridSize = existingMapMode ? EXISTING_MAP_GRID_SIZE : GRID_SIZE;
    const visualGridSize = existingMapMode ? EXISTING_MAP_MAJOR_GRID_SIZE : GRID_SIZE;

    /**
     * 신규 지도는 입력한 창고 크기를 기본 도면 범위로 사용한다.
     * 기존 지도는 저장 좌표와 창고 크기의 단위가 다를 수 있으므로,
     * 실제 객체가 차지하는 범위를 계산해 기본 viewport로 사용한다.
     */
    const contentViewport = useMemo(
        () => calculateContentViewport(objects, existingMapMode),
        [existingMapMode, objects],
    );

    // 사용자 viewport, 기존 지도 콘텐츠 범위, 창고 전체 크기 순으로 화면 범위를 결정한다.
    const activeViewport = viewport ?? contentViewport ?? {
        x: 0,
        y: 0,
        width: numericWidth || 1,
        height: numericHeight || 1,
    };

    // 창고 크기가 바뀌면 이전 확대·이동 범위가 맞지 않을 수 있으므로 화면 맞춤 상태로 되돌린다.
    useEffect(() => {
        setViewport(null);
    }, [numericHeight, numericWidth]);

    // 편집 초안을 저장 가능한 노드·방향 엣지·통계·검증 결과로 컴파일한다.
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

    // 저장에 사용하는 컴파일 결과를 부모 상태와 동기화한다.
    useEffect(() => {
        onChange(compiled);
    }, [compiled, onChange]);

    // 선택·드래그 상태를 제외한 객체와 엣지만 복사해 재편집용 초안으로 전달한다.
    useEffect(() => {
        onDraftChange?.(snapshotOf(objects, aisles));
    }, [aisles, objects, onDraftChange]);

    // ============================================================
    // 2. 공통 상태 변경
    // ============================================================

    // 상태를 변경하기 직전의 현재 지도를 실행 취소 기록에 추가한다.
    // 가장 최근 MAX_HISTORY개만 남겨 무제한으로 메모리가 증가하지 않게 한다.
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

    /**
     * 브라우저 화면 기준 포인터 좌표를 SVG의 창고 좌표로 변환한다.
     * getScreenCTM의 역행렬을 사용하므로 확대·축소나 화면 비율이 달라도 정확한 지도 위치를 얻을 수 있다.
     * 변환된 좌표는 창고 경계를 벗어나지 않도록 0~width, 0~height 범위로 제한한다.
     */
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

    // 확대·이동된 viewport가 창고 경계를 벗어나지 않도록 제한한다.
    const clampViewport = (nextViewport) => ({
        ...nextViewport,
        x: clamp(nextViewport.x, 0, numericWidth - nextViewport.width),
        y: clamp(nextViewport.y, 0, numericHeight - nextViewport.height),
    });

    // 일반 휠은 세로 이동, Shift+휠은 가로 이동, Ctrl+휠은 포인터 중심 확대·축소로 처리한다.
    const handleCanvasWheel = (event) => {
        if (!dimensionsReady) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Ctrl 키가 없으면 휠 이동량을 현재 viewport 좌표계로 환산해 평행 이동한다.
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

        // 확대 전후에도 포인터가 가리키는 지도 지점이 같은 화면 위치에 남도록 비율을 보정한다.
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
    // 네이티브 wheel 리스너가 최신 상태를 사용하도록 현재 핸들러를 ref에 보관한다.
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

    // 컴포넌트가 사라질 때 진행 중인 삭제 타이머를 제거해 언마운트 후 상태 변경을 방지한다.
    useEffect(() => () => {
        if (deleteTimerRef.current) {
            window.clearTimeout(deleteTimerRef.current);
        }
    }, []);

    // ============================================================
    // 4. 객체·엣지 편집과 포인터 이벤트
    // ============================================================

    // 휠 버튼 시작점과 viewport를 저장하고, SVG 밖에서도 패닝이 이어지도록 포인터를 캡처한다.
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

    // 입력 좌표를 그리드에 맞춰 객체를 생성하고 기존 지도 모드에서는 축소된 표시 크기를 적용한다.
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

        // 기존 지도 모드에서만 원본 좌표 비율에 맞는 축소 표시 크기를 덮어쓴다.
        setObjects((previous) => [
            ...previous,
            compactSize ? { ...created, ...compactSize } : created,
        ]);
        setSelected(null);
    };

    // 도구 전환 시 이전 선택 상태를 정리하고 새 도구의 안내 문구를 표시한다.
    const handleToolSelect = (tool) => {
        cancelDeleteHold();
        setActiveTool(tool);
        clearSelectionState();
        setEdgeMessage(toolGuideMessage(tool));
    };

    // 빈 캔버스 클릭을 선택 해제, 도구 안내 또는 객체 배치로 분기한다.
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

    /**
     * 엣지 연결 도구의 두 단계 노드 선택을 처리한다.
     * 첫 번째 노드를 기억한 뒤 자기 연결과 방향만 다른 중복 연결을 막고 새 엣지를 생성한다.
     */
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

        // 화면 편집 단계에서는 방향과 무관하게 동일한 노드 쌍을 하나의 연결로 취급한다.
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

    // 객체와 연결 엣지를 함께 삭제하며, 선반은 같은 rack_id의 보조 rack_access까지 정리한다.
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

    // 길게 누르기 삭제 타이머와 강조 상태를 정리하고 필요하면 취소 안내를 표시한다.
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

    /**
     * 삭제 도구에서 객체나 엣지를 3초 동안 누른 경우에만 삭제한다.
     * 포인터를 먼저 놓으면 타이머를 취소해 실수로 삭제되는 것을 방지한다.
     */
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

    // 팔레트의 포인터 시작 위치를 기록해 클릭 선택과 드래그 배치를 구분한다.
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

    // 지정 거리 미만의 움직임은 손떨림으로 보고 일반 도구 선택으로 유지한다.
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

    // SVG 안에 놓인 경우에만 객체를 생성하며, route 외 시설은 한 번 배치한 뒤 선택 도구로 돌아간다.
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

    /**
     * 배치된 객체의 이동을 시작한다.
     * 설비 그룹에 속한 객체는 그룹 전체의 초기 좌표를 저장하여 구성원 모두를 같은 거리만큼 이동한다.
     * 포인터와 객체 중심의 오프셋을 기억해 드래그 시작 순간 객체가 포인터 위치로 튀는 현상을 막는다.
     */
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

    // 패닝과 객체 드래그를 동시에 처리하지 않고, 패닝 상태를 우선해 갱신한다.
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

        // 기준 객체의 이동량을 그룹 구성원의 초기 좌표에 동일하게 적용한다.
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

    // 삭제 대기, 패닝, 객체 드래그 순으로 현재 포인터 작업을 안전하게 종료한다.
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

    // 전체 삭제 전 상태를 기록해 사용자가 실행 취소할 수 있게 한다.
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

    /**
     * 편집기 단축키를 처리한다.
     * Esc는 현재 도구와 선택을 초기화하고, Ctrl/Cmd+Z는 실행 취소, Delete/Backspace는 안전 삭제 모드로 전환한다.
     * 입력창에서 문자를 편집하는 동안에는 단축키가 가로채지 않도록 제외한다.
     */
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

    // 선택 ID를 실제 객체와 엣지로 해석해 강조 표시와 인스펙터에 사용한다.
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

    // 렌더링과 이벤트에서 반복 조회할 객체·노드 인덱스를 생성한다.
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

    // 양방향으로 컴파일된 엣지는 화면에서 노드 쌍당 한 번만 표시한다.
    const visibleEdges = useMemo(
        () => uniqueVisibleEdges(compiled.map.edges),
        [compiled.map.edges],
    );

    // 숨김 대상 접근 노드를 제외하고 기존 지도 모드의 겹침 순서까지 반영한다.
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

    // 반복 설비 그룹과 설정 패널에서 사용할 그룹·표시 순서 인덱스를 구성한다.
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

    // 컴파일 검증 결과를 화면의 단계별 완료 상태와 다음 안내로 변환한다.
    const { validationSteps, activeValidationStep } = useMemo(
        () => createValidationState({ aisles, compiled, dimensionsReady, objects }),
        [aisles, compiled, dimensionsReady, objects],
    );

    // 설비 설정 이벤트가 동일한 그룹 조회와 구성원 정렬 규칙을 사용하도록 공통화한다.
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

    /**
     * 반복 설비 그룹의 개수를 설정된 허용 범위 안에서 변경한다.
     *
     * 개수를 줄이면 뒤쪽 구성원과 연결 엣지를 함께 삭제한다.
     * 개수를 늘리면 첫 구성원을 기준으로 현재 방향과 간격을 연장한다.
     * 기존 지도에서는 원본 형식에 맞는 rawNode ID도 새로 생성한다.
     */
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
        // 개수를 줄일 때는 표시 순서 뒤쪽 구성원과 연결 엣지만 제거한다.
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

        // 개수를 늘릴 때는 첫 구성원을 기준으로 현재 방향과 간격을 연장한다.
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

    /**
     * 반복 설비 그룹을 가로 또는 세로 배열로 전환한다.
     * 첫 구성원의 위치는 고정하고, 나머지 구성원만 인덱스와 간격에 따라 새 좌표로 재배치한다.
     * 방향 변경 후 겹침이 생기지 않도록 현재 간격과 새 방향의 최소 간격 중 큰 값을 사용한다.
     */
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

    // 입력 간격을 객체가 겹치지 않는 최소값과 허용 최댓값 사이로 제한한 뒤 다시 배치한다.
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

    // 엣지 선택 시 편집 도구를 선택 모드로 되돌리고 인스펙터에 표시한다.
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
