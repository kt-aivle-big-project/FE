import { useEffect, useState } from "react";
import "../../styles/scenario/ScenarioCreateModal.css";

/**
 * API 연결 전 창고 선택용 임시 데이터
 *
 * 추후 창고 조회 API 응답으로 교체합니다.
 */
const WAREHOUSE_OPTIONS = [
    {
        value: "WH-001",
        label: "A-1 센터 (서울)",
    },
    {
        value: "WH-002",
        label: "B-1 센터 (대전)",
    },
    {
        value: "WH-003",
        label: "C-1 센터 (광주)",
    },
];

/**
 * 시나리오에 포함할 수 있는 로봇 유형입니다.
 */
const ROBOT_TYPE_OPTIONS = [
    {
        value: "입고",
        label: "입고",
        symbol: "⇩",
    },
    {
        value: "출고",
        label: "출고",
        symbol: "⇧",
    },
    {
        value: "보충",
        label: "보충",
        symbol: "◇",
    },
    {
        value: "충전",
        label: "충전",
        symbol: "ϟ",
    },
    {
        value: "재배치",
        label: "재배치",
        symbol: "↻",
    },
];

/**
 * 예외 발생 시 사용할 재계획 방식입니다.
 */
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
 * 품목 데이터에 화면 입력용 고유 ID를 추가합니다.
 */
const createItemField = (item = {}, index = 0) => ({
    ...item,
    fieldId: `${item.id ?? "new"}-${index}-${Date.now()}-${Math.random()}`,
    itemName: item.itemName ?? "",
});

/**
 * 생성/수정 모드에 맞는 초기 입력값을 만듭니다.
 */
const createInitialFormData = (initialScenario) => {
    const matchedWarehouse = WAREHOUSE_OPTIONS.find(
        (warehouse) =>
            warehouse.value === initialScenario?.warehouseId ||
            warehouse.label === initialScenario?.warehouseName
    );

    return {
        name: initialScenario?.name ?? "",
        description: initialScenario?.description ?? "",
        warehouseId:
            matchedWarehouse?.value ?? WAREHOUSE_OPTIONS[0].value,
        robotTypes:
            initialScenario?.robotTypes ?? [
                "입고",
                "출고",
                "보충",
                "재배치",
            ],
        initialBattery: initialScenario?.initialBattery ?? 100,
        chargeThreshold: initialScenario?.chargeThreshold ?? 20,
        replanMethod:
            initialScenario?.replanMethod ?? "AFFECTED_TASKS_ONLY",
        items: (initialScenario?.items ?? []).map(createItemField),
    };
};

function ScenarioCreateModal({
    mode = "create",
    initialScenario = null,
    onClose,
    onSubmit,
}) {
    const isEditMode = mode === "edit";

    const [itemInput, setItemInput] = useState("");

    const [formData, setFormData] = useState(() =>
        createInitialFormData(initialScenario)
    );

    const [errors, setErrors] = useState({});

    /**
     * 팝업이 열려 있는 동안 배경 스크롤을 막고,
     * ESC 키를 누르면 팝업을 닫습니다.
     */
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
 * 입력한 품목을 목록에 추가합니다.
 */
    const handleAddItem = () => {
        const trimmedItemName = itemInput.trim();

        if (!trimmedItemName) {
            return;
        }

        const duplicatedItem = formData.items.some(
            (item) =>
                item.itemName.toLowerCase() ===
                trimmedItemName.toLowerCase()
        );

        if (duplicatedItem) {
            setErrors((previousErrors) => ({
                ...previousErrors,
                items: "이미 등록된 품목입니다.",
            }));

            return;
        }

        setFormData((previousData) => ({
            ...previousData,
            items: [
                ...previousData.items,
                createItemField({
                    itemName: trimmedItemName,
                }),
            ],
        }));

        setItemInput("");

        setErrors((previousErrors) => ({
            ...previousErrors,
            items: "",
        }));
    };

    /**
     * 선택한 품목 입력 행을 삭제합니다.
     */
    const handleRemoveItem = (fieldId) => {
        setFormData((previousData) => ({
            ...previousData,
            items: previousData.items.filter(
                (item) => item.fieldId !== fieldId
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

        const validItems = formData.items.filter((item) =>
            item.itemName.trim()
        );

        if (validItems.length === 0) {
            nextErrors.items = "품목을 한 개 이상 입력해주세요.";
        }

        setErrors(nextErrors);

        return Object.keys(nextErrors).length === 0;
    };

    /**
     * 입력한 시나리오 정보를 부모 컴포넌트로 전달합니다.
     */
    const handleSubmit = (event) => {
        event.preventDefault();

        if (!validateForm()) {
            return;
        }

        const selectedWarehouse =
            WAREHOUSE_OPTIONS.find(
                (warehouse) =>
                    warehouse.value === formData.warehouseId
            ) ?? WAREHOUSE_OPTIONS[0];

        const validItems = formData.items
            .filter((item) => item.itemName.trim())
            .map((item, index) => {
                const { fieldId, ...itemData } = item;

                return {
                    ...itemData,
                    id: item.id ?? index + 1,

                    /**
                     * 기존 품목은 코드를 유지하고,
                     * 새 품목만 화면 확인용 임시 코드를 생성합니다.
                     */
                    itemCode:
                        item.itemCode ??
                        `ITEM-${String(index + 1).padStart(3, "0")}`,
                    itemName: item.itemName.trim(),
                };
            });

        onSubmit({
            name: formData.name.trim(),
            description: formData.description.trim(),
            warehouseId: selectedWarehouse.value,
            warehouseName: selectedWarehouse.label,
            robotTypes: formData.robotTypes,
            initialBattery: Number(formData.initialBattery),
            chargeThreshold: Number(formData.chargeThreshold),
            replanMethod: formData.replanMethod,
            items: validItems,
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
                                            value={
                                                formData.warehouseId
                                            }
                                            onChange={
                                                handleInputChange
                                            }
                                            className={
                                                errors.warehouseId
                                                    ? "is-error"
                                                    : ""
                                            }
                                        >
                                            {WAREHOUSE_OPTIONS.map(
                                                (warehouse) => (
                                                    <option
                                                        key={
                                                            warehouse.value
                                                        }
                                                        value={
                                                            warehouse.value
                                                        }
                                                    >
                                                        {
                                                            warehouse.label
                                                        }
                                                    </option>
                                                )
                                            )}
                                        </select>
                                    </div>

                                    {errors.warehouseId && (
                                        <small className="scenario-create-error">
                                            {errors.warehouseId}
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
                                        className={`scenario-create-robot-option ${isSelected
                                            ? "is-selected"
                                            : ""
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

                    {/* 4. 시나리오 품목 */}
                    <section className="scenario-create-section">
                        <div className="scenario-create-section-heading">
                            <span className="scenario-create-step-number">
                                4
                            </span>

                            <div>
                                <h3>시나리오 품목 입력</h3>

                                <p>
                                    시뮬레이션에서 사용할 품목명을 등록합니다.
                                </p>
                            </div>
                        </div>

                        <div className="scenario-create-item-area">
                            {/* 품목 입력 */}
                            <div className="scenario-create-item-input-row">
                                <input
                                    type="text"
                                    value={itemInput}
                                    placeholder="품목명을 입력해주세요."
                                    onChange={(event) =>
                                        setItemInput(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            handleAddItem();
                                        }
                                    }}
                                />

                                <button
                                    type="button"
                                    className="scenario-create-item-add-button"
                                    onClick={handleAddItem}
                                >
                                    ＋ 품목 추가
                                </button>
                            </div>

                            {/* 등록된 품목 */}
                            <div className="scenario-create-item-result">
                                <div className="scenario-create-item-result-header">
                                    <span>등록 품목</span>

                                    <strong>{formData.items.length}개</strong>
                                </div>

                                {formData.items.length > 0 ? (
                                    <div className="scenario-create-item-chip-list">
                                        {formData.items.map((item) => (
                                            <div
                                                key={item.fieldId}
                                                className="scenario-create-item-chip"
                                            >
                                                <span>{item.itemName}</span>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemoveItem(item.fieldId)
                                                    }
                                                    aria-label={`${item.itemName} 삭제`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="scenario-create-item-empty-text">
                                        등록된 품목이 없습니다.
                                    </p>
                                )}
                            </div>
                        </div>

                        {errors.items && (
                            <small className="scenario-create-error scenario-create-section-error">
                                {errors.items}
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