import { fileURLToPath } from "node:url";
import { gameCommandProfileId, MAX_PROFILE_ID, ProfileError } from "@lotus-yunzai/account";
import { createAtlasRuntimeCatalog, defaultAtlasLocale, parseAtlasLocale } from "@lotus-yunzai/atlas/catalog";
import { legacyLotusDirectories, readLotusGlobalConfig } from "../../lib/lotus-global-config.ts";
import { readAtlasGalleryImage } from "@lotus-yunzai/atlas/gallery";
import { ownedGenshinRole, type GenshinRoleProfiles } from "./owned-role.ts";
import type { AcquireRoleArchiveLock } from "@lotus-yunzai/storage";
import { renderAchievementCard, type AchievementCard } from "./achievement-card.ts";
import { achievementCategoryKey, achievementGroups, achievementStats, AchievementInputError,
  createAchievementProgressStore, maxAchievementBytes, parseAchievementExport, type AchievementCategory } from "./achievement-progress.ts";

const hostRoot = new URL("../../", import.meta.url);
const indexCommand = /^#成就(?:目录|索引|列表|查漏)?(?:\s*(?:档案\s*)?(\d{1,3}))?$/u;
const importCommand = /^#成就(?:导入|录入)(?:\s*(?:档案\s*)?(\d{1,3})(?!\d))?\s*([\s\S]*)$/u;
const categoryCommand = /^#([^#%*\r\n]{2,70})$/u;
const publicCategory = /^#成就(?:图鉴|分类)/u;
// Bare category lookups must leave genuine game, utility and personal commands for their own handlers.
const reserved = /队伍伤害|队伤|体力|树脂|便笺|便签|面板|更新|抽卡|签到|登录|图鉴|帮助|菜单|远程|上传|下载|B站|BBDown|深渊|深境|幻想|幻境|剧诗|真境|幽境|危战|星铁|崩铁|星穹铁道|绝区|攻略|配队|材料|素材|伤害|排名|排行|练度|兑换|计数器|[！!？?]/iu;
const waitMs = 300_000;
const categoryPageSize = 25;
const atlasUnavailable = "原神成就图鉴数据不可用，请执行 #全量更新图鉴 或检查当前图鉴目录。";

type Image = { readonly type: "image"; readonly file: Uint8Array };
type Reply = string | Image | { readonly type: "forward"; readonly nodes: readonly (string | Image)[]; readonly batchSize: number };
interface AchievementContext {
  readonly normalizedMessage: string;
  readonly adapter?: string;
  readonly self_id?: number;
  readonly user_id?: number;
  readonly group_id?: number;
  readonly message_type?: string;
  readonly inlineImageByteLimit?: number;
  readonly isDelegated?: boolean;
  readonly canReadAttachments?: boolean;
  readonly attachment?: { readonly name: string; read(signal?: AbortSignal): Promise<Uint8Array | undefined> };
  readonly forward?: (nodes: readonly (string | Image)[], senderName?: string) => Promise<boolean>;
  reply(message: string): unknown;
}
type Identity = { readonly uid: string; readonly accountId: string; readonly revision: string };
type Atlas = ReturnType<typeof createAtlasRuntimeCatalog>;
type Pending = { readonly profileId: number; readonly expires: number; readonly session: Identity;
  readonly timeout: ReturnType<typeof setTimeout>; busy: boolean };

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function scope(context: AchievementContext) {
  if (context.isDelegated || !positiveId(context.self_id) || !positiveId(context.user_id)) return;
  const place = context.message_type === "group" && positiveId(context.group_id) ? `group:${context.group_id}`
    : context.message_type === "private" ? "private" : undefined;
  if (place) return `${context.adapter ?? "onebot"}:${context.self_id}:${context.user_id}:${place}`;
}

function jsonAttachment(context: AchievementContext) {
  return context.attachment && /\.json$/iu.test(context.attachment.name) ? context.attachment : undefined;
}

function canContinueImport(message: string) {
  return !/^[#＃*＊%％/／]/u.test(message.trim());
}

function parseCategory(message: string, bareOnly: boolean) {
  if (publicCategory.test(message)) return;
  const body = categoryCommand.exec(message)?.[1]?.trim();
  if (!body) return;
  const explicit = body.startsWith("成就");
  if (!explicit && (!bareOnly || reserved.test(body))) return;
  const query = explicit ? body.slice("成就".length).trim() : body;
  if (!query || /^(?:分类|目录|索引|列表|查漏|导入|录入)$/u.test(query)) return;
  return { explicit, query };
}

function selectCategory({ query, explicit }: NonNullable<ReturnType<typeof parseCategory>>, categories: readonly AchievementCategory[]) {
  const names = categories.map(category => ({ category, key: achievementCategoryKey(category.name) }));
  const normalize = (label: string) => achievementCategoryKey(label.trim().replace(/(?:成就)+$/u, ""));
  const suffix = /(?:\s*档案\s*|\s*)(\d{1,3})$/u.exec(query);
  const split = suffix && suffix.index > 0 && !/\d$/u.test(query.slice(0, suffix.index)) ? suffix : undefined;
  const fullKey = normalize(query);
  const suffixKey = split && normalize(query.slice(0, split.index));
  const exact = (key: string) => names.find(item => item.key === key)?.category;
  const partial = (key: string) => {
    if (!key || !explicit && [...key].length < 2) return;
    return names.filter(item => item.key.includes(key) || key.includes(item.key))
      .sort((a, b) => Math.abs(a.key.length - key.length) - Math.abs(b.key.length - key.length))[0]?.category;
  };
  const full = exact(fullKey);
  if (full) return { category: full, profileId: gameCommandProfileId("gs") };
  if (split && suffixKey) {
    const category = exact(suffixKey) ?? partial(suffixKey);
    if (category) return { category, profileId: gameCommandProfileId("gs", split[1]) };
  }
  return { category: partial(fullKey), profileId: gameCommandProfileId("gs") };
}

function decode(value: string | Uint8Array) {
  const size = typeof value === "string" ? Buffer.byteLength(value) : value.byteLength;
  if (size > maxAchievementBytes) throw new AchievementInputError("成就 JSON 文件最多 4 MiB。");
  try {
    return JSON.parse(typeof value === "string" ? value : new TextDecoder("utf-8", { fatal: true }).decode(value));
  } catch {
    throw new AchievementInputError("成就文件不是有效的 UTF-8 JSON。");
  }
}

const progressLabel = (stats: ReturnType<typeof achievementStats>) =>
  `已完成 ${stats.completed}/${stats.total}，原石 ${stats.pointsDone}/${stats.pointsTotal}，完成率 ${stats.percent}%。`;
const summary = (stats: Pick<ReturnType<typeof achievementStats>, "completed" | "total" | "pointsDone" | "pointsTotal" | "percent">,
  end: string, label: "分类" | "分组" = "分类") => ({
  headers: ["成就", "原石", "完成率", label], widths: [183.75, 183.75, 183.75, 183.75],
  rows: [[`${stats.completed}/${stats.total}`, `${stats.pointsDone}/${stats.pointsTotal}`, `${stats.percent}%`, end]],
});

function configuredCatalog(root: URL) {
  const directory = fileURLToPath(new URL("data/atlas/", root));
  let catalog: Atlas | undefined;
  return async () => {
    const { atlas } = await readLotusGlobalConfig(root);
    const locale = parseAtlasLocale((atlas as { locale?: unknown } | undefined)?.locale) ?? defaultAtlasLocale;
    if (catalog?.locale !== locale) catalog = createAtlasRuntimeCatalog(directory, Bun.env.LOTUS_ATLAS_DATA_DIR, locale);
    return catalog;
  };
}

function progressStoreAt(root: URL, lockFile: AcquireRoleArchiveLock) {
  const current = fileURLToPath(new URL("data/achievements/", root));
  const legacy = ["plugins", "backup/plugins"].flatMap(directory => legacyLotusDirectories.map(name =>
    fileURLToPath(new URL(`${directory}/${name}/data/achievements/`, root))));
  return createAchievementProgressStore(current, [current, ...legacy], lockFile);
}

export function createAchievementCommand(profiles: GenshinRoleProfiles, lockFile: AcquireRoleArchiveLock, signal: AbortSignal, {
  installationRoot = hostRoot, atlas, atlasConfigRoot = installationRoot,
  store = progressStoreAt(installationRoot, lockFile),
  render = renderAchievementCard, now = () => performance.now(),
}: { installationRoot?: URL; atlas?: Pick<Atlas, "read" | "achievementCategoryArtwork" | "assetRoot">; atlasConfigRoot?: URL;
  store?: ReturnType<typeof createAchievementProgressStore>; render?: typeof renderAchievementCard; now?: () => number } = {}) {
  const activeCatalog = configuredCatalog(atlasConfigRoot);
  const pending = new Map<string, Pending>();

  function clear(key: string, request = pending.get(key)) {
    if (!request || pending.get(key) !== request) return;
    clearTimeout(request.timeout);
    pending.delete(key);
  }
  signal.addEventListener("abort", () => { for (const key of pending.keys()) clear(key); }, { once: true });

  async function identity(qq: string, profileId: number): Promise<Identity> {
    const { source, accountId } = await ownedGenshinRole(profiles, qq, profileId);
    return { uid: source.role.uid, accountId, revision: source.revision };
  }

  async function sameIdentity(qq: string, profileId: number, expected: Identity) {
    const current = await identity(qq, profileId).catch(() => undefined);
    return current?.uid === expected.uid && current.accountId === expected.accountId && current.revision === expected.revision;
  }

  async function catalog() {
    const source = atlas ?? await activeCatalog();
    const data = await source.read();
    const page = data.pages.find(item => item.game === "gi" && item.kind === "achievement" && !item.sampled);
    return {
      source,
      entries: page?.entries ?? [],
      categories: (page?.achievementCategories ?? []).toSorted((a, b) =>
        (a.priority ?? Number(a.id)) - (b.priority ?? Number(b.id)) || Number(a.id) - Number(b.id)),
    };
  }

  async function artwork(record: Awaited<ReturnType<typeof catalog>>, category: AchievementCategory) {
    const entry = record.entries.find(item => item.id === category.id);
    if (!entry) return;
    const path = await record.source.achievementCategoryArtwork(entry).catch(() => undefined);
    return await readAtlasGalleryImage(record.source.assetRoot(entry), "gi", path);
  }

  async function asImage(data: AchievementCard, inlineImageByteLimit?: number): Promise<Image> {
    const { png } = await render(data, { inlineImageByteLimit, signal });
    return { type: "image", file: png };
  }

  async function directoryCard(data: Awaited<ReturnType<typeof catalog>>, uid: string,
    stats: ReturnType<typeof achievementStats>, inlineImageByteLimit?: number, report?: { title: string; summary: AchievementCard["tables"][number]; notes: string[] }) {
    const rows = await Promise.all(stats.categories.map(async row => [
      { label: row.category.name, icon: await artwork(data, row.category).catch(() => undefined) },
      `${row.completed}/${row.total}`, `${row.pointsDone}/${row.pointsTotal}`, `${row.percent}%`,
    ]));
    return asImage({
      title: "原神成就目录", subtitle: `UID ${uid}`, badge: report?.title ?? `${stats.completed}/${stats.total}`,
      tables: [report?.summary ?? summary(stats, `${stats.categories.filter(row => row.completed === row.total).length}/${stats.categories.length}`),
        { headers: ["分类", "已完成", "原石", "完成率"], widths: [270, 100, 105, 260], rows }],
      notes: report?.notes ?? [`已完成 ${stats.completed}/${stats.total} 个成就，原石 ${stats.pointsDone}/${stats.pointsTotal}。目录状态来自椰羊 JSON 导入进度与本地图鉴。`],
    }, inlineImageByteLimit);
  }

  async function main(context: AchievementContext, bareOnly = false): Promise<Reply | undefined> {
    if (signal.aborted) return;
    const key = scope(context);
    const message = context.normalizedMessage.trim();
    const index = indexCommand.exec(message);
    const importing = importCommand.exec(message);
    const file = jsonAttachment(context);
    const earlier = key ? pending.get(key) : undefined;
    const request = file && canContinueImport(message) ? earlier : undefined;
    const categoryAction = parseCategory(message, bareOnly);
    if (bareOnly ? !categoryAction || index || importing : !index && !importing && !request && !categoryAction) return;
    const qq = String(context.user_id);
    let profileId = gameCommandProfileId("gs", index?.[1] ?? importing?.[1] ?? request?.profileId);
    let data: Awaited<ReturnType<typeof catalog>> | undefined;
    let category: AchievementCategory | undefined;
    if (!index && !importing && !request && categoryAction) {
      data = await catalog().catch(() => undefined);
      const selection = selectCategory(categoryAction, data?.categories ?? []);
      category = selection.category;
      if (!category) {
        if (!categoryAction.explicit) return;
        return data?.categories.length ? `未找到原神成就分类「${categoryAction.query}」。` : atlasUnavailable;
      }
      profileId = selection.profileId;
    }

    if (!key) return "请从本人 QQ 会话使用原神成就。";
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return "档案编号须在 1 到 255 之间。";
    if (request && request.expires <= now()) {
      clear(key, request);
      return "成就导入等待已超时，请重新发送 #成就导入。";
    }
    if (request?.busy) return "当前正在读取该档案的成就文件。";
    if (request) request.busy = true;
    try {
      const session = request?.session ?? await identity(qq, profileId);
      const { uid } = session;
      const verify = async () => {
        signal.throwIfAborted();
        if (!await sameIdentity(qq, profileId, session)) throw new ProfileError("changed", "档案变化。");
        if (request && (request.expires <= now() || pending.get(key) !== request)) {
          throw new AchievementInputError("成就导入等待已结束，请重新发送 #成就导入。");
        }
        signal.throwIfAborted();
      };

      if (importing || request) {
        const input = importing?.[2]?.trim() ?? "";
        if (Buffer.byteLength(input) > maxAchievementBytes) throw new AchievementInputError("成就 JSON 文件最多 4 MiB。");
        const start = input.indexOf("{"), end = input.lastIndexOf("}");
        const prefix = start === -1 ? input : input.slice(0, start);
        for (const [hint] of prefix.matchAll(/(?<!\d)[1-9]\d{7,9}(?!\d)/gu)) {
          if (hint !== uid) return "指定的原神 UID 与当前档案不一致。";
        }
        const inline = start >= 0 && end > start ? input.slice(start, end + 1) : undefined;
        if (!inline && context.attachment && !file) return "请发送 .json 格式的成就文件。";
        if (!inline && !file) {
          if (/[{}]/u.test(input)) throw new AchievementInputError("成就文件不是有效的 UTF-8 JSON。");
          if (context.canReadAttachments !== true) return "当前会话暂不支持接收文件，可在 #成就导入 后粘贴 JSON。";
          if (!pending.has(key) && pending.size >= 2048) return "成就导入等待人数过多，请稍后再试。";
          clear(key);
          const timeout = setTimeout(() => clear(key), waitMs).unref();
          pending.set(key, { profileId, session, timeout, expires: now() + waitMs, busy: false });
          return `请在 5 分钟内发送椰羊导出的 JSON 文件（档案 ${profileId}）。`;
        }
        if (!inline && context.canReadAttachments !== true) return "当前会话暂不支持读取成就文件。";
        await verify();
        const bytes = inline ?? await file?.read(signal);
        if (!bytes) throw new AchievementInputError("无法读取成就 JSON 文件，请重新发送。");
        const parsed = parseAchievementExport(decode(bytes), uid);
        data ??= await catalog().catch(() => undefined);
        if (!data?.categories.length) return `${atlasUnavailable} 进度未修改。`;
        const result = await store.merge({ qq, uid }, parsed, data.categories, verify);
        if (earlier) clear(key, earlier);
        const info = `椰羊 JSON 扫描 ${result.scanned} 条，完成项 ${result.completedInput} 条；新增 ${result.added} 条，重复 ${result.duplicate} 条，未知 ${result.unknown} 条，系列补全 ${result.inferred} 条。`;
        const updates = result.touched.length ? `更新分类：${result.touched.slice(0, 8).join(" / ")}${result.touched.length > 8 ? " 等" : ""}` : "";
        const notes = [info, updates].filter(Boolean);
        const progress = await store.read(qq, uid).catch(() => undefined);
        const reply = progress ? await directoryCard(data, uid, achievementStats(data.categories, progress), context.inlineImageByteLimit, {
          title: `+${result.added}`, notes: [notes.join(" ")],
          summary: { headers: ["新增", "重复", "未知", "补全"], widths: [183.75, 183.75, 183.75, 183.75],
            rows: [[result.added, result.duplicate, result.unknown, result.inferred].map(String)] },
        }).catch(() => notes.join("\n")) : notes.join("\n");
        if (!await sameIdentity(qq, profileId, session) || signal.aborted) return;
        return reply;
      }

      data ??= await catalog().catch(() => undefined);
      if (!data?.categories.length) return atlasUnavailable;
      const progress = await store.read(qq, uid);
      const stats = achievementStats(category ? [category] : data.categories, progress);
      if (!category) {
        const reply = await directoryCard(data, uid, stats, context.inlineImageByteLimit).catch(() => ["原神成就目录", progressLabel(stats),
          ...stats.categories.map(row => `${row.category.name} · ${row.completed}/${row.total}`)].join("\n"));
        await verify();
        return reply;
      }

      const groups = achievementGroups(category, progress);
      const totalPages = Math.ceil(groups.length / categoryPageSize);
      const forward = totalPages > 2 ? context.forward : undefined;
      if (totalPages > 2 && !forward) return "当前会话不支持确认分页转发。";
      await verify();
      if (totalPages > 1) await context.reply(`正在生成「${category.name}」成就，共 ${totalPages} 张，将按顺序合并转发。`);
      let pages: (Image | string)[] = [];
      for (let offset = 0; offset < groups.length; offset += categoryPageSize) {
        await verify();
        const visible = groups.slice(offset, offset + categoryPageSize);
        const page = offset / categoryPageSize + 1;
        const pageLabel = `第 ${page}/${totalPages} 张`;
        const groupLabel = `${offset + 1}-${offset + visible.length}/${groups.length} 组`;
        const label = `${pageLabel} · ${groupLabel}`;
        const card = { title: category.name, subtitle: `UID ${uid}`, badge: `${stats.completed}/${stats.total}`,
          tables: [summary(stats, totalPages === 1 ? String(groups.length) : `${offset + 1}-${offset + visible.length}/${groups.length}`, "分组"), ...visible.map(group => ({
            title: `${group.name} · ${group.completed}/${group.total} · 原石 ${group.pointsDone}/${group.pointsTotal}`,
            description: group.stages[0]?.description,
            headers: ["阶段 / 状态", "成就说明", "原石 / 进度"], widths: [120, 520, 95],
            rows: group.stages.map(stage => [
              `${group.total > 1 ? `${stage.stage}/${group.total}` : "单项"} · ${stage.done ? "已完成" : "未完成"}${stage.date ? `\n${stage.date}` : ""}`,
              stage.description || stage.name, `${stage.points ?? 0} 原石\n${stage.progress}`,
            ]),
          }))], notes: [`未完成条目优先显示；同名多阶段成就会作为一个条目一起排序。原石 ${stats.pointsDone}/${stats.pointsTotal}。${totalPages > 1 ? ` ${label}` : ""}`] };
        pages.push(await asImage(card, context.inlineImageByteLimit).catch(() => [category.name, progressLabel(stats), label,
          ...visible.map(group => `${group.name} · ${group.completed}/${group.total}`)].join("\n")));
        if (forward && (pages.length === 2 || page === totalPages)) {
          await verify();
          const delivered = await forward(pages, "Lotus-Yunzai").catch(() => undefined);
          pages = [];
          if (delivered === undefined) return "成就合并转发结果未确认，已停止后续分页。";
          if (!delivered) return "成就分页未送达，已停止后续分页。";
        }
      }
      if (forward) return { type: "forward", nodes: [], batchSize: 2 };
      await verify();
      return pages.length > 1 ? { type: "forward", nodes: pages, batchSize: 2 } : pages[0] ?? "该成就分类暂无条目。";
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return `请先登录档案 ${profileId}。`;
        if (error.code === "role-missing") return `档案 ${profileId} 尚未同步当前原神角色，请同步后重试。`;
        if (error.code === "invalid") return "档案的账号或登录凭据无法核验，请重新登录。";
        if (error.code === "changed") return "原神档案角色已变化，请重新操作。";
      }
      if (error instanceof AchievementInputError) return error.message;
      return "暂时无法读取或保存原神成就，请检查本地进度和图鉴。";
    } finally {
      if (request) request.busy = false;
    }
  }
  return {
    main,
    explicit(context: AchievementContext) {
      const key = scope(context);
      return /^#成就/u.test(context.normalizedMessage) && !publicCategory.test(context.normalizedMessage) || key !== undefined && pending.has(key) &&
        canContinueImport(context.normalizedMessage) && jsonAttachment(context) !== undefined;
    },
  };
}
