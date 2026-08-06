import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { warehouseApi } from "../api/client";
import WarehouseLayoutEditor from "../components/warehouse/WarehouseLayoutEditor";
import { WarehouseMapPreview } from "./WarehouseManagement";
import { layoutResponseToMapData } from "../utils/warehouseLayoutAdapter";
import { createLayoutDraftFromMap } from "../utils/warehouseLayoutBuilder";
import "../styles/WarehouseCreate.css";

const DRAFT_STORAGE_KEY = "laro.warehouse-create-draft.v1";

const EMPTY_FORM = {
    name: "",
    location: "",
    width: "",
    height: "",
    description: "",
    status: "ACTIVE",
};

/**
 * 지도 노드 좌표에서 창고 크기를 구한다.
 *
 * 백엔드 WarehouseImportService.resolveDimensions 와 같은 규칙이다.
 * 여기서 다르게 계산하면 화면에 보이는 크기와 저장된 크기가 어긋난다.
 */
const dimensionsFromMap = (mapData) => {
    const nodes = Array.isArray(mapData?.nodes) ? mapData.nodes : [];
    const xValues = nodes.map((node) => Number(node.x)).filter(Number.isFinite);
    const yValues = nodes.map((node) => Number(node.y)).filter(Number.isFinite);

    if (xValues.length === 0 || yValues.length === 0) {
        return null;
    }

    return {
        width: Math.max(1, Math.ceil(Math.max(...xValues)) + 1),
        height: Math.max(1, Math.ceil(Math.max(...yValues)) + 1),
    };
};

const readDraft = () => {
    try {
        const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
};

function WarehouseCreate() {
    const navigate = useNavigate();
    const { warehouseId } = useParams();
    const editWarehouseId = Number(warehouseId);
    const isEditMode = Number.isSafeInteger(editWarehouseId) && editWarehouseId > 0;
    const [savedDraft] = useState(() => isEditMode ? null : readDraft());
    const [form, setForm] = useState(savedDraft?.form ?? EMPTY_FORM);
    const [creationSource, setCreationSource] = useState(
        savedDraft?.creationSource === "JSON" ? "JSON" : "DESIGN",
    );
    const [designedLayout, setDesignedLayout] = useState(null);
    const [layoutDraft, setLayoutDraft] = useState(savedDraft?.layoutDraft ?? null);
    const [uploadedMapData, setUploadedMapData] = useState(
        savedDraft?.uploadedMapData ?? null,
    );
    const [jsonFileName, setJsonFileName] = useState(
        savedDraft?.jsonFileName ?? "",
    );
    const [jsonError, setJsonError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(Boolean(savedDraft));
    const [isLoadingExisting, setIsLoadingExisting] = useState(isEditMode);
    const ignoreInitialDraftChange = useRef(isEditMode);

    useEffect(() => {
        if (!isEditMode) {
            return undefined;
        }

        let active = true;
        const loadExistingWarehouse = async () => {
            setIsLoadingExisting(true);
            setSaveError("");
            try {
                const layout = await warehouseApi.getLayout(editWarehouseId);
                if (!active) return;

                const warehouse = layout.warehouse ?? await warehouseApi.get(editWarehouseId);
                const map = layoutResponseToMapData(layout, {
                    name: warehouse.name,
                });
                setForm({
                    name: warehouse.name ?? "",
                    location: warehouse.location ?? "",
                    width: String(warehouse.width ?? ""),
                    height: String(warehouse.height ?? ""),
                    description: warehouse.description ?? "",
                    status: warehouse.status ?? "ACTIVE",
                });
                setCreationSource("DESIGN");
                setLayoutDraft(createLayoutDraftFromMap(map));
                setUploadedMapData(null);
                setIsDirty(false);
            } catch (error) {
                if (active) {
                    setSaveError(error.message || "기존 창고 지도를 불러오지 못했습니다.");
                }
            } finally {
                if (active) setIsLoadingExisting(false);
            }
        };

        loadExistingWarehouse();
        return () => {
            active = false;
        };
    }, [editWarehouseId, isEditMode]);

    const handleDesignedLayoutChange = useCallback((layout) => {
        setDesignedLayout(layout);
    }, []);

    const handleLayoutDraftChange = useCallback((draft) => {
        setLayoutDraft(draft);
        if (ignoreInitialDraftChange.current) {
            ignoreInitialDraftChange.current = false;
            return;
        }
        if (draft.objects.length > 0 || draft.aisles.length > 0) {
            setIsDirty(true);
        }
    }, []);

    useEffect(() => {
        if (!isDirty) {
            return;
        }

        if (isEditMode) {
            return;
        }

        try {
            sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
                form,
                creationSource,
                layoutDraft,
                uploadedMapData,
                jsonFileName,
            }));
        } catch {
            // 저장 공간이 부족해도 현재 편집 세션은 계속 사용할 수 있다.
        }
    }, [creationSource, form, isDirty, isEditMode, jsonFileName, layoutDraft, uploadedMapData]);

    useEffect(() => {
        if (!isDirty) {
            return undefined;
        }

        const handleBeforeUnload = (event) => {
            event.preventDefault();
            event.returnValue = true;
        };

        const handleNavigationClick = (event) => {
            const link = event.target.closest?.("a[href]");
            if (!link || link.href === window.location.href) {
                return;
            }

            if (!window.confirm("저장하지 않은 창고 설계가 있습니다. 페이지를 나갈까요?")) {
                event.preventDefault();
                event.stopPropagation();
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("click", handleNavigationClick, true);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("click", handleNavigationClick, true);
        };
    }, [isDirty]);

    const handleFormChange = (event) => {
        const { name, value } = event.target;
        setForm((previous) => ({ ...previous, [name]: value }));
        setSaveError("");
        setIsDirty(true);
    };

    const changeCreationSource = (source) => {
        setCreationSource(source);
        setSaveError("");
        setIsDirty(true);
    };

    const handleJsonFileChange = async (event) => {
        const file = event.target.files?.[0];
        setJsonError("");

        if (!file) {
            setUploadedMapData(null);
            setJsonFileName("");
            return;
        }

        if (!file.name.toLowerCase().endsWith(".json")) {
            setJsonError("JSON 파일만 업로드할 수 있습니다.");
            event.target.value = "";
            return;
        }

        try {
            const parsed = JSON.parse(await file.text());
            if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
                throw new Error("nodes와 edges 배열이 필요합니다.");
            }

            setUploadedMapData(parsed);
            setJsonFileName(file.name);

            // 가로·세로는 지도가 정답을 갖고 있다. 사람이 다시 입력할 필요가 없다.
            const dimensions = dimensionsFromMap(parsed);

            if (dimensions) {
                setForm((previous) => ({
                    ...previous,
                    width: String(dimensions.width),
                    height: String(dimensions.height),
                }));
            }

            setIsDirty(true);
        } catch (error) {
            setUploadedMapData(null);
            setJsonFileName("");
            setJsonError(`JSON 검증 실패: ${error.message}`);
            event.target.value = "";
        }
    };

    const selectedMap = creationSource === "DESIGN"
        ? designedLayout?.map
        : uploadedMapData;
    const isBasicFormValid =
        form.name.trim() !== "" &&
        form.location.trim() !== "" &&
        Number(form.width) > 0 &&
        Number(form.height) > 0;
    const isMapValid = creationSource === "DESIGN"
        ? Boolean(designedLayout?.validation?.isValid)
        : Boolean(uploadedMapData);
    const canSave = isBasicFormValid && isMapValid && !isSaving;

    const leavePage = () => {
        if (isDirty && !window.confirm("저장하지 않은 창고 설계를 버리고 목록으로 돌아갈까요?")) {
            return;
        }

        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
        setIsDirty(false);
        navigate("/warehouse");
    };

    const handleSave = async () => {
        if (!canSave) {
            return;
        }

        setIsSaving(true);
        setSaveError("");

        try {
            const payload = {
                name: form.name.trim(),
                width: Number(form.width),
                height: Number(form.height),
                location: form.location.trim(),
                description: form.description.trim(),
                status: form.status,
                map: {
                    nodes: selectedMap.nodes,
                    edges: selectedMap.edges,
                },
            };
            const saved = isEditMode
                ? await warehouseApi.updateLayout(editWarehouseId, payload)
                : await warehouseApi.importWarehouse(payload);

            sessionStorage.removeItem(DRAFT_STORAGE_KEY);
            setIsDirty(false);
            navigate("/warehouse", {
                replace: true,
                state: {
                    selectedWarehouseId:
                        saved?.warehouseId ?? (isEditMode ? editWarehouseId : null),
                },
            });
        } catch (error) {
            setSaveError(error.message || "창고 생성에 실패했습니다.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="warehouse-create-page">
            <header className="warehouse-create-page-header">
                <div>
                    <button type="button" className="warehouse-create-back" onClick={leavePage}>
                        ← 창고 목록
                    </button>
                    <div className="warehouse-create-title">
                        <span>WAREHOUSE BUILDER</span>
                        <h1>{isEditMode ? "창고 지도 수정" : "새 창고 설계"}</h1>
                        <p>
                            {isEditMode
                                ? "현재 저장된 시설물·노드·엣지를 불러왔습니다. 아이콘을 옮기거나 연결을 수정하세요."
                                : "창고 크기를 정한 뒤 시설물과 노드를 배치하고 필요한 엣지를 연결하세요."}
                        </p>
                    </div>
                </div>

                <div className="warehouse-create-header-actions">
                    <button type="button" className="warehouse-create-cancel" onClick={leavePage}>
                        취소
                    </button>
                    <button
                        type="button"
                        className="warehouse-create-save"
                        disabled={!canSave}
                        onClick={handleSave}
                    >
                        {isSaving ? "저장 중..." : isEditMode ? "수정 저장" : "창고 생성"}
                    </button>
                </div>
            </header>

            <section className="warehouse-create-basic-card">
                <div className="warehouse-create-section-heading">
                    <span>01</span>
                    <div>
                        <h2>기본 정보</h2>
                        <p>가로·세로 크기는 아래 설계 캔버스에 즉시 반영됩니다.</p>
                    </div>
                </div>

                <div className="warehouse-create-form-grid">
                    <label>
                        <span>창고명 *</span>
                        <input name="name" value={form.name} onChange={handleFormChange} placeholder="예: 수도권 풀필먼트 A" />
                    </label>
                    <label>
                        <span>위치 *</span>
                        <input name="location" value={form.location} onChange={handleFormChange} placeholder="예: 경기도 성남시" />
                    </label>
                    <label>
                        <span>가로 (m) *</span>
                        <input type="number" min="1" name="width" value={form.width} onChange={handleFormChange} placeholder="50" />
                    </label>
                    <label>
                        <span>세로 (m) *</span>
                        <input type="number" min="1" name="height" value={form.height} onChange={handleFormChange} placeholder="30" />
                    </label>
                    <label>
                        <span>운영 상태</span>
                        <select name="status" value={form.status} onChange={handleFormChange}>
                            <option value="ACTIVE">운영 중</option>
                            <option value="MAINTENANCE">점검 중</option>
                            <option value="INACTIVE">비활성</option>
                        </select>
                    </label>
                    <label>
                        <span>설명</span>
                        <input name="description" value={form.description} onChange={handleFormChange} placeholder="창고 용도나 특징을 입력하세요." />
                    </label>
                </div>
            </section>

            <section className="warehouse-create-design-card">
                <div className="warehouse-create-design-header">
                    <div className="warehouse-create-section-heading">
                        <span>02</span>
                        <div>
                            <h2>창고 지도</h2>
                            <p>시설물과 경로 노드를 배치한 뒤 엣지 도구로 연결할 노드 두 개를 선택하세요.</p>
                        </div>
                    </div>

                    <div className="warehouse-create-source-tabs" role="tablist" aria-label="창고 지도 생성 방식">
                        <button
                            type="button"
                            className={creationSource === "DESIGN" ? "active" : ""}
                            onClick={() => changeCreationSource("DESIGN")}
                        >
                            직접 설계
                        </button>
                        <button
                            type="button"
                            className={creationSource === "JSON" ? "active" : ""}
                            onClick={() => changeCreationSource("JSON")}
                        >
                            JSON 가져오기
                        </button>
                    </div>
                </div>

                {isLoadingExisting ? (
                    <div className="warehouse-create-loading">
                        기존 창고 지도와 로봇 위치를 불러오는 중입니다.
                    </div>
                ) : creationSource === "DESIGN" ? (
                    <WarehouseLayoutEditor
                        key={isEditMode ? `warehouse-edit-${editWarehouseId}` : "warehouse-create"}
                        width={form.width}
                        height={form.height}
                        title={form.name}
                        initialDraft={layoutDraft}
                        onChange={handleDesignedLayoutChange}
                        onDraftChange={handleLayoutDraftChange}
                        existingMapMode={isEditMode}
                    />
                ) : (
                    <div className="warehouse-create-json-panel">
                        <label htmlFor="warehouse-create-json">지도 JSON 파일 선택</label>
                        <input
                            id="warehouse-create-json"
                            type="file"
                            accept=".json,application/json"
                            onChange={handleJsonFileChange}
                        />
                        {jsonError && <p className="warehouse-create-error">{jsonError}</p>}
                        {uploadedMapData && (
                            <div className="warehouse-create-json-preview">
                                <div>
                                    <strong>{jsonFileName || "임시 저장된 JSON 지도"}</strong>
                                    <span>
                                        노드 {uploadedMapData.nodes.length}개 · 엣지 {uploadedMapData.edges.length}개
                                    </span>
                                </div>
                                <WarehouseMapPreview mapData={uploadedMapData} compact />
                            </div>
                        )}
                    </div>
                )}

                {saveError && <p className="warehouse-create-error save-error">{saveError}</p>}
            </section>

            <footer className="warehouse-create-footer">
                <span>
                    {canSave
                        ? "필수 정보와 지도 검증이 완료되었습니다."
                        : "기본 정보 입력과 지도 검증을 완료하면 창고를 생성할 수 있습니다."}
                </span>
                <div>
                    <button type="button" className="warehouse-create-cancel" onClick={leavePage}>취소</button>
                    <button type="button" className="warehouse-create-save" disabled={!canSave} onClick={handleSave}>
                        {isSaving ? "저장 중..." : isEditMode ? "수정 저장" : "창고 생성"}
                    </button>
                </div>
            </footer>
        </div>
    );
}

export default WarehouseCreate;
