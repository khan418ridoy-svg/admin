
const { db } = require('../config/firebase');
const { GRAPH_VERSION, SITE_URL } = require('../config/settings');
const catalog = require('../services/catalog/search');

const graph = `https://graph.facebook.com/${GRAPH_VERSION}`;
const PUBLIC_REPLY = 'স্যার, খুব দ্রুত আপনার সাথে যোগাযোগ করা হবে।';

const BAD_WORDS = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole',
  'motherfucker', 'মাদারচোদ', 'চোদ', 'খানকি',
  'বোকাচোদা', 'হারামজাদা'
];

const PROCESSING_TIMEOUT = 2 * 60 * 1000;

function isBadComment(value) {
  const text = String(value || '').toLowerCase().trim();

  if (!text) return true;
  if (BAD_WORDS.some(word => text.includes(word))) return true;

  const links = (text.match(/https?:\/\//g) || []).length;

  if (
    links >= 2 ||
    /(inbox me|whatsapp me|earn money|crypto signal|loan offer)/i.test(text)
  ) {
    return true;
  }

  return false;
}

async function pageToken() {
  const snap = await db.doc('meta/privateFacebook').get();

  const token = snap.exists
    ? snap.data().pageAccessToken
    : process.env.META_PAGE_TOKEN;

  if (!token) {
    throw new Error('meta_page_token_missing');
  }

  return token;
}

async function graphPost(path, token, body) {
  const response = await fetch(
    `${graph}/${path}?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.error?.message || `meta_graph_${response.status}`
    );

    error.status = response.status;
    error.metaCode = data.error?.code;
    error.metaSubcode = data.error?.error_subcode;

    throw error;
  }

  return data;
}

async function getPostText(postId, token) {
  const fields = encodeURIComponent(
    'message,story,full_picture,permalink_url'
  );

  const response = await fetch(
    `${graph}/${encodeURIComponent(postId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(10000) }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error?.message || `meta_post_${response.status}`
    );
  }

  return `${data.message || ''}\n${data.story || ''}`;
}

function extractCode(text) {
  const matches =
    String(text || '').match(/\b[A-Z0-9][A-Z0-9_-]{3,24}\b/gi) || [];

  return (
    matches.find(x => /[A-Z]/i.test(x) && /\d/.test(x)) ||
    matches[0] ||
    ''
  );
}

function productDetails(p) {
  const price = Number(
    p.sellingPrice ??
    p.baseSellingPrice ??
    p.price ??
    p.minPrice ??
    0
  );

  const colors = (p.availableColors || p.colors || [])
    .slice(0, 8)
    .join(', ');

  const sizes = (p.availableSizes || p.sizes || [])
    .slice(0, 10)
    .join(', ');

  const url =
    /^https:\/\//i.test(SITE_URL) && p.slug
      ? `${SITE_URL.replace(/\/$/, '')}/products/${encodeURIComponent(p.slug)}`
      : '';

  return [
    `🌸 Nishat Fashion — ${p.name || 'Product'}`,
    `Product Code: ${p.shortCode || p.sku || 'N/A'}`,
    price > 0 ? `Price: ৳${price.toLocaleString('en-BD')}` : '',
    colors ? `Available Color: ${colors}` : '',
    sizes ? `Available Size: ${sizes}` : '',
    Number(p.totalStock || 0) > 0
      ? 'Stock: Available'
      : 'Stock: Please confirm with our team',
    url ? `Product Link: ${url}` : '',
    'অর্ডার করতে চাইলে আপনার পছন্দের Color ও Size লিখুন।'
  ]
    .filter(Boolean)
    .join('\n');
}

// Prevent duplicate processing while allowing failed/stale events to retry.
async function claimEvent(eventRef, eventData) {
  let claimed = false;
  let previous = {};

  await db.runTransaction(async tx => {
    const snap = await tx.get(eventRef);
    const now = Date.now();

    if (snap.exists) {
      previous = snap.data() || {};

      // A successful private reply must never be sent twice.
      if (
        previous.privateReplyStatus === 'sent' ||
        previous.status === 'replied' ||
        previous.status === 'private_replied_public_failed' ||
        previous.status === 'skipped_moderation'
      ) {
        return;
      }

      // Another worker may currently be processing this comment.
      if (
        previous.status === 'processing' &&
        now - Number(previous.processingStartedAt || previous.createdAt || 0) <
          PROCESSING_TIMEOUT
      ) {
        return;
      }
    }

    tx.set(
      eventRef,
      {
        ...eventData,
        status: 'processing',
        processingStartedAt: now,
        attempts: Number(previous.attempts || 0) + 1,
        updatedAt: now
      },
      { merge: true }
    );

    claimed = true;
  });

  return { claimed, previous };
}

async function handleComment(change, pageId) {
  const value = change?.value || {};

  if (
    String(value.item || '').toLowerCase() !== 'comment' ||
    String(value.verb || '').toLowerCase() !== 'add'
  ) {
    return;
  }

  const commentId = String(value.comment_id || value.id || '');
  const commentText = String(value.message || '').trim();
  const fromId = String(value.from?.id || '');

  if (!commentId || !commentText) {
    console.warn('[comment-automation] comment ID or message missing');
    return;
  }

  if (fromId && fromId === String(pageId)) {
    return;
  }

  const safeId = commentId
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 140);

  const eventRef = db
    .collection('facebookCommentEvents')
    .doc(safeId);

  let previous = {};

  try {
    const claim = await claimEvent(eventRef, {
      commentId,
      pageId: String(pageId),
      commentText,
      fromId,
      createdAt: Date.now()
    });

    if (!claim.claimed) {
      console.info(
        '[comment-automation] duplicate/already processed:',
        commentId
      );
      return;
    }

    previous = claim.previous;

    console.info(
      '[comment-automation] processing comment:',
      commentId
    );

    if (isBadComment(commentText)) {
      await eventRef.set(
        {
          status: 'skipped_moderation',
          moderation: 'bad_or_spam',
          completedAt: Date.now()
        },
        { merge: true }
      );

      console.info(
        '[comment-automation] skipped by moderation:',
        commentId
      );

      return;
    }

    const token = await pageToken();

    // Find product information for the private reply.
    let postText = '';
    const postId = String(value.post_id || '');

    if (postId) {
      try {
        postText = await getPostText(postId, token);
      } catch (error) {
        console.warn(
          '[comment-automation] post lookup failed:',
          error.message
        );
      }
    }

    const code = extractCode(`${postText}\n${commentText}`);
    let product = null;

    if (code) {
      try {
        product = await catalog.getByCode(code);
      } catch (error) {
        console.warn(
          '[comment-automation] catalog lookup failed:',
          error.message
        );
      }
    }

    const privateMessage = product
      ? productDetails(product)
      : 'স্যার, আপনার পছন্দের পণ্যটি নিশ্চিতভাবে শনাক্ত করতে পারিনি। অনুগ্রহ করে পোস্টে থাকা Product Code-টি Inbox-এ লিখুন, আমরা বিস্তারিত পাঠিয়ে দেব।';

    // Public reply: independent operation.
    let publicReplyOk = previous.publicReplyStatus === 'sent';
    let publicReplyError = previous.publicReplyError || null;

    if (!publicReplyOk) {
      try {
        await graphPost(
          `${encodeURIComponent(commentId)}/comments`,
          token,
          { message: PUBLIC_REPLY }
        );

        publicReplyOk = true;
        publicReplyError = null;

        await eventRef.set(
          {
            publicReplyStatus: 'sent',
            publicRepliedAt: Date.now(),
            publicReplyError: null
          },
          { merge: true }
        );

        console.info(
          '[comment-automation] public reply sent:',
          commentId
        );
      } catch (error) {
        publicReplyOk = false;
        publicReplyError = error.message;

        await eventRef.set(
          {
            publicReplyStatus: 'failed',
            publicReplyError: error.message
          },
          { merge: true }
        );

        console.error(
          '[comment-automation] public reply failed:',
          commentId,
          error.message,
          'Meta code:',
          error.metaCode || 'N/A'
        );
      }
    }

    // Private inbox reply: always attempt, even if public reply failed.
    let privateReplyOk = previous.privateReplyStatus === 'sent';
    let privateReplyError = previous.privateReplyError || null;

    if (!privateReplyOk) {
      try {
        await graphPost(
          `${encodeURIComponent(commentId)}/private_replies`,
          token,
          { message: privateMessage }
        );

        privateReplyOk = true;
        privateReplyError = null;

        await eventRef.set(
          {
            privateReplyStatus: 'sent',
            privateRepliedAt: Date.now(),
            privateReplyError: null,
            productId: product?.id || null,
            productCode: code || null
          },
          { merge: true }
        );

        console.info(
          '[comment-automation] private inbox reply sent:',
          commentId
        );
      } catch (error) {
        privateReplyOk = false;
        privateReplyError = error.message;

        await eventRef.set(
          {
            privateReplyStatus: 'failed',
            privateReplyError: error.message,
            productId: product?.id || null,
            productCode: code || null
          },
          { merge: true }
        );

        console.error(
          '[comment-automation] private reply failed:',
          commentId,
          error.message,
          'Meta code:',
          error.metaCode || 'N/A'
        );
      }
    }

    let status = 'failed';

    if (privateReplyOk && publicReplyOk) {
      status = 'replied';
    } else if (privateReplyOk && !publicReplyOk) {
      status = 'private_replied_public_failed';
    } else if (!privateReplyOk && publicReplyOk) {
      status = 'public_replied_private_failed';
    }

    await eventRef.set(
      {
        status,
        publicReplyStatus: publicReplyOk ? 'sent' : 'failed',
        privateReplyStatus: privateReplyOk ? 'sent' : 'failed',
        publicReplyError,
        privateReplyError,
        productId: product?.id || null,
        productCode: code || null,
        completedAt: Date.now(),
        updatedAt: Date.now()
      },
      { merge: true }
    );

    console.info(
      '[comment-automation] completed:',
      commentId,
      'status:',
      status
    );
  } catch (error) {
    await eventRef.set(
      {
        status: 'failed',
        error: error.message,
        failedAt: Date.now(),
        updatedAt: Date.now()
      },
      { merge: true }
    ).catch(saveError => {
      console.error(
        '[comment-automation] failed to save event error:',
        saveError.message
      );
    });

    console.error(
      '[comment-automation] handler failed:',
      commentId,
      error.message,
      'Meta code:',
      error.metaCode || 'N/A'
    );

    throw error;
  }
}

module.exports = {
  handleComment,
  isBadComment
};
