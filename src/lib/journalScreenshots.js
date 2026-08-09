import { supabase } from '@/api/supabaseClient';

export const JOURNAL_SCREENSHOT_BUCKET = 'journal-screenshots';
export const MAX_JOURNAL_SCREENSHOTS = 6;
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

const safeExt = (file) => {
  const nameExt = file?.name?.split('.').pop()?.toLowerCase();
  if (nameExt && /^[a-z0-9]{2,5}$/.test(nameExt)) return nameExt;
  const mimeExt = file?.type?.split('/').pop()?.toLowerCase();
  return mimeExt && /^[a-z0-9]{2,5}$/.test(mimeExt) ? mimeExt : 'jpg';
};

export function validateJournalScreenshots(files = []) {
  const list = Array.from(files);
  if (list.length > MAX_JOURNAL_SCREENSHOTS) {
    return `You can attach up to ${MAX_JOURNAL_SCREENSHOTS} screenshots per journal entry.`;
  }
  const invalidType = list.find(file => !file?.type?.startsWith('image/'));
  if (invalidType) return 'Screenshots must be image files.';
  const tooLarge = list.find(file => file.size > MAX_SCREENSHOT_BYTES);
  if (tooLarge) return 'Each screenshot must be 10 MB or smaller.';
  return null;
}

async function currentUserId() {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user?.id) throw new Error('Not authenticated');
  return data.user.id;
}

export async function uploadJournalScreenshots(files = []) {
  const list = Array.from(files);
  if (list.length === 0) return [];
  const validationError = validateJournalScreenshots(list);
  if (validationError) throw new Error(validationError);

  const userId = await currentUserId();
  const uploaded = [];

  try {
    for (const file of list) {
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const path = `${userId}/${id}.${safeExt(file)}`;
      const { error } = await supabase.storage
        .from(JOURNAL_SCREENSHOT_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        });
      if (error) throw error;
      uploaded.push(path);
    }
    return uploaded;
  } catch (error) {
    if (uploaded.length) {
      await supabase.storage.from(JOURNAL_SCREENSHOT_BUCKET).remove(uploaded).catch(() => {});
    }
    throw error;
  }
}

export async function removeJournalScreenshots(paths = []) {
  const valid = paths.filter(Boolean);
  if (!supabase || valid.length === 0) return;
  const { error } = await supabase.storage.from(JOURNAL_SCREENSHOT_BUCKET).remove(valid);
  if (error) throw error;
}

export async function signedJournalScreenshotUrls(paths = [], expiresIn = 3600) {
  const valid = paths.filter(Boolean);
  if (!supabase || valid.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(JOURNAL_SCREENSHOT_BUCKET)
    .createSignedUrls(valid, expiresIn);
  if (error) throw error;
  return (data || []).map(item => ({ path: item.path, url: item.signedUrl })).filter(item => item.url);
}
