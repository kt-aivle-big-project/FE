import { useState } from "react";
import "../styles/WarehouseManagement.css";

import warehouseGraph1 from "../assets/warehouse-maps/warehouse_graph_1.json";
import warehouseGraph2 from "../assets/warehouse-maps/warehouse_graph_2.json";
import warehouseGraph3 from "../assets/warehouse-maps/warehouse_graph_3.json";

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

const getCurrentDateTime = () => {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}`;
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
    const [warehouseList, setWarehouseList] =
        useState(initialWarehouses);

    const [selectedWarehouse, setSelectedWarehouse] =
        useState(initialWarehouses[0]);

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

    const handleSaveWarehouse = () => {
        if (!canSave) {
            return;
        }

        const now = getCurrentDateTime();

        if (modalMode === "EDIT") {
            const updatedWarehouse = {
                ...selectedWarehouse,
                name: warehouseForm.name.trim(),
                location: warehouseForm.location.trim(),
                status: warehouseForm.status,
                width: Number(warehouseForm.width),
                height: Number(warehouseForm.height),
                updatedAt: now,
                description:
                    warehouseForm.description.trim() ||
                    "등록된 설명이 없습니다.",
            };

            setWarehouseList((previous) =>
                previous.map((warehouse) =>
                    warehouse.warehouse_id ===
                    selectedWarehouse.warehouse_id
                        ? updatedWarehouse
                        : warehouse,
                ),
            );

            setSelectedWarehouse(updatedWarehouse);
            closeWarehouseModal();
            return;
        }

        const currentIds = warehouseList.map(
            (warehouse) => warehouse.warehouse_id,
        );

        const nextWarehouseId =
            currentIds.length > 0
                ? Math.max(...currentIds) + 1
                : 1;

        const mapData = uploadedMapData;

        const nodeCount =
            mapData?.summary?.node_count ??
            mapData?.nodes?.length ??
            0;

        const edgeCount =
            mapData?.summary?.edge_count ??
            mapData?.edges?.length ??
            0;

        const shelfCount =
            mapData?.summary?.rack_entity_count ??
            mapData?.summary?.rack_entities_external ??
            0;

        const newWarehouse = {
            warehouse_id: nextWarehouseId,
            name: warehouseForm.name.trim(),
            location: warehouseForm.location.trim(),
            status: warehouseForm.status,
            width: Number(warehouseForm.width),
            height: Number(warehouseForm.height),
            robotCount: 0,
            shelfCount,
            createdAt: now,
            updatedAt: now,
            description:
                warehouseForm.description.trim() ||
                "등록된 설명이 없습니다.",
            creationType: "JSON",
            mapTitle: mapData?.title ?? jsonFile?.name ?? "업로드 창고맵",
            mapData,
            nodeCount,
            edgeCount,
            mapTemplateId: null,
            mapTemplateFileName: null,
            jsonFileName: jsonFile?.name ?? null,
        };

        setWarehouseList((previous) => [
            ...previous,
            newWarehouse,
        ]);

        setSelectedWarehouse(newWarehouse);
        closeWarehouseModal();
    };

    const handleDeleteWarehouse = () => {
        if (!selectedWarehouse) {
            return;
        }

        const shouldDelete = window.confirm(
            `${selectedWarehouse.name}를 삭제하시겠습니까?`,
        );

        if (!shouldDelete) {
            return;
        }

        const remainingWarehouses = warehouseList.filter(
            (warehouse) =>
                warehouse.warehouse_id !==
                selectedWarehouse.warehouse_id,
        );

        setWarehouseList(remainingWarehouses);

        if (remainingWarehouses.length > 0) {
            setSelectedWarehouse(remainingWarehouses[0]);
        } else {
            setSelectedWarehouse(null);
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
                    {warehouseList.length === 0 && (
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
                                >
                                    수정
                                </button>

                                <button
                                    type="button"
                                    className="delete-button"
                                    onClick={handleDeleteWarehouse}
                                >
                                    삭제
                                </button>
                            </div>
                        </div>

                        <div className="warehouse-detail-content">
                            <div className="warehouse-preview">
                                {selectedWarehouse.mapData ? (
                                    <div className="warehouse-preview-content">
                                        <WarehouseMapPreview
                                            mapData={
                                                selectedWarehouse.mapData
                                            }
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