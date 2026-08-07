import { useEffect, useState } from "react";
import { warehouseApi } from "../../api/client";
import "../../styles/scenario/ScenarioCreatePanel.css";

// 생성 또는 수정 모드의 초기 입력값을 만든다.
const createInitialFormData = (initialScenario) => ({
    name: initialScenario?.name ?? "",
    description: initialScenario?.description ?? "",
    warehouseId:
        initialScenario?.warehouseId != null
            ? String(initialScenario.warehouseId)
            : "",
    initialBattery: initialScenario?.initialBattery ?? 100,
    chargeThreshold: initialScenario?.chargeThreshold ?? 20,
});

// 백엔드 창고 응답을 select 옵션 형태로 변환한다.
const createWarehouseOption = (warehouse) => {
    if (warehouse?.id == null) {
        return null;
    }

    const name = warehouse.name?.trim() || `창고 ${warehouse.id}`;
    const location = warehouse.location?.trim() || "위치 미지정";

    return {
        value: String(warehouse.id),
        label: `${name} (${location})`,
        name,
        location,
        status: warehouse.status,
    };
};

// 숫자형 창고 ID는 숫자로, 그 외 ID는 문자열로 유지한다.
const normalizeWarehouseId = (warehouseId) => {
    const numericWarehouseId = Number(warehouseId);

    return Number.isNaN(numericWarehouseId)
        ? warehouseId
        : numericWarehouseId;
};

function ScenarioCreatePanel({
    mode = "create",
    initialScenario = null,
    onClose,
    onSubmit,
}) {
    const isEditMode = mode === "edit";

    const [formData, setFormData] = useState(() =>
        createInitialFormData(initialScenario)
    );
    const [errors, setErrors] = useState({});

    const [warehouseOptions, setWarehouseOptions] = useState([]);
    const [isWarehouseLoading, setIsWarehouseLoading] = useState(true);
    const [warehouseLoadError, setWarehouseLoadError] = useState("");

    // ESC 키로 열려 있는 생성/수정 패널을 닫는다.
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    // 패널이 열리면 백엔드에 등록된 창고 목록을 조회한다.
    useEffect(() => {
        let isCancelled = false;

        const loadWarehouses = async () => {
            try {
                setIsWarehouseLoading(true);
                setWarehouseLoadError("");

                const response = await warehouseApi.getAll();
                const options = (Array.isArray(response) ? response : [])
                    .map(createWarehouseOption)
                    .filter(Boolean);

                const existingWarehouseId =
                    initialScenario?.warehouseId != null
                        ? String(initialScenario.warehouseId)
                        : "";

                // 수정 화면에서는 API 목록에 없는 기존 창고 정보도 유지한다.
                if (
                    existingWarehouseId &&
                    !options.some(
                        (warehouse) =>
                            warehouse.value === existingWarehouseId
                    )
                ) {
                    const existingWarehouseName =
                        initialScenario?.warehouseName ?? "기존 창고";
                    const existingWarehouseLocation =
                        initialScenario?.warehouseLocation ?? "";

                    options.unshift({
                        value: existingWarehouseId,
                        label: existingWarehouseLocation
                            ? `${existingWarehouseName} (${existingWarehouseLocation})`
                            : existingWarehouseName,
                        name: existingWarehouseName,
                        location: existingWarehouseLocation,
                        status: null,
                    });
                }

                if (isCancelled) {
                    return;
                }

                setWarehouseOptions(options);

                // 생성 모드에서는 첫 번째 활성 창고를 기본값으로 사용한다.
                const firstAvailableWarehouse = options.find(
                    (warehouse) => warehouse.status !== "INACTIVE"
                );

                setFormData((previousData) => ({
                    ...previousData,
                    warehouseId:
                        previousData.warehouseId ||
                        firstAvailableWarehouse?.value ||
                        "",
                }));
            } catch (error) {
                if (isCancelled) {
                    return;
                }

                console.error("창고 목록 조회 실패:", error);
                setWarehouseOptions([]);
                setWarehouseLoadError(
                    "창고 목록을 불러오지 못했습니다."
                );
            } finally {
                if (!isCancelled) {
                    setIsWarehouseLoading(false);
                }
            }
        };

        loadWarehouses();

        return () => {
            isCancelled = true;
        };
    }, [
        initialScenario?.warehouseId,
        initialScenario?.warehouseName,
        initialScenario?.warehouseLocation,
    ]);

    // 일반 입력값을 변경한다.
    const handleInputChange = (event) => {
        const { name, value } = event.target;

        setFormData((previousData) => ({
            ...previousData,
            [name]: value,
        }));

        setErrors((previousErrors) => ({
            ...previousErrors,
            [name]: "",
        }));
    };

    // 숫자 입력값을 변경한다.
    const handleNumberChange = (event) => {
        const { name, value } = event.target;

        setFormData((previousData) => ({
            ...previousData,
            [name]: value === "" ? "" : Number(value),
        }));

        setErrors((previousErrors) => ({
            ...previousErrors,
            [name]: "",
        }));
    };

    // 필수 입력값과 배터리 범위를 검증한다.
    const validateForm = () => {
        const nextErrors = {};

        if (!formData.name.trim()) {
            nextErrors.name = "시나리오명을 입력해주세요.";
        }

        if (!formData.warehouseId) {
            nextErrors.warehouseId = "창고를 선택해주세요.";
        }

        if (
            formData.initialBattery === "" ||
            formData.initialBattery < 0 ||
            formData.initialBattery > 100
        ) {
            nextErrors.initialBattery =
                "초기 배터리는 0~100 사이로 입력해주세요.";
        }

        if (
            formData.chargeThreshold === "" ||
            formData.chargeThreshold < 0 ||
            formData.chargeThreshold > 100
        ) {
            nextErrors.chargeThreshold =
                "충전 기준은 0~100 사이로 입력해주세요.";
        }

        if (
            Number(formData.chargeThreshold) >=
            Number(formData.initialBattery)
        ) {
            nextErrors.chargeThreshold =
                "충전 기준은 초기 배터리보다 작아야 합니다.";
        }

        setErrors(nextErrors);

        return Object.keys(nextErrors).length === 0;
    };

    // 검증된 시나리오 정보를 부모 컴포넌트로 전달한다.
    const handleSubmit = (event) => {
        event.preventDefault();

        if (!validateForm()) {
            return;
        }

        const selectedWarehouse = warehouseOptions.find(
            (warehouse) =>
                warehouse.value === String(formData.warehouseId)
        );

        if (!selectedWarehouse) {
            setErrors((previousErrors) => ({
                ...previousErrors,
                warehouseId: "유효한 창고를 선택해주세요.",
            }));
            return;
        }

        onSubmit({
            name: formData.name.trim(),
            description: formData.description.trim(),
            // 백엔드 관계 연결 기준은 warehouseId이다.
            warehouseId: normalizeWarehouseId(selectedWarehouse.value),
            // 목록과 상세 화면 표시에 필요한 창고 정보이다.
            warehouseName: selectedWarehouse.name,
            warehouseLocation: selectedWarehouse.location,
            initialBattery: Number(formData.initialBattery),
            chargeThreshold: Number(formData.chargeThreshold),
        });
    };

    return (
        <form
            className="scenario-create-panel"
            onSubmit={handleSubmit}
            aria-labelledby="scenario-create-title"
        >
            {/* 패널 상단 */}
                <header className="scenario-create-panel-header">
                    <div>
                        <h2 id="scenario-create-title">
                            {isEditMode
                                ? "시나리오 수정"
                                : "새 시나리오 추가"}
                        </h2>

                        <p>
                            {isEditMode
                                ? "선택한 시나리오의 기본 조건을 수정합니다."
                                : "시뮬레이션에 사용할 기본 조건을 설정합니다."}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="scenario-create-close-button"
                        onClick={onClose}
                        aria-label="패널 닫기"
                    >
                        ×
                    </button>
                </header>

                {/* 패널 입력 영역 */}
                <div className="scenario-create-panel-body">
                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading scenario-create-section-heading-simple">
                            <div>
                                <h3>기본 정보</h3>
                                <p>
                                    시나리오 이름과 적용할 창고를 설정합니다.
                                </p>
                            </div>
                        </div>

                        <div className="scenario-create-info-grid">
                            <label className="scenario-create-field">
                                <span>
                                    시나리오명
                                    <em>*</em>
                                </span>

                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    placeholder="시나리오명을 입력해주세요."
                                    onChange={handleInputChange}
                                    autoFocus
                                    className={
                                        errors.name ? "is-error" : ""
                                    }
                                />

                                {errors.name && (
                                    <small className="scenario-create-error">
                                        {errors.name}
                                    </small>
                                )}
                            </label>

                            <label className="scenario-create-field">
                                <span>
                                    창고 선택
                                    <em>*</em>
                                </span>

                                <div className="scenario-create-warehouse-select">
                                    <span aria-hidden="true">▣</span>

                                    <select
                                        name="warehouseId"
                                        value={formData.warehouseId}
                                        onChange={handleInputChange}
                                        disabled={
                                            isWarehouseLoading ||
                                            warehouseOptions.length === 0
                                        }
                                        className={
                                            errors.warehouseId
                                                ? "is-error"
                                                : ""
                                        }
                                    >
                                        <option value="">
                                            {isWarehouseLoading
                                                ? "창고 목록 불러오는 중..."
                                                : warehouseOptions.length === 0
                                                  ? "등록된 창고가 없습니다."
                                                  : "창고를 선택해주세요."}
                                        </option>

                                        {warehouseOptions.map(
                                            (warehouse) => {
                                                const isInactive =
                                                    warehouse.status ===
                                                    "INACTIVE";
                                                const isCurrentWarehouse =
                                                    warehouse.value ===
                                                    formData.warehouseId;

                                                return (
                                                    <option
                                                        key={warehouse.value}
                                                        value={warehouse.value}
                                                        disabled={
                                                            isInactive &&
                                                            !isCurrentWarehouse
                                                        }
                                                    >
                                                        {warehouse.label}
                                                        {isInactive
                                                            ? " - 비활성"
                                                            : ""}
                                                    </option>
                                                );
                                            }
                                        )}
                                    </select>
                                </div>

                                {errors.warehouseId && (
                                    <small className="scenario-create-error">
                                        {errors.warehouseId}
                                    </small>
                                )}

                                {warehouseLoadError && (
                                    <small className="scenario-create-error">
                                        {warehouseLoadError}
                                    </small>
                                )}
                            </label>

                            <label className="scenario-create-field scenario-create-description-field scenario-create-full-field">
                                <span>설명</span>

                                <textarea
                                    name="description"
                                    value={formData.description}
                                    placeholder="시나리오의 목적이나 조건을 간단히 입력해주세요."
                                    onChange={handleInputChange}
                                    rows={4}
                                />
                            </label>
                        </div>
                    </section>

                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading scenario-create-section-heading-simple">
                            <div>
                                <h3>배터리 설정</h3>
                                <p>
                                    시뮬레이션 시작 배터리와 충전 전환 기준을 설정합니다.
                                </p>
                            </div>
                        </div>

                        <div className="scenario-create-battery-grid">
                            <label className="scenario-create-field scenario-create-setting-card">
                                <span>
                                    초기 배터리
                                    <em>*</em>
                                </span>

                                <div className="scenario-create-suffix-input">
                                    <input
                                        type="number"
                                        name="initialBattery"
                                        value={formData.initialBattery}
                                        min="0"
                                        max="100"
                                        onChange={handleNumberChange}
                                        className={
                                            errors.initialBattery
                                                ? "is-error"
                                                : ""
                                        }
                                    />

                                    <span>%</span>
                                </div>

                                <small className="scenario-create-help">
                                    모든 로봇이 이 값으로 시뮬레이션을 시작합니다.
                                </small>

                                {errors.initialBattery && (
                                    <small className="scenario-create-error">
                                        {errors.initialBattery}
                                    </small>
                                )}
                            </label>

                            <label className="scenario-create-field scenario-create-setting-card">
                                <span>
                                    배터리 충전 기준
                                    <em>*</em>
                                </span>

                                <div className="scenario-create-suffix-input">
                                    <input
                                        type="number"
                                        name="chargeThreshold"
                                        value={formData.chargeThreshold}
                                        min="0"
                                        max="100"
                                        onChange={handleNumberChange}
                                        className={
                                            errors.chargeThreshold
                                                ? "is-error"
                                                : ""
                                        }
                                    />

                                    <span>%</span>
                                </div>

                                <small className="scenario-create-help">
                                    이 값 이하가 되면 충전 작업으로 전환합니다.
                                </small>

                                {errors.chargeThreshold && (
                                    <small className="scenario-create-error">
                                        {errors.chargeThreshold}
                                    </small>
                                )}
                            </label>
                        </div>
                    </section>
                </div>

                {/* 패널 하단 */}
                <footer className="scenario-create-panel-footer">
                    <span className="scenario-create-required-note">
                        <em>*</em>
                        필수 입력 항목
                    </span>

                    <div className="scenario-create-footer-actions">
                        <button
                            type="button"
                            className="scenario-create-cancel-button"
                            onClick={onClose}
                        >
                            취소
                        </button>

                        <button
                            type="submit"
                            className="scenario-create-submit-button"
                            disabled={
                                isWarehouseLoading ||
                                warehouseOptions.length === 0
                            }
                        >
                            {isEditMode ? "수정 저장" : "저장"}
                        </button>
                    </div>
                </footer>
        </form>
    );
}

export default ScenarioCreatePanel;
