
const API_BASE = "/api/catalog";

export async function renderCatalogPage(container) {
    if (!(container instanceof HTMLElement)) {
        throw new Error("Catalog container element is required");
    }

    const state = {
        collections: [],
        version: 0,
        loading: false,
        error: "",
        success: ""
    };

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
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

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || `Request failed: ${response.status}`
            );
        }

        return result;
    }

    function showMessage(message, type = "success") {
        state.success = type === "success" ? message : "";
        state.error = type === "error" ? message : "";

        const element = container.querySelector("#catalog-message");

        if (!element) return;

        element.textContent = message;
        element.className = `catalog-message ${type}`;
        element.hidden = !message;
    }

    async function loadTaxonomy() {
        state.loading = true;
        state.error = "";

        render();

        try {
            const result = await api("GET", API_BASE);

            state.collections = Array.isArray(result.collections)
                ? result.collections
                : [];

            state.version = Number(result.version) || 0;
        } catch (error) {
            state.error = error.message;
        } finally {
            state.loading = false;
            render();
        }
    }

    function statusBadge(active) {
        return active
            ? '<span class="catalog-status active">Active</span>'
            : '<span class="catalog-status inactive">Inactive</span>';
    }

    function renderSubcategories(collection, category) {
        const subcategories = Array.isArray(category.subcategories)
            ? category.subcategories
            : [];

        return `
      <div class="catalog-subcategories">
        <div class="catalog-section-heading">
          <h4>Subcategories (${subcategories.length})</h4>

          <button
            type="button"
            class="catalog-button small"
            data-action="add-subcategory"
            data-collection="${escapeHTML(collection.id)}"
            data-category="${escapeHTML(category.id)}"
          >
            + Add Subcategory
          </button>
        </div>

        ${subcategories.length
                ? subcategories.map((subcategory) => `
              <div class="catalog-subcategory">
                <div class="catalog-item-info">
                  <strong>${escapeHTML(subcategory.name)}</strong>
                  <span>ID: ${escapeHTML(subcategory.id)}</span>
                  ${statusBadge(subcategory.active)}
                </div>

                <div class="catalog-actions">
                  <button
                    type="button"
                    class="catalog-button small"
                    data-action="edit-subcategory"
                    data-collection="${escapeHTML(collection.id)}"
                    data-category="${escapeHTML(category.id)}"
                    data-subcategory="${escapeHTML(subcategory.id)}"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    class="catalog-button small"
                    data-action="toggle-subcategory"
                    data-collection="${escapeHTML(collection.id)}"
                    data-category="${escapeHTML(category.id)}"
                    data-subcategory="${escapeHTML(subcategory.id)}"
                    data-active="${String(!subcategory.active)}"
                  >
                    ${subcategory.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            `).join("")
                : '<p class="catalog-empty-small">No subcategories yet.</p>'
            }
      </div>
    `;
    }

    function renderCategories(collection) {
        const categories = Array.isArray(collection.categories)
            ? collection.categories
            : [];

        return `
      <div class="catalog-category-list">
        <div class="catalog-section-heading">
          <h3>Categories (${categories.length})</h3>

          <button
            type="button"
            class="catalog-button"
            data-action="add-category"
            data-collection="${escapeHTML(collection.id)}"
          >
            + Add Category
          </button>
        </div>

        ${categories.length
                ? categories.map((category) => `
              <article class="catalog-category">
                <div class="catalog-item-header">
                  <div class="catalog-item-info">
                    <h4>${escapeHTML(category.name)}</h4>
                    <span>ID: ${escapeHTML(category.id)}</span>
                    ${statusBadge(category.active)}
                  </div>

                  <div class="catalog-actions">
                    <button
                      type="button"
                      class="catalog-button small"
                      data-action="edit-category"
                      data-collection="${escapeHTML(collection.id)}"
                      data-category="${escapeHTML(category.id)}"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      class="catalog-button small"
                      data-action="toggle-category"
                      data-collection="${escapeHTML(collection.id)}"
                      data-category="${escapeHTML(category.id)}"
                      data-active="${String(!category.active)}"
                    >
                      ${category.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>

                ${renderSubcategories(collection, category)}
              </article>
            `).join("")
                : '<p class="catalog-empty-small">No categories yet.</p>'
            }
      </div>
    `;
    }

    function renderCollections() {
        if (!state.collections.length) {
            return `
        <div class="catalog-empty">
          <h3>No collections found</h3>
          <p>Create your first collection to get started.</p>
        </div>
      `;
        }

        return state.collections.map((collection) => `
      <article class="catalog-collection">
        <div class="catalog-collection-header">
          <div class="catalog-item-info">
            <h2>
              ${escapeHTML(collection.icon || "📁")}
              ${escapeHTML(collection.name)}
            </h2>

            <span>ID: ${escapeHTML(collection.id)}</span>
            ${statusBadge(collection.active)}
          </div>

          <div class="catalog-actions">
            <button
              type="button"
              class="catalog-button"
              data-action="edit-collection"
              data-collection="${escapeHTML(collection.id)}"
            >
              Edit
            </button>

            <button
              type="button"
              class="catalog-button"
              data-action="toggle-collection"
              data-collection="${escapeHTML(collection.id)}"
              data-active="${String(!collection.active)}"
            >
              ${collection.active ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>

        ${renderCategories(collection)}
      </article>
    `).join("");
    }

    function render() {
        container.innerHTML = `
      <section class="catalog-page">

        <header class="catalog-page-header">
          <div>
            <p class="catalog-eyebrow">PRODUCT MANAGEMENT</p>
            <h1>Category & Collection Management</h1>
            <p>
              Manage collections, categories and subcategories.
            </p>
          </div>

          <button
            type="button"
            class="catalog-button primary"
            data-action="add-collection"
          >
            + Create Collection
          </button>
        </header>

        <div
          id="catalog-message"
          class="catalog-message"
          ${!state.error && !state.success ? "hidden" : ""}
        >${escapeHTML(state.error || state.success)}</div>

        <div class="catalog-overview">
          <div class="catalog-stat">
            <span>Total Collections</span>
            <strong>${state.collections.length}</strong>
          </div>

          <div class="catalog-stat">
            <span>Total Categories</span>
            <strong>
              ${state.collections.reduce(
            (total, item) =>
                total + (item.categories?.length || 0),
            0
        )}
            </strong>
          </div>

          <div class="catalog-stat">
            <span>Total Subcategories</span>
            <strong>
              ${state.collections.reduce(
            (total, item) =>
                total + (item.categories || []).reduce(
                    (sum, category) =>
                        sum + (category.subcategories?.length || 0),
                    0
                ),
            0
        )}
            </strong>
          </div>

          <div class="catalog-stat">
            <span>Taxonomy Version</span>
            <strong>${state.version}</strong>
          </div>
        </div>

        <div class="catalog-toolbar">
          <h2>All Collections</h2>

          <button
            type="button"
            class="catalog-button"
            data-action="refresh"
            ${state.loading ? "disabled" : ""}
          >
            ${state.loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        ${state.loading
                ? '<div class="catalog-loading">Loading catalog...</div>'
                : state.error && !state.collections.length
                    ? '<div class="catalog-empty">Unable to load catalog.</div>'
                    : `<div class="catalog-collections">${renderCollections()}</div>`
            }

        <dialog id="catalog-dialog" class="catalog-dialog">
          <form id="catalog-form" class="catalog-form">
            <div class="catalog-dialog-header">
              <h2 id="catalog-dialog-title">Create item</h2>

              <button
                type="button"
                class="catalog-close"
                data-action="close-dialog"
                aria-label="Close"
              >×</button>
            </div>

            <div id="catalog-form-fields"></div>

            <div class="catalog-dialog-actions">
              <button
                type="button"
                class="catalog-button"
                data-action="close-dialog"
              >
                Cancel
              </button>

              <button
                type="submit"
                class="catalog-button primary"
                id="catalog-submit"
              >
                Save
              </button>
            </div>
          </form>
        </dialog>

      </section>
    `;
    }

    function findCollection(id) {
        return state.collections.find((item) => item.id === id);
    }

    function findCategory(collectionId, categoryId) {
        return findCollection(collectionId)
            ?.categories?.find((item) => item.id === categoryId);
    }

    function findSubcategory(collectionId, categoryId, subcategoryId) {
        return findCategory(collectionId, categoryId)
            ?.subcategories?.find((item) => item.id === subcategoryId);
    }

    function openDialog(type, data = {}) {
        const dialog = container.querySelector("#catalog-dialog");
        const fields = container.querySelector("#catalog-form-fields");
        const title = container.querySelector("#catalog-dialog-title");
        const form = container.querySelector("#catalog-form");

        const editing = Boolean(data.editing);
        const item = data.item || {};

        const titles = {
            collection: editing ? "Edit Collection" : "Create Collection",
            category: editing ? "Edit Category" : "Create Category",
            subcategory: editing ? "Edit Subcategory" : "Create Subcategory"
        };

        title.textContent = titles[type];

        const idField = `
      <div class="catalog-form-group">
        <label for="catalog-id">ID</label>
        <input
          id="catalog-id"
          name="id"
          type="text"
          value="${escapeHTML(item.id || "")}"
          ${editing ? "disabled" : "required"}
          maxlength="100"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          placeholder="example-category"
        >
        <small>Lowercase letters, numbers and hyphens only.</small>
      </div>
    `;

        const nameField = `
      <div class="catalog-form-group">
        <label for="catalog-name">Name</label>
        <input
          id="catalog-name"
          name="name"
          type="text"
          value="${escapeHTML(item.name || "")}"
          maxlength="80"
          required
          placeholder="Enter name"
        >
      </div>
    `;

        const iconField = `
      <div class="catalog-form-group">
        <label for="catalog-icon">Icon (optional)</label>
        <input
          id="catalog-icon"
          name="icon"
          type="text"
          value="${escapeHTML(item.icon || "")}"
          maxlength="20"
          placeholder="📁"
        >
      </div>
    `;

        const activeField = `
      <label class="catalog-checkbox">
        <input
          type="checkbox"
          name="active"
          ${item.active !== false ? "checked" : ""}
        >
        Active
      </label>
    `;

        fields.innerHTML = `
      ${editing ? "" : idField}
      ${nameField}
      ${iconField}
      ${editing ? activeField : ""}
    `;

        form.dataset.type = type;
        form.dataset.editing = String(editing);
        form.dataset.collection = data.collectionId || "";
        form.dataset.category = data.categoryId || "";
        form.dataset.subcategory = data.subcategoryId || "";

        dialog.showModal();

        fields.querySelector("input[name='name']")?.focus();
    }

    function closeDialog() {
        const dialog = container.querySelector("#catalog-dialog");

        if (dialog?.open) {
            dialog.close();
        }
    }

    async function saveForm(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const submitButton = container.querySelector("#catalog-submit");

        if (!form.reportValidity()) return;

        const formData = new FormData(form);

        const type = form.dataset.type;
        const editing = form.dataset.editing === "true";

        const collectionId = form.dataset.collection;
        const categoryId = form.dataset.category;
        const subcategoryId = form.dataset.subcategory;

        const id = String(formData.get("id") || "").trim();
        const name = String(formData.get("name") || "").trim();
        const icon = String(formData.get("icon") || "").trim();
        const active = formData.has("active");

        let url = API_BASE;
        let method = editing ? "PATCH" : "POST";
        let body;

        if (type === "collection") {
            if (editing) {
                url += `/${encodeURIComponent(collectionId)}`;
                body = { name, icon, active };
            } else {
                body = {
                    id,
                    name,
                    icon,
                    active: true,
                    categories: []
                };
            }
        }

        if (type === "category") {
            url += `/${encodeURIComponent(collectionId)}/categories`;

            if (editing) {
                url += `/${encodeURIComponent(categoryId)}`;
                body = { name, icon, active };
            } else {
                body = {
                    id,
                    name,
                    icon,
                    active: true,
                    subcategories: []
                };
            }
        }

        if (type === "subcategory") {
            url += `/${encodeURIComponent(collectionId)}`;
            url += `/categories/${encodeURIComponent(categoryId)}`;
            url += "/subcategories";

            if (editing) {
                url += `/${encodeURIComponent(subcategoryId)}`;
                body = { name, icon, active };
            } else {
                body = {
                    id,
                    name,
                    icon,
                    active: true
                };
            }
        }

        submitButton.disabled = true;
        submitButton.textContent = "Saving...";

        try {
            await api(method, url, body);

            closeDialog();

            await loadTaxonomy();

            showMessage(
                `${type.charAt(0).toUpperCase() + type.slice(1)} ${editing ? "updated" : "created"
                } successfully.`
            );
        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Save";
        }
    }

    async function toggleActive(url, active) {
        const action = active ? "activate" : "deactivate";

        await api(
            "PATCH",
            `${url}/${action}`
        );

        await loadTaxonomy();

        showMessage(
            `Status changed to ${active ? "Active" : "Inactive"}.`
        );
    }

    async function handleAction(button) {
        const action = button.dataset.action;
        const collectionId = button.dataset.collection;
        const categoryId = button.dataset.category;
        const subcategoryId = button.dataset.subcategory;

        if (action === "refresh") {
            await loadTaxonomy();
            return;
        }

        if (action === "close-dialog") {
            closeDialog();
            return;
        }

        if (action === "add-collection") {
            openDialog("collection");
            return;
        }

        if (action === "edit-collection") {
            const item = findCollection(collectionId);
            if (item) openDialog("collection", { editing: true, item, collectionId });
            return;
        }

        if (action === "add-category") {
            openDialog("category", { collectionId });
            return;
        }

        if (action === "edit-category") {
            const item = findCategory(collectionId, categoryId);

            if (item) {
                openDialog("category", {
                    editing: true,
                    item,
                    collectionId,
                    categoryId
                });
            }
            return;
        }

        if (action === "add-subcategory") {
            openDialog("subcategory", {
                collectionId,
                categoryId
            });
            return;
        }

        if (action === "edit-subcategory") {
            const item = findSubcategory(
                collectionId,
                categoryId,
                subcategoryId
            );

            if (item) {
                openDialog("subcategory", {
                    editing: true,
                    item,
                    collectionId,
                    categoryId,
                    subcategoryId
                });
            }
            return;
        }

        if (action === "toggle-collection") {
            const active = button.dataset.active === "true";

            await toggleActive(
                `${API_BASE}/${encodeURIComponent(collectionId)}`,
                active
            );

            return;
        }
        if (action === "toggle-category") {
            const active = button.dataset.active === "true";

            await toggleActive(
                `${API_BASE}/${encodeURIComponent(collectionId)}`
                + `/categories/${encodeURIComponent(categoryId)}`,
                active
            );

            return;
        }

        if (action === "toggle-subcategory") {
            const active = button.dataset.active === "true";

            await toggleActive(
                `${API_BASE}/${encodeURIComponent(collectionId)}`
                + `/categories/${encodeURIComponent(categoryId)}`
                + `/subcategories/${encodeURIComponent(subcategoryId)}`,
                active
            );
        }
    }

    container.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");

        if (!button || !container.contains(button)) return;

        try {
            await handleAction(button);
        } catch (error) {
            showMessage(error.message, "error");
        }
    });

    container.addEventListener("submit", async (event) => {
        if (event.target.id !== "catalog-form") return;

        try {
            await saveForm(event);
        } catch (error) {
            showMessage(error.message, "error");
        }
    });

    await loadTaxonomy();
}
