// A product may go live (status -> active) only after it was viewed and marked "OK".
// Set REQUIRE_REVIEW_FOR_ACTIVE to false to turn the review rule off (the 3-image rule stays).
const REQUIRE_REVIEW_FOR_ACTIVE = true;
const MIN_IMAGES = 3;

// Returns an error code when the product can't become active, otherwise null.
function activationBlocker(product) {
  if (REQUIRE_REVIEW_FOR_ACTIVE && product?.review?.status !== 'ok') return 'review_not_ok';
  const imageCount = Array.isArray(product?.images) ? product.images.filter(x => x && x.url).length : 0;
  if (imageCount < MIN_IMAGES) return 'active_product_requires_minimum_3_images';
  return null;
}

// Only a real change to "active" is checked; products already active are left alone.
const needsActivationCheck = (currentStatus, nextStatus) => nextStatus === 'active' && currentStatus !== 'active';

module.exports = { REQUIRE_REVIEW_FOR_ACTIVE, MIN_IMAGES, activationBlocker, needsActivationCheck };
