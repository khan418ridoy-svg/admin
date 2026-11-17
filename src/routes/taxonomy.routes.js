
'use strict';

const express = require('express');

const router = express.Router();

const adminAuth = require('../middleware/adminAuth');
const taxonomyService = require('../services/taxonomy.service');

// ========================================
// Async Handler
// ========================================

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// ========================================
// Authentication
// ========================================

// All taxonomy routes require admin authentication.
router.use(adminAuth);

// ========================================
// GET: Version Only
// ========================================

// GET /api/taxonomy/version
router.get(
  '/version',
  asyncHandler(async (req, res) => {
    const meta = await taxonomyService.getTaxonomyMeta();

    res.json({
      success: true,
      version: meta.version,
      updatedAt: meta.updatedAt
    });
  })
);

// ========================================
// GET: All Collections (Cache Aware)
// ========================================

// GET /api/taxonomy
// GET /api/taxonomy?version=5

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const clientVersion = req.query.version ?? null;

    const result = await taxonomyService.listCollections(
      clientVersion
    );

    res.json({
      success: true,
      ...result
    });
  })
);

// ========================================
// POST: Create Collection
// ========================================

// POST /api/taxonomy/collections

router.post(
  '/collections',
  asyncHandler(async (req, res) => {
    const collection = await taxonomyService.createCollection(
      req.body || {}
    );

    res.status(201).json({
      success: true,
      message: 'Collection created successfully',
      collection
    });
  })
);

// ========================================
// GET: Single Collection
// ========================================

// GET /api/taxonomy/:collectionId

router.get(
  '/:collectionId',
  asyncHandler(async (req, res) => {
    const collection = await taxonomyService.getCollection(
      req.params.collectionId
    );

    res.json({
      success: true,
      collection
    });
  })
);

// ========================================
// PATCH: Update Collection
// ========================================

// PATCH /api/taxonomy/:collectionId

router.patch(
  '/:collectionId',
  asyncHandler(async (req, res) => {
    const collection = await taxonomyService.updateCollection(
      req.params.collectionId,
      req.body || {}
    );

    res.json({
      success: true,
      message: 'Collection updated successfully',
      collection
    });
  })
);

// ========================================
// DELETE: Collection
// ========================================

// DELETE /api/taxonomy/:collectionId

router.delete(
  '/:collectionId',
  asyncHandler(async (req, res) => {
    const result = await taxonomyService.deleteCollection(
      req.params.collectionId
    );

    res.json({
      success: true,
      message: 'Collection deleted successfully',
      ...result
    });
  })
);

// ========================================
// POST: Create Category
// ========================================

// POST /api/taxonomy/:collectionId/categories

router.post(
  '/:collectionId/categories',
  asyncHandler(async (req, res) => {
    const category = await taxonomyService.createCategory(
      req.params.collectionId,
      req.body || {}
    );

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category
    });
  })
);

// ========================================
// PATCH: Update Category
// ========================================

// PATCH /api/taxonomy/:collectionId/categories/:categoryId

router.patch(
  '/:collectionId/categories/:categoryId',
  asyncHandler(async (req, res) => {
    const collection = await taxonomyService.updateCategory(
      req.params.collectionId,
      req.params.categoryId,
      req.body || {}
    );

    res.json({
      success: true,
      message: 'Category updated successfully',
      collection
    });
  })
);

// ========================================
// DELETE: Category
// ========================================

// DELETE /api/taxonomy/:collectionId/categories/:categoryId

router.delete(
  '/:collectionId/categories/:categoryId',
  asyncHandler(async (req, res) => {
    const collection = await taxonomyService.deleteCategory(
      req.params.collectionId,
      req.params.categoryId
    );

    res.json({
      success: true,
      message: 'Category deleted successfully',
      collection
    });
  })
);

// ========================================
// POST: Create Subcategory
// ========================================

// POST /api/taxonomy/:collectionId/categories/:categoryId/subcategories

router.post(
  '/:collectionId/categories/:categoryId/subcategories',
  asyncHandler(async (req, res) => {
    const subCategory = await taxonomyService.createSubcategory(
      req.params.collectionId,
      req.params.categoryId,
      req.body || {}
    );

    res.status(201).json({
      success: true,
      message: 'Subcategory created successfully',
      subCategory
    });
  })
);

// ========================================
// PATCH: Update Subcategory
// ========================================

// PATCH /api/taxonomy/:collectionId/categories/:categoryId/subcategories/:subCategoryId

router.patch(
  '/:collectionId/categories/:categoryId/subcategories/:subCategoryId',
  asyncHandler(async (req, res) => {
    const collection = await taxonomyService.updateSubcategory(
      req.params.collectionId,
      req.params.categoryId,
      req.params.subCategoryId,
      req.body || {}
    );

    res.json({
      success: true,
      message: 'Subcategory updated successfully',
      collection
    });
  })
);

// ========================================
// DELETE: Subcategory
// ========================================

// DELETE /api/taxonomy/:collectionId/categories/:categoryId/subcategories/:subCategoryId

router.delete(
  '/:collectionId/categories/:categoryId/subcategories/:subCategoryId',
  asyncHandler(async (req, res) => {
    const collection = await taxonomyService.deleteSubcategory(
      req.params.collectionId,
      req.params.categoryId,
      req.params.subCategoryId
    );

    res.json({
      success: true,
      message: 'Subcategory deleted successfully',
      collection
    });
  })
);

// ========================================
// Export
// ========================================

module.exports = router;
