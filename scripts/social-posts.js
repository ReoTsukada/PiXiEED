(function () {
  'use strict';

  if (window.PiXiEEDSocialPosts) return;

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  const BUCKET = 'social-posts';
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
  const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/webp', 'image/gif', 'image/jpeg']);
  let clientPromise = null;

  function ensureClientId() {
    const key = 'pixieed_client_id';
    try {
      const current = localStorage.getItem(key);
      if (current) return current;
      const next = crypto.randomUUID?.() || `social-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, next);
      return next;
    } catch (_error) {
      return `social-${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  async function client() {
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) {
      return window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
    }
    if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) {
      try {
        return await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
      } catch (_error) {
        window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = null;
      }
    }
    if (!clientPromise) {
      clientPromise = import(SUPABASE_MODULE_URL).then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: AUTH_STORAGE_KEY,
        },
        global: { headers: { 'x-client-id': ensureClientId() } },
      }));
      window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = clientPromise;
    }
    const instance = await clientPromise;
    window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ ||= instance;
    return instance;
  }

  async function session() {
    const instance = await client();
    const { data, error } = await instance.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  async function loadFeed(limit = 120) {
    const instance = await client();
    const { data, error } = await instance.rpc('social_public_feed_v1', {
      input_limit: Math.min(120, Math.max(1, Number(limit) || 120)),
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadPost(postId) {
    const instance = await client();
    const { data, error } = await instance.rpc('social_public_post_v1', { input_post_id: postId });
    if (error) throw error;
    return data && typeof data === 'object' ? data : null;
  }

  async function sourceStates(postKind, sourceIds) {
    const unique = Array.from(new Set((sourceIds || []).map(String).filter(Boolean)));
    if (!unique.length) return new Map();
    const instance = await client();
    const { data, error } = await instance.rpc('social_posts_for_sources_v1', {
      input_post_kind: postKind,
      input_source_ids: unique,
    });
    if (error) throw error;
    return new Map((Array.isArray(data) ? data : []).map((entry) => [String(entry.source_id), entry]));
  }

  async function toggleLike(postId) {
    const currentSession = await session();
    if (!currentSession?.user) {
      const error = new Error('login required');
      error.code = 'LOGIN_REQUIRED';
      throw error;
    }
    const instance = await client();
    const { data, error } = await instance.rpc('social_toggle_like_v1', { input_post_id: postId });
    if (error) throw error;
    return data;
  }

  function extensionFor(file) {
    const known = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/jpeg': 'jpg' };
    return known[file.type] || 'png';
  }

  async function createImagePost(file, options = {}) {
    if (!(file instanceof File) || !ACCEPTED_IMAGE_TYPES.has(file.type)) {
      throw new Error('PNG・WebP・GIF・JPEG画像を選択してください。');
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
      throw new Error('画像は10MB以内にしてください。');
    }
    const currentSession = await session();
    if (!currentSession?.user?.id) {
      const error = new Error('login required');
      error.code = 'LOGIN_REQUIRED';
      throw error;
    }
    const instance = await client();
    const objectPath = `${currentSession.user.id}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID?.() || Date.now()}.${extensionFor(file)}`;
    const { error: uploadError } = await instance.storage.from(BUCKET).upload(objectPath, file, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const distributionMode = options.freeDownload ? 'free' : 'showcase';
    const rpcPayload = {
      input_title: String(options.title || '').trim(),
      input_caption: String(options.caption || '').trim(),
      input_tags: Array.isArray(options.tags) ? options.tags.slice(0, 5) : [],
      input_object_path: objectPath,
      input_distribution_mode: distributionMode,
      input_derivative_allowed: distributionMode === 'free' && Boolean(options.derivativeAllowed),
      input_comments_enabled: options.commentsEnabled !== false,
      input_content_kind: ['finished', 'wip', 'material', 'game'].includes(String(options.contentKind || ''))
        ? String(options.contentKind)
        : 'finished',
    };
    let result = await instance.rpc('social_create_image_post_v2', rpcPayload);
    const signatureUnavailable = result.error && /could not find the function|does not exist|function .*social_create_image_post_v2/i.test(String(result.error.message || ''));
    if (signatureUnavailable) {
      const { input_content_kind: _contentKind, ...legacyPayload } = rpcPayload;
      result = await instance.rpc('social_create_image_post_v2', legacyPayload);
    }
    const { data, error } = result;
    if (error) {
      await instance.storage.from(BUCKET).remove([objectPath]).catch(() => {});
      throw error;
    }
    return String(data || '');
  }

  async function loadComments(postId, limit = 50) {
    const instance = await client();
    const { data, error } = await instance.rpc('social_public_comments_v1', {
      input_post_id: postId,
      input_limit: Math.min(50, Math.max(1, Number(limit) || 50)),
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function createComment(postId, body) {
    const currentSession = await session();
    if (!currentSession?.user) {
      const error = new Error('login required');
      error.code = 'LOGIN_REQUIRED';
      throw error;
    }
    const instance = await client();
    const { data, error } = await instance.rpc('social_create_comment_v1', {
      input_post_id: postId,
      input_body: String(body || '').trim(),
    });
    if (error) throw error;
    return data;
  }

  async function removeComment(commentId) {
    const instance = await client();
    const { data, error } = await instance.rpc('social_remove_comment_v1', { input_comment_id: commentId });
    if (error) throw error;
    return Boolean(data);
  }

  function publicMediaUrl(objectPath) {
    const path = String(objectPath || '').replace(/^\/+/, '');
    return path ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}` : '';
  }

  async function marketPreviews(assetIds) {
    const unique = Array.from(new Set((assetIds || []).map(String).filter(Boolean)));
    if (!unique.length) return {};
    const instance = await client();
    const { data, error } = await instance.functions.invoke('market-public-preview', {
      body: { asset_ids: unique },
    });
    if (error) throw error;
    return data?.previews && typeof data.previews === 'object' ? data.previews : {};
  }

  function avatarUrl(value) {
    const raw = String(value || '').trim();
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
    const id = raw.toLowerCase();
    if (/^jerin[1-8]$/.test(id)) return `/character-dots/Jerin${id.slice(5)}.png`;
    if (/^jellnall([1-9]|1[0-9])$/.test(id)) return `/character-dots/${id.toUpperCase()}.png`;
    if (id === 'baburin') return '/character-dots/baburinpng.png';
    return '/character-dots/maousama.png';
  }

  function postImageUrl(post, previews = {}) {
    if (post?.post_kind === 'image') return publicMediaUrl(post.media_object_path);
    if (post?.post_kind === 'market') return previews[post.market_asset_id] || '';
    return String(post?.source_thumbnail_url || '');
  }

  function detailUrl(post) {
    const id = encodeURIComponent(String(post?.id || ''));
    return `/post/?id=${id}`;
  }

  function loginUrl() {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return `/account/index.html?auth=login&returnTo=${encodeURIComponent(returnTo)}`;
  }

  window.PiXiEEDSocialPosts = Object.freeze({
    avatarUrl,
    client,
    createComment,
    createImagePost,
    detailUrl,
    loadFeed,
    loadComments,
    loadPost,
    loginUrl,
    marketPreviews,
    postImageUrl,
    publicMediaUrl,
    removeComment,
    session,
    sourceStates,
    toggleLike,
  });
})();
