
const { db } = require('../config/firebase');
const { handle } = require('./handleMessage');
const { handleComment } = require('./commentAutomation');

async function processWebhookEvent(body) {
  console.info('[FACEBOOK WEBHOOK] Processing started:', {
    object: body?.object,
    entries: body?.entry?.length || 0
  });

  for (const entry of body.entry || []) {
    const pageId = String(entry.id || '');

    // ==========================================
    // FACEBOOK PAGE FEED / COMMENT EVENTS
    // ==========================================
    if (body.object === 'page') {
      for (const change of entry.changes || []) {
        console.info('[FACEBOOK FEED EVENT]', JSON.stringify({
          pageId,
          field: change.field || null,
          item: change.value?.item || null,
          verb: change.value?.verb || null,
          commentId:
            change.value?.comment_id ||
            change.value?.id ||
            null,
          message: change.value?.message || null,
          senderId: change.value?.from?.id || null
        }));

        if (change.field !== 'feed') {
          console.warn(
            '[FACEBOOK FEED] Ignored non-feed field:',
            change.field
          );
          continue;
        }

        try {
          await handleComment(change, pageId);
        } catch (error) {
          console.error('[FACEBOOK COMMENT HANDLER ERROR]', {
            pageId,
            message: error.message,
            code: error.code || null,
            stack: error.stack
          });
        }
      }
    }

    // ==========================================
    // MESSENGER EVENTS
    // ==========================================
    for (const event of entry.messaging || []) {
      if (!event.sender?.id || event.message?.is_echo) {
        continue;
      }

      if (!event.message && !event.postback) {
        continue;
      }

      const psid = String(event.sender.id);

      const mid =
        event.message?.mid ||
        event.postback?.mid ||
        `evt_${pageId}_${psid}_${event.timestamp}`;

      if (pageId && psid === pageId) {
        console.warn(
          '[messenger-webhook] ignored event where sender is the Page itself',
          pageId
        );
        continue;
      }

      const text =
        event.message?.text ||
        event.postback?.title ||
        '';

      const attachment = (
        event.message?.attachments || []
      ).find(
        a => a.type === 'image' && a.payload?.url
      );

      const attachmentUrl =
        attachment?.payload?.url || null;

      console.info(
        `[messenger-webhook] received page=${pageId || 'unknown'} psid=${psid} mid=${mid} type=${event.postback ? 'postback' : event.message?.attachments ? 'attachment' : 'message'}`
      );

      const payload =
        event.message?.quick_reply?.payload ||
        event.postback?.payload ||
        null;

      const ref = db
        .collection('botEvents')
        .doc(
          Buffer.from(`${pageId}:${mid}`)
            .toString('base64url')
            .slice(0, 140)
        );

      try {
        await ref.create({
          pageId,
          mid,
          psid,
          text,
          payload,
          createdAt: Date.now(),
          processed: false
        });
      } catch (error) {
        if (
          error.code === 6 ||
          error.code === 'already-exists' ||
          String(error.message || '').includes('ALREADY_EXISTS')
        ) {
          continue;
        }

        console.error(
          '[messenger-webhook] failed to claim event',
          {
            pageId,
            psid,
            mid,
            error: error.message
          }
        );

        continue;
      }

      try {
        const convRef = db.doc(`conversations/${psid}`);
        const convSnap = await convRef.get();

        const senderName = String(
          convSnap.data()?.profileName || ''
        );

        await handle({
          psid,
          text,
          payload,
          mid,
          senderName,
          attachmentUrl
        });

        await ref.update({
          processed: true,
          processedAt: Date.now()
        });

      } catch (error) {
        console.error(
          `[messenger-handler] page=${pageId} psid=${psid} mid=${mid}`,
          error.message
        );

        await ref.update({
          processed: false,
          error: error.message,
          failedAt: Date.now()
        });
      }
    }
  }

  console.info('[FACEBOOK WEBHOOK] Processing finished');
}

module.exports = { processWebhookEvent };
