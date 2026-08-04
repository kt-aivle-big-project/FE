import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/warehouseManagement.css";

import WarehouseSVG from "./WarehouseSVG";
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


const normalizeNodeType = (node) =>
    String(
        node?.nodeType ??
        node?.type ??
        node?.category ??
        node?.role ??
        "",
    )
        .trim()
        .toLowerCase();

const createEmptyWarehouseStats = () => ({
    shelfCount: 0,
    inboundCount: 0,
    outboundCount: 0,
    chargingStationCount: 0,
});

const firstFiniteNumber = (...values) => {
    const found = values.find(
        (value) =>
            value !== null &&
            value !== undefined &&
            Number.isFinite(Number(value)),
    );

    return found === undefined ? null : Number(found);
};

const createWarehouseStats = (layout) => {
    const nodes = Array.isArray(layout?.nodes) ? layout.nodes : [];
    const summary = layout?.summary ?? {};

    const nodesByType = (targetTypes) =>
        nodes.filter((node) =>
            targetTypes.includes(normalizeNodeType(node)),
        );

    const rackCollection = [
        layout?.racks,
        layout?.rackEntities,
        layout?.shelves,
        layout?.storageLocations,
    ].find(Array.isArray);

    // 기본 JSON은 선반 하나당 rack_access 노드가 A/B 두 개씩 있으므로
    // "_ACCESS_A", "_ACCESS_B"를 제거해 실제 선반 수로 중복 제거한다.
    const rackIdsFromAccessNodes = new Set(
        nodesByType(["rack_access"]).map((node) =>
            String(node.id ?? node.nodeCode ?? "")
                .replace(/_ACCESS_[AB]$/i, "")
                .replace(/_ACCESS$/i, ""),
        ),
    );

    const shelfCount =
        firstFiniteNumber(
            summary.rackEntityCount,
            summary.rack_entity_count,
            summary.rackEntitiesExternal,
            summary.rack_entities_external,
            summary.rackCount,
            summary.rack_count,
            rackCollection?.length,
        ) ??
        (rackIdsFromAccessNodes.size > 0
            ? rackIdsFromAccessNodes.size
            : nodesByType([
                  "rack_storage",
                  "rack",
                  "shelf",
                  "storage",
                  "storage_location",
              ]).length);

    const inboundCount =
        firstFiniteNumber(
            summary.inboundNodes,
            summary.inbound_nodes,
            summary.inboundCount,
            summary.inbound_count,
            summary.inboundStationCount,
            summary.inbound_station_count,
        ) ??
        nodesByType([
            "inbound",
            "inbound_station",
        ]).length;

    const outboundCount =
        firstFiniteNumber(
            summary.outboundNodes,
            summary.outbound_nodes,
            summary.logicalOutboundDestinations,
            summary.logical_outbound_destinations,
            summary.outboundCount,
            summary.outbound_count,
        ) ??
        nodesByType([
            "outbound",
            "outbound_station",
        ]).length;

    const chargingStationCount =
        firstFiniteNumber(
            summary.chargingSlotNodes,
            summary.charging_slot_nodes,
            summary.chargingStationCount,
            summary.charging_station_count,
            summary.chargingSlotCount,
            summary.charging_slot_count,
            summary.chargerCount,
            summary.charger_count,
            Array.isArray(layout?.chargingStations)
                ? layout.chargingStations.length
                : null,
        ) ??
        nodesByType([
            "charging_station",
            "charging_slot",
            "charger_slot",
            "charger",
        ]).length;

    return {
        shelfCount,
        inboundCount,
        outboundCount,
        chargingStationCount,
    };
};

function WarehouseConfigIcon({ type }) {
    if (type === "shelf") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 3v18M19 3v18M5 7h14M5 12h14M5 17h14" />
            </svg>
        );
    }

    if (type === "inbound") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v10M8 9l4 4 4-4" />
                <path d="M5 14v6h14v-6" />
            </svg>
        );
    }

    if (type === "outbound") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15V5M8 9l4-4 4 4" />
                <path d="M5 14v6h14v-6" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3v5M16 3v5M7 8h10v4a5 5 0 0 1-10 0V8Z" />
            <path d="M12 17v4M9 21h6" />
        </svg>
    );
}

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

export function WarehouseMapPreview({ mapData, compact = false }) {
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
    const navigate = useNavigate();
    const location = useLocation();

    // 목록은 백엔드에서 불러온다. 목업은 조회 실패 시에만 쓴다.
    const [warehouseList, setWarehouseList] = useState([]);

    const [selectedWarehouse, setSelectedWarehouse] = useState(null);

    const [isLoading, setIsLoading] = useState(true);

    const [saveError, setSaveError] = useState("");

    const [warehouseStats, setWarehouseStats] = useState(
        createEmptyWarehouseStats,
    );

    const [isStatsLoading, setIsStatsLoading] = useState(false);

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
        const requestedId = Number(location.state?.selectedWarehouseId);

        reloadWarehouses(
            Number.isSafeInteger(requestedId) && requestedId > 0
                ? requestedId
                : null,
        );
    }, [location.state?.selectedWarehouseId]);


    useEffect(() => {
        const warehouseId = selectedWarehouse?.warehouse_id;

        if (!warehouseId) {
            setWarehouseStats(createEmptyWarehouseStats());
            return undefined;
        }

        let cancelled = false;

        const loadWarehouseStats = async () => {
            setIsStatsLoading(true);

            try {
                const layout = await warehouseApi.getLayout(warehouseId);

                if (!cancelled) {
                    setWarehouseStats(createWarehouseStats(layout));
                }
            } catch (error) {
                console.warn(
                    "창고 구성 정보 조회 실패",
                    error.message,
                );

                if (!cancelled) {
                    setWarehouseStats(
                        selectedWarehouse?.mapData
                            ? createWarehouseStats(
                                  selectedWarehouse.mapData,
                              )
                            : createEmptyWarehouseStats(),
                    );
                }
            } finally {
                if (!cancelled) {
                    setIsStatsLoading(false);
                }
            }
        };

        loadWarehouseStats();

        return () => {
            cancelled = true;
        };
    }, [selectedWarehouse?.warehouse_id]);

    const openCreateModal = () => {
        setModalMode("CREATE");
        setWarehouseForm(initialForm);
        setJsonFile(null);
        setUploadedMapData(null);
        setJsonError("");
        setIsWarehouseModalOpen(true);
    };

    const openWarehouseDesigner = () => {
        navigate("/warehouse/new");
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

    const openWarehouseLayoutEditor = () => {
        if (!selectedWarehouse) {
            return;
        }

        if (selectedWarehouse.shared) {
            window.alert("공용 창고는 지도와 시설을 수정할 수 없습니다.");
            return;
        }

        navigate(`/warehouse/${selectedWarehouse.warehouse_id}/edit`);
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

                    <div className="warehouse-create-actions">
                        <button
                            type="button"
                            className="warehouse-button"
                            onClick={openCreateModal}
                        >
                            + JSON 등록
                        </button>
                        <button
                            type="button"
                            className="warehouse-button"
                            onClick={openWarehouseDesigner}
                        >
                            + 직접 설계
                        </button>
                    </div>
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

                        <div className="warehouse-create-actions">
                            <button
                                type="button"
                                className="warehouse-button"
                                onClick={openCreateModal}
                            >
                                JSON으로 창고 생성
                            </button>
                            <button
                                type="button"
                                className="warehouse-button"
                                onClick={openWarehouseDesigner}
                            >
                                직접 창고 설계
                            </button>
                        </div>
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
                                    정보 수정
                                </button>

                                <button
                                    type="button"
                                    onClick={openWarehouseLayoutEditor}
                                    disabled={selectedWarehouse.shared}
                                    title={
                                        selectedWarehouse.shared
                                            ? "공용 창고는 지도와 시설을 수정할 수 없습니다."
                                            : undefined
                                    }
                                >
                                    지도 수정
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
                            <section className="warehouse-map-card">
                                <div className="warehouse-card-heading">
                                    <div>
                                        <h2>창고 맵</h2>
                                        <p>
                                            창고의 선반과 주요 작업 지점 배치를
                                            확인할 수 있습니다.
                                        </p>
                                    </div>
                                </div>

                                <div className="warehouse-preview">
                                    <div className="warehouse-preview-content">
                                        <WarehouseSVG
                                            key={
                                                selectedWarehouse.warehouse_id
                                            }
                                            warehouseId={
                                                selectedWarehouse.warehouse_id
                                            }
                                            robots={[]}
                                            simulationSpeed={1}
                                        />
                                    </div>
                                </div>
                            </section>

                            <div className="warehouse-detail-bottom">
                                <section className="warehouse-configuration">
                                    <div className="warehouse-configuration-header">
                                        <div>
                                            <h2>시설 구성</h2>
                                            <p>
                                                창고 맵에 등록된 시설별 수량과
                                                용도를 확인할 수 있습니다.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="warehouse-facility-list">
                                        <article className="warehouse-facility-item shelf">
                                            <div className="warehouse-facility-icon">
                                                <WarehouseConfigIcon type="shelf" />
                                            </div>

                                            <div className="warehouse-facility-main">
                                                <div className="warehouse-facility-title-row">
                                                    <strong>선반</strong>
                                                    <span className="warehouse-facility-badge">
                                                        맵 표시 · 회색
                                                    </span>
                                                </div>

                                                <p>
                                                    상품을 적재하고 보관하는
                                                    랙 시설입니다.
                                                </p>
                                            </div>

                                            <div className="warehouse-facility-count">
                                                <strong>
                                                    {isStatsLoading
                                                        ? "-"
                                                        : warehouseStats.shelfCount}
                                                </strong>
                                                <span>개</span>
                                            </div>
                                        </article>

                                        <article className="warehouse-facility-item inbound">
                                            <div className="warehouse-facility-icon">
                                                <WarehouseConfigIcon type="inbound" />
                                            </div>

                                            <div className="warehouse-facility-main">
                                                <div className="warehouse-facility-title-row">
                                                    <strong>입고장</strong>
                                                    <span className="warehouse-facility-badge">
                                                        맵 표시 · 초록
                                                    </span>
                                                </div>

                                                <p>
                                                    상품의 입고 작업이 시작되는
                                                    작업 지점입니다.
                                                </p>
                                            </div>

                                            <div className="warehouse-facility-count">
                                                <strong>
                                                    {isStatsLoading
                                                        ? "-"
                                                        : warehouseStats.inboundCount}
                                                </strong>
                                                <span>개</span>
                                            </div>
                                        </article>

                                        <article className="warehouse-facility-item outbound">
                                            <div className="warehouse-facility-icon">
                                                <WarehouseConfigIcon type="outbound" />
                                            </div>

                                            <div className="warehouse-facility-main">
                                                <div className="warehouse-facility-title-row">
                                                    <strong>출고장</strong>
                                                    <span className="warehouse-facility-badge">
                                                        맵 표시 · 주황
                                                    </span>
                                                </div>

                                                <p>
                                                    상품의 출고 작업이 완료되는
                                                    작업 지점입니다.
                                                </p>
                                            </div>

                                            <div className="warehouse-facility-count">
                                                <strong>
                                                    {isStatsLoading
                                                        ? "-"
                                                        : warehouseStats.outboundCount}
                                                </strong>
                                                <span>개</span>
                                            </div>
                                        </article>

                                        <article className="warehouse-facility-item charging">
                                            <div className="warehouse-facility-icon">
                                                <WarehouseConfigIcon type="charging" />
                                            </div>

                                            <div className="warehouse-facility-main">
                                                <div className="warehouse-facility-title-row">
                                                    <strong>충전소</strong>
                                                    <span className="warehouse-facility-badge">
                                                        맵 표시 · 파랑
                                                    </span>
                                                </div>

                                                <p>
                                                    로봇이 대기하거나 배터리를
                                                    충전하는 시설입니다.
                                                </p>
                                            </div>

                                            <div className="warehouse-facility-count">
                                                <strong>
                                                    {isStatsLoading
                                                        ? "-"
                                                        : warehouseStats.chargingStationCount}
                                                </strong>
                                                <span>개</span>
                                            </div>
                                        </article>
                                    </div>
                                </section>

                                <section className="warehouse-info-section">
                                    <div className="warehouse-info-header">
                                        <h2>기본 정보</h2>
                                    </div>

                                    <div className="warehouse-info">
                                        <div className="warehouse-info-row">
                                            <span>위치</span>
                                            <strong>
                                                {
                                                    selectedWarehouse.location
                                                }
                                            </strong>
                                        </div>

                                        <div className="warehouse-info-row">
                                            <span>크기</span>
                                            <strong>
                                                {
                                                    selectedWarehouse.width
                                                }
                                                m ×{" "}
                                                {
                                                    selectedWarehouse.height
                                                }
                                                m
                                            </strong>
                                        </div>

                                        <div className="warehouse-info-row">
                                            <span>생성일</span>
                                            <strong>
                                                {
                                                    selectedWarehouse.createdAt
                                                }
                                            </strong>
                                        </div>

                                        <div className="warehouse-info-row">
                                            <span>최근 업데이트</span>
                                            <strong>
                                                {
                                                    selectedWarehouse.updatedAt
                                                }
                                            </strong>
                                        </div>

                                        <div className="warehouse-info-row warehouse-info-description">
                                            <span>설명</span>
                                            <strong>
                                                {
                                                    selectedWarehouse.description
                                                }
                                            </strong>
                                        </div>
                                    </div>
                                </section>
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
