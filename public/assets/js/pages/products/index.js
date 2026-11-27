
const PRODUCT_API = "/api/products";
const CATALOG_API = "/api/catalog";
const AI_API = "/api/ai/products";

const PAGE_LIMIT = 20;

export async function renderProductsPage(container) {
    if (!(container instanceof HTMLElement)) {
        throw new Error("Product container element is required");
    }

    const state = {
        products: [],
        collections: [],
        pagination: {
            limit: PAGE_LIMIT,
            hasMore: false,
            nextCursor: null
        },
        status: "",
        collectionId: "",
        categoryId: "",
        cursor: "",
        loading: false,
        saving: false,
        editingProduct: null,
        error: "",
        success: ""
    };

    // =====================================
    // HELPERS
    // =====================================

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function money(value) {
        return Number(value || 0).toLocaleString("en-BD", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }

    function generateId() {
        if (crypto.randomUUID) {
            return crypto.randomUUID();
        }

        return `variant-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`;
    }

    async function api(method, url, body) {
        const response = await fetch(url, {
            method,
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            ...(body !== undefined
                ? { body: JSON.stringify(body) }
                : {})
        });

        let result;

        try {
            result = await response.json();
        } catch {
            throw new Error("Invalid server response");
        }

        if (!response.ok || !result.success) {
            throw new Error(
                result.message ||
                `Request failed: ${response.status}`
            );
        }

        return result;
    }

    function showMessage(message, type = "success") {
        state.error = type === "error" ? message : "";
        state.success = type === "success" ? message : "";

        const element = container.querySelector(
            "#products-message"
        );

        if (!element) return;

        element.textContent = message;
        element.className = `products-message ${type}`;
        element.hidden = !message;
    }

    function getActiveCollections() {
        return state.collections.filter(
            collection => collection.active !== false
        );
    }

    function getCategories(collectionId) {
        const collection = state.collections.find(
            item => item.id === collectionId
        );

        return (collection?.categories || []).filter(
            category => category.active !== false
        );
    }

    function getSubcategories(collectionId, categoryId) {
        const category = getCategories(collectionId).find(
            item => item.id === categoryId
        );

        return (category?.subcategories || []).filter(
            item => item.active !== false
        );
    }

    function getCollectionName(id) {
        return state.collections.find(
            item => item.id === id
        )?.name || "—";
    }

    function getCategoryName(collectionId, categoryId) {
        return getCategories(collectionId).find(
            item => item.id === categoryId
        )?.name || "—";
    }

    function statusBadge(status) {
        return `
            <span class="products-status ${escapeHTML(status)}">
                ${escapeHTML(status || "draft")}
            </span>
        `;
    }

    // =====================================
    // LOAD CATALOG TAXONOMY
    // =====================================

    async function loadTaxonomy() {
        const result = await api("GET", CATALOG_API);

        state.collections = Array.isArray(result.collections)
            ? result.collections
            : [];
    }

    // =====================================
    // LOAD PRODUCTS
    // =====================================

    async function loadProducts() {
        state.loading = true;
        state.error = "";

        render();

        try {
            const params = new URLSearchParams();

            params.set("limit", String(PAGE_LIMIT));

            if (state.status) {
                params.set("status", state.status);
            }

            if (state.collectionId) {
                params.set("collectionId", state.collectionId);
            }

            if (state.categoryId) {
                params.set("categoryId", state.categoryId);
            }

            if (state.cursor) {
                params.set("cursor", state.cursor);
            }

            const result = await api(
                "GET",
                `${PRODUCT_API}?${params.toString()}`
            );

            state.products = Array.isArray(result.products)
                ? result.products
                : [];

            state.pagination = result.pagination || {
                limit: PAGE_LIMIT,
                hasMore: false,
                nextCursor: null
            };

        } catch (error) {
            state.error = error.message;
            state.products = [];
        } finally {
            state.loading = false;
            render();
        }
    }

    // =====================================
    // PRODUCT TABLE
    // =====================================

    function renderProductRows() {
        if (!state.products.length) {
            return `
                <tr>
                    <td colspan="8">
                        <div class="products-empty">
                            <h3>No products found</h3>
                            <p>Create your first product to get started.</p>
                        </div>
                    </td>
                </tr>
            `;
        }

        return state.products.map(product => {
            const mainImage = (product.images || []).find(
                image => image.isMain
            );

            return `
                <tr>
                    <td>
                        <div class="products-image-cell">
                            ${
                                mainImage?.url
                                    ? `
                                        <img
                                            src="${escapeHTML(mainImage.url)}"
                                            alt="${escapeHTML(mainImage.alt || product.name)}"
                                            loading="lazy"
                                        >
                                    `
                                    : `
                                        <div class="products-image-placeholder">
                                            No Image
                                        </div>
                                    `
                            }
                        </div>
                    </td>

                    <td>
                        <strong>${escapeHTML(product.name)}</strong>
                        <small>${escapeHTML(product.sku || "—")}</small>
                    </td>

                    <td>
                        ${escapeHTML(product.type || "—")}
                    </td>

                    <td>
                        ${escapeHTML(
                            getCollectionName(product.collectionId)
                        )}
                    </td>

                    <td>
                        ${escapeHTML(
                            getCategoryName(
                                product.collectionId,
                                product.categoryId
                            )
                        )}
                    </td>

                    <td>
                        ${
                            product.type === "simple"
                                ? `৳${money(product.sellingPrice)}`
                                : `${(product.variants || []).length} Variants`
                        }
                    </td>

                    <td>
                        ${statusBadge(product.status)}
                    </td>

                    <td>
                        <button
                            type="button"
                            class="products-button small"
                            data-action="edit"
                            data-id="${escapeHTML(product.id)}"
                        >
                            Edit
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    // =====================================
    // PRODUCT FORM OPTIONS
    // =====================================

    function collectionOptions(selected = "") {
        return getActiveCollections().map(collection => `
            <option
                value="${escapeHTML(collection.id)}"
                ${collection.id === selected ? "selected" : ""}
            >
                ${escapeHTML(collection.name)}
            </option>
        `).join("");
    }

    function categoryOptions(collectionId, selected = "") {
        return getCategories(collectionId).map(category => `
            <option
                value="${escapeHTML(category.id)}"
                ${category.id === selected ? "selected" : ""}
            >
                ${escapeHTML(category.name)}
            </option>
        `).join("");
    }

    function subcategoryOptions(
        collectionId,
        categoryId,
        selected = ""
    ) {
        return getSubcategories(
            collectionId,
            categoryId
        ).map(subcategory => `
            <option
                value="${escapeHTML(subcategory.id)}"
                ${subcategory.id === selected ? "selected" : ""}
            >
                ${escapeHTML(subcategory.name)}
            </option>
        `).join("");
    }

    // =====================================
    // IMAGE FORM
    // =====================================

    function renderImageRow(image = {}, index = 0) {
        return `
            <div class="products-image-row">

                <div class="products-form-group">
                    <label>Cloudinary Image URL</label>

                    <input
                        type="url"
                        name="imageUrl"
                        value="${escapeHTML(image.url || "")}"
                        placeholder="https://res.cloudinary.com/..."
                        required
                    >
                </div>

                <div class="products-form-group">
                    <label>Public ID</label>

                    <input
                        type="text"
                        name="imagePublicId"
                        value="${escapeHTML(image.publicId || "")}"
                        placeholder="folder/image-name"
                        required
                    >
                </div>

                <div class="products-form-group">
                    <label>Alt Text</label>

                    <input
                        type="text"
                        name="imageAlt"
                        value="${escapeHTML(image.alt || "")}"
                        placeholder="Image description"
                    >
                </div>

                <div class="products-form-group">
                    <label>Color</label>

                    <input
                        type="text"
                        name="imageColor"
                        value="${escapeHTML(image.color || "")}"
                        placeholder="Red"
                    >
                </div>

                <div class="products-form-group">
                    <label>Main Image</label>

                    <select name="imageMain">
                        <option value="false"
                            ${image.isMain ? "" : "selected"}>
                            No
                        </option>

                        <option value="true"
                            ${image.isMain ? "selected" : ""}>
                            Yes
                        </option>
                    </select>
                </div>

                <button
                    type="button"
                    class="products-button danger small"
                    data-action="remove-image"
                >
                    Remove
                </button>

            </div>
        `;
    }

    // =====================================
    // VARIANT FORM
    // =====================================

    function renderVariantRow(variant = {}) {
        const attributes = variant.attributes || {};

        return `
            <div class="products-variant-row">

                <input
                    type="hidden"
                    name="variantId"
                    value="${escapeHTML(variant.variantId || generateId())}"
                >

                <div class="products-form-group">
                    <label>Variant Name</label>

                    <input
                        type="text"
                        name="variantName"
                        value="${escapeHTML(variant.name || "")}"
                        placeholder="Red / M"
                        required
                    >
                </div>

                <div class="products-form-group">
                    <label>Color</label>

                    <input
                        type="text"
                        name="variantColor"
                        value="${escapeHTML(attributes.color || "")}"
                        placeholder="Red"
                    >
                </div>

                <div class="products-form-group">
                    <label>Size</label>

                    <input
                        type="text"
                        name="variantSize"
                        value="${escapeHTML(attributes.size || "")}"
                        placeholder="M"
                    >
                </div>

                <div class="products-form-group">
                    <label>Selling Price (৳)</label>

                    <input
                        type="number"
                        name="variantPrice"
                        value="${escapeHTML(variant.sellingPrice ?? "")}"
                        min="0"
                        step="0.01"
                        required
                    >
                </div>

                <div class="products-form-group">
                    <label>Barcode</label>

                    <input
                        type="text"
                        name="variantBarcode"
                        value="${escapeHTML(variant.barcode || "")}"
                        placeholder="Optional"
                    >
                </div>

                <div class="products-form-group">
                    <label>Stock Quantity</label>

                    <input
                        type="number"
                        name="variantStock"
                        value="${escapeHTML(variant.stockQuantity ?? 0)}"
                        min="0"
                        step="1"
                    >
                </div>

                <button
                    type="button"
                    class="products-button danger small"
                    data-action="remove-variant"
                >
                    Remove Variant
                </button>

            </div>
        `;
    }

    // =====================================
    // PRODUCT FORM
    // =====================================

    function renderForm(product = null) {
        const editing = Boolean(product);

        const collectionId = product?.collectionId || "";
        const categoryId = product?.categoryId || "";
        const subcategoryId = product?.subcategoryId || "";

        const images = Array.isArray(product?.images)
            ? product.images
            : [];

        const variants = Array.isArray(product?.variants)
            ? product.variants
            : [];

        return `
            <dialog id="products-dialog" class="products-dialog">

                <form id="products-form" class="products-form">

                    <header class="products-dialog-header">

                        <div>
                            <h2>
                                ${editing ? "Edit Product" : "Create Product"}
                            </h2>

                            <p>
                                ${editing
                                    ? "Update your product information."
                                    : "Add a new product to your catalog."
                                }
                            </p>
                        </div>

                        <button
                            type="button"
                            class="products-close"
                            data-action="close-dialog"
                            aria-label="Close"
                        >
                            ×
                        </button>

                    </header>

                    <div class="products-dialog-body">

                        <section class="products-form-section">

                            <h3>Basic Information</h3>

                            <div class="products-form-grid">

                                <div class="products-form-group">
                                    <label>Product Name *</label>

                                    <input
                                        type="text"
                                        name="name"
                                        value="${escapeHTML(product?.name || "")}"
                                        maxlength="200"
                                        required
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Brand</label>

                                    <input
                                        type="text"
                                        name="brand"
                                        value="${escapeHTML(product?.brand || "Nishat Fashion")}"
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Product Type *</label>

                                    <select name="type" id="product-type" required>
                                        <option
                                            value="simple"
                                            ${product?.type !== "variable" ? "selected" : ""}
                                        >
                                            Simple Product
                                        </option>

                                        <option
                                            value="variable"
                                            ${product?.type === "variable" ? "selected" : ""}
                                        >
                                            Variable Product
                                        </option>
                                    </select>
                                </div>

                                <div class="products-form-group">
                                    <label>Status</label>

                                    <select name="status">
                                        <option value="draft"
                                            ${product?.status === "draft" || !product ? "selected" : ""}>
                                            Draft
                                        </option>

                                        <option value="active"
                                            ${product?.status === "active" ? "selected" : ""}>
                                            Active
                                        </option>

                                        <option value="inactive"
                                            ${product?.status === "inactive" ? "selected" : ""}>
                                            Inactive
                                        </option>
                                    </select>
                                </div>

                                ${
                                    editing
                                        ? `
                                            <div class="products-form-group">
                                                <label>Product SKU</label>

                                                <input
                                                    type="text"
                                                    value="${escapeHTML(product.sku || "")}"
                                                    readonly
                                                >
                                            </div>
                                        `
                                        : `
                                            <div class="products-form-note">
                                                Product SKU will be generated automatically.
                                            </div>
                                        `
                                }

                            </div>

                        </section>

                        <section class="products-form-section">

                            <h3>Product Category</h3>

                            <div class="products-form-grid">

                                <div class="products-form-group">
                                    <label>Collection *</label>

                                    <select name="collectionId" id="product-collection" required>
                                        <option value="">Select Collection</option>
                                        ${collectionOptions(collectionId)}
                                    </select>
                                </div>

                                <div class="products-form-group">
                                    <label>Category *</label>

                                    <select name="categoryId" id="product-category" required>
                                        <option value="">Select Category</option>
                                        ${categoryOptions(collectionId, categoryId)}
                                    </select>
                                </div>

                                <div class="products-form-group">
                                    <label>Subcategory</label>

                                    <select name="subcategoryId" id="product-subcategory">
                                        <option value="">No Subcategory</option>
                                        ${subcategoryOptions(
                                            collectionId,
                                            categoryId,
                                            subcategoryId
                                        )}
                                    </select>
                                </div>

                            </div>

                        </section>

                        <section class="products-form-section">

                            <div class="products-section-heading">
                                <h3>Descriptions</h3>
                            </div>

                            ${
                                editing
                                    ? `
                                        <div class="products-ai-actions">

                                            <button
                                                type="button"
                                                class="products-button ai"
                                                data-action="generate-short"
                                            >
                                                ✨ Generate Short Description
                                            </button>

                                            <button
                                                type="button"
                                                class="products-button ai"
                                                data-action="generate-full"
                                            >
                                                ✨ Generate Full Description
                                            </button>

                                            <button
                                                type="button"
                                                class="products-button ai"
                                                data-action="generate-tags"
                                            >
                                                ✨ Generate Tags
                                            </button>

                                        </div>

                                        <p class="products-help">
                                            AI uses the saved product information.
                                            Save your changes before generating new content.
                                        </p>
                                    `
                                    : `
                                        <p class="products-help">
                                            Save the product first. AI generation will be available when editing it.
                                        </p>
                                    `
                            }

                            <div class="products-form-group">
                                <label>Short Description</label>

                                <textarea
                                    name="shortDescription"
                                    maxlength="500"
                                    rows="3"
                                    placeholder="Short product description..."
                                >${escapeHTML(product?.shortDescription || "")}</textarea>
                            </div>

                            <div class="products-form-group">
                                <label>Full Description</label>

                                <textarea
                                    name="fullDescription"
                                    maxlength="10000"
                                    rows="7"
                                    placeholder="Detailed product description..."
                                >${escapeHTML(product?.fullDescription || "")}</textarea>
                            </div>

                            <div class="products-form-group">
                                <label>Tags</label>

                                <textarea
                                    name="tags"
                                    rows="3"
                                    placeholder="baby shirt, kids fashion, red shirt"
                                >${escapeHTML(
                                    Array.isArray(product?.tags)
                                        ? product.tags.join(", ")
                                        : ""
                                )}</textarea>

                                <small>Separate tags using commas.</small>
                            </div>

                            <p
                                id="products-ai-message"
                                class="products-message"
                                hidden
                            ></p>

                        </section>

                        <section class="products-form-section">

                            <h3>Product Images</h3>

                            <p class="products-help">
                                Add Cloudinary image URLs and their Public IDs.
                                Exactly one image must be marked as Main.
                            </p>

                            <div id="products-images-list">

                                ${
                                    images.length
                                        ? images.map(renderImageRow).join("")
                                        : renderImageRow({}, 0)
                                }

                            </div>

                            <button
                                type="button"
                                class="products-button"
                                data-action="add-image"
                            >
                                + Add Image
                            </button>

                        </section>

                        <section
                            class="products-form-section"
                            id="simple-product-fields"
                            ${product?.type === "variable" ? "hidden" : ""}
                        >

                            <h3>Simple Product Price</h3>

                            <div class="products-form-grid">

                                <div class="products-form-group">
                                    <label>Selling Price (৳) *</label>

                                    <input
                                        type="number"
                                        name="sellingPrice"
                                        value="${escapeHTML(product?.sellingPrice ?? "")}"
                                        min="0"
                                        step="0.01"
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Compare At Price (৳)</label>

                                    <input
                                        type="number"
                                        name="compareAtPrice"
                                        value="${escapeHTML(product?.compareAtPrice ?? "")}"
                                        min="0"
                                        step="0.01"
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Barcode</label>

                                    <input
                                        type="text"
                                        name="barcode"
                                        value="${escapeHTML(product?.barcode || "")}"
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Stock Quantity</label>

                                    <input
                                        type="number"
                                        name="stockQuantity"
                                        value="${escapeHTML(product?.stockQuantity ?? 0)}"
                                        min="0"
                                        step="1"
                                    >
                                </div>

                            </div>

                        </section>

                        <section
                            class="products-form-section"
                            id="variable-product-fields"
                            ${product?.type === "variable" ? "" : "hidden"}
                        >

                            <h3>Product Variants</h3>

                            <p class="products-help">
                                Every variant needs a unique Variant ID,
                                name and selling price. Variant SKU is generated by the backend.
                            </p>

                            <div id="products-variants-list">

                                ${
                                    variants.length
                                        ? variants.map(renderVariantRow).join("")
                                        : renderVariantRow()
                                }

                            </div>

                            <button
                                type="button"
                                class="products-button"
                                data-action="add-variant"
                            >
                                + Add Variant
                            </button>

                        </section>

                        <section class="products-form-section">

                            <h3>Inventory & Settings</h3>

                            <div class="products-form-grid">

                                <div class="products-form-group">
                                    <label>Low Stock Alert</label>

                                    <input
                                        type="number"
                                        name="lowStockAlert"
                                        value="${escapeHTML(product?.lowStockAlert ?? 5)}"
                                        min="0"
                                        step="1"
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Weight</label>

                                    <input
                                        type="number"
                                        name="weight"
                                        value="${escapeHTML(product?.weight ?? "")}"
                                        min="0"
                                        step="0.01"
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Length</label>

                                    <input
                                        type="number"
                                        name="length"
                                        value="${escapeHTML(product?.length ?? "")}"
                                        min="0"
                                        step="0.01"
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Width</label>

                                    <input
                                        type="number"
                                        name="width"
                                        value="${escapeHTML(product?.width ?? "")}"
                                        min="0"
                                        step="0.01"
                                    >
                                </div>

                                <div class="products-form-group">
                                    <label>Height</label>

                                    <input
                                        type="number"
                                        name="height"
                                        value="${escapeHTML(product?.height ?? "")}"
                                        min="0"
                                        step="0.01"
                                    >
                                </div>

                            </div>

                            <div class="products-checkboxes">

                                <label>
                                    <input
                                        type="checkbox"
                                        name="trackInventory"
                                        ${product?.trackInventory !== false ? "checked" : ""}
                                    >
                                    Track Inventory
                                </label>

                                <label>
                                    <input
                                        type="checkbox"
                                        name="allowBackorder"
                                        ${product?.allowBackorder === true ? "checked" : ""}
                                    >
                                    Allow Backorder
                                </label>

                                <label>
                                    <input
                                        type="checkbox"
                                        name="requiresShipping"
                                        ${product?.requiresShipping !== false ? "checked" : ""}
                                    >
                                    Requires Shipping
                                </label>

                                <label>
                                    <input
                                        type="checkbox"
                                        name="featured"
                                        ${product?.featured === true ? "checked" : ""}
                                    >
                                    Featured Product
                                </label>

                            </div>

                        </section>

                    </div>

                    <footer class="products-dialog-footer">

                        <button
                            type="button"
                            class="products-button"
                            data-action="close-dialog"
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            class="products-button primary"
                            id="products-save-button"
                        >
                            ${editing ? "Update Product" : "Create Product"}
                        </button>

                    </footer>

                </form>

            </dialog>
        `;
    }

    // =====================================
    // MAIN PAGE RENDER
    // =====================================

    function render() {
        container.innerHTML = `
            <section class="products-page">

                <header class="products-page-header">

                    <div>
                        <p class="products-eyebrow">
                            PRODUCT MANAGEMENT
                        </p>

                        <h1>Product Catalog</h1>

                        <p>
                            Create, manage and update your products.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="products-button primary"
                        data-action="create"
                        ${state.loading ? "disabled" : ""}
                    >
                        + Create Product
                    </button>

                </header>

                <div
                    id="products-message"
                    class="products-message"
                    hidden
                ></div>

                <div class="products-toolbar">

                    <div class="products-filter">

                        <select
                            id="products-status-filter"
                            aria-label="Filter by status"
                        >
                            <option value="">All Status</option>
                            <option value="draft"
                                ${state.status === "draft" ? "selected" : ""}>
                                Draft
                            </option>
                            <option value="active"
                                ${state.status === "active" ? "selected" : ""}>
                                Active
                            </option>
                            <option value="inactive"
                                ${state.status === "inactive" ? "selected" : ""}>
                                Inactive
                            </option>
                        </select>

                        <select
                            id="products-collection-filter"
                            aria-label="Filter by collection"
                        >
                            <option value="">All Collections</option>
                            ${collectionOptions(state.collectionId)}
                        </select>

                        <select
                            id="products-category-filter"
                            aria-label="Filter by category"
                        >
                            <option value="">All Categories</option>
                            ${categoryOptions(
                                state.collectionId,
                                state.categoryId
                            )}
                        </select>

                    </div>

                    <button
                        type="button"
                        class="products-button"
                        data-action="refresh"
                        ${state.loading ? "disabled" : ""}
                    >
                        ${state.loading ? "Loading..." : "Refresh"}
                    </button>

                </div>

                <div class="products-table-wrapper">

                    <table class="products-table">

                        <thead>
                            <tr>
                                <th>Image</th>
                                <th>Product</th>
                                <th>Type</th>
                                <th>Collection</th>
                                <th>Category</th>
                                <th>Price / Variants</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${
                                state.loading
                                    ? `
                                        <tr>
                                            <td colspan="8">
                                                <div class="products-loading">
                                                    Loading products...
                                                </div>
                                            </td>
                                        </tr>
                                    `
                                    : renderProductRows()
                            }
                        </tbody>

                    </table>

                </div>

                <div class="products-pagination">

                    <span>
                        ${
                            state.products.length
                        } products on this page
                    </span>

                    <button
                        type="button"
                        class="products-button"
                        data-action="next-page"
                        ${!state.pagination.hasMore || state.loading ? "disabled" : ""}
                    >
                        Next Page →
                    </button>

                </div>

                ${renderForm(state.editingProduct)}

            </section>
        `;

        if (state.error || state.success) {
            showMessage(
                state.error || state.success,
                state.error ? "error" : "success"
            );
        }
    }

    // =====================================
    // OPEN / CLOSE FORM
    // =====================================

    function openForm(product = null) {
        state.editingProduct = product;

        render();

        const dialog = container.querySelector(
            "#products-dialog"
        );

        dialog?.showModal();

        updateTypeSections();
    }

    function closeForm() {
        const dialog = container.querySelector(
            "#products-dialog"
        );

        if (dialog?.open) {
            dialog.close();
        }

        state.editingProduct = null;
    }

    function updateTypeSections() {
        const type = container.querySelector(
            "#product-type"
        )?.value;

        const simpleFields = container.querySelector(
            "#simple-product-fields"
        );

        const variableFields = container.querySelector(
            "#variable-product-fields"
        );

        if (simpleFields) {
            simpleFields.hidden = type !== "simple";
        }

        if (variableFields) {
            variableFields.hidden = type !== "variable";
        }
    }

    // =====================================
    // OPEN EDIT PRODUCT
    // =====================================

    async function editProduct(productId) {
        try {
            showMessage("Loading product...", "success");

            const result = await api(
                "GET",
                `${PRODUCT_API}/${encodeURIComponent(productId)}`
            );

            if (!result.product) {
                throw new Error("Product data not found");
            }

            openForm(result.product);

        } catch (error) {
            showMessage(error.message, "error");
        }
    }

    // =====================================
    // COLLECT IMAGE DATA
    // =====================================

    function collectImages() {
        const rows = [
            ...container.querySelectorAll(".products-image-row")
        ];

        return rows.map(row => ({
            url: row.querySelector('[name="imageUrl"]').value.trim(),
            publicId: row.querySelector('[name="imagePublicId"]').value.trim(),
            alt: row.querySelector('[name="imageAlt"]').value.trim(),
            color: row.querySelector('[name="imageColor"]').value.trim(),
            isMain:
                row.querySelector('[name="imageMain"]').value === "true"
        }));
    }

    // =====================================
    // COLLECT VARIANT DATA
    // =====================================

    function collectVariants() {
        const rows = [
            ...container.querySelectorAll(".products-variant-row")
        ];

        return rows.map(row => {
            const variantId = row.querySelector(
                '[name="variantId"]'
            ).value;

            const name = row.querySelector(
                '[name="variantName"]'
            ).value.trim();

            const color = row.querySelector(
                '[name="variantColor"]'
            ).value.trim();

            const size = row.querySelector(
                '[name="variantSize"]'
            ).value.trim();

            const price = Number(
                row.querySelector('[name="variantPrice"]').value
            );

            const barcode = row.querySelector(
                '[name="variantBarcode"]'
            ).value.trim();

            const stock = Number(
                row.querySelector('[name="variantStock"]').value
            );

            const attributes = {};

            if (color) attributes.color = color;
            if (size) attributes.size = size;

            const variant = {
                variantId,
                name,
                attributes,
                sellingPrice: price,
                active: true,
                stockQuantity: stock
            };

            if (barcode) {
                variant.barcode = barcode;
            }

            return variant;
        });
    }

    // =====================================
    // COLLECT PRODUCT DATA
    // =====================================

    function collectProductData() {
        const form = container.querySelector("#products-form");

        const data = new FormData(form);

        const type = data.get("type");

        const payload = {
            name: String(data.get("name") || "").trim(),
            brand: String(data.get("brand") || "").trim(),
            type,

            status: data.get("status"),

            collectionId: data.get("collectionId"),
            categoryId: data.get("categoryId"),

            images: collectImages(),

            shortDescription: String(
                data.get("shortDescription") || ""
            ).trim(),

            fullDescription: String(
                data.get("fullDescription") || ""
            ).trim(),

            tags: String(data.get("tags") || "")
                .split(",")
                .map(tag => tag.trim())
                .filter(Boolean),

            trackInventory:
                data.get("trackInventory") === "on",

            allowBackorder:
                data.get("allowBackorder") === "on",

            requiresShipping:
                data.get("requiresShipping") === "on",

            featured:
                data.get("featured") === "on",

            lowStockAlert: Number(
                data.get("lowStockAlert") || 0
            ),

            variants: type === "variable"
                ? collectVariants()
                : []
        };

        const subcategoryId = String(
            data.get("subcategoryId") || ""
        ).trim();

        if (subcategoryId) {
            payload.subcategoryId = subcategoryId;
        }

        const optionalNumericFields = [
            "sellingPrice",
            "compareAtPrice",
            "stockQuantity",
            "weight",
            "length",
            "width",
            "height"
        ];

        for (const field of optionalNumericFields) {
            const rawValue = data.get(field);

            if (
                rawValue !== null &&
                String(rawValue).trim() !== ""
            ) {
                payload[field] = Number(rawValue);
            }
        }

        return payload;
    }

    // =====================================
    // SAVE PRODUCT
    // =====================================

    async function saveProduct(event) {
        event.preventDefault();

        if (state.saving) return;

        const form = container.querySelector("#products-form");

        if (!form.reportValidity()) {
            return;
        }

        const saveButton = container.querySelector(
            "#products-save-button"
        );

        state.saving = true;

        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            const payload = collectProductData();

            const product = state.editingProduct;

            if (product) {
                await api(
                    "PATCH",
                    `${PRODUCT_API}/${encodeURIComponent(product.id)}`,
                    payload
                );

                state.success = "Product updated successfully.";

            } else {
                await api(
                    "POST",
                    PRODUCT_API,
                    payload
                );

                state.success = "Product created successfully.";
            }

            closeForm();

            state.cursor = "";

            await loadProducts();

            showMessage(state.success, "success");

        } catch (error) {
            showMessage(error.message, "error");

        } finally {
            state.saving = false;

            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = state.editingProduct
                    ? "Update Product"
                    : "Create Product";
            }
        }
    }

    // =====================================
    // GEMINI AI GENERATION
    // =====================================

    async function generateAI(field) {
        const product = state.editingProduct;

        if (!product?.id) {
            showAIMessage(
                "Save the product first before generating AI content.",
                "error"
            );

            return;
        }

        const endpoints = {
            shortDescription: "short-description",
            fullDescription: "full-description",
            tags: "tags"
        };

        const endpoint = endpoints[field];

        if (!endpoint) {
            return;
        }

        const button = container.querySelector(
            `[data-action="generate-${field === "shortDescription"
                ? "short"
                : field === "fullDescription"
                    ? "full"
                    : "tags"
            }"]`
        );

        const originalText = button?.textContent || "Generate";

        try {
            if (button) {
                button.disabled = true;
                button.textContent = "Generating...";
            }

            showAIMessage(
                "Gemini is generating content...",
                "success"
            );

            const result = await api(
                "POST",
                `${AI_API}/${encodeURIComponent(product.id)}/${endpoint}`
            );

            if (!result.success || result.value === undefined) {
                throw new Error("AI generation failed");
            }

            if (field === "tags") {
                const tags = Array.isArray(result.value)
                    ? result.value
                    : [];

                container.querySelector('[name="tags"]').value =
                    tags.join(", ");

            } else {
                container.querySelector(
                    `[name="${field}"]`
                ).value = String(result.value);
            }

            showAIMessage(
                `${field} generated successfully using ${result.model || "Gemini"}. Review the content before saving.`,
                "success"
            );

        } catch (error) {
            showAIMessage(error.message, "error");

        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }

    function showAIMessage(message, type = "success") {
        const element = container.querySelector(
            "#products-ai-message"
        );

        if (!element) return;

        element.textContent = message;
        element.className = `products-message ${type}`;
        element.hidden = false;
    }

    // =====================================
    // EVENT HANDLERS
    // =====================================

    container.addEventListener("click", async event => {
        const button = event.target.closest("[data-action]");

        if (!button || !container.contains(button)) {
            return;
        }

        const action = button.dataset.action;

        if (action === "create") {
            openForm();
            return;
        }

        if (action === "edit") {
            await editProduct(button.dataset.id);
            return;
        }

        if (action === "refresh") {
            state.cursor = "";
            await loadProducts();
            return;
        }

        if (action === "close-dialog") {
            closeForm();
            return;
        }

        if (action === "next-page") {
            if (
                state.pagination.hasMore &&
                state.pagination.nextCursor
            ) {
                state.cursor = state.pagination.nextCursor;
                await loadProducts();
            }

            return;
        }

        if (action === "add-image") {
            const list = container.querySelector(
                "#products-images-list"
            );

            list.insertAdjacentHTML(
                "beforeend",
                renderImageRow()
            );

            return;
        }

        if (action === "remove-image") {
            const rows = container.querySelectorAll(
                ".products-image-row"
            );

            if (rows.length <= 1) {
                showAIMessage(
                    "At least one product image is required.",
                    "error"
                );
                return;
            }

            button.closest(".products-image-row").remove();
            return;
        }

        if (action === "add-variant") {
            const list = container.querySelector(
                "#products-variants-list"
            );

            list.insertAdjacentHTML(
                "beforeend",
                renderVariantRow()
            );

            return;
        }

        if (action === "remove-variant") {
            const rows = container.querySelectorAll(
                ".products-variant-row"
            );

            if (rows.length <= 1) {
                showAIMessage(
                    "Variable products require at least one variant.",
                    "error"
                );
                return;
            }

            button.closest(".products-variant-row").remove();
            return;
        }

        if (action === "generate-short") {
            await generateAI("shortDescription");
            return;
        }

        if (action === "generate-full") {
            await generateAI("fullDescription");
            return;
        }

        if (action === "generate-tags") {
            await generateAI("tags");
        }
    });

    container.addEventListener("submit", async event => {
        if (event.target.id === "products-form") {
            await saveProduct(event);
        }
    });

    container.addEventListener("change", async event => {
        const target = event.target;

        if (target.id === "product-type") {
            updateTypeSections();
            return;
        }

        if (target.id === "product-collection") {
            const collectionId = target.value;

            const categorySelect = container.querySelector(
                "#product-category"
            );

            const subcategorySelect = container.querySelector(
                "#product-subcategory"
            );

            categorySelect.innerHTML = `
                <option value="">Select Category</option>
                ${categoryOptions(collectionId)}
            `;

            subcategorySelect.innerHTML = `
                <option value="">No Subcategory</option>
            `;

            return;
        }

        if (target.id === "product-category") {
            const collectionId = container.querySelector(
                "#product-collection"
            ).value;

            const subcategorySelect = container.querySelector(
                "#product-subcategory"
            );

            subcategorySelect.innerHTML = `
                <option value="">No Subcategory</option>
                ${subcategoryOptions(
                    collectionId,
                    target.value
                )}
            `;

            return;
        }

        if (target.id === "products-status-filter") {
            state.status = target.value;
            state.cursor = "";
            await loadProducts();
            return;
        }

        if (target.id === "products-collection-filter") {
            state.collectionId = target.value;
            state.categoryId = "";
            state.cursor = "";
            await loadProducts();
            return;
        }

        if (target.id === "products-category-filter") {
            state.categoryId = target.value;
            state.cursor = "";
            await loadProducts();
        }
    });

    // =====================================
    // INITIALIZE
    // =====================================

    try {
        await loadTaxonomy();
        await loadProducts();

    } catch (error) {
        state.error = error.message;
        state.loading = false;
        render();
    }
}
