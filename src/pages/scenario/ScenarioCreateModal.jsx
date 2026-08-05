import { useEffect, useState } from "react";
import { warehouseApi } from "../../api/client";
import "../../styles/scenario/ScenarioCreateModal.css";

/** 시나리오에서 사용할 수 있는 로봇 유형 */
const ROBOT_TYPE_OPTIONS = [
    { value: "입고", label: "입고", symbol: "⇩" },
    { value: "출고", label: "출고", symbol: "⇧" },
    { value: "보충", label: "보충", symbol: "◇" },
    { value: "충전", label: "충전", symbol: "ϟ" },
    { value: "재배치", label: "재배치", symbol: "↻" },
];

/** 예외 발생 시 적용할 재계획 방식 */
const REPLAN_METHOD_OPTIONS = [
    {
        value: "AFFECTED_TASKS_ONLY",
        label: "영향받은 작업만 재계획",
    },
    {
        value: "ALL_TASKS",
        label: "전체 작업 재계획",
    },
    {
        value: "PATH_ONLY",
        label: "경로만 재계산",
    },
];

/**
 * 상품 입력값에 화면 렌더링용 고유 ID를 추가합니다.
 *
 * productCode는 백엔드에서 생성하거나 조회한 값을 사용할 수 있도록
 * 기존 값이 있을 때만 유지합니다. 새 상품은 productName만 입력합니다.
 */
const createProductField = (product = {}, index = 0) => ({
    ...product,
    fieldId: `${
        product.productCode ?? product.id ?? "new"
    }-${index}-${Date.now()}-${Math.random()}`,
    productName: product.productName ?? "",
    productCode: product.productCode ?? null,
});

/** 생성 또는 수정 모드의 초기 입력값을 만듭니다. */
const createInitialFormData = (initialScenario) => ({
    name: initialScenario?.name ?? "",
    description: initialScenario?.description ?? "",
    warehouseId:
        initialScenario?.warehouseId != null
            ? String(initialScenario.warehouseId)
            : "",
    robotTypes: initialScenario?.robotTypes ?? [
        "입고",
        "출고",
        "보충",
        "재배치",
    ],
    initialBattery: initialScenario?.initialBattery ?? 100,
    chargeThreshold: initialScenario?.chargeThreshold ?? 20,
    replanMethod:
        initialScenario?.replanMethod ?? "AFFECTED_TASKS_ONLY",
    products: (initialScenario?.products ?? []).map(
        createProductField
    ),
});

/** 백엔드 창고 응답을 select 옵션 형태로 변환합니다. */
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

/** 숫자형 창고 ID는 숫자로, 그 외 ID는 문자열로 유지합니다. */
const normalizeWarehouseId = (warehouseId) => {
    const numericWarehouseId = Number(warehouseId);

    return Number.isNaN(numericWarehouseId)
        ? warehouseId
        : numericWarehouseId;
};

function ScenarioCreateModal({
    mode = "create",
    initialScenario = null,
    onClose,
    onSubmit,
}) {
    const isEditMode = mode === "edit";

    const [formData, setFormData] = useState(() =>
        createInitialFormData(initialScenario)
    );
    const [productInput, setProductInput] = useState("");
    const [errors, setErrors] = useState({});

    const [warehouseOptions, setWarehouseOptions] = useState([]);
    const [isWarehouseLoading, setIsWarehouseLoading] = useState(true);
    const [warehouseLoadError, setWarehouseLoadError] = useState("");

    /** 모달이 열려 있는 동안 배경 스크롤을 막고 ESC로 닫습니다. */
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = "hidden";

        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    /** 모달이 열리면 백엔드에 등록된 창고 목록을 조회합니다. */
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

                // 목업 시나리오의 창고 ID가 API 목록에 없더라도
                // 수정 화면에서는 기존 창고 정보를 유지합니다.
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

                // 생성 모드에서는 조회된 첫 번째 활성 창고를 기본값으로 사용합니다.
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

    /**
     * 일반 입력값을 변경합니다.
     */
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

    /**
     * 숫자 입력값을 변경합니다.
     */
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

    /**
     * 로봇 유형을 선택하거나 선택 해제합니다.
     */
    const handleRobotTypeToggle = (robotType) => {
        setFormData((previousData) => {
            const isSelected =
                previousData.robotTypes.includes(robotType);

            return {
                ...previousData,
                robotTypes: isSelected
                    ? previousData.robotTypes.filter(
                        (type) => type !== robotType
                    )
                    : [...previousData.robotTypes, robotType],
            };
        });

        setErrors((previousErrors) => ({
            ...previousErrors,
            robotTypes: "",
        }));
    };

    /**
     * 입력한 상품명을 시나리오 상품 목록에 추가합니다.
     *
     * 사용자는 상품명만 입력하며 productCode는 만들지 않습니다.
     * 상품 코드는 백엔드에서 상품을 조회하거나 생성한 뒤 결정합니다.
     */
    const handleAddProduct = () => {
        const trimmedProductName = productInput.trim();

        if (!trimmedProductName) {
            return;
        }

        const duplicatedProduct = formData.products.some(
            (product) =>
                product.productName.toLowerCase() ===
                trimmedProductName.toLowerCase()
        );

        if (duplicatedProduct) {
            setErrors((previousErrors) => ({
                ...previousErrors,
                products: "이미 등록된 상품입니다.",
            }));
            return;
        }

        setFormData((previousData) => ({
            ...previousData,
            products: [
                ...previousData.products,
                createProductField({
                    productName: trimmedProductName,
                }),
            ],
        }));

        setProductInput("");

        setErrors((previousErrors) => ({
            ...previousErrors,
            products: "",
        }));
    };

    /** 선택한 상품을 시나리오 상품 목록에서 제거합니다. */
    const handleRemoveProduct = (fieldId) => {
        setFormData((previousData) => ({
            ...previousData,
            products: previousData.products.filter(
                (product) => product.fieldId !== fieldId
            ),
        }));
    };

    /**
     * 필수 입력값과 배터리 범위를 검증합니다.
     */
    const validateForm = () => {
        const nextErrors = {};

        if (!formData.name.trim()) {
            nextErrors.name = "시나리오명을 입력해주세요.";
        }

        if (!formData.warehouseId) {
            nextErrors.warehouseId = "창고를 선택해주세요.";
        }

        if (formData.robotTypes.length === 0) {
            nextErrors.robotTypes =
                "로봇 유형을 한 개 이상 선택해주세요.";
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

        if (!formData.replanMethod) {
            nextErrors.replanMethod =
                "재계획 방식을 선택해주세요.";
        }

        const validProducts = formData.products.filter(
            (product) => product.productName.trim()
        );

        if (validProducts.length === 0) {
            nextErrors.products =
                "상품을 한 개 이상 입력해주세요.";
        }

        setErrors(nextErrors);

        return Object.keys(nextErrors).length === 0;
    };

    /** 검증된 시나리오 정보를 부모 컴포넌트로 전달합니다. */
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

        /**
         * 입력 화면의 fieldId는 제거하고 상품명만 필수로 전달합니다.
         *
         * 수정 중인 상품에 productCode가 이미 존재하면 화면 데이터 유지를
         * 위해 함께 전달하지만, 새 상품에는 임시 코드를 생성하지 않습니다.
         */
        const validProducts = formData.products
            .filter((product) => product.productName.trim())
            .map((product) => {
                const normalizedProduct = {
                    productName: product.productName.trim(),
                };

                return product.productCode
                    ? {
                        ...normalizedProduct,
                        productCode: product.productCode,
                    }
                    : normalizedProduct;
            });

        onSubmit({
            name: formData.name.trim(),
            description: formData.description.trim(),
            // 백엔드 관계 연결 기준은 warehouseId입니다.
            warehouseId: normalizeWarehouseId(selectedWarehouse.value),
            // 현재 목록과 상세 화면 표시에 필요한 창고 정보입니다.
            warehouseName: selectedWarehouse.name,
            warehouseLocation: selectedWarehouse.location,
            robotTypes: formData.robotTypes,
            initialBattery: Number(formData.initialBattery),
            chargeThreshold: Number(formData.chargeThreshold),
            replanMethod: formData.replanMethod,
            products: validProducts,
        });
    };

    /**
     * 어두운 배경 영역을 직접 클릭한 경우 팝업을 닫습니다.
     */
    const handleOverlayMouseDown = (event) => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };


    return (
        <div
            className="scenario-create-modal-overlay"
            onMouseDown={handleOverlayMouseDown}
        >
            <form
                className="scenario-create-modal"
                onSubmit={handleSubmit}
                role="dialog"
                aria-modal="true"
                aria-labelledby="scenario-create-title"
            >
                {/* 팝업 상단 */}
                <header className="scenario-create-modal-header">
                    <div>
                        <h2 id="scenario-create-title">
                            {isEditMode
                                ? "시나리오 수정"
                                : "새 시나리오 추가"}
                        </h2>

                        <p>
                            {isEditMode
                                ? "선택한 시나리오의 조건과 품목을 수정합니다."
                                : "시뮬레이션에 사용할 조건과 품목을 설정합니다."}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="scenario-create-close-button"
                        onClick={onClose}
                        aria-label="팝업 닫기"
                    >
                        ×
                    </button>
                </header>

                {/* 팝업 입력 영역 */}
                <div className="scenario-create-modal-body">
                    {/* 1. 기본 정보 */}
                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading">
                            <span className="scenario-create-step-number">
                                1
                            </span>

                            <div>
                                <h3>기본 정보</h3>
                            </div>
                        </div>

                        <div className="scenario-create-basic-grid">
                            <div className="scenario-create-basic-left">
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
                                            errors.name
                                                ? "is-error"
                                                : ""
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
                                        <span aria-hidden="true">
                                            ▣
                                        </span>

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
                                                            key={
                                                                warehouse.value
                                                            }
                                                            value={
                                                                warehouse.value
                                                            }
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
                            </div>

                            <label className="scenario-create-field scenario-create-description-field">
                                <span>설명</span>

                                <textarea
                                    name="description"
                                    value={formData.description}
                                    placeholder="시나리오의 목적과 조건을 입력해주세요."
                                    onChange={handleInputChange}
                                    rows={4}
                                />
                            </label>
                        </div>
                    </section>

                    {/* 2. 로봇 유형 */}
                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading">
                            <span className="scenario-create-step-number">
                                2
                            </span>

                            <div>
                                <h3>로봇 유형 선택</h3>

                                <p>
                                    시나리오에서 사용할 로봇 유형을
                                    선택합니다.
                                </p>
                            </div>
                        </div>

                        <div className="scenario-create-robot-grid">
                            {ROBOT_TYPE_OPTIONS.map((robotType) => {
                                const isSelected =
                                    formData.robotTypes.includes(
                                        robotType.value
                                    );

                                return (
                                    <button
                                        type="button"
                                        key={robotType.value}
                                        className={`scenario-create-robot-option ${
                                            isSelected ? "is-selected" : ""
                                        }`}
                                        onClick={() =>
                                            handleRobotTypeToggle(
                                                robotType.value
                                            )
                                        }
                                        aria-pressed={isSelected}
                                    >
                                        <span className="scenario-create-robot-check">
                                            {isSelected ? "✓" : ""}
                                        </span>

                                        <span
                                            className="scenario-create-robot-symbol"
                                            aria-hidden="true"
                                        >
                                            {robotType.symbol}
                                        </span>

                                        <strong>
                                            {robotType.label}
                                        </strong>
                                    </button>
                                );
                            })}
                        </div>

                        {errors.robotTypes && (
                            <small className="scenario-create-error scenario-create-section-error">
                                {errors.robotTypes}
                            </small>
                        )}
                    </section>

                    {/* 3. 배터리 및 재계획 설정 */}
                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading">
                            <span className="scenario-create-step-number">
                                3
                            </span>

                            <div>
                                <h3>배터리 및 재계획 설정</h3>

                                <p>
                                    초기 배터리, 충전 기준과 재계획
                                    방식을 설정합니다.
                                </p>
                            </div>
                        </div>

                        <div className="scenario-create-setting-grid">
                            <label className="scenario-create-field">
                                <span>
                                    초기 배터리
                                    <em>*</em>
                                </span>

                                <div className="scenario-create-suffix-input">
                                    <input
                                        type="number"
                                        name="initialBattery"
                                        value={
                                            formData.initialBattery
                                        }
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
                                    모든 로봇이 이 값으로
                                    시뮬레이션을 시작합니다.
                                </small>

                                {errors.initialBattery && (
                                    <small className="scenario-create-error">
                                        {errors.initialBattery}
                                    </small>
                                )}
                            </label>

                            <label className="scenario-create-field">
                                <span>
                                    배터리 충전 기준
                                    <em>*</em>
                                </span>

                                <div className="scenario-create-suffix-input">
                                    <input
                                        type="number"
                                        name="chargeThreshold"
                                        value={
                                            formData.chargeThreshold
                                        }
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
                                    이 값 이하가 되면 충전 작업으로
                                    전환합니다.
                                </small>

                                {errors.chargeThreshold && (
                                    <small className="scenario-create-error">
                                        {errors.chargeThreshold}
                                    </small>
                                )}
                            </label>

                            <label className="scenario-create-field">
                                <span>
                                    재계획 방식
                                    <em>*</em>
                                </span>

                                <select
                                    name="replanMethod"
                                    value={formData.replanMethod}
                                    onChange={handleInputChange}
                                    className={
                                        errors.replanMethod
                                            ? "is-error"
                                            : ""
                                    }
                                >
                                    {REPLAN_METHOD_OPTIONS.map(
                                        (method) => (
                                            <option
                                                key={method.value}
                                                value={method.value}
                                            >
                                                {method.label}
                                            </option>
                                        )
                                    )}
                                </select>

                                <small className="scenario-create-help">
                                    예외 발생 시 다시 계산할 작업
                                    범위를 선택합니다.
                                </small>

                                {errors.replanMethod && (
                                    <small className="scenario-create-error">
                                        {errors.replanMethod}
                                    </small>
                                )}
                            </label>
                        </div>
                    </section>

                    {/* 4. 시나리오 상품 */}
                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading">
                            <span className="scenario-create-step-number">
                                4
                            </span>

                            <div>
                                <h3>시나리오 상품 입력</h3>

                                <p>
                                    시뮬레이션에서 사용할 상품명을 등록합니다.
                                </p>
                            </div>
                        </div>

                        <div className="scenario-create-item-area">
                            {/* 상품명 입력 */}
                            <div className="scenario-create-item-input-row">
                                <input
                                    type="text"
                                    value={productInput}
                                    placeholder="상품명을 입력해주세요."
                                    onChange={(event) =>
                                        setProductInput(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            handleAddProduct();
                                        }
                                    }}
                                />

                                <button
                                    type="button"
                                    className="scenario-create-item-add-button"
                                    onClick={handleAddProduct}
                                >
                                    ＋ 상품 추가
                                </button>
                            </div>

                            {/* 등록된 상품 */}
                            <div className="scenario-create-item-result">
                                <div className="scenario-create-item-result-header">
                                    <span>등록 상품</span>

                                    <strong>{formData.products.length}개</strong>
                                </div>

                                {formData.products.length > 0 ? (
                                    <div className="scenario-create-item-chip-list">
                                        {formData.products.map((product) => (
                                            <div
                                                key={product.fieldId}
                                                className="scenario-create-item-chip"
                                            >
                                                <span>{product.productName}</span>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemoveProduct(product.fieldId)
                                                    }
                                                    aria-label={`${product.productName} 삭제`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="scenario-create-item-empty-text">
                                        등록된 상품이 없습니다.
                                    </p>
                                )}
                            </div>
                        </div>

                        {errors.products && (
                            <small className="scenario-create-error scenario-create-section-error">
                                {errors.products}
                            </small>
                        )}
                    </section>
                </div>

                {/* 팝업 하단 */}
                <footer className="scenario-create-modal-footer">
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
        </div>
    );
}

export default ScenarioCreateModal;