
'use strict';

// ========================================
// PRODUCT IMAGES
// Cloudinary Upload & Image Management
// ========================================

import {
  getProductElement,
  showProductMessage
} from './product-utils.js';


// ========================================
// STATE
// ========================================

let productImages = [];
let initialized = false;

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp'
];


// ========================================
// SELECTORS
// ========================================

const SELECTORS = {
  input: '#product-image-input',
  container: '#product-image-container',
  uploadButton: '#product-image-upload',
  mainImage: '#product-main-image',
  hoverImage: '#product-hover-image'
};


// ========================================
// GET ELEMENTS
// ========================================

function getElements() {
  return {
    input: getProductElement(SELECTORS.input),
    container: getProductElement(SELECTORS.container),
    uploadButton: getProductElement(SELECTORS.uploadButton),
    mainImage: getProductElement(SELECTORS.mainImage),
    hoverImage: getProductElement(SELECTORS.hoverImage)
  };
}


// ========================================
// ESCAPE HTML
// ========================================

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}


// ========================================
// VALIDATE IMAGE FILE
// ========================================

function validateImageFile(file) {
  if (!file) return false;

  if (!ALLOWED_TYPES.includes(file.type)) {
    showProductMessage(
      'শুধুমাত্র JPG, PNG ও WebP ছবি Upload করা যাবে।',
      'warning'
    );

    return false;
  }

  if (file.size > MAX_FILE_SIZE) {
    showProductMessage(
      'প্রতিটি ছবির Size সর্বোচ্চ 5 MB হতে পারবে।',
      'warning'
    );

    return false;
  }

  return true;
}


// ========================================
// CLOUDINARY CONFIG
// ========================================

function getCloudinaryConfig() {
  const config = window.APP_CONFIG?.cloudinary;

  if (!config?.cloudName || !config?.uploadPreset) {
    throw new Error('Cloudinary configuration পাওয়া যায়নি।');
  }

  return config;
}


// ========================================
// UPLOAD TO CLOUDINARY
// ========================================

async function uploadToCloudinary(file) {
  const config = getCloudinaryConfig();

  const formData = new FormData();

  formData.append('file', file);
  formData.append('upload_preset', config.uploadPreset);

  if (config.folder) {
    formData.append('folder', config.folder);
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    {
      method: 'POST',
      body: formData
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || 'Cloudinary upload failed'
    );
  }

  if (!result.secure_url || !result.public_id) {
    throw new Error('Cloudinary image response invalid');
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width || 0,
    height: result.height || 0,
    format: result.format || '',
    bytes: result.bytes || 0
  };
}


// ========================================
// UPLOAD IMAGE
// ========================================

async function uploadProductImage(file) {
  if (!validateImageFile(file)) return null;

  if (productImages.length >= MAX_IMAGES) {
    showProductMessage(
      `সর্বোচ্চ ${MAX_IMAGES} টি ছবি রাখা যাবে।`,
      'warning'
    );

    return null;
  }

  try {
    const uploaded = await uploadToCloudinary(file);

    const image = {
      url: uploaded.url,
      publicId: uploaded.publicId,
      alt: '',
      color: '',
      order: productImages.length + 1,
      width: uploaded.width,
      height: uploaded.height,
      format: uploaded.format
    };

    productImages.push(image);

    renderProductImages();

    showProductMessage(
      'ছবি সফলভাবে Upload হয়েছে।',
      'success'
    );

    return image;

  } catch (error) {
    console.error('[PRODUCT IMAGES]', error);

    showProductMessage(
      error.message || 'ছবি Upload করা যায়নি।',
      'error'
    );

    return null;
  }
}


// ========================================
// RENDER IMAGE LIST
// ========================================

function renderProductImages() {
  const { container } = getElements();

  if (!container) return;

  container.replaceChildren();

  productImages.forEach((image, index) => {
    const card = document.createElement('div');

    card.className = 'product-image-item';
    card.dataset.index = String(index);

    const img = document.createElement('img');

    img.src = image.url;
    img.alt = image.alt || `Product image ${index + 1}`;
    img.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'product-image-info';

    const mainButton = document.createElement('button');

    mainButton.type = 'button';
    mainButton.dataset.action = 'main';
    mainButton.textContent = image.isMain
      ? 'Main Image'
      : 'Set Main';

    const hoverButton = document.createElement('button');

    hoverButton.type = 'button';
    hoverButton.dataset.action = 'hover';
    hoverButton.textContent = image.isHover
      ? 'Hover Image'
      : 'Set Hover';

    const deleteButton = document.createElement('button');

    deleteButton.type = 'button';
    deleteButton.dataset.action = 'delete';
    deleteButton.textContent = 'Delete';

    const altInput = document.createElement('input');

    altInput.type = 'text';
    altInput.dataset.action = 'alt';
    altInput.placeholder = 'Image alt text';
    altInput.value = image.alt || '';

    const colorInput = document.createElement('input');

    colorInput.type = 'text';
    colorInput.dataset.action = 'color';
    colorInput.placeholder = 'Color (optional)';
    colorInput.value = image.color || '';

    info.append(
      mainButton,
      hoverButton,
      deleteButton,
      altInput,
      colorInput
    );

    card.append(img, info);

    container.appendChild(card);
  });
}


// ========================================
// SET MAIN IMAGE
// ========================================

function setMainImage(index) {
  if (!productImages[index]) return;

  productImages = productImages.map((image, i) => ({
    ...image,
    isMain: i === index
  }));

  renderProductImages();
}


// ========================================
// SET HOVER IMAGE
// ========================================

function setHoverImage(index) {
  if (!productImages[index]) return;

  productImages = productImages.map((image, i) => ({
    ...image,
    isHover: i === index
  }));

  renderProductImages();
}


// ========================================
// DELETE IMAGE
// ========================================

function deleteProductImage(index) {
  if (!productImages[index]) return;

  productImages.splice(index, 1);

  productImages = productImages.map((image, i) => ({
    ...image,
    order: i + 1
  }));

  if (productImages.length) {
    if (!productImages.some(image => image.isMain)) {
      productImages[0].isMain = true;
    }

    if (!productImages.some(image => image.isHover)) {
      productImages.forEach(image => {
        image.isHover = false;
      });
    }
  }

  renderProductImages();
}


// ========================================
// IMAGE EVENTS
// ========================================

function bindImageEvents() {
  const { input, uploadButton, container } = getElements();

  uploadButton?.addEventListener('click', () => {
    input?.click();
  });

  input?.addEventListener('change', async () => {
    const files = Array.from(input.files || []);

    for (const file of files) {
      if (productImages.length >= MAX_IMAGES) break;

      await uploadProductImage(file);
    }

    input.value = '';
  });

  container?.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');

    if (!button) return;

    const card = button.closest('.product-image-item');

    if (!card) return;

    const index = Number(card.dataset.index);

    switch (button.dataset.action) {
      case 'main':
        setMainImage(index);
        break;

      case 'hover':
        setHoverImage(index);
        break;

      case 'delete':
        deleteProductImage(index);
        break;
    }
  });

  container?.addEventListener('input', event => {
    const inputElement = event.target;

    const card = inputElement.closest('.product-image-item');

    if (!card) return;

    const index = Number(card.dataset.index);

    if (!productImages[index]) return;

    if (inputElement.dataset.action === 'alt') {
      productImages[index].alt = inputElement.value;
    }

    if (inputElement.dataset.action === 'color') {
      productImages[index].color = inputElement.value;
    }
  });
}


// ========================================
// GET IMAGE DATA
// ========================================

export function getProductImagesData() {
  return productImages.map((image, index) => ({
    url: image.url,
    publicId: image.publicId,
    alt: image.alt || '',
    color: image.color || '',
    order: index + 1,
    width: image.width || 0,
    height: image.height || 0
  }));
}


// ========================================
// SET IMAGE DATA (EDIT PRODUCT)
// ========================================

export function setProductImagesData(images = []) {
  if (!Array.isArray(images)) return;

  productImages = images.slice(0, MAX_IMAGES).map(
    (image, index) => ({
      url: image.url || '',
      publicId: image.publicId || '',
      alt: image.alt || '',
      color: image.color || '',
      order: index + 1,
      width: image.width || 0,
      height: image.height || 0,
      isMain: image.isMain === true || index === 0,
      isHover: image.isHover === true
    })
  );

  renderProductImages();
}


// ========================================
// VALIDATE IMAGES
// ========================================

export function validateProductImages() {
  if (productImages.length < 3) {
    showProductMessage(
      'Active Product-এর জন্য কমপক্ষে 3 টি ছবি প্রয়োজন।',
      'warning'
    );

    return false;
  }

  if (!productImages.some(image => image.isMain)) {
    showProductMessage(
      'একটি Main Image নির্বাচন করুন।',
      'warning'
    );

    return false;
  }

  return true;
}


// ========================================
// RESET IMAGES
// ========================================

export function resetProductImages() {
  productImages = [];

  const { input } = getElements();

  if (input) input.value = '';

  renderProductImages();
}


// ========================================
// INITIALIZE
// ========================================

export function initProductImages() {
  if (initialized) return;

  const { container, input, uploadButton } = getElements();

  if (!container || !input || !uploadButton) {
    console.warn(
      '[PRODUCT IMAGES] Required HTML elements not found.'
    );

    return;
  }

  input.type = 'file';
  input.accept = ALLOWED_TYPES.join(',');
  input.multiple = true;

  bindImageEvents();

  initialized = true;

  renderProductImages();
}


// ========================================
// DEFAULT EXPORT
// ========================================

export default initProductImages;
