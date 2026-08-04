import { useEffect, useRef, useState } from "react";
import "../styles/WarehouseManagement.css";

import { warehouseApi } from "../api/client";

import warehouseGraph1 from "../assets/warehouse-maps/warehouse_graph_1.json";
import warehouseGraph2 from "../assets/warehouse-maps/warehouse_graph_2.json";
import warehouseGraph3 from "../assets/warehouse-maps/warehouse_graph_3.json";

// 백엔드 상태값 <-> 화면 표기
const STATUS_TO_LABEL = {
    ACTIVE: "운영 중",
    MAINTENANCE: "점검 중",
    INACTIVE: "비활성",
};

const LABEL_TO_STATUS = {
    "운영 중": "ACTIVE",
    "점검 중": "MAINTENANCE",
    비활성: "INACTIVE",
};

/**
 * 레이아웃 응답을 미리보기가 이해하는 지도 형태로 바꾼다.
 *
 * 서버는 노드를 숫자 ID 로 주고 간선은 그 ID 로 양끝을 가리킨다.
 * 미리보기는 노드 코드(K0_1, R0_0 ...)를 쓰므로 한 번 갈아끼운다.
 *
 * 노드 종류도 표기가 다르다. (RACK_STORAGE -> rack_access)
 * 색을 칠하는 데만 쓰이므로 화면 규칙에 맞춰 준다.
 */
const NODE_TYPE_TO_PREVIEW = {
    ROUTE: "route",
    ROUTE_CHARGE_JUNCTION: "route_charge_junction",
    RACK_STORAGE: "rack_access",
    INBOUND: "inbound",
    OUTBOUND: "outbound",
    CHARGING_SLOT: "charging_slot",
};

const toPreviewMap = (layout, warehouseName) => {
    const nodes = Array.isArray(layout?.nodes) ? layout.nodes : [];
    const edges = Array.isArray(layout?.edges) ? layout.edges : [];

    if (nodes.length === 0) {
        return null;
    }

    // 간선이 가리키는 숫자 ID 를 노드 코드로 바꾸기 위한 표
    const codeById = new Map(
        nodes.map((node) => [node.id, node.nodeCode ?? String(node.id)])
    );

    return {
        title: `${warehouseName ?? "창고"} 지도`,
        nodes: nodes.map((node) => ({
            id: node.nodeCode ?? String(node.id),
            type: NODE_TYPE_TO_PREVIEW[node.nodeType] ?? "route",
            x: node.x,
            y: node.y,
        })),
        edges: edges
            .map((edge) => ({
                id: String(edge.id),
                source: codeById.get(edge.fromNodeId),
                target: codeById.get(edge.toNodeId),
            }))
            // 한쪽 끝이 없는 간선은 그릴 수 없으니 버린다.
            .filter((edge) => edge.source && edge.target),
    };
};

// 백엔드 응답 -> 화면에서 쓰던 형태
const toWarehouseView = (warehouse) => ({
    warehouse_id: warehouse.id,
    shared: Boolean(warehouse.shared),
    name: warehouse.name,
    location: warehouse.location ?? "미지정",
    status: STATUS_TO_LABEL[warehouse.status] ?? "운영 중",
    width: warehouse.width ?? 0,
    height: warehouse.height ?? 0,
    description: warehouse.description || "등록된 설명이 없습니다.",
    createdAt: (warehouse.createdAt ?? "").replace("T", " ").slice(0, 16),
    updatedAt: (warehouse.updatedAt ?? "").replace("T", " ").slice(0, 16),

    // 아래 값들은 목록 응답에 없다. 상세 조회를 붙이기 전까지 0으로 둔다.
    robotCount: 0,
    shelfCount: 0,
    nodeCount: 0,
    edgeCount: 0,
    utilization: 0,
    workingRobots: 0,
    storageUsage: 0,
    todayTasks: 0,
    mapData: null,
});

const getShelfCount = (mapData) =>
    mapData?.summary?.rack_entity_count ??
    mapData?.summary?.rack_entities_external ??
    0;

const initialWarehouses = [
    {
        warehouse_id: 1,
        name: "창고 A",
        location: "서울특별시",
        status: "운영 중",
        width: 50,
        height: 50,
        robotCount: 0,
        shelfCount: getShelfCount(warehouseGraph1),
        createdAt: "2026-07-20 09:00",
        updatedAt: "2026-07-20 09:15",
        description: "서울 물류센터 창고 A",
        creationType: "TEMPLATE",
        mapTemplateId: "warehouse_graph_1",
        mapTemplateFileName: "warehouse_graph_1.json",
        mapTitle: warehouseGraph1.title ?? "창고맵 1",
        mapData: warehouseGraph1,
    },
    {
        warehouse_id: 2,
        name: "창고 B",
        location: "부산광역시",
        status: "운영 중",
        width: 50,
        height: 50,
        robotCount: 0,
        shelfCount: getShelfCount(warehouseGraph2),
        createdAt: "2026-07-20 09:00",
        updatedAt: "2026-07-20 09:15",
        description: "부산 물류센터 창고 B",
        creationType: "TEMPLATE",
        mapTemplateId: "warehouse_graph_2",
        mapTemplateFileName: "warehouse_graph_2.json",
        mapTitle: warehouseGraph2.title ?? "창고맵 2",
        mapData: warehouseGraph2,
    },
    {
        warehouse_id: 3,
        name: "창고 C",
        location: "인천광역시",
        status: "점검 중",
        width: 50,
        height: 50,
        robotCount: 0,
        shelfCount: getShelfCount(warehouseGraph3),
        createdAt: "2026-07-20 09:00",
        updatedAt: "2026-07-20 09:15",
        description: "인천 물류센터 창고 C",
        creationType: "TEMPLATE",
        mapTemplateId: "warehouse_graph_3",
        mapTemplateFileName: "warehouse_graph_3.json",
        mapTitle: warehouseGraph3.title ?? "창고맵 3",
        mapData: warehouseGraph3,
    },
];

const initialForm = {
    name: "",
    location: "",
    width: "",
    height: "",
    description: "",
    status: "운영 준비",
};

function WarehouseMapPreview({ mapData, compact = false }) {
    const nodes = Array.isArray(mapData?.nodes)
        ? mapData.nodes.filter(
              (node) =>
                  Number.isFinite(Number(node.x)) &&
                  Number.isFinite(Number(node.y)),
          )
        : [];

    const edges = Array.isArray(mapData?.edges)
        ? mapData.edges
        : [];

    if (nodes.length === 0) {
        return (
            <div className="warehouse-preview-placeholder">
                표시할 창고맵이 없습니다.
            </div>
        );
    }

    const nodeMap = new Map(
        nodes.map((node) => [node.id, node]),
    );

    const xValues = nodes.map((node) => Number(node.x));
    const yValues = nodes.map((node) => Number(node.y));

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    const mapWidth = Math.max(maxX - minX, 1);
    const mapHeight = Math.max(maxY - minY, 1);
    const padding = Math.max(mapWidth, mapHeight) * 0.08;

    const viewBox = [
        minX - padding,
        minY - padding,
        mapWidth + padding * 2,
        mapHeight + padding * 2,
    ].join(" ");

    const mapScale = Math.max(mapWidth, mapHeight);
    const nodeRadius = Math.max(mapScale * 0.007, 0.035);

    const getNodeColor = (type) => {
        if (type === "charging_slot") {
            return "#2563eb";
        }

        if (type === "route_charge_junction") {
            return "#7c3aed";
        }

        if (
            type === "inbound" ||
            type === "inbound_access"
        ) {
            return "#16a34a";
        }

        if (
            type === "outbound" ||
            type === "outbound_access"
        ) {
            return "#f97316";
        }

        if (type === "rack_access") {
            return "#94a3b8";
        }

        if (type === "empty_tote_buffer_access") {
            return "#eab308";
        }

        return "#ffffff";
    };

    return (
        <svg
            className="warehouse-map-svg"
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={mapData.title ?? "창고맵 미리보기"}
            style={{
                display: "block",
                width: "100%",
                height: "100%",
                minHeight: compact ? "220px" : "420px",
                backgroundColor: "#ffffff",
            }}
        >
            <g>
                {edges.map((edge, index) => {
                    const sourceNode = nodeMap.get(edge.source);
                    const targetNode = nodeMap.get(edge.target);

                    if (!sourceNode || !targetNode) {
                        return null;
                    }

                    return (
                        <line
                            key={edge.id ?? `edge-${index}`}
                            x1={Number(sourceNode.x)}
                            y1={Number(sourceNode.y)}
                            x2={Number(targetNode.x)}
                            y2={Number(targetNode.y)}
                            stroke="#cbd5e1"
                            strokeWidth="1.2"
                            vectorEffect="non-scaling-stroke"
                        />
                    );
                })}
            </g>

            <g>
                {nodes.map((node, index) => (
                    <circle
                        key={node.id ?? `node-${index}`}
                        cx={Number(node.x)}
                        cy={Number(node.y)}
                        r={nodeRadius}
                        fill={getNodeColor(node.type)}
                        stroke="#334155"
                        strokeWidth="0.8"
                        vectorEffect="non-scaling-stroke"
                    >
                        <title>
                            {node.id} / {node.type}
                        </title>
                    </circle>
                ))}
            </g>
        </svg>
    );
}

function WarehouseManagement() {
    // 목록은 백엔드에서 불러온다. 목업은 조회 실패 시에만 쓴다.
    const [warehouseList, setWarehouseList] = useState([]);

    const [selectedWarehouse, setSelectedWarehouse] = useState(null);

    const [isLoading, setIsLoading] = useState(true);

    const [saveError, setSaveError] = useState("");

    const [
        isWarehouseModalOpen,
        setIsWarehouseModalOpen,
    ] = useState(false);

    const [modalMode, setModalMode] = useState("CREATE");

    const [warehouseForm, setWarehouseForm] =
        useState(initialForm);

    const [jsonFile, setJsonFile] = useState(null);

    const [uploadedMapData, setUploadedMapData] =
        useState(null);

    const [jsonError, setJsonError] = useState("");

    /**
     * 창고 목록을 다시 불러온다.
     *
     * @param keepId 새로고침 후에도 선택을 유지할 창고 ID
     */
    const reloadWarehouses = async (keepId = null) => {
        // 창고를 만들거나 고치면 지도도 바뀐다. 받아둔 것을 버리고 다시 받는다.
        requestedMapIds.current.clear();
        setMapCache({});

        try {
            const list = await warehouseApi.getAll();
            const views = (Array.isArray(list) ? list : []).map(toWarehouseView);

            setWarehouseList(views);

            const next =
                views.find((warehouse) => warehouse.warehouse_id === keepId) ??
                views[0] ??
                null;

            setSelectedWarehouse(next);
        } catch (error) {
            console.warn("창고 목록 조회 실패 - 목업을 사용합니다.", error.message);
            setWarehouseList(initialWarehouses);
            setSelectedWarehouse(initialWarehouses[0] ?? null);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        reloadWarehouses();
    }, []);

    /* =========================================================
       선택한 창고의 지도

       목록 응답에는 노드·간선이 없다. 창고를 고를 때마다
       레이아웃을 따로 받아 미리보기에 넘긴다.
       한 번 받은 창고는 다시 부르지 않는다.
    ========================================================= */

    const [mapCache, setMapCache] = useState({});

    // 이미 요청한 창고를 기억한다. 상태로 두면 캐시가 바뀔 때마다
    // 아래 useEffect 가 다시 돌아 불필요한 렌더가 생긴다.
    const requestedMapIds = useRef(new Set());

    const selectedWarehouseId = selectedWarehouse?.warehouse_id ?? null;

    useEffect(() => {
        if (selectedWarehouseId === null) {
            return;
        }

        // 목업으로 떨어진 경우엔 이미 지도를 들고 있다.
        if (selectedWarehouse?.mapData) {
            return;
        }

        if (requestedMapIds.current.has(selectedWarehouseId)) {
            return;
        }

        requestedMapIds.current.add(selectedWarehouseId);

        let cancelled = false;

        const loadMap = async () => {
            try {
                const layout = await warehouseApi.getLayout(selectedWarehouseId);
                const preview = toPreviewMap(layout, selectedWarehouse?.name);

                if (!cancelled) {
                    setMapCache((previous) => ({
                        ...previous,
                        [selectedWarehouseId]: preview,
                    }));
                }
            } catch (error) {
                console.warn("창고 지도 조회 실패:", error.message);

                // 실패해도 기록은 남긴다. 다시 눌러야 재시도한다.
                if (!cancelled) {
                    setMapCache((previous) => ({
                        ...previous,
                        [selectedWarehouseId]: null,
                    }));
                }
            }
        };

        loadMap();

        return () => {
            cancelled = true;
        };
    }, [selectedWarehouseId, selectedWarehouse?.mapData, selectedWarehouse?.name]);

    // 목업 지도가 있으면 그것을, 없으면 서버에서 받은 것을 쓴다.
    const selectedMapData =
        selectedWarehouse?.mapData
        ?? (selectedWarehouseId === null
            ? null
            : mapCache[selectedWarehouseId] ?? null);

    const openCreateModal = () => {
        setModalMode("CREATE");
        setWarehouseForm(initialForm);
        setJsonFile(null);
        setUploadedMapData(null);
        setJsonError("");
        setIsWarehouseModalOpen(true);
    };

    const openEditModal = () => {
        if (!selectedWarehouse) {
            return;
        }

        // 공용 창고는 모두가 함께 쓰므로 고칠 수 없다
        if (selectedWarehouse.shared) {
            window.alert("공용 창고는 수정할 수 없습니다.");
            return;
        }

        setModalMode("EDIT");

        setWarehouseForm({
            name: selectedWarehouse.name,
            location: selectedWarehouse.location,
            width: String(selectedWarehouse.width),
            height: String(selectedWarehouse.height),
            description: selectedWarehouse.description ?? "",
            status: selectedWarehouse.status,
        });

        setJsonFile(null);
        setUploadedMapData(null);
        setJsonError("");
        setIsWarehouseModalOpen(true);
    };

    const closeWarehouseModal = () => {
        setIsWarehouseModalOpen(false);
        setModalMode("CREATE");
        setWarehouseForm(initialForm);
        setJsonFile(null);
        setUploadedMapData(null);
        setJsonError("");
    };

    const handleFormChange = (event) => {
        const { name, value } = event.target;

        setWarehouseForm((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const handleJsonFileChange = async (event) => {
        const file = event.target.files?.[0];

        setJsonError("");
        setUploadedMapData(null);

        if (!file) {
            setJsonFile(null);
            return;
        }

        if (!file.name.toLowerCase().endsWith(".json")) {
            setJsonFile(null);
            setJsonError("JSON 파일만 업로드할 수 있습니다.");
            event.target.value = "";
            return;
        }

        try {
            const fileText = await file.text();
            const parsedData = JSON.parse(fileText);

            if (!Array.isArray(parsedData.nodes)) {
                throw new Error(
                    "nodes 배열이 존재하지 않습니다.",
                );
            }

            if (!Array.isArray(parsedData.edges)) {
                throw new Error(
                    "edges 배열이 존재하지 않습니다.",
                );
            }

            setJsonFile(file);
            setUploadedMapData(parsedData);
        } catch (error) {
            setJsonFile(null);
            setUploadedMapData(null);
            setJsonError(
                error instanceof Error
                    ? `JSON 검증 실패: ${error.message}`
                    : "JSON 파일을 읽을 수 없습니다.",
            );
            event.target.value = "";
        }
    };

    const removeJsonFile = () => {
        setJsonFile(null);
        setUploadedMapData(null);
        setJsonError("");
    };

    const isBasicFormValid =
        warehouseForm.name.trim() !== "" &&
        warehouseForm.location.trim() !== "" &&
        Number(warehouseForm.width) > 0 &&
        Number(warehouseForm.height) > 0;

    const canSave =
        isBasicFormValid &&
        (modalMode === "EDIT" || uploadedMapData !== null);

    /**
     * 창고 저장.
     *
     * 생성   지도 JSON 과 함께 보내면 백엔드가 노드·간선·랙·로봇까지 만든다.
     * 수정   이름·소재지·상태 등만 바꾼다. 지도는 건드리지 않는다.
     */
    const handleSaveWarehouse = async () => {
        if (!canSave) {
            return;
        }

        setSaveError("");

        const basePayload = {
            name: warehouseForm.name.trim(),
            width: Number(warehouseForm.width),
            height: Number(warehouseForm.height),
            location: warehouseForm.location.trim(),
            description: warehouseForm.description.trim(),
            status: LABEL_TO_STATUS[warehouseForm.status] ?? "ACTIVE",
        };

        try {
            if (modalMode === "EDIT") {
                await warehouseApi.update(
                    selectedWarehouse.warehouse_id,
                    basePayload,
                );

                await reloadWarehouses(selectedWarehouse.warehouse_id);
                closeWarehouseModal();
                return;
            }

            const created = await warehouseApi.importWarehouse({
                ...basePayload,
                map: {
                    nodes: uploadedMapData.nodes,
                    edges: uploadedMapData.edges,
                },
            });

            await reloadWarehouses(created?.warehouseId ?? null);
            closeWarehouseModal();
        } catch (error) {
            setSaveError(error.message || "저장에 실패했습니다.");
        }
    };

    const handleDeleteWarehouse = async () => {
        if (!selectedWarehouse) {
            return;
        }

        const shouldDelete = window.confirm(
            `${selectedWarehouse.name}를 삭제하시겠습니까?\n` +
                "창고의 지도와 로봇 정보도 함께 사라집니다.",
        );

        if (!shouldDelete) {
            return;
        }

        try {
            await warehouseApi.remove(selectedWarehouse.warehouse_id);
            await reloadWarehouses();
        } catch (error) {
            window.alert(
                error.message ||
                    "삭제에 실패했습니다. 실행 중인 시뮬레이션이 있는지 확인해주세요.",
            );
        }
    };

    return (
        <div className="warehouse-management">
            <div className="management-header">
                <h1>창고 관리</h1>
            </div>

            <aside className="warehouse-list-panel">
                <div className="warehouse-list-header">
                    <h2>창고 목록</h2>

                    <button
                        type="button"
                        className="warehouse-button"
                        onClick={openCreateModal}
                    >
                        + 새 창고
                    </button>
                </div>

                <div className="warehouse-list">
                    {isLoading && (
                        <div className="warehouse-list-empty">
                            불러오는 중...
                        </div>
                    )}

                    {!isLoading && warehouseList.length === 0 && (
                        <div className="warehouse-list-empty">
                            등록된 창고가 없습니다.
                        </div>
                    )}

                    {warehouseList.map((warehouse) => (
                        <button
                            type="button"
                            key={warehouse.warehouse_id}
                            className={`warehouse-list-item ${
                                selectedWarehouse?.warehouse_id ===
                                warehouse.warehouse_id
                                    ? "active"
                                    : ""
                            }`}
                            onClick={() =>
                                setSelectedWarehouse(warehouse)
                            }
                        >
                            <div className="warehouse-list-info">
                                <strong>{warehouse.name}</strong>
                                <span>{warehouse.location}</span>
                            </div>

                            <span
                                className={`warehouse-status ${warehouse.status
                                    .replaceAll(" ", "-")
                                    .toLowerCase()}`}
                            >
                                {warehouse.status}
                            </span>
                        </button>
                    ))}
                </div>
            </aside>

            <section className="warehouse-detail">
                {!selectedWarehouse ? (
                    <div className="warehouse-empty-detail">
                        <p>표시할 창고가 없습니다.</p>

                        <button
                            type="button"
                            className="warehouse-button"
                            onClick={openCreateModal}
                        >
                            새 창고 만들기
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="warehouse-detail-header">
                            <div className="warehouse-title-group">
                                <h1>{selectedWarehouse.name}</h1>

                                <span className="detail-status">
                                    {selectedWarehouse.status}
                                </span>
                            </div>

                            <div className="warehouse-action-buttons">
                                <button
                                    type="button"
                                    onClick={openEditModal}
                                    disabled={selectedWarehouse.shared}
                                    title={
                                        selectedWarehouse.shared
                                            ? "공용 창고는 수정할 수 없습니다."
                                            : undefined
                                    }
                                >
                                    수정
                                </button>

                                <button
                                    type="button"
                                    className="delete-button"
                                    onClick={handleDeleteWarehouse}
                                    disabled={selectedWarehouse.shared}
                                    title={
                                        selectedWarehouse.shared
                                            ? "공용 창고는 삭제할 수 없습니다."
                                            : undefined
                                    }
                                >
                                    삭제
                                </button>
                            </div>
                        </div>

                        <div className="warehouse-detail-content">
                            <div className="warehouse-preview">
                                {selectedMapData ? (
                                    <div className="warehouse-preview-content">
                                        <WarehouseMapPreview
                                            mapData={selectedMapData}
                                        />
                                    </div>
                                ) : (
                                    <div className="warehouse-preview-placeholder">
                                        창고 미리보기
                                    </div>
                                )}
                            </div>

                            <div className="warehouse-info">
                                <div className="warehouse-info-row">
                                    <span>위치</span>
                                    <strong>
                                        {selectedWarehouse.location}
                                    </strong>
                                </div>

                                <div className="warehouse-info-row">
                                    <span>크기</span>
                                    <strong>
                                        {selectedWarehouse.width}m ×{" "}
                                        {selectedWarehouse.height}m
                                    </strong>
                                </div>

                                <div className="warehouse-info-row">
                                    <span>등록 로봇 수</span>
                                    <strong>
                                        {selectedWarehouse.robotCount}대
                                    </strong>
                                </div>

                                <div className="warehouse-info-row">
                                    <span>선반 수</span>
                                    <strong>
                                        {selectedWarehouse.shelfCount}개
                                    </strong>
                                </div>

                                <div className="warehouse-info-row">
                                    <span>생성일</span>
                                    <strong>
                                        {selectedWarehouse.createdAt}
                                    </strong>
                                </div>

                                <div className="warehouse-info-row">
                                    <span>최근 업데이트</span>
                                    <strong>
                                        {selectedWarehouse.updatedAt}
                                    </strong>
                                </div>

                                <div className="warehouse-info-row">
                                    <span>설명</span>
                                    <strong>
                                        {selectedWarehouse.description}
                                    </strong>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </section>

            {isWarehouseModalOpen && (
                <div className="warehouse-modal-backdrop">
                    <section
                        className="warehouse-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="warehouse-modal-title"
                    >
                        <div className="warehouse-modal-header">
                            <h2 id="warehouse-modal-title">
                                {modalMode === "EDIT"
                                    ? "창고 수정"
                                    : "새 창고 생성"}
                            </h2>

                            <button
                                type="button"
                                className="warehouse-modal-close"
                                onClick={closeWarehouseModal}
                                aria-label="팝업 닫기"
                            >
                                ×
                            </button>
                        </div>

                        <div className="warehouse-create-tabs">
                            <span className="active">
                                기본 정보
                            </span>

                            {modalMode === "CREATE" && (
                                <span>JSON 업로드</span>
                            )}
                        </div>

                        <div className="warehouse-form-grid">
                            <label className="warehouse-form-field">
                                <span>창고명 *</span>

                                <input
                                    type="text"
                                    name="name"
                                    value={warehouseForm.name}
                                    onChange={handleFormChange}
                                    placeholder="예) 대전 물류센터 A"
                                />
                            </label>

                            <label className="warehouse-form-field">
                                <span>위치 *</span>

                                <input
                                    type="text"
                                    name="location"
                                    value={warehouseForm.location}
                                    onChange={handleFormChange}
                                    placeholder="예) 대전광역시"
                                />
                            </label>

                            <label className="warehouse-form-field">
                                <span>가로 크기(m) *</span>

                                <input
                                    type="number"
                                    name="width"
                                    min="1"
                                    value={warehouseForm.width}
                                    onChange={handleFormChange}
                                    placeholder="예) 50"
                                />
                            </label>

                            <label className="warehouse-form-field">
                                <span>세로 크기(m) *</span>

                                <input
                                    type="number"
                                    name="height"
                                    min="1"
                                    value={warehouseForm.height}
                                    onChange={handleFormChange}
                                    placeholder="예) 50"
                                />
                            </label>

                            <label className="warehouse-form-field">
                                <span>운영 상태</span>

                                <select
                                    name="status"
                                    value={warehouseForm.status}
                                    onChange={handleFormChange}
                                >
                                    <option value="운영 준비">
                                        운영 준비
                                    </option>

                                    <option value="운영 중">
                                        운영 중
                                    </option>

                                    <option value="점검 중">
                                        점검 중
                                    </option>

                                    <option value="비활성">
                                        비활성
                                    </option>
                                </select>
                            </label>

                            <label className="warehouse-form-field">
                                <span>설명</span>

                                <textarea
                                    name="description"
                                    value={warehouseForm.description}
                                    onChange={handleFormChange}
                                    placeholder="창고에 대한 설명을 입력하세요"
                                    rows="3"
                                />
                            </label>
                        </div>

                        {modalMode === "CREATE" && (
                            <div className="warehouse-json-upload">
                                <label htmlFor="warehouse-json-file">
                                    JSON 파일 선택 *
                                </label>

                                <input
                                    id="warehouse-json-file"
                                    type="file"
                                    accept=".json,application/json"
                                    onChange={handleJsonFileChange}
                                />

                                {jsonError && (
                                    <p className="warehouse-json-error">
                                        {jsonError}
                                    </p>
                                )}

                                {jsonFile && uploadedMapData && (
                                    <>
                                        <div className="warehouse-json-file-info">
                                            <div>
                                                <strong>
                                                    {jsonFile.name}
                                                </strong>

                                                <span>
                                                    노드{" "}
                                                    {uploadedMapData
                                                        .summary
                                                        ?.node_count ??
                                                        uploadedMapData
                                                            .nodes
                                                            .length}
                                                    개 · 엣지{" "}
                                                    {uploadedMapData
                                                        .summary
                                                        ?.edge_count ??
                                                        uploadedMapData
                                                            .edges
                                                            .length}
                                                    개
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={removeJsonFile}
                                            >
                                                제거
                                            </button>
                                        </div>

                                        <div className="warehouse-selected-map-preview">
                                            <WarehouseMapPreview
                                                mapData={
                                                    uploadedMapData
                                                }
                                                compact
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {saveError && (
                            <p className="warehouse-json-error">
                                {saveError}
                            </p>
                        )}

                        <div className="warehouse-modal-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={closeWarehouseModal}
                            >
                                취소
                            </button>

                            <button
                                type="button"
                                className="primary-button"
                                disabled={!canSave}
                                onClick={handleSaveWarehouse}
                            >
                                {modalMode === "EDIT"
                                    ? "수정"
                                    : "생성"}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

export default WarehouseManagement;