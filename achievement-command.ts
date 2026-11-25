import { createTranslator as createTextTranslator } from "../../packages/i18n/index.ts";
import messageCatalog from "./i18n/zh-CN.json";
const $t = createTextTranslator("genshin", messageCatalog.messages);
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
const atlasUnavailable = $t("achievement-command.text_d097a00252");

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
  const query = explicit ? body.slice($t("achievement-command.text_52b0e1703d").length).trim() : body;
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
  if (size > maxAchievementBytes) throw new AchievementInputError($t("achievement-command.text_9816af6d35"));
  try {
    return JSON.parse(typeof value === "string" ? value : new TextDecoder("utf-8", { fatal: true }).decode(value));
  } catch {
    throw new AchievementInputError($t("achievement-command.text_c362d46090"));
  }
}

const progressLabel = (stats: ReturnType<typeof achievementStats>) =>
  $t("achievement-command.text_d59bd480a3", { "completed": stats.completed, "total": stats.total, "pointsDone": stats.pointsDone, "pointsTotal": stats.pointsTotal, "percent": stats.percent });
const summary = (stats: Pick<ReturnType<typeof achievementStats>, "completed" | "total" | "pointsDone" | "pointsTotal" | "percent">,
  end: string, label: string = $t("achievement-command.text_515559957f")) => ({
  headers: [$t("achievement-command.text_52b0e1703d"), $t("achievement-command.text_761ab59423"), $t("achievement-command.text_43ca7616b8"), label], widths: [183.75, 183.75, 183.75, 183.75],
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
      title: $t("achievement-command.text_19a7ef1a74"), subtitle: `UID ${uid}`, badge: report?.title ?? `${stats.completed}/${stats.total}`,
      tables: [report?.summary ?? summary(stats, `${stats.categories.filter(row => row.completed === row.total).length}/${stats.categories.length}`),
        { headers: [$t("achievement-command.text_515559957f"), $t("achievement-command.text_f28461bb49"), $t("achievement-command.text_761ab59423"), $t("achievement-command.text_43ca7616b8")], widths: [270, 100, 105, 260], rows }],
      notes: report?.notes ?? [$t("achievement-command.text_66e1af2396", { "completed": stats.completed, "total": stats.total, "pointsDone": stats.pointsDone, "pointsTotal": stats.pointsTotal })],
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
        return data?.categories.length ? $t("achievement-command.text_52f62c6af3", { "query": categoryAction.query }) : atlasUnavailable;
      }
      profileId = selection.profileId;
    }

    if (!key) return $t("achievement-command.text_2c9423cddd");
    if (profileId < 1 || profileId > MAX_PROFILE_ID) return $t("achievement-command.text_3dd62228d2");
    if (request && request.expires <= now()) {
      clear(key, request);
      return $t("achievement-command.text_f52899659d");
    }
    if (request?.busy) return $t("achievement-command.text_844ba32c18");
    if (request) request.busy = true;
    try {
      const session = request?.session ?? await identity(qq, profileId);
      const { uid } = session;
      const verify = async () => {
        signal.throwIfAborted();
        if (!await sameIdentity(qq, profileId, session)) throw new ProfileError("changed", $t("achievement-command.text_79872712a9"));
        if (request && (request.expires <= now() || pending.get(key) !== request)) {
          throw new AchievementInputError($t("achievement-command.text_d480b605d9"));
        }
        signal.throwIfAborted();
      };

      if (importing || request) {
        const input = importing?.[2]?.trim() ?? "";
        if (Buffer.byteLength(input) > maxAchievementBytes) throw new AchievementInputError($t("achievement-command.text_9816af6d35"));
        const start = input.indexOf("{"), end = input.lastIndexOf("}");
        const prefix = start === -1 ? input : input.slice(0, start);
        for (const [hint] of prefix.matchAll(/(?<!\d)[1-9]\d{7,9}(?!\d)/gu)) {
          if (hint !== uid) return $t("achievement-command.text_48cf5d7dc5");
        }
        const inline = start >= 0 && end > start ? input.slice(start, end + 1) : undefined;
        if (!inline && context.attachment && !file) return $t("achievement-command.text_5f239cc400");
        if (!inline && !file) {
          if (/[{}]/u.test(input)) throw new AchievementInputError($t("achievement-command.text_c362d46090"));
          if (context.canReadAttachments !== true) return $t("achievement-command.text_1db21494f8");
          if (!pending.has(key) && pending.size >= 2048) return $t("achievement-command.text_a6b54b6dd5");
          clear(key);
          const timeout = setTimeout(() => clear(key), waitMs).unref();
          pending.set(key, { profileId, session, timeout, expires: now() + waitMs, busy: false });
          return $t("achievement-command.text_5321e72dec", { "profileId": profileId });
        }
        if (!inline && context.canReadAttachments !== true) return $t("achievement-command.text_db71ae5b37");
        await verify();
        const bytes = inline ?? await file?.read(signal);
        if (!bytes) throw new AchievementInputError($t("achievement-command.text_d19c911545"));
        const parsed = parseAchievementExport(decode(bytes), uid);
        data ??= await catalog().catch(() => undefined);
        if (!data?.categories.length) return $t("achievement-command.text_14262ad324", { "atlasUnavailable": atlasUnavailable });
        const result = await store.merge({ qq, uid }, parsed, data.categories, verify);
        if (earlier) clear(key, earlier);
        const info = $t("achievement-command.text_58eb3ba41e", { "scanned": result.scanned, "completedInput": result.completedInput, "added": result.added, "duplicate": result.duplicate, "unknown": result.unknown, "inferred": result.inferred });
        const updates = result.touched.length ? $t("achievement-command.text_5c4c68d3ec", { "value1": result.touched.slice(0, 8).join(" / "), "value2": result.touched.length > 8 ? $t("achievement-command.text_8ab274ae26") : "" }) : "";
        const notes = [info, updates].filter(Boolean);
        const progress = await store.read(qq, uid).catch(() => undefined);
        const reply = progress ? await directoryCard(data, uid, achievementStats(data.categories, progress), context.inlineImageByteLimit, {
          title: `+${result.added}`, notes: [notes.join(" ")],
          summary: { headers: [$t("achievement-command.text_0006d696d8"), $t("achievement-command.text_609cf2fdf6"), $t("achievement-command.text_4d8c1c5b42"), $t("achievement-command.text_40b1d8dd09")], widths: [183.75, 183.75, 183.75, 183.75],
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
        const reply = await directoryCard(data, uid, stats, context.inlineImageByteLimit).catch(() => [$t("achievement-command.text_19a7ef1a74"), progressLabel(stats),
          ...stats.categories.map(row => `${row.category.name} · ${row.completed}/${row.total}`)].join("\n"));
        await verify();
        return reply;
      }

      const groups = achievementGroups(category, progress);
      const totalPages = Math.ceil(groups.length / categoryPageSize);
      const forward = totalPages > 2 ? context.forward : undefined;
      if (totalPages > 2 && !forward) return $t("achievement-command.text_c233d8eee0");
      await verify();
      if (totalPages > 1) await context.reply($t("achievement-command.text_93bf6dad6b", { "name": category.name, "totalPages": totalPages }));
      let pages: (Image | string)[] = [];
      for (let offset = 0; offset < groups.length; offset += categoryPageSize) {
        await verify();
        const visible = groups.slice(offset, offset + categoryPageSize);
        const page = offset / categoryPageSize + 1;
        const pageLabel = $t("achievement-command.text_bd4ce0beba", { "page": page, "totalPages": totalPages });
        const groupLabel = $t("achievement-command.text_e6946edb20", { "value1": offset + 1, "value2": offset + visible.length, "length": groups.length });
        const label = `${pageLabel} · ${groupLabel}`;
        const card = { title: category.name, subtitle: `UID ${uid}`, badge: `${stats.completed}/${stats.total}`,
          tables: [summary(stats, totalPages === 1 ? String(groups.length) : `${offset + 1}-${offset + visible.length}/${groups.length}`, $t("achievement-command.text_399ee69347")), ...visible.map(group => ({
            title: $t("achievement-command.text_176ddce843", { "name": group.name, "completed": group.completed, "total": group.total, "pointsDone": group.pointsDone, "pointsTotal": group.pointsTotal }),
            description: group.stages[0]?.description,
            headers: [$t("achievement-command.text_7a72c017fb"), $t("achievement-command.text_fd00110702"), $t("achievement-command.text_4d2c37e80f")], widths: [120, 520, 95],
            rows: group.stages.map(stage => [
              `${group.total > 1 ? `${stage.stage}/${group.total}` : $t("achievement-command.text_dd37325469")} · ${stage.done ? $t("achievement-command.text_f28461bb49") : $t("achievement-command.text_6707de42c2")}${stage.date ? `\n${stage.date}` : ""}`,
              stage.description || stage.name, $t("achievement-command.text_6f45efd7b7", { "value1": stage.points ?? 0, "progress": stage.progress }),
            ]),
          }))], notes: [$t("achievement-command.text_057beaf799", { "pointsDone": stats.pointsDone, "pointsTotal": stats.pointsTotal, "value3": totalPages > 1 ? ` ${label}` : "" })] };
        pages.push(await asImage(card, context.inlineImageByteLimit).catch(() => [category.name, progressLabel(stats), label,
          ...visible.map(group => `${group.name} · ${group.completed}/${group.total}`)].join("\n")));
        if (forward && (pages.length === 2 || page === totalPages)) {
          await verify();
          const delivered = await forward(pages, "Lotus-Yunzai").catch(() => undefined);
          pages = [];
          if (delivered === undefined) return $t("achievement-command.text_31a6757cd8");
          if (!delivered) return $t("achievement-command.text_329d5797d2");
        }
      }
      if (forward) return { type: "forward", nodes: [], batchSize: 2 };
      await verify();
      return pages.length > 1 ? { type: "forward", nodes: pages, batchSize: 2 } : pages[0] ?? $t("achievement-command.text_2a249bc71f");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ProfileError) {
        if (error.code === "missing" || error.code === "login-required") return $t("achievement-command.text_76720712c8", { "profileId": profileId });
        if (error.code === "role-missing") return $t("achievement-command.text_728082fbd9", { "profileId": profileId });
        if (error.code === "invalid") return $t("achievement-command.text_b00482b677");
        if (error.code === "changed") return $t("achievement-command.text_45af24754e");
      }
      if (error instanceof AchievementInputError) return error.message;
      return $t("achievement-command.text_731b45072e");
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
