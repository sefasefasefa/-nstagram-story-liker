import { fetchStoriesTray, fetchUserStories, likeMedia } from "./feed.js";

export interface AutoLikerStatus {
  enabled: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalLiked: number;
  lastRunLiked: number;
  log: string[];
}

const MAX_LOG = 50;

const state: {
  enabled: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  totalLiked: number;
  lastRunLiked: number;
  log: string[];
  timer: ReturnType<typeof setInterval> | null;
  running: boolean; // true while a tick is in progress
} = {
  enabled: false,
  intervalMs: 15 * 60 * 1000, // 15 dakika
  lastRunAt: null,
  nextRunAt: null,
  totalLiked: 0,
  lastRunLiked: 0,
  log: [],
  timer: null,
  running: false,
};

function pushLog(msg: string) {
  const ts = new Date().toLocaleTimeString("tr-TR", { hour12: false });
  state.log.unshift(`[${ts}] ${msg}`);
  if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
}

async function tick() {
  if (state.running) return; // önceki tur bitmemişse atla
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  pushLog("Hikaye tepsisi taranıyor…");

  let likedThisRun = 0;
  try {
    const tray = await fetchStoriesTray();
    if (tray.error) {
      pushLog(`Tepsi hatası: ${tray.error}`);
      return;
    }

    const reels = tray.reels ?? [];
    pushLog(`${reels.length} kullanıcının hikayesi bulundu`);

    for (const reel of reels) {
      if (!state.enabled) break; // durdurulduysa döngüyü kes

      try {
        const stories = await fetchUserStories(reel.userId);
        const items = stories.items ?? [];

        for (const item of items) {
          if (!state.enabled) break;
          if (item.hasLiked) continue; // zaten beğenilmiş

          const result = await likeMedia(item.storyId);
          if (result.success) {
            likedThisRun++;
            state.totalLiked++;
            pushLog(`✓ @${reel.user.username} — ${item.storyId} beğenildi`);
          } else {
            pushLog(`✗ @${reel.user.username} — ${item.storyId}: ${result.message}`);
          }

          // Instagram rate-limit koruması: her beğeni arası 1.5s bekle
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (err) {
        pushLog(`@${reel.user.username} hatası: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    state.lastRunLiked = likedThisRun;
    state.running = false;
    if (state.enabled) {
      state.nextRunAt = new Date(Date.now() + state.intervalMs).toISOString();
    }
    pushLog(`Tur tamamlandı — bu turda ${likedThisRun} beğeni yapıldı`);
  }
}

export function startAutoLiker(intervalMs?: number): AutoLikerStatus {
  if (intervalMs && intervalMs >= 60_000) {
    state.intervalMs = intervalMs;
  }
  if (!state.enabled) {
    state.enabled = true;
    state.nextRunAt = new Date(Date.now() + state.intervalMs).toISOString();
    pushLog(`Otomatik beğeni başlatıldı — her ${Math.round(state.intervalMs / 60000)} dakikada bir çalışacak`);

    // Hemen bir tur başlat, sonra aralıklı çalıştır
    tick();
    state.timer = setInterval(tick, state.intervalMs);
  }
  return getStatus();
}

export function stopAutoLiker(): AutoLikerStatus {
  if (state.enabled) {
    state.enabled = false;
    state.nextRunAt = null;
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    pushLog("Otomatik beğeni durduruldu");
  }
  return getStatus();
}

export function getStatus(): AutoLikerStatus {
  return {
    enabled: state.enabled,
    intervalMs: state.intervalMs,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    totalLiked: state.totalLiked,
    lastRunLiked: state.lastRunLiked,
    log: [...state.log],
  };
}
